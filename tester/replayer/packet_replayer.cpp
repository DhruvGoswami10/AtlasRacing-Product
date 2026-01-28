#include <iostream>
#include <fstream>
#include <chrono>
#include <thread>
#include <vector>
#include <string>
#include <cstring>
#include <signal.h>
#include "../recorder/f124_file_format.h"

#ifdef _WIN32
#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>
#include <processthreadsapi.h>
typedef int socklen_t;
#else
#include <sys/socket.h>
#include <netinet/in.h>
#include <unistd.h>
#include <arpa/inet.h>
#endif

struct PacketEntry {
    uint64_t timestamp_ms;
    std::vector<uint8_t> data;
    uint8_t packet_id;
};

class PacketReplayer {
private:
    int socket_fd;
    std::vector<PacketEntry> packets;
    F124FileHeader file_header;
    bool replaying;
    bool paused;
    double speed_multiplier;
    bool loop_mode;
    size_t current_packet;
    size_t start_packet_index;
    double start_offset_seconds;
    std::chrono::steady_clock::time_point replay_start_time;
    std::chrono::steady_clock::time_point pause_time;
    std::string control_file_path;
    
public:
    PacketReplayer() : socket_fd(-1), replaying(false), paused(false), speed_multiplier(1.0), 
                      loop_mode(false), current_packet(0), start_packet_index(0), start_offset_seconds(0.0) {
        // Create unique control file path based on process ID
#ifdef _WIN32
        control_file_path = "replay_control_" + std::to_string(GetCurrentProcessId()) + ".tmp";
#else
        control_file_path = "replay_control_" + std::to_string(getpid()) + ".tmp";
#endif
        std::remove(control_file_path.c_str()); // Clean up any existing control file
    }
    
    bool initialize(const std::string& target_ip = "127.0.0.1", int target_port = 20777) {
        std::cout << "▶️  Atlas Racing Packet Replayer" << std::endl;
        std::cout << "==================================" << std::endl;
        
#ifdef _WIN32
        WSADATA wsaData;
        if (WSAStartup(MAKEWORD(2, 2), &wsaData) != 0) {
            std::cerr << "Failed to initialize Winsock" << std::endl;
            return false;
        }
#endif
        
        // Create UDP socket
        socket_fd = socket(AF_INET, SOCK_DGRAM, 0);
        if (socket_fd < 0) {
            std::cerr << "Failed to create socket" << std::endl;
            return false;
        }
        
        std::cout << "✓ Targeting " << target_ip << ":" << target_port << std::endl;
        return true;
    }
    
    bool loadRecording(const std::string& filename) {
        std::ifstream file(filename, std::ios::binary);
        if (!file.is_open()) {
            std::cerr << "Failed to open recording file: " << filename << std::endl;
            return false;
        }
        
        // Read header
        file.read((char*)&file_header, sizeof(file_header));
        if (strncmp(file_header.magic, F124_MAGIC, 4) != 0) {
            std::cerr << "Invalid F124 file format" << std::endl;
            return false;
        }
        
        if (file_header.version != F124_VERSION) {
            std::cerr << "Unsupported file version: " << file_header.version << std::endl;
            return false;
        }
        
        std::cout << "📁 Loading: " << filename << std::endl;
        std::cout << "📝 Session: " << file_header.session_name << std::endl;
        std::cout << "⏱️  Duration: " << (file_header.duration_ms / 1000.0f) << "s" << std::endl;
        std::cout << "📦 Packets: " << file_header.total_packets << std::endl;
        
        // Read all packets
        packets.clear();
        packets.reserve(file_header.total_packets);
        
        while (file.good()) {
            F124PacketRecord record;
            file.read((char*)&record, sizeof(record));
            if (file.gcount() != sizeof(record)) break;
            
            if (record.packet_size > MAX_PACKET_SIZE) {
                std::cerr << "Invalid packet size: " << record.packet_size << std::endl;
                return false;
            }
            
            PacketEntry entry;
            entry.timestamp_ms = record.timestamp_ms;
            entry.packet_id = record.packet_id;
            entry.data.resize(record.packet_size);
            
            file.read((char*)entry.data.data(), record.packet_size);
            if (file.gcount() != record.packet_size) {
                std::cerr << "Failed to read packet data" << std::endl;
                return false;
            }
            
            packets.push_back(std::move(entry));
        }
        
        file.close();
        
        std::cout << "✓ Loaded " << packets.size() << " packets" << std::endl;
        return true;
    }
    
    void setPlaybackSpeed(double multiplier) {
        if (multiplier <= 0 || multiplier > 10.0) {
            std::cerr << "Invalid speed multiplier: " << multiplier << std::endl;
            return;
        }
        speed_multiplier = multiplier;
        std::cout << "🎛️  Playback speed: " << multiplier << "x" << std::endl;
    }
    
    void setLoopMode(bool enable) {
        loop_mode = enable;
        std::cout << "🔄 Loop mode: " << (enable ? "ON" : "OFF") << std::endl;
    }
    
    void setStartOffset(double offset_seconds) {
        start_offset_seconds = offset_seconds;
        std::cout << "⏭️  Start offset: " << offset_seconds << "s" << std::endl;
    }
    
    size_t findPacketAtTime(double target_seconds) {
        if (packets.empty()) return 0;
        
        uint64_t target_ms = (uint64_t)(target_seconds * 1000.0);
        uint64_t first_packet_time = packets[0].timestamp_ms;
        uint64_t target_time = first_packet_time + target_ms;
        
        // Binary search for the closest packet
        size_t left = 0, right = packets.size() - 1;
        size_t best = 0;
        
        while (left <= right) {
            size_t mid = left + (right - left) / 2;
            
            if (packets[mid].timestamp_ms <= target_time) {
                best = mid;
                left = mid + 1;
            } else {
                if (mid == 0) break;
                right = mid - 1;
            }
        }
        
        std::cout << "🎯 Found packet " << best << " at time " 
                  << ((packets[best].timestamp_ms - first_packet_time) / 1000.0f) << "s" << std::endl;
        return best;
    }
    
    void checkControlCommands() {
        std::ifstream control_file(control_file_path);
        if (control_file.is_open()) {
            std::string command;
            std::getline(control_file, command);
            control_file.close();
            
            std::cout << "🎮 Control command received: '" << command << "'" << std::endl;
            
            if (command == "pause" && !paused) {
                pauseReplay();
            } else if (command == "resume" && paused) {
                resumeReplay();
            } else if (command == "stop") {
                stopReplay();
            }
            
            // Remove the control file after processing
            std::remove(control_file_path.c_str());
        }
    }
    
    void pauseReplay() {
        if (!paused && replaying) {
            paused = true;
            pause_time = std::chrono::steady_clock::now();
            std::cout << "⏸️  Replay paused" << std::endl;
        }
    }
    
    void resumeReplay() {
        if (paused && replaying) {
            auto pause_duration = std::chrono::steady_clock::now() - pause_time;
            replay_start_time += pause_duration; // Adjust start time to account for pause
            paused = false;
            std::cout << "▶️  Replay resumed" << std::endl;
        }
    }
    
    std::string getControlFilePath() const {
        return control_file_path;
    }
    
    void startReplay(const std::string& target_ip = "127.0.0.1", int target_port = 20777) {
        if (packets.empty()) {
            std::cerr << "No packets loaded!" << std::endl;
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
        current_packet = 0;
        replay_start_time = std::chrono::steady_clock::now();
        
        std::cout << std::endl;
        std::cout << "▶️  Starting replay..." << std::endl;
        std::cout << "🎯 Target: " << target_ip << ":" << target_port << std::endl;
        std::cout << "⚡ Speed: " << speed_multiplier << "x" << std::endl;
        std::cout << "🔄 Loop: " << (loop_mode ? "ON" : "OFF") << std::endl;
        std::cout << "🎮 Control: " << control_file_path << std::endl;
        std::cout << "Press Ctrl+C to stop" << std::endl;
        std::cout << std::endl;
        
        auto last_progress_time = std::chrono::steady_clock::now();
        size_t last_progress_packet = 0;
        
        do {
            // Calculate start packet index based on offset
            start_packet_index = (start_offset_seconds > 0) ? findPacketAtTime(start_offset_seconds) : 0;
            current_packet = start_packet_index;
            replay_start_time = std::chrono::steady_clock::now();
            
            while (replaying && current_packet < packets.size()) {
                // Check for control commands every few iterations
                if (current_packet % 10 == 0) {
                    checkControlCommands();
                }
                
                // If paused, wait and continue checking for commands
                if (paused) {
                    std::this_thread::sleep_for(std::chrono::milliseconds(100));
                    continue;
                }
                
                const auto& packet = packets[current_packet];
                
                // Calculate when this packet should be sent (relative to start packet time)
                uint64_t start_packet_time = (start_packet_index < packets.size()) ? 
                    packets[start_packet_index].timestamp_ms : packets[0].timestamp_ms;
                uint64_t relative_time = packet.timestamp_ms - start_packet_time;
                auto target_time = replay_start_time + std::chrono::milliseconds(
                    (uint64_t)(relative_time / speed_multiplier));
                
                // Wait until it's time to send this packet
                auto now = std::chrono::steady_clock::now();
                if (now < target_time) {
                    std::this_thread::sleep_until(target_time);
                }
                
                // Send packet
                int bytes_sent = sendto(socket_fd, (char*)packet.data.data(), packet.data.size(), 0,
                                      (struct sockaddr*)&server_addr, sizeof(server_addr));
                
                if (bytes_sent < 0) {
#ifdef _WIN32
                    std::cerr << "Failed to send packet " << current_packet << " (WSA Error: " << WSAGetLastError() << ")" << std::endl;
#else
                    std::cerr << "Failed to send packet " << current_packet << " (Error: " << errno << ")" << std::endl;
#endif
                } else if (current_packet % 1000 == 0) {
                    // Debug: Print every 1000th packet
                    std::cout << "📡 Sent packet " << current_packet << " (" << bytes_sent << " bytes) to " 
                              << target_ip << ":" << target_port << std::endl;
                }
                
                current_packet++;
                
                // Print progress every 5 seconds
                now = std::chrono::steady_clock::now();
                auto progress_elapsed = std::chrono::duration_cast<std::chrono::seconds>(
                    now - last_progress_time).count();
                if (progress_elapsed >= 5) {
                    size_t packets_in_period = current_packet - last_progress_packet;
                    double pps = packets_in_period / (double)progress_elapsed;
                    double progress = (current_packet * 100.0) / packets.size();
                    
                    auto session_elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(
                        now - replay_start_time).count();
                    
                    std::cout << "📊 Progress: " << (int)progress << "% (" << current_packet 
                              << "/" << packets.size() << ") | Rate: " << (int)pps << " pps"
                              << " | Elapsed: " << (session_elapsed / 1000.0f) << "s" << std::endl;
                    
                    last_progress_time = now;
                    last_progress_packet = current_packet;
                }
            }
            
            if (replaying && loop_mode) {
                std::cout << "🔄 Looping session..." << std::endl;
            }
            
        } while (replaying && loop_mode);
        
        std::cout << "⏹️  Replay finished" << std::endl;
    }
    
    void stopReplay() {
        replaying = false;
    }
    
    void printPacketStats() {
        if (packets.empty()) {
            std::cout << "No packets loaded" << std::endl;
            return;
        }
        
        // Count packets by type
        std::vector<size_t> packet_counts(15, 0);
        for (const auto& packet : packets) {
            if (packet.packet_id < 15) {
                packet_counts[packet.packet_id]++;
            }
        }
        
        std::cout << std::endl;
        std::cout << "📊 Packet Statistics:" << std::endl;
        std::cout << "---------------------" << std::endl;
        
        const char* packet_names[] = {
            "Motion", "Session", "Lap Data", "Event", "Participants",
            "Car Setups", "Car Telemetry", "Car Status", "Final Classification",
            "Lobby Info", "Car Damage", "Session History", "Tyre Sets",
            "Motion Ex", "Time Trial"
        };
        
        for (int i = 0; i < 15; i++) {
            if (packet_counts[i] > 0) {
                std::cout << "  " << packet_names[i] << ": " << packet_counts[i] << std::endl;
            }
        }
        std::cout << std::endl;
    }
    
    ~PacketReplayer() {
        if (replaying) {
            stopReplay();
        }
        
        if (socket_fd >= 0) {
#ifdef _WIN32
            closesocket(socket_fd);
            WSACleanup();
#else
            close(socket_fd);
#endif
        }
        
        // Clean up control file
        std::remove(control_file_path.c_str());
    }
};

PacketReplayer* replayer = nullptr;

void signalHandler(int signal) {
    std::cout << std::endl << "Received signal " << signal << ", stopping replay..." << std::endl;
    if (replayer) {
        replayer->stopReplay();
    }
}

int main(int argc, char* argv[]) {
    signal(SIGINT, signalHandler);
    signal(SIGTERM, signalHandler);
    
    std::string filename = "";
    std::string target_ip = "127.0.0.1";
    int target_port = 20777;
    double speed = 1.0;
    double offset = 0.0;
    bool loop = false;
    bool show_stats = false;
    
    // Parse command line arguments
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
            std::cout << "Usage: " << argv[0] << " -f <file> [options]" << std::endl;
            std::cout << "Options:" << std::endl;
            std::cout << "  -f, --file <filename>    F124 recording file to replay" << std::endl;
            std::cout << "  -i, --ip <ip>            Target IP address (default: 127.0.0.1)" << std::endl;
            std::cout << "  -p, --port <port>        Target UDP port (default: 20777)" << std::endl;
            std::cout << "  -s, --speed <multiplier> Playback speed (0.1-10.0, default: 1.0)" << std::endl;
            std::cout << "  -o, --offset <seconds>   Start playback from time offset (default: 0.0)" << std::endl;
            std::cout << "  -l, --loop               Loop playback continuously" << std::endl;
            std::cout << "  --stats                  Show packet statistics only" << std::endl;
            std::cout << "  -h, --help               Show this help message" << std::endl;
            return 0;
        }
    }
    
    if (filename.empty()) {
        std::cerr << "Error: No recording file specified. Use -f <filename>" << std::endl;
        return 1;
    }
    
    replayer = new PacketReplayer();
    
    if (!replayer->initialize(target_ip, target_port)) {
        delete replayer;
        return 1;
    }
    
    if (!replayer->loadRecording(filename)) {
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