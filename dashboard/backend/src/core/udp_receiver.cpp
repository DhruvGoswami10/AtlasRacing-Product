#include "../../include/telemetry/udp_receiver.h"

#ifdef _WIN32
UDPReceiver::UDPReceiver() : socket_fd(INVALID_SOCKET), wsa_initialized(false) {}
#else
UDPReceiver::UDPReceiver() : socket_fd(-1) {}
#endif

UDPReceiver::~UDPReceiver() {
#ifdef _WIN32
    if (socket_fd != INVALID_SOCKET) {
        closesocket(socket_fd);
    }
    if (wsa_initialized) {
        WSACleanup();
    }
#else
    if (socket_fd >= 0) {
        close(socket_fd);
    }
#endif
}

bool UDPReceiver::initialize() {
#ifdef _WIN32
    // Initialize Winsock
    WSADATA wsaData;
    int result = WSAStartup(MAKEWORD(2, 2), &wsaData);
    if (result != 0) {
        std::cerr << "WSAStartup failed: " << result << std::endl;
        return false;
    }
    wsa_initialized = true;
#endif

    socket_fd = socket(AF_INET, SOCK_DGRAM, 0);
#ifdef _WIN32
    if (socket_fd == INVALID_SOCKET) {
        std::cerr << "Failed to create socket: " << WSAGetLastError() << std::endl;
        return false;
    }
#else
    if (socket_fd < 0) {
        std::cerr << "Failed to create socket" << std::endl;
        return false;
    }
#endif

    memset(&server_addr, 0, sizeof(server_addr));
    server_addr.sin_family = AF_INET;
    server_addr.sin_addr.s_addr = INADDR_ANY;
    server_addr.sin_port = htons(F1_24_PORT);

    if (bind(socket_fd, (struct sockaddr*)&server_addr, sizeof(server_addr)) < 0) {
#ifdef _WIN32
        std::cerr << "Failed to bind socket to port " << F1_24_PORT << ": " << WSAGetLastError() << std::endl;
#else
        std::cerr << "Failed to bind socket to port " << F1_24_PORT << std::endl;
#endif
        return false;
    }

    std::cout << "UDP receiver initialized on port " << F1_24_PORT << std::endl;
    return true;
}

int UDPReceiver::receivePacket(char* buffer) {
    struct sockaddr_in client_addr;
    socklen_t client_len = sizeof(client_addr);
    
#ifdef _WIN32
    int bytes_received = recvfrom(socket_fd, buffer, BUFFER_SIZE, 0, 
                                (struct sockaddr*)&client_addr, &client_len);
    
    if (bytes_received == SOCKET_ERROR) {
        std::cerr << "Error receiving packet: " << WSAGetLastError() << std::endl;
        return -1;
    }
#else
    int bytes_received = recvfrom(socket_fd, buffer, BUFFER_SIZE, 0, 
                                (struct sockaddr*)&client_addr, &client_len);
    
    if (bytes_received < 0) {
        std::cerr << "Error receiving packet" << std::endl;
        return -1;
    }
#endif
    
    return bytes_received;
}