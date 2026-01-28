#pragma once
#include <iostream>
#include <cstring>

#ifdef _WIN32
    #include <winsock2.h>
    #include <ws2tcpip.h>
    typedef int socklen_t;
#else
    #include <sys/socket.h>
    #include <netinet/in.h>
    #include <arpa/inet.h>
    #include <unistd.h>
#endif

class UDPReceiver {
private:
#ifdef _WIN32
    SOCKET socket_fd;
    bool wsa_initialized;
#else
    int socket_fd;
#endif
    struct sockaddr_in server_addr;
    static const int F1_24_PORT = 20777;
    static const int BUFFER_SIZE = 2048;

public:
    UDPReceiver();
    ~UDPReceiver();
    
    bool initialize();
    int receivePacket(char* buffer);
};