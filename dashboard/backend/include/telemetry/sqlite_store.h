#pragma once
#include <sqlite3.h>
#include <iostream>
#include <string>
#include <ctime>
#include <cstdint>
#include <vector>

struct SessionInfo {
    uint64_t session_uid;
    std::string name;
    std::string session_type;
    std::string track_name;
    std::string game;
    std::string weather;
    std::string car;
    std::string start_time;
    std::string end_time;
    int total_laps;
    float best_lap_time;
};

class SQLiteStore {
private:
    sqlite3* db;
    std::string db_path;
    
public:
    SQLiteStore(const std::string& path = "telemetry.db");
    ~SQLiteStore();
    
    bool initialize();
    bool storeTelemetry(uint64_t session_uid, uint64_t timestamp_ms, uint32_t frame_id,
                       float speed, uint16_t rpm, int8_t gear, float throttle, float brake,
                       float current_lap_time, float last_lap_time, uint8_t position);
    bool createSession(uint64_t session_uid, const std::string& name, const std::string& session_type, 
                      const std::string& track_name, const std::string& game, 
                      const std::string& weather, const std::string& car);
    
    // Session retrieval methods
    std::vector<SessionInfo> getAllSessions();
    SessionInfo getSession(uint64_t session_uid);
    bool deleteSession(uint64_t session_uid);
};