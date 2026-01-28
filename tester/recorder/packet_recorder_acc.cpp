#include <iostream>
#include <fstream>
#include <chrono>
#include <string>
#include <vector>
#include <cstring>
#include <signal.h>
#include <thread>
#include <windows.h>
#include <algorithm>

#pragma pack(push, 1)
struct ACCFileHeader {
    char magic[4];
    uint32_t version;
    uint64_t created_timestamp;
    uint32_t sample_rate_hz;
    uint64_t frame_count;
    uint64_t duration_ms;
    uint32_t physics_blob_size;
    uint32_t graphics_blob_size;
    uint32_t static_blob_size;
    char session_name[64];
    char track_name[64];
    char car_model[64];
};
#pragma pack(pop)

static const char* ACC_MAGIC = "ACC1";
static const uint32_t ACC_VERSION = 1;

class ACCRecorder {
public:
    ACCRecorder()
        : physics_handle(nullptr)
        , graphics_handle(nullptr)
        , static_handle(nullptr)
        , physics_view(nullptr)
        , graphics_view(nullptr)
        , static_view(nullptr)
        , physics_size(0)
        , graphics_size(0)
        , static_size(0)
        , recording(false)
        , sample_rate_hz(60)
        , frame_count(0) {}

    bool initialize() {
        std::cout << "🎬 Atlas Racing ACC Recorder" << std::endl;
        std::cout << "===================================" << std::endl;

        physics_handle = OpenFileMappingW(FILE_MAP_READ, FALSE, L"Local\\acpmf_physics");
        graphics_handle = OpenFileMappingW(FILE_MAP_READ, FALSE, L"Local\\acpmf_graphics");
        static_handle = OpenFileMappingW(FILE_MAP_READ, FALSE, L"Local\\acpmf_static");

        if (!physics_handle || !graphics_handle || !static_handle) {
            std::cerr << "❌ Failed to open ACC shared memory segments." << std::endl;
            std::cerr << "   Ensure Assetto Corsa Competizione is running with shared memory enabled." << std::endl;
            cleanup();
            return false;
        }

        physics_view = MapViewOfFile(physics_handle, FILE_MAP_READ, 0, 0, 0);
        graphics_view = MapViewOfFile(graphics_handle, FILE_MAP_READ, 0, 0, 0);
        static_view = MapViewOfFile(static_handle, FILE_MAP_READ, 0, 0, 0);

        if (!physics_view || !graphics_view || !static_view) {
            std::cerr << "❌ Failed to map ACC shared memory views." << std::endl;
            cleanup();
            return false;
        }

        physics_size = regionSize(physics_view);
        graphics_size = regionSize(graphics_view);
        static_size = regionSize(static_view);

        if (physics_size == 0 || graphics_size == 0 || static_size == 0) {
            std::cerr << "❌ Unable to determine ACC shared memory sizes." << std::endl;
            cleanup();
            return false;
        }

        static_blob.resize(static_size);
        std::memcpy(static_blob.data(), static_view, static_size);

        std::cout << "✅ Connected to ACC shared memory" << std::endl;
        std::cout << "   Physics block: " << physics_size << " bytes" << std::endl;
        std::cout << "   Graphics block: " << graphics_size << " bytes" << std::endl;
        std::cout << "   Static block: " << static_size << " bytes" << std::endl;
        return true;
    }

    bool startRecording(const std::string& filename, const std::string& session_name, uint32_t rate_hz) {
        if (recording) {
            std::cerr << "❌ Already recording" << std::endl;
            return false;
        }

        if (!physics_view || !graphics_view || !static_view) {
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

        ACCFileHeader header{};
        std::memcpy(header.magic, ACC_MAGIC, 4);
        header.version = ACC_VERSION;
        header.created_timestamp = currentTimestamp();
        header.sample_rate_hz = sample_rate_hz;
        header.frame_count = 0;
        header.duration_ms = 0;
        header.physics_blob_size = static_cast<uint32_t>(physics_size);
        header.graphics_blob_size = static_cast<uint32_t>(graphics_size);
        header.static_blob_size = static_cast<uint32_t>(static_size);

        if (!session_name.empty()) {
            std::strncpy(header.session_name, session_name.c_str(), sizeof(header.session_name) - 1);
        }

        output.write(reinterpret_cast<const char*>(&header), sizeof(header));
        output.write(reinterpret_cast<const char*>(static_blob.data()), static_blob.size());
        if (!output.good()) {
            std::cerr << "❌ Failed to write ACC recording header" << std::endl;
            output.close();
            return false;
        }

        start_time = std::chrono::steady_clock::now();
        last_stats_time = start_time;
        frame_count = 0;
        recording = true;

        std::cout << "🔴 Recording started (ACC): " << filename << std::endl;
        if (!session_name.empty()) {
            std::cout << "📝 Session: " << session_name << std::endl;
        }
        std::cout << "⏱️  Sample rate: " << sample_rate_hz << " Hz" << std::endl;
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

        std::vector<uint8_t> physics_buffer(physics_size);
        std::vector<uint8_t> graphics_buffer(graphics_size);

        while (recording) {
            auto now = steady_clock::now();
            if (now < next_sample_time) {
                std::this_thread::sleep_until(next_sample_time);
                now = steady_clock::now();
            }
            next_sample_time = now + sample_interval;

            uint64_t timestamp_ms = duration_cast<milliseconds>(now - start_time).count();

            std::memcpy(physics_buffer.data(), physics_view, physics_size);
            std::memcpy(graphics_buffer.data(), graphics_view, graphics_size);

            output.write(reinterpret_cast<const char*>(&timestamp_ms), sizeof(timestamp_ms));
            output.write(reinterpret_cast<const char*>(physics_buffer.data()), physics_size);
            output.write(reinterpret_cast<const char*>(graphics_buffer.data()), graphics_size);

            if (!output.good()) {
                std::cerr << "❌ Disk write error detected. Stopping recording." << std::endl;
                recording = false;
                break;
            }

            frame_count++;

            auto stats_elapsed = duration_cast<seconds>(now - last_stats_time).count();
            if (stats_elapsed >= 5) {
                double elapsed_sec = timestamp_ms / 1000.0;
                std::cout << "📊 Frames: " << frame_count
                          << " | Duration: " << elapsed_sec << "s"
                          << " | Rate: " << (frame_count / std::max(0.1, elapsed_sec)) << " fps" << std::endl;
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

    ~ACCRecorder() {
        if (recording) {
            stopRecording();
        }
        cleanup();
    }

private:
    HANDLE physics_handle;
    HANDLE graphics_handle;
    HANDLE static_handle;
    void* physics_view;
    void* graphics_view;
    void* static_view;
    size_t physics_size;
    size_t graphics_size;
    size_t static_size;

    bool recording;
    uint32_t sample_rate_hz;
    uint64_t frame_count;
    std::string current_filename;
    std::ofstream output;
    std::vector<uint8_t> static_blob;
    std::chrono::steady_clock::time_point start_time;
    std::chrono::steady_clock::time_point last_stats_time;

    static uint64_t currentTimestamp() {
        using namespace std::chrono;
        return duration_cast<milliseconds>(system_clock::now().time_since_epoch()).count();
    }

    static size_t regionSize(void* address) {
        MEMORY_BASIC_INFORMATION info{};
        if (VirtualQuery(address, &info, sizeof(info)) == 0) {
            return 0;
        }
        return static_cast<size_t>(info.RegionSize);
    }

    void cleanup() {
        if (physics_view) {
            UnmapViewOfFile(physics_view);
            physics_view = nullptr;
        }
        if (graphics_view) {
            UnmapViewOfFile(graphics_view);
            graphics_view = nullptr;
        }
        if (static_view) {
            UnmapViewOfFile(static_view);
            static_view = nullptr;
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

    void updateHeader(uint64_t duration_ms) {
        std::fstream file(current_filename, std::ios::in | std::ios::out | std::ios::binary);
        if (!file.is_open()) {
            std::cerr << "⚠️  Failed to reopen recording file to update header." << std::endl;
            return;
        }

        ACCFileHeader header{};
        file.read(reinterpret_cast<char*>(&header), sizeof(header));
        if (!file.good()) {
            std::cerr << "⚠️  Failed to read recording header for update." << std::endl;
            return;
        }

        header.frame_count = frame_count;
        header.duration_ms = duration_ms;

        file.seekp(0);
        file.write(reinterpret_cast<const char*>(&header), sizeof(header));
        file.close();
    }
};

static ACCRecorder* g_recorder = nullptr;

void signalHandler(int) {
    std::cout << std::endl << "⚠️  Interrupt received, stopping recording..." << std::endl;
    if (g_recorder) {
        g_recorder->stopRecording();
    }
}

int main(int argc, char* argv[]) {
    signal(SIGINT, signalHandler);
    signal(SIGTERM, signalHandler);

    std::string filename = "session_recording.acc";
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
            std::cout << "Assetto Corsa Competizione Recorder" << std::endl;
            std::cout << "Usage: " << argv[0] << " [options]" << std::endl;
            std::cout << "Options:" << std::endl;
            std::cout << "  -f, --file <filename>    Output file (default: session_recording.acc)" << std::endl;
            std::cout << "  -n, --name <session>     Session name metadata" << std::endl;
            std::cout << "  -r, --rate <hz>          Sample rate in Hz (default: 60)" << std::endl;
            std::cout << "  -h, --help               Show this help message" << std::endl;
            return 0;
        }
    }

    ACCRecorder recorder;
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
