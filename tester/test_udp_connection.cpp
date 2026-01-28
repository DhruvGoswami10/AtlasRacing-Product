#include <iostream>
#include <winsock2.h>
#include <ws2tcpip.h>

int main() {
    WSADATA wsaData;
    WSAStartup(MAKEWORD(2, 2), &wsaData);
    
    int sock = socket(AF_INET, SOCK_DGRAM, 0);
    if (sock == INVALID_SOCKET) {
        std::cerr << "Failed to create socket" << std::endl;
        return 1;
    }
    
    struct sockaddr_in server_addr;
    server_addr.sin_family = AF_INET;
    server_addr.sin_port = htons(20777);
    inet_pton(AF_INET, "127.0.0.1", &server_addr.sin_addr);
    
    char test_data[] = "TEST PACKET";
    int bytes_sent = sendto(sock, test_data, sizeof(test_data), 0,
                           (struct sockaddr*)&server_addr, sizeof(server_addr));
    
    if (bytes_sent > 0) {
        std::cout << "✅ Successfully sent " << bytes_sent << " bytes to 127.0.0.1:20777" << std::endl;
    } else {
        std::cout << "❌ Failed to send data (Error: " << WSAGetLastError() << ")" << std::endl;
    }
    
    closesocket(sock);
    WSACleanup();
    return 0;
}