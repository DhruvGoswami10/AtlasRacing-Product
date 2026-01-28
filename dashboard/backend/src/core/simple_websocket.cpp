#include "../../include/telemetry/websocket_server.h"
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <string>
#include <sstream>
#include <openssl/sha.h>
#include <openssl/evp.h>
#include <openssl/bio.h>
#include <openssl/buffer.h>

// Simple WebSocket implementation
class SimpleWebSocketServer {
private:
    int server_fd;
    std::vector<int> clients;
    std::mutex clients_mutex;
    bool running;
    static const int WS_PORT = 8080;

public:
    SimpleWebSocketServer() : server_fd(-1), running(false) {}

    bool start() {
        server_fd = socket(AF_INET, SOCK_STREAM, 0);
        if (server_fd < 0) {
            std::cerr << "Failed to create WebSocket server socket" << std::endl;
            return false;
        }

        int opt = 1;
        setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));

        struct sockaddr_in address;
        address.sin_family = AF_INET;
        address.sin_addr.s_addr = INADDR_ANY;
        address.sin_port = htons(WS_PORT);

        if (bind(server_fd, (struct sockaddr*)&address, sizeof(address)) < 0) {
            std::cerr << "Failed to bind WebSocket server to port " << WS_PORT << std::endl;
            return false;
        }

        if (listen(server_fd, 3) < 0) {
            std::cerr << "Failed to listen on WebSocket server" << std::endl;
            return false;
        }

        running = true;
        std::cout << "WebSocket server listening on port " << WS_PORT << std::endl;
        return true;
    }

    void acceptConnections() {
        while (running) {
            struct sockaddr_in client_addr;
            socklen_t client_len = sizeof(client_addr);
            
            int client_fd = accept(server_fd, (struct sockaddr*)&client_addr, &client_len);
            if (client_fd < 0) {
                if (running) {
                    std::cerr << "Failed to accept WebSocket connection" << std::endl;
                }
                continue;
            }

            // Handle WebSocket handshake in a separate thread
            std::thread(&SimpleWebSocketServer::handleClient, this, client_fd).detach();
        }
    }

    void handleClient(int client_fd) {
        char buffer[4096];
        ssize_t bytes_read = recv(client_fd, buffer, sizeof(buffer) - 1, 0);
        
        if (bytes_read <= 0) {
            close(client_fd);
            return;
        }

        buffer[bytes_read] = '\0';
        std::string request(buffer);

        // Simple WebSocket handshake
        if (request.find("Upgrade: websocket") != std::string::npos) {
            std::string key = extractWebSocketKey(request);
            if (!key.empty()) {
                std::string response = generateHandshakeResponse(key);
                send(client_fd, response.c_str(), response.length(), 0);
                
                // Add client to list
                {
                    std::lock_guard<std::mutex> lock(clients_mutex);
                    clients.push_back(client_fd);
                }
                
                std::cout << "WebSocket client connected" << std::endl;
                return; // Keep connection open
            }
        }
        
        // If not WebSocket, close connection
        close(client_fd);
    }

    void broadcast(const std::string& message) {
        std::lock_guard<std::mutex> lock(clients_mutex);
        
        // Create WebSocket frame
        std::string frame = createWebSocketFrame(message);
        
        auto it = clients.begin();
        while (it != clients.end()) {
            if (send(*it, frame.c_str(), frame.length(), MSG_NOSIGNAL) < 0) {
                // Client disconnected, remove from list
                close(*it);
                it = clients.erase(it);
            } else {
                ++it;
            }
        }
    }

    void stop() {
        running = false;
        if (server_fd >= 0) {
            close(server_fd);
        }
        
        std::lock_guard<std::mutex> lock(clients_mutex);
        for (int client : clients) {
            close(client);
        }
        clients.clear();
    }

private:
    std::string extractWebSocketKey(const std::string& request) {
        size_t pos = request.find("Sec-WebSocket-Key: ");
        if (pos == std::string::npos) return "";
        
        pos += 19; // Length of "Sec-WebSocket-Key: "
        size_t end = request.find("\r\n", pos);
        if (end == std::string::npos) return "";
        
        return request.substr(pos, end - pos);
    }

    std::string generateHandshakeResponse(const std::string& key) {
        std::string combined = key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
        
        // Simple SHA1 hash (basic implementation)
        unsigned char hash[SHA_DIGEST_LENGTH];
        SHA1((unsigned char*)combined.c_str(), combined.length(), hash);
        
        // Base64 encode
        BIO *bio, *b64;
        BUF_MEM *bufferPtr;
        
        b64 = BIO_new(BIO_f_base64());
        bio = BIO_new(BIO_s_mem());
        bio = BIO_push(b64, bio);
        
        BIO_set_flags(bio, BIO_FLAGS_BASE64_NO_NL);
        BIO_write(bio, hash, SHA_DIGEST_LENGTH);
        BIO_flush(bio);
        BIO_get_mem_ptr(bio, &bufferPtr);
        
        std::string encoded(bufferPtr->data, bufferPtr->length);
        BIO_free_all(bio);
        
        std::stringstream response;
        response << "HTTP/1.1 101 Switching Protocols\r\n";
        response << "Upgrade: websocket\r\n";
        response << "Connection: Upgrade\r\n";
        response << "Sec-WebSocket-Accept: " << encoded << "\r\n";
        response << "\r\n";
        
        return response.str();
    }

    std::string createWebSocketFrame(const std::string& payload) {
        std::string frame;
        
        // Simple text frame (opcode 0x1)
        frame += static_cast<char>(0x81); // FIN + opcode
        
        size_t payload_len = payload.length();
        if (payload_len < 126) {
            frame += static_cast<char>(payload_len);
        } else if (payload_len < 65536) {
            frame += static_cast<char>(126);
            frame += static_cast<char>((payload_len >> 8) & 0xFF);
            frame += static_cast<char>(payload_len & 0xFF);
        } else {
            // For simplicity, we'll limit to 65535 bytes
            frame += static_cast<char>(126);
            frame += static_cast<char>(0xFF);
            frame += static_cast<char>(0xFF);
        }
        
        frame += payload;
        return frame;
    }
};

// Global instance for the WebSocketServer class to use
static SimpleWebSocketServer* g_ws_server = nullptr;

WebSocketServer::WebSocketServer() : running(false) {
    g_ws_server = new SimpleWebSocketServer();
}

bool WebSocketServer::start() {
    if (!g_ws_server->start()) {
        return false;
    }
    
    running = true;
    
    // Start accepting connections in a separate thread
    std::thread accept_thread(&SimpleWebSocketServer::acceptConnections, g_ws_server);
    accept_thread.detach();
    
    return true;
}

void WebSocketServer::broadcastTelemetry(const std::string& json_data) {
    if (g_ws_server) {
        g_ws_server->broadcast(json_data);
    }
}

void WebSocketServer::stop() {
    running = false;
    if (g_ws_server) {
        g_ws_server->stop();
        delete g_ws_server;
        g_ws_server = nullptr;
    }
}

void WebSocketServer::serverLoop() {
    // No longer needed as acceptConnections handles this
}

void WebSocketServer::handleNewConnection(int client_fd) {
    // Handled by SimpleWebSocketServer
}

void WebSocketServer::removeConnection(int client_fd) {
    // Handled by SimpleWebSocketServer
}