#include "../../include/telemetry/websocket_server.h"
#include <string>
#include <sstream>
#include <fstream>
#include <memory>
#include <map>

#ifdef _WIN32
    #include <winsock2.h>
    #include <ws2tcpip.h>
    typedef int socklen_t;
    #define MSG_NOSIGNAL 0
#else
    #include <sys/socket.h>
    #include <netinet/in.h>
    #include <arpa/inet.h>
    #include <unistd.h>
#endif

// Simple HTTP Server with Server-Sent Events for real-time data
class SimpleHTTPServer {
private:
#ifdef _WIN32
    SOCKET server_fd;
    std::vector<SOCKET> sse_clients;
    std::vector<SOCKET> state_sync_clients;
    bool wsa_initialized;
#else
    int server_fd;
    std::vector<int> sse_clients;
    std::vector<int> state_sync_clients;
#endif
    std::mutex clients_mutex;
    std::mutex state_sync_mutex;
    bool running;
    static const int HTTP_PORT = 8080;

    // State sync storage
    std::map<std::string, std::string> dashboard_states;

public:
#ifdef _WIN32
    SimpleHTTPServer() : server_fd(INVALID_SOCKET), running(false), wsa_initialized(false) {
    }
#else
    SimpleHTTPServer() : server_fd(-1), running(false) {
    }
#endif

    bool start() {
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

        server_fd = socket(AF_INET, SOCK_STREAM, 0);
#ifdef _WIN32
        if (server_fd == INVALID_SOCKET) {
            std::cerr << "Failed to create HTTP server socket: " << WSAGetLastError() << std::endl;
            return false;
        }
#else
        if (server_fd < 0) {
            std::cerr << "Failed to create HTTP server socket" << std::endl;
            return false;
        }
#endif

        int opt = 1;
#ifdef _WIN32
        setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, (const char*)&opt, sizeof(opt));
#else
        setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));
#endif

        struct sockaddr_in address;
        address.sin_family = AF_INET;
        address.sin_addr.s_addr = INADDR_ANY;
        address.sin_port = htons(HTTP_PORT);

        if (bind(server_fd, (struct sockaddr*)&address, sizeof(address)) < 0) {
            std::cerr << "Failed to bind HTTP server to port " << HTTP_PORT << std::endl;
            return false;
        }

        if (listen(server_fd, 10) < 0) {
            std::cerr << "Failed to listen on HTTP server" << std::endl;
            return false;
        }

        running = true;
        std::cout << "HTTP server with SSE listening on port " << HTTP_PORT << std::endl;
        return true;
    }

    void acceptConnections() {
        while (running) {
            struct sockaddr_in client_addr;
            socklen_t client_len = sizeof(client_addr);
            
#ifdef _WIN32
            SOCKET client_fd = accept(server_fd, (struct sockaddr*)&client_addr, &client_len);
            if (client_fd == INVALID_SOCKET) {
                if (running) {
                    std::cerr << "Failed to accept HTTP connection: " << WSAGetLastError() << std::endl;
                }
                continue;
            }
#else
            int client_fd = accept(server_fd, (struct sockaddr*)&client_addr, &client_len);
            if (client_fd < 0) {
                if (running) {
                    std::cerr << "Failed to accept HTTP connection" << std::endl;
                }
                continue;
            }
#endif

            // Handle HTTP request in a separate thread
            std::thread(&SimpleHTTPServer::handleClient, this, client_fd).detach();
        }
    }

    void handleClient(
#ifdef _WIN32
        SOCKET client_fd
#else
        int client_fd
#endif
    ) {
        char buffer[4096];
#ifdef _WIN32
        int bytes_read = recv(client_fd, buffer, sizeof(buffer) - 1, 0);
#else
        ssize_t bytes_read = recv(client_fd, buffer, sizeof(buffer) - 1, 0);
#endif
        
        if (bytes_read <= 0) {
#ifdef _WIN32
            closesocket(client_fd);
#else
    #ifdef _WIN32
        closesocket(client_fd);
#else
        close(client_fd);
#endif
#endif
            return;
        }

        buffer[bytes_read] = '\0';
        std::string request(buffer);

        std::cout << "HTTP Request: " << request.substr(0, 100) << "..." << std::endl;

        // Handle different endpoints
        if (request.find("GET /telemetry") != std::string::npos) {
            handleSSEConnection(client_fd);
        } else if (request.find("GET /api/state-sync/") != std::string::npos) {
            handleStateSyncSSE(client_fd, request);
        } else if (request.find("POST /api/state-sync/broadcast") != std::string::npos) {
            handleStateBroadcast(client_fd, request);
        } else if (request.find("OPTIONS") != std::string::npos) {
            sendCORSPreflight(client_fd);
        } else if (request.find("GET /") != std::string::npos) {
            sendCORSHeaders(client_fd);
        } else {
            send404(client_fd);
        }
    }

    void handleSSEConnection(
#ifdef _WIN32
        SOCKET client_fd
#else
        int client_fd
#endif
    ) {
        // Send SSE headers
        std::string headers = 
            "HTTP/1.1 200 OK\r\n"
            "Content-Type: text/event-stream\r\n"
            "Cache-Control: no-cache\r\n"
            "Connection: keep-alive\r\n"
            "Access-Control-Allow-Origin: *\r\n"
            "Access-Control-Allow-Headers: Cache-Control\r\n"
            "\r\n";
        
        send(client_fd, headers.c_str(), headers.length(), 0);
        
        // Add to SSE clients
        {
            std::lock_guard<std::mutex> lock(clients_mutex);
            sse_clients.push_back(client_fd);
        }
        
        std::cout << "SSE client connected for telemetry stream" << std::endl;
        
        // Send initial connection message
        std::string welcome = "data: {\"type\":\"connected\",\"message\":\"Telemetry stream connected\"}\n\n";
        send(client_fd, welcome.c_str(), welcome.length(), 0);
    }

    void sendCORSHeaders(
#ifdef _WIN32
        SOCKET client_fd
#else
        int client_fd
#endif
    ) {
        std::string response = 
            "HTTP/1.1 200 OK\r\n"
            "Access-Control-Allow-Origin: *\r\n"
            "Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS\r\n"
            "Access-Control-Allow-Headers: Content-Type\r\n"
            "Content-Type: text/plain\r\n"
            "Content-Length: 24\r\n"
            "\r\n"
            "F1 24 Telemetry Server\n";
        
        send(client_fd, response.c_str(), response.length(), 0);
#ifdef _WIN32
        closesocket(client_fd);
#else
        close(client_fd);
#endif
    }

    void sendCORSPreflight(
#ifdef _WIN32
        SOCKET client_fd
#else
        int client_fd
#endif
    ) {
        std::string response = 
            "HTTP/1.1 200 OK\r\n"
            "Access-Control-Allow-Origin: *\r\n"
            "Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS\r\n"
            "Access-Control-Allow-Headers: Content-Type, Authorization\r\n"
            "Access-Control-Max-Age: 86400\r\n"
            "Content-Length: 0\r\n"
            "\r\n";
        
        send(client_fd, response.c_str(), response.length(), 0);
#ifdef _WIN32
        closesocket(client_fd);
#else
        close(client_fd);
#endif
    }

    void send404(
#ifdef _WIN32
        SOCKET client_fd
#else
        int client_fd
#endif
    ) {
        std::string response = 
            "HTTP/1.1 404 Not Found\r\n"
            "Content-Type: text/plain\r\n"
            "Content-Length: 9\r\n"
            "\r\n"
            "Not Found";
        
        send(client_fd, response.c_str(), response.length(), 0);
#ifdef _WIN32
        closesocket(client_fd);
#else
        close(client_fd);
#endif
    }

    // All session API methods removed - using JSON file storage in frontend

    void handleStateSyncSSE(
#ifdef _WIN32
        SOCKET client_fd,
#else
        int client_fd,
#endif
        const std::string& request
    ) {
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

    void handleStateBroadcast(
#ifdef _WIN32
        SOCKET client_fd,
#else
        int client_fd,
#endif
        const std::string& request
    ) {
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
#ifdef _WIN32
        closesocket(client_fd);
#else
        close(client_fd);
#endif

        std::cout << "State broadcasted for dashboard: " << dashboard_id << std::endl;
    }

    void broadcastStateSync(const std::string& json_data) {
        std::lock_guard<std::mutex> lock(state_sync_mutex);

        // Create SSE message
        std::string sse_message = "data: " + json_data + "\n\n";

        auto it = state_sync_clients.begin();
        while (it != state_sync_clients.end()) {
            if (send(*it, sse_message.c_str(), sse_message.length(), MSG_NOSIGNAL) < 0) {
                // Client disconnected, remove from list
#ifdef _WIN32
                closesocket(*it);
#else
                close(*it);
#endif
                it = state_sync_clients.erase(it);
                std::cout << "State sync client disconnected" << std::endl;
            } else {
                ++it;
            }
        }

        std::cout << "State sync message sent to " << state_sync_clients.size() << " clients" << std::endl;
    }

    void broadcast(const std::string& json_data) {
        std::lock_guard<std::mutex> lock(clients_mutex);
        
        // Create SSE message
        std::string sse_message = "data: " + json_data + "\n\n";
        
        auto it = sse_clients.begin();
        while (it != sse_clients.end()) {
            if (send(*it, sse_message.c_str(), sse_message.length(), MSG_NOSIGNAL) < 0) {
                // Client disconnected, remove from list
#ifdef _WIN32
                closesocket(*it);
#else
                close(*it);
#endif
                it = sse_clients.erase(it);
                std::cout << "SSE client disconnected" << std::endl;
            } else {
                ++it;
            }
        }
    }

    void stop() {
        running = false;
#ifdef _WIN32
        if (server_fd != INVALID_SOCKET) {
            closesocket(server_fd);
        }
        
        std::lock_guard<std::mutex> lock(clients_mutex);
        for (SOCKET client : sse_clients) {
            closesocket(client);
        }
        sse_clients.clear();
        
        if (wsa_initialized) {
            WSACleanup();
        }
#else
        if (server_fd >= 0) {
            close(server_fd);
        }
        
        std::lock_guard<std::mutex> lock(clients_mutex);
        for (int client : sse_clients) {
            close(client);
        }
        sse_clients.clear();
#endif
    }
};

// Global instance for the WebSocketServer class to use
static SimpleHTTPServer* g_http_server = nullptr;

