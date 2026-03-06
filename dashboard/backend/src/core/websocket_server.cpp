#include "../../include/telemetry/websocket_server.h"
#include <string>
#include <sstream>
#include <map>
#include <cerrno>
#include <cstdio>

#ifdef _WIN32
#include <winsock2.h>
#include <ws2tcpip.h>
#include <iphlpapi.h>
#undef close
#define close closesocket
typedef int socklen_t;
#define MSG_NOSIGNAL 0
#else
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <fcntl.h>
#include <unistd.h>
#include <ifaddrs.h>
#endif

namespace {

std::string getLocalIPAddress() {
#ifdef _WIN32
    char hostname[256];
    if (gethostname(hostname, sizeof(hostname)) == 0) {
        struct addrinfo hints{}, *result = nullptr;
        hints.ai_family = AF_INET;
        hints.ai_socktype = SOCK_DGRAM;
        if (getaddrinfo(hostname, nullptr, &hints, &result) == 0 && result) {
            char ip[INET_ADDRSTRLEN];
            inet_ntop(AF_INET, &((struct sockaddr_in*)result->ai_addr)->sin_addr, ip, sizeof(ip));
            freeaddrinfo(result);
            std::string addr(ip);
            if (addr != "127.0.0.1") return addr;
        }
        if (result) freeaddrinfo(result);
    }
#else
    struct ifaddrs *ifaddr, *ifa;
    if (getifaddrs(&ifaddr) == 0) {
        for (ifa = ifaddr; ifa != nullptr; ifa = ifa->ifa_next) {
            if (!ifa->ifa_addr || ifa->ifa_addr->sa_family != AF_INET) continue;
            char ip[INET_ADDRSTRLEN];
            inet_ntop(AF_INET, &((struct sockaddr_in*)ifa->ifa_addr)->sin_addr, ip, sizeof(ip));
            std::string addr(ip);
            if (addr != "127.0.0.1") {
                freeifaddrs(ifaddr);
                return addr;
            }
        }
        freeifaddrs(ifaddr);
    }
#endif
    return "127.0.0.1";
}

bool setSocketNonBlocking(int fd) {
#ifdef _WIN32
    u_long mode = 1;
    if (ioctlsocket(fd, FIONBIO, &mode) != 0) {
        std::cerr << "Failed to set socket non-blocking, error: " << WSAGetLastError() << std::endl;
        return false;
    }
#else
    int flags = fcntl(fd, F_GETFL, 0);
    if (flags == -1) {
        std::perror("fcntl(F_GETFL)");
        return false;
    }
    if (fcntl(fd, F_SETFL, flags | O_NONBLOCK) == -1) {
        std::perror("fcntl(F_SETFL)");
        return false;
    }
#endif
    return true;
}
}

WebSocketServer::WebSocketServer() : running(false) {
    // Initialize state sync storage
}

bool WebSocketServer::start() {
    std::cout << "Starting simple HTTP/WebSocket server on port " << WS_PORT << std::endl;
    
#ifdef _WIN32
    WSADATA wsaData;
    if (WSAStartup(MAKEWORD(2, 2), &wsaData) != 0) {
        std::cerr << "WSAStartup failed" << std::endl;
        return false;
    }
#endif
    
    running = true;
    
    // Start server thread
    std::thread server_thread(&WebSocketServer::serverLoop, this);
    server_thread.detach();
    
    std::cout << "✓ HTTP/WebSocket server started on port " << WS_PORT << std::endl;
    return true;
}

void WebSocketServer::broadcastTelemetry(const std::string& json_data) {
    std::lock_guard<std::mutex> lock(telemetry_clients_mutex);
    
    // Send to all connected telemetry clients
    auto it = telemetry_clients.begin();
    while (it != telemetry_clients.end()) {
        std::string sse_data = "data: " + json_data + "\n\n";
        const char* buffer = sse_data.c_str();
        size_t remaining = sse_data.length();
        bool dropClient = false;

        while (remaining > 0 && !dropClient) {
            int sent = send(*it, buffer, static_cast<int>(remaining), 0);
            if (sent < 0) {
#ifdef _WIN32
                int err = WSAGetLastError();
                if (err == WSAEWOULDBLOCK) {
                    // Client can't keep up right now; drop this payload but keep connection
                    break;
                }
#else
                if (errno == EWOULDBLOCK || errno == EAGAIN) {
                    break;
                }
#endif
                close(*it);
                it = telemetry_clients.erase(it);
                std::cout << "SSE telemetry client disconnected" << std::endl;
                dropClient = true;
            } else if (sent == 0) {
                break;
            } else {
                buffer += sent;
                remaining -= static_cast<size_t>(sent);
            }
        }

        if (!dropClient) {
            ++it;
        }
    }
    
    // Log occasionally
    static int log_counter = 0;
    if (++log_counter % 300 == 0) {
        std::cout << "Broadcasting telemetry SSE to " << telemetry_clients.size() << " clients: " << json_data.substr(0, 100) << "..." << std::endl;
    }
}

void WebSocketServer::broadcastEvents(const std::string& json_data) {
    std::lock_guard<std::mutex> lock(events_clients_mutex);
    
    // Send to all connected events clients
    auto it = events_clients.begin();
    while (it != events_clients.end()) {
        std::string sse_data = "data: " + json_data + "\n\n";
        const char* buffer = sse_data.c_str();
        size_t remaining = sse_data.length();
        bool dropClient = false;

        while (remaining > 0 && !dropClient) {
            int sent = send(*it, buffer, static_cast<int>(remaining), 0);
            if (sent < 0) {
#ifdef _WIN32
                int err = WSAGetLastError();
                if (err == WSAEWOULDBLOCK) {
                    break;
                }
#else
                if (errno == EWOULDBLOCK || errno == EAGAIN) {
                    break;
                }
#endif
                close(*it);
                it = events_clients.erase(it);
                std::cout << "SSE events client disconnected" << std::endl;
                dropClient = true;
            } else if (sent == 0) {
                break;
            } else {
                buffer += sent;
                remaining -= static_cast<size_t>(sent);
            }
        }

        if (!dropClient) {
            ++it;
        }
    }
    
    // Log occasionally
    static int events_log_counter = 0;
    if (++events_log_counter % 300 == 0) {
        std::cout << "Broadcasting events SSE to " << events_clients.size() << " clients: " << json_data.substr(0, 100) << "..." << std::endl;
    }
}

void WebSocketServer::broadcastMultiCarData(const std::string& json_data) {
    // Use same broadcasting mechanism
    broadcastTelemetry(json_data);
}

void WebSocketServer::stop() {
    running = false;
    
    // Close all telemetry clients
    {
        std::lock_guard<std::mutex> lock(telemetry_clients_mutex);
        for (int client_fd : telemetry_clients) {
            close(client_fd);
        }
        telemetry_clients.clear();
    }
    
    // Close all events clients
    {
        std::lock_guard<std::mutex> lock(events_clients_mutex);
        for (int client_fd : events_clients) {
            close(client_fd);
        }
        events_clients.clear();
    }
    
#ifdef _WIN32
    WSACleanup();
#endif
}

void WebSocketServer::serverLoop() {
    int server_fd = socket(AF_INET, SOCK_STREAM, 0);
    if (server_fd < 0) {
        std::cerr << "Failed to create socket" << std::endl;
        return;
    }
    
    int opt = 1;
    setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, (char*)&opt, sizeof(opt));
    
    struct sockaddr_in address;
    address.sin_family = AF_INET;
    address.sin_addr.s_addr = INADDR_ANY;
    address.sin_port = htons(WS_PORT);
    
    if (bind(server_fd, (struct sockaddr*)&address, sizeof(address)) < 0) {
        std::cerr << "Failed to bind to port " << WS_PORT << std::endl;
        close(server_fd);
        return;
    }
    
    if (listen(server_fd, 3) < 0) {
        std::cerr << "Failed to listen on port " << WS_PORT << std::endl;
        close(server_fd);
        return;
    }
    
    std::cout << "HTTP server listening on port " << WS_PORT << std::endl;
    
    while (running) {
        struct sockaddr_in client_addr;
        socklen_t client_len = sizeof(client_addr);
        
        int client_fd = accept(server_fd, (struct sockaddr*)&client_addr, &client_len);
        if (client_fd < 0) {
            if (running) {
                std::cerr << "Failed to accept connection" << std::endl;
            }
            continue;
        }
        
        // Handle client in separate thread
        std::thread(&WebSocketServer::handleNewConnection, this, client_fd).detach();
    }
    
    close(server_fd);
}

void WebSocketServer::handleNewConnection(int client_fd) {
    char buffer[4096];
    int bytes_read = recv(client_fd, buffer, sizeof(buffer) - 1, 0);
    
    if (bytes_read > 0) {
        buffer[bytes_read] = '\0';
        std::string request(buffer);
        
        // SSE endpoint for telemetry
        if (request.find("GET /telemetry") != std::string::npos) {
            // Send SSE headers
            std::string response = "HTTP/1.1 200 OK\r\n";
            response += "Content-Type: text/event-stream\r\n";
            response += "Cache-Control: no-cache\r\n";
            response += "Connection: keep-alive\r\n";
            response += "Access-Control-Allow-Origin: *\r\n";
            response += "Access-Control-Allow-Headers: Cache-Control\r\n";
            response += "\r\n";
            
            // Send initial connection message
            response += "data: {\"type\":\"connected\",\"message\":\"Atlas Racing Telemetry Server\"}\n\n";
            
            send(client_fd, response.c_str(), response.length(), 0);
            
            setSocketNonBlocking(client_fd);

            {
                std::lock_guard<std::mutex> lock(telemetry_clients_mutex);
                telemetry_clients.push_back(client_fd);
            }
            std::cout << "New SSE telemetry client connected" << std::endl;
            return; // Keep connection open for streaming
        }
        
        // SSE endpoint for events (same as telemetry for now)
        if (request.find("GET /events") != std::string::npos) {
            // Send SSE headers
            std::string response = "HTTP/1.1 200 OK\r\n";
            response += "Content-Type: text/event-stream\r\n";
            response += "Cache-Control: no-cache\r\n";
            response += "Connection: keep-alive\r\n";
            response += "Access-Control-Allow-Origin: *\r\n";
            response += "Access-Control-Allow-Headers: Cache-Control\r\n";
            response += "\r\n";

            // Send initial connection message
            response += "data: {\"type\":\"connected\",\"message\":\"Atlas Racing Events Server\"}\n\n";

            send(client_fd, response.c_str(), response.length(), 0);

            setSocketNonBlocking(client_fd);

            {
                std::lock_guard<std::mutex> lock(events_clients_mutex);
                events_clients.push_back(client_fd);
            }
            std::cout << "New SSE events client connected" << std::endl;
            return; // Keep connection open for streaming
        }

        // API info endpoint for QR code pairing
        if (request.find("GET /api/info") != std::string::npos) {
            std::string ip = getLocalIPAddress();
            std::string body = "{\"ip\":\"" + ip + "\",\"port\":" + std::to_string(WS_PORT) + ",\"version\":\"2.0.0\",\"name\":\"Atlas Racing\"}";
            std::string response =
                "HTTP/1.1 200 OK\r\n"
                "Content-Type: application/json\r\n"
                "Access-Control-Allow-Origin: *\r\n"
                "Content-Length: " + std::to_string(body.length()) + "\r\n"
                "\r\n" + body;
            send(client_fd, response.c_str(), response.length(), 0);
            close(client_fd);
            return;
        }

        // State sync SSE endpoint
        if (request.find("GET /api/state-sync/") != std::string::npos) {
            handleStateSyncSSE(client_fd, request);
            return;
        }

        // State sync broadcast endpoint
        if (request.find("POST /api/state-sync/broadcast") != std::string::npos) {
            handleStateBroadcast(client_fd, request);
            return;
        }
        
        // CORS preflight
        if (request.find("OPTIONS") != std::string::npos) {
            sendCORSResponse(client_fd);
            return;
        }

        // Default GET response
        if (request.find("GET /") != std::string::npos) {
            sendCORSResponse(client_fd);
            return;
        }
    }

    // Send 404 for unknown requests
    send404(client_fd);
    
    close(client_fd);
}

void WebSocketServer::removeConnection(int client_fd) {
    // Check and remove from telemetry clients
    {
        std::lock_guard<std::mutex> lock(telemetry_clients_mutex);
        telemetry_clients.erase(
            std::remove(telemetry_clients.begin(), telemetry_clients.end(), client_fd),
            telemetry_clients.end()
        );
    }

    // Check and remove from events clients
    {
        std::lock_guard<std::mutex> lock(events_clients_mutex);
        events_clients.erase(
            std::remove(events_clients.begin(), events_clients.end(), client_fd),
            events_clients.end()
        );
    }

    // Check and remove from state sync clients
    {
        std::lock_guard<std::mutex> lock(state_sync_mutex);
        state_sync_clients.erase(
            std::remove(state_sync_clients.begin(), state_sync_clients.end(), client_fd),
            state_sync_clients.end()
        );
    }

    close(client_fd);
    std::cout << "Client disconnected" << std::endl;
}

// State sync method implementations
void WebSocketServer::handleStateSyncSSE(int client_fd, const std::string& request) {
    // Extract dashboard ID from URL (e.g., /api/state-sync/f1v3)
    size_t pos = request.find("/api/state-sync/");
    std::string dashboard_id = "f1v3"; // default
    if (pos != std::string::npos) {
        pos += 16; // length of "/api/state-sync/"
        size_t end = request.find(" ", pos);
        if (end != std::string::npos) {
            dashboard_id = request.substr(pos, end - pos);
        }
    }

    // Send SSE headers
    std::string response =
        "HTTP/1.1 200 OK\r\n"
        "Content-Type: text/event-stream\r\n"
        "Cache-Control: no-cache\r\n"
        "Connection: keep-alive\r\n"
        "Access-Control-Allow-Origin: *\r\n"
        "Access-Control-Allow-Headers: Cache-Control\r\n"
        "\r\n";

    send(client_fd, response.c_str(), response.length(), 0);

    // Add client to state sync list
    {
        std::lock_guard<std::mutex> lock(state_sync_mutex);
        setSocketNonBlocking(client_fd);
        state_sync_clients.push_back(client_fd);
    }

    // Send current state if available
    auto state_it = dashboard_states.find(dashboard_id);
    if (state_it != dashboard_states.end()) {
        std::string sse_message = "data: " + state_it->second + "\n\n";
        send(client_fd, sse_message.c_str(), sse_message.length(), MSG_NOSIGNAL);
    }

    std::cout << "State sync SSE client connected for dashboard: " << dashboard_id << std::endl;
}

void WebSocketServer::handleStateBroadcast(int client_fd, const std::string& request) {
    // Extract JSON body from POST request
    size_t body_pos = request.find("\r\n\r\n");
    if (body_pos == std::string::npos) {
        send404(client_fd);
        return;
    }

    std::string json_body = request.substr(body_pos + 4);

    // Parse dashboard ID from JSON (simple extraction)
    std::string dashboard_id = "f1v3"; // default
    size_t dashboard_pos = json_body.find("\"dashboard\":\"");
    if (dashboard_pos != std::string::npos) {
        dashboard_pos += 13; // length of "dashboard":""
        size_t end_pos = json_body.find("\"", dashboard_pos);
        if (end_pos != std::string::npos) {
            dashboard_id = json_body.substr(dashboard_pos, end_pos - dashboard_pos);
        }
    }

    // Store state
    dashboard_states[dashboard_id] = json_body;

    // Broadcast to all state sync clients
    broadcastStateSync(json_body);

    // Send success response
    std::string response =
        "HTTP/1.1 200 OK\r\n"
        "Content-Type: application/json\r\n"
        "Access-Control-Allow-Origin: *\r\n"
        "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n"
        "Access-Control-Allow-Headers: Content-Type\r\n"
        "Content-Length: 25\r\n"
        "\r\n"
        "{\"status\":\"broadcast\"}";

    send(client_fd, response.c_str(), response.length(), 0);

    std::cout << "State broadcasted for dashboard: " << dashboard_id << std::endl;
}

void WebSocketServer::broadcastStateSync(const std::string& json_data) {
    std::lock_guard<std::mutex> lock(state_sync_mutex);

    // Create SSE message
    std::string sse_message = "data: " + json_data + "\n\n";

    auto it = state_sync_clients.begin();
    while (it != state_sync_clients.end()) {
        const char* buffer = sse_message.c_str();
        size_t remaining = sse_message.length();
        bool dropClient = false;

        while (remaining > 0 && !dropClient) {
            int sent = send(*it, buffer, static_cast<int>(remaining), MSG_NOSIGNAL);
            if (sent < 0) {
#ifdef _WIN32
                int err = WSAGetLastError();
                if (err == WSAEWOULDBLOCK) {
                    break;
                }
#else
                if (errno == EWOULDBLOCK || errno == EAGAIN) {
                    break;
                }
#endif
                close(*it);
                it = state_sync_clients.erase(it);
                std::cout << "State sync client disconnected" << std::endl;
                dropClient = true;
            } else if (sent == 0) {
                break;
            } else {
                buffer += sent;
                remaining -= static_cast<size_t>(sent);
            }
        }

        if (!dropClient) {
            ++it;
        }
    }

    std::cout << "State sync message sent to " << state_sync_clients.size() << " clients" << std::endl;
}

void WebSocketServer::sendCORSResponse(int client_fd) {
    std::string response =
        "HTTP/1.1 200 OK\r\n"
        "Access-Control-Allow-Origin: *\r\n"
        "Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS\r\n"
        "Access-Control-Allow-Headers: Content-Type, Authorization\r\n"
        "Content-Type: text/plain\r\n"
        "Content-Length: 24\r\n"
        "\r\n"
        "Atlas Racing Server OK\n";

    send(client_fd, response.c_str(), response.length(), 0);
    close(client_fd);
}

void WebSocketServer::send404(int client_fd) {
    std::string response =
        "HTTP/1.1 404 Not Found\r\n"
        "Content-Type: text/plain\r\n"
        "Access-Control-Allow-Origin: *\r\n"
        "Content-Length: 9\r\n"
        "\r\n"
        "Not Found";

    send(client_fd, response.c_str(), response.length(), 0);
    close(client_fd);
}
