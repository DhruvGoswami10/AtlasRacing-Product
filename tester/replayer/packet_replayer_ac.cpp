#include <iostream>
#include <fstream>
#include <chrono>
#include <thread>
#include <vector>
#include <string>
#include <cstring>
#include <algorithm>
#include <signal.h>
#include <windows.h>
#include <processthreadsapi.h>

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

class ACReplayer {
public:
    ACReplayer()
        : physics_handle(nullptr)
        , graphics_handle(nullptr)
        , static_handle(nullptr)
        , physics_view(nullptr)
        , graphics_view(nullptr)
        , static_view(nullptr)
        , replaying(false)
        , paused(false)
        , speed_multiplier(1.0)
        , loop_mode(false)
        , current_frame(0)
        , start_frame_index(0)
        , start_offset_seconds(0.0) {
#ifdef _WIN32
        control_file_path = "replay_control_" + std::to_string(GetCurrentProcessId()) + "_ac.tmp";
#else
        control_file_path = "replay_control_" + std::to_string(getpid()) + "_ac.tmp";
#endif
        std::remove(control_file_path.c_str());
    }

    ~ACReplayer() {
        stopReplay();
        cleanupSharedMemory();
        std::remove(control_file_path.c_str());
    }

    bool loadRecording(const std::string& filename) {
        std::ifstream file(filename, std::ios::binary);
        if (!file.is_open()) {
            std::cerr << "❌ Failed to open recording file: " << filename << std::endl;
            return false;
        }

        file.read(reinterpret_cast<char*>(&header), sizeof(header));
        if (std::strncmp(header.magic, AC_MAGIC, 4) != 0) {
            std::cerr << "❌ Invalid AC recording file" << std::endl;
            return false;
        }

        frames.clear();
        frames.reserve(static_cast<size_t>(header.frame_count));

        while (file.good()) {
            ACFrameRecord frame{};
            file.read(reinterpret_cast<char*>(&frame), sizeof(frame));
            if (file.gcount() != sizeof(frame)) {
                break;
            }
            frames.push_back(frame);
        }

        if (frames.empty()) {
            std::cerr << "❌ Recording contains no frames" << std::endl;
            return false;
        }

        std::cout << "📼  Atlas Racing AC Replayer" << std::endl;
        std::cout << "===============================" << std::endl;
        std::cout << "🎯 Frames: " << frames.size() << std::endl;
        std::cout << "⏱️  Duration: " << (header.duration_ms / 1000.0) << "s" << std::endl;
        std::cout << "🎵 Sample rate: " << header.sample_rate_hz << " Hz" << std::endl;
        std::cout << "📝 Session: " << header.session_name << std::endl;
        std::cout << "🏁 Track: " << header.track_name << std::endl;
        std::cout << "🚗 Car: " << header.car_model << std::endl;
        return true;
    }

    void setPlaybackSpeed(double multiplier) {
        if (multiplier <= 0) {
            std::cerr << "⚠️  Invalid speed multiplier" << std::endl;
            return;
        }
        speed_multiplier = multiplier;
        std::cout << "⚙️  Playback speed: " << multiplier << "x" << std::endl;
    }

    void setLoopMode(bool enable) {
        loop_mode = enable;
        std::cout << "🔁 Loop mode: " << (loop_mode ? "ON" : "OFF") << std::endl;
    }

    void setStartOffset(double offset_seconds) {
        start_offset_seconds = std::max(0.0, offset_seconds);
        std::cout << "🎬 Start offset: " << start_offset_seconds << "s" << std::endl;
    }

    void startReplay() {
        if (frames.empty()) {
            std::cerr << "❌ No frames loaded" << std::endl;
            return;
        }
        if (replaying) {
            std::cerr << "⚠️  Replay already running" << std::endl;
            return;
        }

        if (!initializeSharedMemory()) {
            std::cerr << "❌ Failed to create shared memory for playback" << std::endl;
            return;
        }

        applyStaticData();

        replaying = true;
        paused = false;
        current_frame = 0;
        start_frame_index = findFrameAtTime(start_offset_seconds);

        std::cout << std::endl;
        std::cout << "▶️  Starting AC playback..." << std::endl;
        std::cout << "🕹️  Control: " << control_file_path << std::endl;

        replayLoop();
    }

    void stopReplay() {
        if (!replaying) {
            return;
        }
        replaying = false;
    }

    void pauseReplay() {
        if (replaying && !paused) {
            paused = true;
            pause_time = std::chrono::steady_clock::now();
            std::cout << "⏸️  Playback paused" << std::endl;
        }
    }

    void resumeReplay() {
        if (replaying && paused) {
            auto pause_duration = std::chrono::steady_clock::now() - pause_time;
            replay_start_time += pause_duration;
            paused = false;
            std::cout << "▶️  Playback resumed" << std::endl;
        }
    }

    void printFrameStats() const {
        std::cout << "📊 Frame statistics:" << std::endl;
        std::cout << "  Frames: " << frames.size() << std::endl;
        std::cout << "  Duration: " << (header.duration_ms / 1000.0) << "s" << std::endl;
        std::cout << "  Sample rate: " << header.sample_rate_hz << " Hz" << std::endl;
    }

    const std::string& controlFilePath() const { return control_file_path; }

private:
    HANDLE physics_handle;
    HANDLE graphics_handle;
    HANDLE static_handle;
    AC::SPageFilePhysics* physics_view;
    AC::SPageFileGraphic* graphics_view;
    AC::SPageFileStatic* static_view;

    ACFileHeader header{};
    std::vector<ACFrameRecord> frames;

    bool replaying;
    bool paused;
    double speed_multiplier;
    bool loop_mode;
    size_t current_frame;
    size_t start_frame_index;
    double start_offset_seconds;
    std::string control_file_path;

    std::chrono::steady_clock::time_point replay_start_time;
    std::chrono::steady_clock::time_point pause_time;

    bool initializeSharedMemory() {
        cleanupSharedMemory();

        physics_handle = CreateFileMappingW(
            INVALID_HANDLE_VALUE, nullptr, PAGE_READWRITE, 0, sizeof(AC::SPageFilePhysics), L"Local\\acpmf_physics");
        graphics_handle = CreateFileMappingW(
            INVALID_HANDLE_VALUE, nullptr, PAGE_READWRITE, 0, sizeof(AC::SPageFileGraphic), L"Local\\acpmf_graphics");
        static_handle = CreateFileMappingW(
            INVALID_HANDLE_VALUE, nullptr, PAGE_READWRITE, 0, sizeof(AC::SPageFileStatic), L"Local\\acpmf_static");

        if (!physics_handle || !graphics_handle || !static_handle) {
            std::cerr << "❌ Failed to create shared memory mappings for playback" << std::endl;
            cleanupSharedMemory();
            return false;
        }

        physics_view = static_cast<AC::SPageFilePhysics*>(
            MapViewOfFile(physics_handle, FILE_MAP_WRITE, 0, 0, sizeof(AC::SPageFilePhysics)));
        graphics_view = static_cast<AC::SPageFileGraphic*>(
            MapViewOfFile(graphics_handle, FILE_MAP_WRITE, 0, 0, sizeof(AC::SPageFileGraphic)));
        static_view = static_cast<AC::SPageFileStatic*>(
            MapViewOfFile(static_handle, FILE_MAP_WRITE, 0, 0, sizeof(AC::SPageFileStatic)));

        if (!physics_view || !graphics_view || !static_view) {
            std::cerr << "❌ Failed to map playback views" << std::endl;
            cleanupSharedMemory();
            return false;
        }

        return true;
    }

    void cleanupSharedMemory() {
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

    void applyStaticData() {
        if (static_view) {
            std::memcpy(static_view, &header.static_block, sizeof(AC::SPageFileStatic));
        }
        if (graphics_view) {
            auto copy = header.static_block;
            (void)copy;
        }
    }

    void replayLoop() {
        using namespace std::chrono;

        do {
            current_frame = start_frame_index;
            replay_start_time = steady_clock::now();

            while (replaying && current_frame < frames.size()) {
                if (current_frame % 10 == 0) {
                    checkControlCommands();
                }

                if (paused) {
                    std::this_thread::sleep_for(milliseconds(50));
                    continue;
                }

                const auto& frame = frames[current_frame];
                auto elapsed = steady_clock::now() - replay_start_time;
                auto target_ms = static_cast<uint64_t>(frame.timestamp_ms / speed_multiplier);
                auto target_time = replay_start_time + milliseconds(target_ms);
                std::this_thread::sleep_until(target_time);

                writeFrame(frame);

                if (current_frame % 600 == 0) {
                    double progress = (current_frame * 100.0) / frames.size();
                    std::cout << "⏩ Progress: " << static_cast<int>(progress) << "% ("
                              << current_frame << "/" << frames.size() << ")" << std::endl;
                }

                current_frame++;
            }

            if (loop_mode && replaying) {
                std::cout << "🔁 Looping playback..." << std::endl;
            }
        } while (replaying && loop_mode);

        std::cout << "⏹️  Playback finished" << std::endl;
        replaying = false;
    }

    void checkControlCommands() {
        std::ifstream control_file(control_file_path);
        if (!control_file.is_open()) {
            return;
        }

        std::string command;
        std::getline(control_file, command);
        control_file.close();
        std::remove(control_file_path.c_str());

        if (command == "pause") {
            pauseReplay();
        } else if (command == "resume") {
            resumeReplay();
        } else if (command == "stop") {
            stopReplay();
        }
    }

    void writeFrame(const ACFrameRecord& frame) {
        if (physics_view) {
            std::memcpy(physics_view, &frame.physics, sizeof(AC::SPageFilePhysics));
        }
        if (graphics_view) {
            std::memcpy(graphics_view, &frame.graphics, sizeof(AC::SPageFileGraphic));
        }
    }

    size_t findFrameAtTime(double seconds) const {
        if (frames.empty()) {
            return 0;
        }
        uint64_t target_ms = static_cast<uint64_t>(seconds * 1000.0);
        size_t left = 0;
        size_t right = frames.size() - 1;
        size_t best = 0;

        while (left <= right) {
            size_t mid = left + (right - left) / 2;
            if (frames[mid].timestamp_ms <= target_ms) {
                best = mid;
                left = mid + 1;
            } else {
                if (mid == 0) {
                    break;
                }
                right = mid - 1;
            }
        }
        return best;
    }
};

static ACReplayer* g_replayer = nullptr;

void signalHandler(int) {
    std::cout << std::endl << "⚠️  Interrupt received, stopping playback..." << std::endl;
    if (g_replayer) {
        g_replayer->stopReplay();
    }
}

int main(int argc, char* argv[]) {
    signal(SIGINT, signalHandler);
    signal(SIGTERM, signalHandler);

    std::string filename;
    double speed = 1.0;
    bool loop = false;
    double offset = 0.0;
    bool show_stats = false;

    for (int i = 1; i < argc; ++i) {
        std::string arg = argv[i];
        if ((arg == "-f" || arg == "--file") && i + 1 < argc) {
            filename = argv[++i];
        } else if ((arg == "-s" || arg == "--speed") && i + 1 < argc) {
            speed = std::stod(argv[++i]);
        } else if ((arg == "-o" || arg == "--offset") && i + 1 < argc) {
            offset = std::stod(argv[++i]);
        } else if (arg == "-l" || arg == "--loop") {
            loop = true;
        } else if (arg == "--stats") {
            show_stats = true;
        } else if (arg == "-h" || arg == "--help") {
            std::cout << "Assetto Corsa Replayer" << std::endl;
            std::cout << "Usage: " << argv[0] << " -f <file> [options]" << std::endl;
            std::cout << "Options:" << std::endl;
            std::cout << "  -f, --file <filename>    AC recording file to replay" << std::endl;
            std::cout << "  -s, --speed <multiplier> Playback speed (0.1-10.0, default: 1.0)" << std::endl;
            std::cout << "  -o, --offset <seconds>   Start playback from time offset" << std::endl;
            std::cout << "  -l, --loop               Loop playback continuously" << std::endl;
            std::cout << "  --stats                  Show frame statistics only" << std::endl;
            std::cout << "  -h, --help               Show this help message" << std::endl;
            return 0;
        }
    }

    if (filename.empty()) {
        std::cerr << "❌ Recording file must be specified with -f <file>" << std::endl;
        return 1;
    }

    ACReplayer replayer;
    g_replayer = &replayer;

    if (!replayer.loadRecording(filename)) {
        return 1;
    }

    if (show_stats) {
        replayer.printFrameStats();
        return 0;
    }

    replayer.setPlaybackSpeed(speed);
    replayer.setLoopMode(loop);
    if (offset > 0) {
        replayer.setStartOffset(offset);
    }

    replayer.startReplay();
    return 0;
}
