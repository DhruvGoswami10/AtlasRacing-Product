#include <iostream>
#include <fstream>
#include <chrono>
#include <string>
#include <cstring>
#include <signal.h>
#include <thread>
#include <windows.h>
#include <algorithm>

#include "../shared/ac_types.h"

#pragma pack(push, 1)
struct ACFileHeader {
    char magic[4];
    uint32_t version;
    uint64_t created_timestamp;
    uint32_t sample_rate_hz;
    uint64_t frame_count;
    uint64_t duration_ms;
    char session_name[64];
    char track_name[64];
    char car_model[64];
    AC::SPageFileStatic static_block;
};

struct ACFrameRecord {
    uint64_t timestamp_ms;
    AC::SPageFilePhysics physics;
    AC::SPageFileGraphic graphics;
};
#pragma pack(pop)

static const char* AC_MAGIC = "AC24";
static const uint32_t AC_VERSION = 1;

class ACRecorder {
public:
    ACRecorder()
        : physics_handle(nullptr)
        , graphics_handle(nullptr)
        , static_handle(nullptr)
        , physics_data(nullptr)
        , graphics_data(nullptr)
        , static_data(nullptr)
        , recording(false)
        , sample_rate_hz(60)
        , frame_count(0) {}

    bool initialize() {
        std::cout << "🎬 Atlas Racing AC Recorder" << std::endl;
        std::cout << "====================================" << std::endl;

        physics_handle = OpenFileMappingW(FILE_MAP_READ, FALSE, L"Local\\acpmf_physics");
        graphics_handle = OpenFileMappingW(FILE_MAP_READ, FALSE, L"Local\\acpmf_graphics");
        static_handle = OpenFileMappingW(FILE_MAP_READ, FALSE, L"Local\\acpmf_static");

        if (!physics_handle || !graphics_handle || !static_handle) {
            std::cerr << "❌ Failed to open Assetto Corsa shared memory segments." << std::endl;
            std::cerr << "   Ensure the game is running and telemetry is enabled." << std::endl;
            cleanup();
            return false;
        }

        physics_data = static_cast<AC::SPageFilePhysics*>(
            MapViewOfFile(physics_handle, FILE_MAP_READ, 0, 0, sizeof(AC::SPageFilePhysics)));
        graphics_data = static_cast<AC::SPageFileGraphic*>(
            MapViewOfFile(graphics_handle, FILE_MAP_READ, 0, 0, sizeof(AC::SPageFileGraphic)));
        static_data = static_cast<AC::SPageFileStatic*>(
            MapViewOfFile(static_handle, FILE_MAP_READ, 0, 0, sizeof(AC::SPageFileStatic)));

        if (!physics_data || !graphics_data || !static_data) {
            std::cerr << "❌ Failed to map Assetto Corsa shared memory views." << std::endl;
            cleanup();
            return false;
        }

        std::cout << "✅ Connected to Assetto Corsa shared memory" << std::endl;
        return true;
    }

    bool startRecording(const std::string& filename, const std::string& session_name, uint32_t rate_hz) {
        if (recording) {
            std::cerr << "❌ Already recording" << std::endl;
            return false;
        }

        if (!physics_data || !graphics_data || !static_data) {
            std::cerr << "❌ Shared memory not initialized" << std::endl;
            return false;
        }

        sample_rate_hz = std::max<uint32_t>(1, rate_hz);

        current_filename = filename;
        output.open(filename, std::ios::binary);
        if (!output.is_open()) {
            std::cerr << "❌ Failed to create recording file: " << filename << std::endl;
            return false;
        }

        ACFileHeader header{};
        std::memcpy(header.magic, AC_MAGIC, 4);
        header.version = AC_VERSION;
        header.created_timestamp = currentTimestamp();
        header.sample_rate_hz = sample_rate_hz;
        header.frame_count = 0;
        header.duration_ms = 0;

        if (!session_name.empty()) {
            std::strncpy(header.session_name, session_name.c_str(), sizeof(header.session_name) - 1);
        }

        std::string track = wideToUtf8(static_data->track, 33);
        std::string car = wideToUtf8(static_data->carModel, 33);
        std::strncpy(header.track_name, track.c_str(), sizeof(header.track_name) - 1);
        std::strncpy(header.car_model, car.c_str(), sizeof(header.car_model) - 1);

        header.static_block = *static_data;

        output.write(reinterpret_cast<const char*>(&header), sizeof(header));
        if (!output.good()) {
            std::cerr << "❌ Failed to write file header" << std::endl;
            output.close();
            return false;
        }

        start_time = std::chrono::steady_clock::now();
        last_stats_time = start_time;
        frame_count = 0;
        recording = true;

        std::cout << "🔴 Recording started (Assetto Corsa): " << filename << std::endl;
        if (!session_name.empty()) {
            std::cout << "📝 Session: " << session_name << std::endl;
        }
        std::cout << "⏱️  Sample rate: " << sample_rate_hz << " Hz" << std::endl;
        std::cout << "🚗 Track: " << track << " | Car: " << car << std::endl;
        std::cout << "Press Ctrl+C to stop recording" << std::endl;

        return true;
    }

    void recordLoop() {
        if (!recording) {
            std::cerr << "❌ Recorder is not running" << std::endl;
            return;
        }

        using namespace std::chrono;

        const auto sample_interval = microseconds(1'000'000 / sample_rate_hz);
        auto next_sample_time = steady_clock::now();

        while (recording) {
            auto now = steady_clock::now();
            if (now < next_sample_time) {
                std::this_thread::sleep_until(next_sample_time);
                now = steady_clock::now();
            }
            next_sample_time = now + sample_interval;

            ACFrameRecord frame{};
            frame.timestamp_ms = duration_cast<milliseconds>(now - start_time).count();
            std::memcpy(&frame.physics, physics_data, sizeof(AC::SPageFilePhysics));
            std::memcpy(&frame.graphics, graphics_data, sizeof(AC::SPageFileGraphic));

            output.write(reinterpret_cast<const char*>(&frame), sizeof(frame));
            if (!output.good()) {
                std::cerr << "❌ Disk write error detected. Stopping recording." << std::endl;
                recording = false;
                break;
            }

            frame_count++;

            auto stats_elapsed = duration_cast<seconds>(now - last_stats_time).count();
            if (stats_elapsed >= 5) {
                double duration_sec = frame.timestamp_ms / 1000.0;
                std::cout << "📊 Frames: " << frame_count
                          << " | Duration: " << duration_sec << "s"
                          << " | Rate: " << (frame_count / std::max(0.1, duration_sec)) << " fps" << std::endl;
                last_stats_time = now;
            }
        }

        output.flush();
    }

    void stopRecording() {
        if (!recording) {
            return;
        }

        recording = false;
        output.flush();
        output.close();

        auto end_time = std::chrono::steady_clock::now();
        auto duration_ms = std::chrono::duration_cast<std::chrono::milliseconds>(end_time - start_time).count();

        updateHeader(duration_ms);

        std::cout << std::endl;
        std::cout << "🛑 Recording stopped" << std::endl;
        std::cout << "📦 Frames captured: " << frame_count << std::endl;
        std::cout << "⏱️  Duration: " << (duration_ms / 1000.0) << "s" << std::endl;
        std::cout << "⚡ Avg rate: " << (frame_count / std::max(0.001, duration_ms / 1000.0)) << " fps" << std::endl;
    }

    ~ACRecorder() {
        if (recording) {
            stopRecording();
        }
        cleanup();
    }

private:
    HANDLE physics_handle;
    HANDLE graphics_handle;
    HANDLE static_handle;
    AC::SPageFilePhysics* physics_data;
    AC::SPageFileGraphic* graphics_data;
    AC::SPageFileStatic* static_data;

    bool recording;
    uint32_t sample_rate_hz;
    uint64_t frame_count;
    std::string current_filename;
    std::ofstream output;
    std::chrono::steady_clock::time_point start_time;
    std::chrono::steady_clock::time_point last_stats_time;

    void cleanup() {
        if (physics_data) {
            UnmapViewOfFile(physics_data);
            physics_data = nullptr;
        }
        if (graphics_data) {
            UnmapViewOfFile(graphics_data);
            graphics_data = nullptr;
        }
        if (static_data) {
            UnmapViewOfFile(static_data);
            static_data = nullptr;
        }
        if (physics_handle) {
            CloseHandle(physics_handle);
            physics_handle = nullptr;
        }
        if (graphics_handle) {
            CloseHandle(graphics_handle);
            graphics_handle = nullptr;
        }
        if (static_handle) {
            CloseHandle(static_handle);
            static_handle = nullptr;
        }
    }

    static uint64_t currentTimestamp() {
        using namespace std::chrono;
        return duration_cast<milliseconds>(system_clock::now().time_since_epoch()).count();
    }

    static std::string wideToUtf8(const wchar_t* source, size_t max_len) {
        if (!source || max_len == 0) {
            return {};
        }

        size_t length = 0;
        while (length < max_len && source[length] != L'\0') {
            length++;
        }

        if (length == 0) {
            return {};
        }

        int size_needed = WideCharToMultiByte(CP_UTF8, 0, source, static_cast<int>(length),
                                              nullptr, 0, nullptr, nullptr);
        if (size_needed <= 0) {
            return {};
        }

        std::string result(size_needed, '\0');
        WideCharToMultiByte(CP_UTF8, 0, source, static_cast<int>(length),
                            result.data(), size_needed, nullptr, nullptr);
        return result;
    }

    void updateHeader(uint64_t duration_ms) {
        std::fstream header_file(current_filename, std::ios::in | std::ios::out | std::ios::binary);
        if (!header_file.is_open()) {
            std::cerr << "⚠️  Failed to reopen recording file to update header." << std::endl;
            return;
        }

        ACFileHeader header{};
        header_file.read(reinterpret_cast<char*>(&header), sizeof(header));
        if (!header_file.good()) {
            std::cerr << "⚠️  Failed to read recording header for update." << std::endl;
            return;
        }

        header.frame_count = frame_count;
        header.duration_ms = duration_ms;

        header_file.seekp(0);
        header_file.write(reinterpret_cast<const char*>(&header), sizeof(header));
        header_file.close();
    }
};

static ACRecorder* g_recorder = nullptr;

void signalHandler(int) {
    std::cout << std::endl << "⚠️  Interrupt received, stopping recording..." << std::endl;
    if (g_recorder) {
        g_recorder->stopRecording();
    }
}

int main(int argc, char* argv[]) {
    signal(SIGINT, signalHandler);
    signal(SIGTERM, signalHandler);

    std::string filename = "session_recording.ac";
    std::string session_name;
    uint32_t sample_rate = 60;

    for (int i = 1; i < argc; ++i) {
        std::string arg = argv[i];
        if ((arg == "-f" || arg == "--file") && i + 1 < argc) {
            filename = argv[++i];
        } else if ((arg == "-n" || arg == "--name") && i + 1 < argc) {
            session_name = argv[++i];
        } else if ((arg == "-r" || arg == "--rate") && i + 1 < argc) {
            sample_rate = std::max<uint32_t>(1, static_cast<uint32_t>(std::stoi(argv[++i])));
        } else if (arg == "-h" || arg == "--help") {
            std::cout << "Assetto Corsa Recorder" << std::endl;
            std::cout << "Usage: " << argv[0] << " [options]" << std::endl;
            std::cout << "Options:" << std::endl;
            std::cout << "  -f, --file <filename>    Output file (default: session_recording.ac)" << std::endl;
            std::cout << "  -n, --name <session>     Session name metadata" << std::endl;
            std::cout << "  -r, --rate <hz>          Sample rate in Hz (default: 60)" << std::endl;
            std::cout << "  -h, --help               Show this help message" << std::endl;
            return 0;
        }
    }

    ACRecorder recorder;
    g_recorder = &recorder;

    if (!recorder.initialize()) {
        return 1;
    }

    if (!recorder.startRecording(filename, session_name, sample_rate)) {
        return 1;
    }

    recorder.recordLoop();
    recorder.stopRecording();
    return 0;
}
