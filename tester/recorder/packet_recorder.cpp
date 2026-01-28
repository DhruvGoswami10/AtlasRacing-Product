#include <iostream>
#include <fstream>
#include <chrono>
#include <string>
#include <cstring>
#include <signal.h>
#include <thread>
#include <cerrno>
#include "f124_file_format.h"

#ifdef _WIN32
#include <winsock2.h>
#include <ws2tcpip.h>
typedef int socklen_t;
#else
#include <sys/socket.h>
#include <netinet/in.h>
#include <unistd.h>
#include <arpa/inet.h>
#endif

class PacketRecorder {
private:
    int socket_fd;
    std::ofstream file;
    std::string current_filename;
    std::chrono::steady_clock::time_point start_time;
    std::chrono::steady_clock::time_point last_packet_time;
    uint64_t packet_count;
    bool recording;
    
public:
    PacketRecorder() : socket_fd(-1), packet_count(0), recording(false) {}
    
    bool initialize(int port = 20777) {
        std::cout << "🎬 Atlas Racing Packet Recorder" << std::endl;
        std::cout << "=================================" << std::endl;
        
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
        
        // Set socket to non-blocking for timeout
        struct timeval timeout;
        timeout.tv_sec = 0;
        timeout.tv_usec = 100000; // 100ms timeout
        setsockopt(socket_fd, SOL_SOCKET, SO_RCVTIMEO, (char*)&timeout, sizeof(timeout));
        
        // Bind to port
        struct sockaddr_in server_addr;
        memset(&server_addr, 0, sizeof(server_addr));
        server_addr.sin_family = AF_INET;
        server_addr.sin_addr.s_addr = INADDR_ANY;
        server_addr.sin_port = htons(port);
        
        if (bind(socket_fd, (struct sockaddr*)&server_addr, sizeof(server_addr)) < 0) {
            std::cerr << "Failed to bind to port " << port << std::endl;
            return false;
        }
        
        std::cout << "✓ Listening on UDP port " << port << std::endl;
        return true;
    }
    
    bool startRecording(const std::string& filename, const std::string& session_name = "") {
        if (recording) {
            std::cerr << "Already recording!" << std::endl;
            return false;
        }
        
        current_filename = filename;
        file.open(filename, std::ios::binary);
        if (!file.is_open()) {
            std::cerr << "Failed to create recording file: " << filename << std::endl;
            return false;
        }
        
        // Write file header
        F124FileHeader header;
        memset(&header, 0, sizeof(header));
        strcpy(header.magic, "F124");
        header.version = 1;
        header.created_timestamp = std::chrono::duration_cast<std::chrono::milliseconds>(
            std::chrono::system_clock::now().time_since_epoch()).count();
        
        if (!session_name.empty()) {
            strncpy(header.session_name, session_name.c_str(), sizeof(header.session_name) - 1);
        }
        
        file.write((char*)&header, sizeof(header));
        
        start_time = std::chrono::steady_clock::now();
        last_packet_time = start_time;
        packet_count = 0;
        recording = true;
        
        std::cout << "🔴 Recording started: " << filename << std::endl;
        if (!session_name.empty()) {
            std::cout << "📝 Session: " << session_name << std::endl;
        }
        std::cout << "Press Ctrl+C to stop recording" << std::endl;
        
        return true;
    }
    
    void recordLoop() {
        if (!recording) {
            std::cerr << "Not recording!" << std::endl;
            return;
        }
        
        char buffer[2048];
        struct sockaddr_in client_addr;
        socklen_t client_len = sizeof(client_addr);
        
        auto last_stats_time = std::chrono::steady_clock::now();
        uint64_t last_stats_count = 0;
        uint64_t packets_since_last_flush = 0;
        
        while (recording) {
            int bytes_received = recvfrom(socket_fd, buffer, sizeof(buffer), 0,
                                        (struct sockaddr*)&client_addr, &client_len);
            
            if (bytes_received > 0) {
                auto current_time = std::chrono::steady_clock::now();
                auto elapsed_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
                    current_time - start_time).count();
                
                // Extract packet ID from F1 24 packet header (first byte after header is packet ID)
                uint8_t packet_id = 0;
                if (bytes_received >= 24) { // F1 24 packet header is 24 bytes
                    packet_id = buffer[20]; // Packet ID is at offset 20 in F1 24 header
                }
                
                // Create packet record
                F124PacketRecord record;
                record.timestamp_ms = elapsed_ms;
                record.packet_size = bytes_received;
                record.packet_id = packet_id;
                
                // Write packet record + data
                file.write((char*)&record, sizeof(record));
                file.write(buffer, bytes_received);
                
                if (!file.good()) {
                    std::cerr << "[Recorder] Disk write error detected. Stopping recording." << std::endl;
                    recording = false;
                    break;
                }
                
                packet_count++;
                packets_since_last_flush++;
                last_packet_time = current_time;
                
                if (packets_since_last_flush >= 200) {
                    file.flush();
                    packets_since_last_flush = 0;
                }
                
                // Print stats every 5 seconds
                auto stats_elapsed = std::chrono::duration_cast<std::chrono::seconds>(
                    current_time - last_stats_time).count();
                if (stats_elapsed >= 5) {
                    uint64_t packets_in_period = packet_count - last_stats_count;
                    double pps = packets_in_period / (double)stats_elapsed;
                    
                    std::cout << "?? Packets: " << packet_count 
                              << " | Rate: " << (int)pps << " pps"
                              << " | Duration: " << (elapsed_ms / 1000.0f) << "s" << std::endl;
                    
                    last_stats_time = current_time;
                    last_stats_count = packet_count;
                }
            } else if (bytes_received < 0) {
#ifdef _WIN32
                int error_code = WSAGetLastError();
                if (error_code == WSAEWOULDBLOCK || error_code == WSAEINTR) {
                    std::this_thread::sleep_for(std::chrono::milliseconds(5));
                    continue;
                }
                std::cerr << "[Recorder] Socket error (" << error_code << "), retrying..." << std::endl;
#else
                int error_code = errno;
                if (error_code == EWOULDBLOCK || error_code == EAGAIN || error_code == EINTR) {
                    std::this_thread::sleep_for(std::chrono::milliseconds(5));
                    continue;
                }
                std::cerr << "[Recorder] Socket error (" << error_code << "), retrying..." << std::endl;
#endif
                std::this_thread::sleep_for(std::chrono::milliseconds(50));
            } else {
                // No data received, yield briefly to avoid busy waiting
                std::this_thread::sleep_for(std::chrono::milliseconds(5));
            }
        }
        
        if (packets_since_last_flush > 0) {
            file.flush();
        }
    }

    void stopRecording() {
        if (!recording) return;
        
        recording = false;
        
        auto end_time = std::chrono::steady_clock::now();
        auto total_duration = std::chrono::duration_cast<std::chrono::milliseconds>(
            end_time - start_time).count();
        
        // Update file header with final stats
        file.close();
        
        // Reopen for reading and writing to update header
        std::fstream update_file(current_filename, std::ios::in | std::ios::out | std::ios::binary);
        if (update_file.is_open()) {
            F124FileHeader header;
            update_file.read((char*)&header, sizeof(header));
            
            header.total_packets = packet_count;
            header.duration_ms = total_duration;
            
            update_file.seekp(0);
            update_file.write((char*)&header, sizeof(header));
            update_file.close();
        }
        
        std::cout << std::endl;
        std::cout << "⏹️  Recording stopped" << std::endl;
        std::cout << "📊 Final stats:" << std::endl;
        std::cout << "   Packets: " << packet_count << std::endl;
        std::cout << "   Duration: " << (total_duration / 1000.0f) << "s" << std::endl;
        std::cout << "   Avg rate: " << (packet_count / (total_duration / 1000.0f)) << " pps" << std::endl;
    }
    
    ~PacketRecorder() {
        if (recording) {
            stopRecording();
        }
        
        if (socket_fd >= 0) {
#ifdef _WIN32
            closesocket(socket_fd);
            WSACleanup();
#else
            close(socket_fd);
#endif
        }
    }
};

PacketRecorder* recorder = nullptr;

void signalHandler(int signal) {
    std::cout << std::endl << "Received signal " << signal << ", stopping recording..." << std::endl;
    if (recorder) {
        recorder->stopRecording();
    }
}

int main(int argc, char* argv[]) {
    signal(SIGINT, signalHandler);
    signal(SIGTERM, signalHandler);
    
    std::string filename = "session_recording.f124";
    std::string session_name = "";
    int port = 20777;
    
    // Parse command line arguments
    for (int i = 1; i < argc; i++) {
        std::string arg = argv[i];
        if (arg == "-f" || arg == "--file") {
            if (i + 1 < argc) filename = argv[++i];
        } else if (arg == "-n" || arg == "--name") {
            if (i + 1 < argc) session_name = argv[++i];
        } else if (arg == "-p" || arg == "--port") {
            if (i + 1 < argc) port = std::stoi(argv[++i]);
        } else if (arg == "-h" || arg == "--help") {
            std::cout << "Usage: " << argv[0] << " [options]" << std::endl;
            std::cout << "Options:" << std::endl;
            std::cout << "  -f, --file <filename>    Output file (default: session_recording.f124)" << std::endl;
            std::cout << "  -n, --name <name>        Session name for metadata" << std::endl;
            std::cout << "  -p, --port <port>        UDP port to listen on (default: 20777)" << std::endl;
            std::cout << "  -h, --help               Show this help message" << std::endl;
            return 0;
        }
    }
    
    recorder = new PacketRecorder();
    
    if (!recorder->initialize(port)) {
        delete recorder;
        return 1;
    }
    
    if (!recorder->startRecording(filename, session_name)) {
        delete recorder;
        return 1;
    }
    
    recorder->recordLoop();
    
    delete recorder;
    return 0;
}
