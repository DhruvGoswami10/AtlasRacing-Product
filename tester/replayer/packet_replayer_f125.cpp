#include <iostream>
#include <fstream>
#include <chrono>
#include <thread>
#include <string>
#include <cstring>
#include <signal.h>
#include "../recorder/f125_file_format.h"

#ifdef _WIN32
#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>
#include <processthreadsapi.h>
#include <io.h>
#include <fcntl.h>
typedef int socklen_t;
#else
#include <sys/socket.h>
#include <netinet/in.h>
#include <unistd.h>
#include <arpa/inet.h>
#endif

// Streaming replayer - reads packets on-demand instead of loading all into memory
class PacketReplayerF125 {
private:
    int socket_fd;
    std::ifstream file;
    F125FileHeader file_header;
    std::string filename;
    bool replaying;
    bool paused;
    double speed_multiplier;
    bool loop_mode;
    uint64_t current_packet;
    double start_offset_seconds;
    std::chrono::steady_clock::time_point replay_start_time;
    std::chrono::steady_clock::time_point pause_time;
    std::string control_file_path;
    uint64_t first_packet_timestamp;
    bool first_packet_read;

    // Buffer for packet data
    char packet_buffer[F125_MAX_PACKET_SIZE];

public:
    PacketReplayerF125() : socket_fd(-1), replaying(false), paused(false), speed_multiplier(1.0),
                      loop_mode(false), current_packet(0), start_offset_seconds(0.0),
                      first_packet_timestamp(0), first_packet_read(false) {
#ifdef _WIN32
        control_file_path = "replay_control_" + std::to_string(GetCurrentProcessId()) + ".tmp";
#else
        control_file_path = "replay_control_" + std::to_string(getpid()) + ".tmp";
#endif
        std::remove(control_file_path.c_str());
    }

    bool initialize(const std::string& target_ip = "127.0.0.1", int target_port = 20777) {
        std::cout << "Atlas Racing F1 25 Packet Replayer" << std::endl;
        std::cout << "===================================" << std::endl;
        std::cout.flush();

#ifdef _WIN32
        WSADATA wsaData;
        if (WSAStartup(MAKEWORD(2, 2), &wsaData) != 0) {
            std::cerr << "Failed to initialize Winsock" << std::endl;
            return false;
        }
#endif

        socket_fd = socket(AF_INET, SOCK_DGRAM, 0);
        if (socket_fd < 0) {
            std::cerr << "Failed to create socket" << std::endl;
            return false;
        }

        // Increase send buffer size for smoother playback
        int send_buffer_size = 1024 * 1024; // 1MB
        setsockopt(socket_fd, SOL_SOCKET, SO_SNDBUF, (char*)&send_buffer_size, sizeof(send_buffer_size));

        std::cout << "[OK] Targeting " << target_ip << ":" << target_port << std::endl;
        std::cout.flush();
        return true;
    }

    bool openRecording(const std::string& fname) {
        filename = fname;
        file.open(filename, std::ios::binary);
        if (!file.is_open()) {
            std::cerr << "Failed to open recording file: " << filename << std::endl;
            return false;
        }

        // Read header
        file.read((char*)&file_header, sizeof(file_header));
        if (!file.good() || file.gcount() != sizeof(file_header)) {
            std::cerr << "Failed to read file header" << std::endl;
            return false;
        }

        if (strncmp(file_header.magic, F125_MAGIC, 4) != 0) {
            std::cerr << "Invalid F125 file format (magic mismatch)" << std::endl;
            return false;
        }

        if (file_header.version != F125_VERSION) {
            std::cerr << "Unsupported file version: " << file_header.version << std::endl;
            return false;
        }

        std::cout << "[FILE] " << filename << std::endl;
        std::cout << "[SESSION] " << (file_header.session_name[0] ? file_header.session_name : "(unnamed)") << std::endl;
        std::cout << "[DURATION] " << (file_header.duration_ms / 1000.0) << " seconds" << std::endl;
        std::cout << "[PACKETS] " << file_header.total_packets << std::endl;
        std::cout.flush();

        first_packet_read = false;
        return true;
    }

    void setPlaybackSpeed(double multiplier) {
        if (multiplier <= 0 || multiplier > 10.0) {
            std::cerr << "Invalid speed multiplier: " << multiplier << std::endl;
            return;
        }
        speed_multiplier = multiplier;
        std::cout << "[SPEED] " << multiplier << "x" << std::endl;
        std::cout.flush();
    }

    void setLoopMode(bool enable) {
        loop_mode = enable;
        std::cout << "[LOOP] " << (enable ? "ON" : "OFF") << std::endl;
        std::cout.flush();
    }

    void setStartOffset(double offset_seconds) {
        start_offset_seconds = offset_seconds;
        std::cout << "[OFFSET] " << offset_seconds << "s" << std::endl;
        std::cout.flush();
    }

    void checkControlCommands() {
        std::ifstream control_file(control_file_path);
        if (control_file.is_open()) {
            std::string command;
            std::getline(control_file, command);
            control_file.close();

            std::cout << "[CONTROL] " << command << std::endl;
            std::cout.flush();

            if (command == "pause" && !paused) {
                pauseReplay();
            } else if (command == "resume" && paused) {
                resumeReplay();
            } else if (command == "stop") {
                stopReplay();
            }

            std::remove(control_file_path.c_str());
        }
    }

    void pauseReplay() {
        if (!paused && replaying) {
            paused = true;
            pause_time = std::chrono::steady_clock::now();
            std::cout << "[PAUSED]" << std::endl;
            std::cout.flush();
        }
    }

    void resumeReplay() {
        if (paused && replaying) {
            auto pause_duration = std::chrono::steady_clock::now() - pause_time;
            replay_start_time += pause_duration;
            paused = false;
            std::cout << "[RESUMED]" << std::endl;
            std::cout.flush();
        }
    }

    std::string getControlFilePath() const {
        return control_file_path;
    }

    bool seekToOffset() {
        if (start_offset_seconds <= 0) return true;

        uint64_t target_ms = (uint64_t)(start_offset_seconds * 1000.0);

        // Read packets until we find one at or past target time
        while (file.good()) {
            F125PacketRecord record;
            file.read((char*)&record, sizeof(record));
            if (file.gcount() != sizeof(record)) break;

            if (!first_packet_read) {
                first_packet_timestamp = record.timestamp_ms;
                first_packet_read = true;
            }

            uint64_t relative_time = record.timestamp_ms - first_packet_timestamp;

            if (relative_time >= target_ms) {
                // Seek back to re-read this packet
                file.seekg(-static_cast<std::streamoff>(sizeof(record)), std::ios::cur);
                std::cout << "[SEEK] Found start at " << (relative_time / 1000.0) << "s" << std::endl;
                std::cout.flush();
                return true;
            }

            // Skip packet data
            if (record.packet_size > F125_MAX_PACKET_SIZE) {
                std::cerr << "[ERROR] Invalid packet size during seek: " << record.packet_size << std::endl;
                return false;
            }
            file.seekg(record.packet_size, std::ios::cur);
            current_packet++;
        }

        std::cerr << "[WARN] Offset beyond end of recording" << std::endl;
        return false;
    }

    void resetToStart() {
        file.clear();
        file.seekg(sizeof(F125FileHeader), std::ios::beg);
        current_packet = 0;
        first_packet_read = false;
    }

    void startReplay(const std::string& target_ip = "127.0.0.1", int target_port = 20777) {
        if (!file.is_open()) {
            std::cerr << "No recording file open!" << std::endl;
            return;
        }

        if (replaying) {
            std::cerr << "Already replaying!" << std::endl;
            return;
        }

        struct sockaddr_in server_addr;
        memset(&server_addr, 0, sizeof(server_addr));
        server_addr.sin_family = AF_INET;
        server_addr.sin_port = htons(target_port);
        inet_pton(AF_INET, target_ip.c_str(), &server_addr.sin_addr);

        replaying = true;

        std::cout << std::endl;
        std::cout << "[REPLAY] Starting..." << std::endl;
        std::cout << "[TARGET] " << target_ip << ":" << target_port << std::endl;
        std::cout << "[CONTROL] " << control_file_path << std::endl;
        std::cout << "Press Ctrl+C to stop" << std::endl;
        std::cout << std::endl;
        std::cout.flush();

        do {
            // Reset to start of packets
            resetToStart();

            // Seek to offset if specified
            if (start_offset_seconds > 0) {
                if (!seekToOffset()) {
                    break;
                }
            }

            replay_start_time = std::chrono::steady_clock::now();
            uint64_t start_timestamp = 0;
            bool start_timestamp_set = false;

            auto last_progress_time = std::chrono::steady_clock::now();
            uint64_t last_progress_packet = current_packet;
            uint64_t packets_sent = 0;
            uint64_t send_errors = 0;

            // Stream packets from file
            while (replaying && file.good()) {
                // Check for control commands periodically
                if (current_packet % 50 == 0) {
                    checkControlCommands();
                }

                if (paused) {
                    std::this_thread::sleep_for(std::chrono::milliseconds(100));
                    continue;
                }

                // Read packet record
                F125PacketRecord record;
                file.read((char*)&record, sizeof(record));
                if (file.gcount() != sizeof(record)) {
                    // End of file or read error
                    break;
                }

                // Validate packet size
                if (record.packet_size > F125_MAX_PACKET_SIZE || record.packet_size == 0) {
                    std::cerr << "[ERROR] Invalid packet size: " << record.packet_size
                              << " at packet " << current_packet << std::endl;
                    // Try to skip and continue
                    file.seekg(record.packet_size, std::ios::cur);
                    current_packet++;
                    continue;
                }

                // Read packet data
                file.read(packet_buffer, record.packet_size);
                if (file.gcount() != record.packet_size) {
                    std::cerr << "[ERROR] Failed to read packet data at packet " << current_packet << std::endl;
                    break;
                }

                // Set start timestamp from first packet
                if (!start_timestamp_set) {
                    start_timestamp = record.timestamp_ms;
                    start_timestamp_set = true;
                    if (!first_packet_read) {
                        first_packet_timestamp = record.timestamp_ms;
                        first_packet_read = true;
                    }
                }

                // Calculate timing
                uint64_t relative_time = record.timestamp_ms - start_timestamp;
                auto target_time = replay_start_time + std::chrono::milliseconds(
                    (uint64_t)(relative_time / speed_multiplier));

                // Wait until it's time to send
                auto now = std::chrono::steady_clock::now();
                if (now < target_time) {
                    std::this_thread::sleep_until(target_time);
                }

                // Send packet
                int bytes_sent = sendto(socket_fd, packet_buffer, record.packet_size, 0,
                                      (struct sockaddr*)&server_addr, sizeof(server_addr));

                if (bytes_sent < 0) {
                    send_errors++;
                    if (send_errors <= 5) {
#ifdef _WIN32
                        std::cerr << "[SEND ERROR] Packet " << current_packet
                                  << " (WSA: " << WSAGetLastError() << ")" << std::endl;
#else
                        std::cerr << "[SEND ERROR] Packet " << current_packet
                                  << " (errno: " << errno << ")" << std::endl;
#endif
                    }
                } else {
                    packets_sent++;
                }

                current_packet++;

                // Progress update every 5 seconds
                now = std::chrono::steady_clock::now();
                auto progress_elapsed = std::chrono::duration_cast<std::chrono::seconds>(
                    now - last_progress_time).count();
                if (progress_elapsed >= 5) {
                    uint64_t packets_in_period = current_packet - last_progress_packet;
                    double pps = packets_in_period / (double)progress_elapsed;
                    double progress = (file_header.total_packets > 0) ?
                        (current_packet * 100.0 / file_header.total_packets) : 0;

                    auto session_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
                        now - replay_start_time).count();

                    std::cout << "[PROGRESS] " << (int)progress << "% (" << current_packet
                              << "/" << file_header.total_packets << ") | "
                              << (int)pps << " pps | " << (session_ms / 1000.0) << "s";
                    if (send_errors > 0) {
                        std::cout << " | " << send_errors << " errors";
                    }
                    std::cout << std::endl;
                    std::cout.flush();

                    last_progress_time = now;
                    last_progress_packet = current_packet;
                }
            }

            std::cout << "[COMPLETE] Sent " << packets_sent << " packets";
            if (send_errors > 0) {
                std::cout << " (" << send_errors << " errors)";
            }
            std::cout << std::endl;
            std::cout.flush();

            if (replaying && loop_mode) {
                std::cout << "[LOOP] Restarting..." << std::endl;
                std::cout.flush();
            }

        } while (replaying && loop_mode);

        std::cout << "[FINISHED]" << std::endl;
        std::cout.flush();
    }

    void stopReplay() {
        replaying = false;
    }

    void printPacketStats() {
        if (!file.is_open()) {
            std::cout << "No recording file open" << std::endl;
            return;
        }

        // Reset to start
        resetToStart();

        // F1 25 has packet IDs 0-15 (16 types)
        size_t packet_counts[16] = {0};
        uint64_t total_bytes = 0;
        uint64_t count = 0;

        while (file.good()) {
            F125PacketRecord record;
            file.read((char*)&record, sizeof(record));
            if (file.gcount() != sizeof(record)) break;

            if (record.packet_id < 16) {
                packet_counts[record.packet_id]++;
            }
            total_bytes += record.packet_size;
            count++;

            // Skip packet data
            file.seekg(record.packet_size, std::ios::cur);
        }

        std::cout << std::endl;
        std::cout << "Packet Statistics:" << std::endl;
        std::cout << "==================" << std::endl;
        std::cout << "Total packets: " << count << std::endl;
        std::cout << "Total data: " << (total_bytes / 1024.0 / 1024.0) << " MB" << std::endl;
        std::cout << std::endl;

        const char* packet_names[] = {
            "Motion", "Session", "Lap Data", "Event", "Participants",
            "Car Setups", "Car Telemetry", "Car Status", "Final Classification",
            "Lobby Info", "Car Damage", "Session History", "Tyre Sets",
            "Motion Ex", "Time Trial", "Lap Positions"
        };

        for (int i = 0; i < 16; i++) {
            if (packet_counts[i] > 0) {
                std::cout << "  " << packet_names[i] << " (ID " << i << "): "
                          << packet_counts[i] << std::endl;
            }
        }
        std::cout << std::endl;
        std::cout.flush();
    }

    ~PacketReplayerF125() {
        if (replaying) {
            stopReplay();
        }

        if (file.is_open()) {
            file.close();
        }

        if (socket_fd >= 0) {
#ifdef _WIN32
            closesocket(socket_fd);
            WSACleanup();
#else
            close(socket_fd);
#endif
        }

        std::remove(control_file_path.c_str());
    }
};

PacketReplayerF125* replayer = nullptr;

void signalHandler(int signal) {
    std::cout << std::endl << "[SIGNAL] " << signal << " - stopping..." << std::endl;
    std::cout.flush();
    if (replayer) {
        replayer->stopReplay();
    }
}

int main(int argc, char* argv[]) {
#ifdef _WIN32
    // Ensure stdout is unbuffered for real-time output
    setvbuf(stdout, NULL, _IONBF, 0);
    setvbuf(stderr, NULL, _IONBF, 0);
#endif

    signal(SIGINT, signalHandler);
    signal(SIGTERM, signalHandler);

    std::string filename = "";
    std::string target_ip = "127.0.0.1";
    int target_port = 20777;
    double speed = 1.0;
    double offset = 0.0;
    bool loop = false;
    bool show_stats = false;

    for (int i = 1; i < argc; i++) {
        std::string arg = argv[i];
        if (arg == "-f" || arg == "--file") {
            if (i + 1 < argc) filename = argv[++i];
        } else if (arg == "-i" || arg == "--ip") {
            if (i + 1 < argc) target_ip = argv[++i];
        } else if (arg == "-p" || arg == "--port") {
            if (i + 1 < argc) target_port = std::stoi(argv[++i]);
        } else if (arg == "-s" || arg == "--speed") {
            if (i + 1 < argc) speed = std::stod(argv[++i]);
        } else if (arg == "-o" || arg == "--offset") {
            if (i + 1 < argc) offset = std::stod(argv[++i]);
        } else if (arg == "-l" || arg == "--loop") {
            loop = true;
        } else if (arg == "--stats") {
            show_stats = true;
        } else if (arg == "-h" || arg == "--help") {
            std::cout << "Atlas Racing F1 25 Packet Replayer" << std::endl;
            std::cout << std::endl;
            std::cout << "Usage: " << argv[0] << " -f <file> [options]" << std::endl;
            std::cout << std::endl;
            std::cout << "Options:" << std::endl;
            std::cout << "  -f, --file <filename>    F125 recording file to replay" << std::endl;
            std::cout << "  -i, --ip <ip>            Target IP (default: 127.0.0.1)" << std::endl;
            std::cout << "  -p, --port <port>        Target UDP port (default: 20777)" << std::endl;
            std::cout << "  -s, --speed <multiplier> Playback speed 0.1-10.0 (default: 1.0)" << std::endl;
            std::cout << "  -o, --offset <seconds>   Start from time offset (default: 0.0)" << std::endl;
            std::cout << "  -l, --loop               Loop playback continuously" << std::endl;
            std::cout << "  --stats                  Show packet statistics only" << std::endl;
            std::cout << "  -h, --help               Show this help" << std::endl;
            return 0;
        }
    }

    if (filename.empty()) {
        std::cerr << "Error: No recording file specified. Use -f <filename>" << std::endl;
        return 1;
    }

    replayer = new PacketReplayerF125();

    if (!replayer->initialize(target_ip, target_port)) {
        delete replayer;
        return 1;
    }

    if (!replayer->openRecording(filename)) {
        delete replayer;
        return 1;
    }

    if (show_stats) {
        replayer->printPacketStats();
        delete replayer;
        return 0;
    }

    replayer->setPlaybackSpeed(speed);
    replayer->setLoopMode(loop);
    if (offset > 0) replayer->setStartOffset(offset);
    replayer->startReplay(target_ip, target_port);

    delete replayer;
    return 0;
}
