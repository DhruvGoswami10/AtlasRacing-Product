#pragma once
#include <iostream>
#include <string>
#include <thread>
#include <vector>
#include <mutex>
#include <chrono>
#include <algorithm>
#ifndef _WIN32
#include <unistd.h>
#endif
#include <map>

class WebSocketServer {
private:
    static const int WS_PORT = 8080;
    
    // Separate client connection pools for different streams
    std::vector<int> telemetry_clients;
    std::vector<int> events_clients;
    std::vector<int> state_sync_clients;

    // Separate mutex locks for thread safety
    std::mutex telemetry_clients_mutex;
    std::mutex events_clients_mutex;
    std::mutex state_sync_mutex;

    // State sync storage
    std::map<std::string, std::string> dashboard_states;

    // Discovery: Atlas Core instances found on the network
    struct DiscoveredInstance {
        std::string ip;
        int ssePort;
        std::string game;
        std::chrono::steady_clock::time_point lastSeen;
    };
    std::vector<DiscoveredInstance> discovered_instances;
    std::mutex discovery_mutex;

    bool running;

public:
    WebSocketServer();
    
    bool start();
    
    // Separate broadcast methods for different streams
    void broadcastTelemetry(const std::string& json_data);
    void broadcastEvents(const std::string& json_data);
    void broadcastMultiCarData(const std::string& json_data);
    
    void stop();

private:
    void serverLoop();
    void handleNewConnection(int client_fd);
    void removeConnection(int client_fd);

    // Discovery
    void discoveryListenerThread();

    // State sync methods
    void handleStateSyncSSE(int client_fd, const std::string& request);
    void handleStateBroadcast(int client_fd, const std::string& request);
    void broadcastStateSync(const std::string& json_data);
    void sendCORSResponse(int client_fd);
    void send404(int client_fd);
};