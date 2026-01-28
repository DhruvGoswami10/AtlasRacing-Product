#include "../../include/telemetry/sqlite_store.h"
#include <cstdint>

SQLiteStore::SQLiteStore(const std::string& path) : db(nullptr), db_path(path) {}

SQLiteStore::~SQLiteStore() {
    if (db) {
        sqlite3_close(db);
    }
}

bool SQLiteStore::initialize() {
    int rc = sqlite3_open(db_path.c_str(), &db);
    
    if (rc) {
        std::cerr << "Can't open database: " << sqlite3_errmsg(db) << std::endl;
        return false;
    }
    
    // Create telemetry table
    const char* create_table_sql = R"(
        CREATE TABLE IF NOT EXISTS telemetry (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_uid INTEGER,
            timestamp_ms INTEGER,
            frame_id INTEGER,
            speed REAL,
            rpm INTEGER,
            gear INTEGER,
            throttle REAL,
            brake REAL,
            current_lap_time REAL,
            last_lap_time REAL,
            position INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    )";
    
    char* err_msg = nullptr;
    rc = sqlite3_exec(db, create_table_sql, nullptr, nullptr, &err_msg);
    
    if (rc != SQLITE_OK) {
        std::cerr << "SQL error: " << err_msg << std::endl;
        sqlite3_free(err_msg);
        return false;
    }
    
    // Check if sessions table exists and upgrade if needed
    const char* check_sessions_sql = "SELECT sql FROM sqlite_master WHERE type='table' AND name='sessions';";
    sqlite3_stmt* check_stmt;
    rc = sqlite3_prepare_v2(db, check_sessions_sql, -1, &check_stmt, nullptr);
    
    if (rc == SQLITE_OK && sqlite3_step(check_stmt) == SQLITE_ROW) {
        const char* table_sql = (const char*)sqlite3_column_text(check_stmt, 0);
        std::string table_schema = table_sql ? table_sql : "";
        
        // Check if new columns exist, if not add them
        if (table_schema.find("name TEXT") == std::string::npos) {
            std::cout << "Upgrading sessions table schema..." << std::endl;
            
            const char* upgrade_queries[] = {
                "ALTER TABLE sessions ADD COLUMN name TEXT DEFAULT '';",
                "ALTER TABLE sessions ADD COLUMN session_type TEXT DEFAULT 'Practice 1';",
                "ALTER TABLE sessions ADD COLUMN game TEXT DEFAULT 'F1 24';",
                "ALTER TABLE sessions ADD COLUMN weather TEXT DEFAULT 'Clear';",
                "ALTER TABLE sessions ADD COLUMN car TEXT DEFAULT 'Unknown Car';"
            };
            
            for (const char* query : upgrade_queries) {
                char* upgrade_err = nullptr;
                int upgrade_rc = sqlite3_exec(db, query, nullptr, nullptr, &upgrade_err);
                if (upgrade_rc != SQLITE_OK) {
                    std::cout << "Note: Column may already exist - " << (upgrade_err ? upgrade_err : "unknown error") << std::endl;
                    if (upgrade_err) sqlite3_free(upgrade_err);
                }
            }
        }
    }
    sqlite3_finalize(check_stmt);
    
    std::cout << "SQLite database initialized: " << db_path << std::endl;
    return true;
}

bool SQLiteStore::storeTelemetry(uint64_t session_uid, uint64_t timestamp_ms, uint32_t frame_id,
                   float speed, uint16_t rpm, int8_t gear, float throttle, float brake,
                   float current_lap_time, float last_lap_time, uint8_t position) {
    
    const char* insert_sql = R"(
        INSERT INTO telemetry 
        (session_uid, timestamp_ms, frame_id, speed, rpm, gear, throttle, brake, 
         current_lap_time, last_lap_time, position)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    )";
    
    sqlite3_stmt* stmt;
    int rc = sqlite3_prepare_v2(db, insert_sql, -1, &stmt, nullptr);
    
    if (rc != SQLITE_OK) {
        std::cerr << "Failed to prepare statement: " << sqlite3_errmsg(db) << std::endl;
        return false;
    }
    
    sqlite3_bind_int64(stmt, 1, session_uid);
    sqlite3_bind_int64(stmt, 2, timestamp_ms);
    sqlite3_bind_int(stmt, 3, frame_id);
    sqlite3_bind_double(stmt, 4, speed);
    sqlite3_bind_int(stmt, 5, rpm);
    sqlite3_bind_int(stmt, 6, gear);
    sqlite3_bind_double(stmt, 7, throttle);
    sqlite3_bind_double(stmt, 8, brake);
    sqlite3_bind_double(stmt, 9, current_lap_time);
    sqlite3_bind_double(stmt, 10, last_lap_time);
    sqlite3_bind_int(stmt, 11, position);
    
    rc = sqlite3_step(stmt);
    sqlite3_finalize(stmt);
    
    if (rc != SQLITE_DONE) {
        std::cerr << "Failed to insert telemetry data: " << sqlite3_errmsg(db) << std::endl;
        return false;
    }
    
    return true;
}

bool SQLiteStore::createSession(uint64_t session_uid, const std::string& name, const std::string& session_type, 
                               const std::string& track_name, const std::string& game, 
                               const std::string& weather, const std::string& car) {
    const char* create_session_sql = R"(
        CREATE TABLE IF NOT EXISTS sessions (
            session_uid INTEGER PRIMARY KEY,
            name TEXT,
            session_type TEXT,
            track_name TEXT,
            game TEXT,
            weather TEXT,
            car TEXT,
            start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
            end_time DATETIME,
            total_laps INTEGER DEFAULT 0,
            best_lap_time REAL
        );
    )";
    
    char* err_msg = nullptr;
    int rc = sqlite3_exec(db, create_session_sql, nullptr, nullptr, &err_msg);
    
    if (rc != SQLITE_OK) {
        std::cerr << "Failed to create sessions table: " << err_msg << std::endl;
        sqlite3_free(err_msg);
        return false;
    }
    
    const char* insert_session_sql = R"(
        INSERT OR REPLACE INTO sessions (session_uid, name, session_type, track_name, game, weather, car)
        VALUES (?, ?, ?, ?, ?, ?, ?);
    )";
    
    sqlite3_stmt* stmt;
    rc = sqlite3_prepare_v2(db, insert_session_sql, -1, &stmt, nullptr);
    
    if (rc == SQLITE_OK) {
        sqlite3_bind_int64(stmt, 1, session_uid);
        sqlite3_bind_text(stmt, 2, name.c_str(), -1, SQLITE_STATIC);
        sqlite3_bind_text(stmt, 3, session_type.c_str(), -1, SQLITE_STATIC);
        sqlite3_bind_text(stmt, 4, track_name.c_str(), -1, SQLITE_STATIC);
        sqlite3_bind_text(stmt, 5, game.c_str(), -1, SQLITE_STATIC);
        sqlite3_bind_text(stmt, 6, weather.c_str(), -1, SQLITE_STATIC);
        sqlite3_bind_text(stmt, 7, car.c_str(), -1, SQLITE_STATIC);
        
        rc = sqlite3_step(stmt);
        sqlite3_finalize(stmt);
    }
    
    return rc == SQLITE_DONE;
}

std::vector<SessionInfo> SQLiteStore::getAllSessions() {
    std::vector<SessionInfo> sessions;
    
    const char* query = "SELECT session_uid, name, session_type, track_name, game, weather, car, start_time, end_time, total_laps, best_lap_time FROM sessions ORDER BY start_time DESC";
    
    sqlite3_stmt* stmt;
    int rc = sqlite3_prepare_v2(db, query, -1, &stmt, nullptr);
    
    if (rc != SQLITE_OK) {
        std::cerr << "Failed to prepare sessions query: " << sqlite3_errmsg(db) << std::endl;
        return sessions;
    }
    
    while ((rc = sqlite3_step(stmt)) == SQLITE_ROW) {
        SessionInfo session;
        session.session_uid = sqlite3_column_int64(stmt, 0);
        
        const char* name = (const char*)sqlite3_column_text(stmt, 1);
        session.name = name ? name : "";
        
        const char* session_type = (const char*)sqlite3_column_text(stmt, 2);
        session.session_type = session_type ? session_type : "";
        
        const char* track_name = (const char*)sqlite3_column_text(stmt, 3);
        session.track_name = track_name ? track_name : "";
        
        const char* game = (const char*)sqlite3_column_text(stmt, 4);
        session.game = game ? game : "";
        
        const char* weather = (const char*)sqlite3_column_text(stmt, 5);
        session.weather = weather ? weather : "";
        
        const char* car = (const char*)sqlite3_column_text(stmt, 6);
        session.car = car ? car : "";
        
        const char* start_time = (const char*)sqlite3_column_text(stmt, 7);
        session.start_time = start_time ? start_time : "";
        
        const char* end_time = (const char*)sqlite3_column_text(stmt, 8);
        session.end_time = end_time ? end_time : "";
        
        session.total_laps = sqlite3_column_int(stmt, 9);
        session.best_lap_time = sqlite3_column_double(stmt, 10);
        
        sessions.push_back(session);
    }
    
    sqlite3_finalize(stmt);
    return sessions;
}

SessionInfo SQLiteStore::getSession(uint64_t session_uid) {
    SessionInfo session = {0};
    
    const char* query = "SELECT session_uid, name, session_type, track_name, game, weather, car, start_time, end_time, total_laps, best_lap_time FROM sessions WHERE session_uid = ?";
    
    sqlite3_stmt* stmt;
    int rc = sqlite3_prepare_v2(db, query, -1, &stmt, nullptr);
    
    if (rc != SQLITE_OK) {
        std::cerr << "Failed to prepare session query: " << sqlite3_errmsg(db) << std::endl;
        return session;
    }
    
    sqlite3_bind_int64(stmt, 1, session_uid);
    
    if (sqlite3_step(stmt) == SQLITE_ROW) {
        session.session_uid = sqlite3_column_int64(stmt, 0);
        
        const char* name = (const char*)sqlite3_column_text(stmt, 1);
        session.name = name ? name : "";
        
        const char* session_type = (const char*)sqlite3_column_text(stmt, 2);
        session.session_type = session_type ? session_type : "";
        
        const char* track_name = (const char*)sqlite3_column_text(stmt, 3);
        session.track_name = track_name ? track_name : "";
        
        const char* game = (const char*)sqlite3_column_text(stmt, 4);
        session.game = game ? game : "";
        
        const char* weather = (const char*)sqlite3_column_text(stmt, 5);
        session.weather = weather ? weather : "";
        
        const char* car = (const char*)sqlite3_column_text(stmt, 6);
        session.car = car ? car : "";
        
        const char* start_time = (const char*)sqlite3_column_text(stmt, 7);
        session.start_time = start_time ? start_time : "";
        
        const char* end_time = (const char*)sqlite3_column_text(stmt, 8);
        session.end_time = end_time ? end_time : "";
        
        session.total_laps = sqlite3_column_int(stmt, 9);
        session.best_lap_time = sqlite3_column_double(stmt, 10);
    }
    
    sqlite3_finalize(stmt);
    return session;
}

bool SQLiteStore::deleteSession(uint64_t session_uid) {
    // Delete telemetry data first
    const char* delete_telemetry = "DELETE FROM telemetry WHERE session_uid = ?";
    sqlite3_stmt* stmt;
    int rc = sqlite3_prepare_v2(db, delete_telemetry, -1, &stmt, nullptr);
    
    if (rc == SQLITE_OK) {
        sqlite3_bind_int64(stmt, 1, session_uid);
        sqlite3_step(stmt);
        sqlite3_finalize(stmt);
    }
    
    // Delete session record
    const char* delete_session = "DELETE FROM sessions WHERE session_uid = ?";
    rc = sqlite3_prepare_v2(db, delete_session, -1, &stmt, nullptr);
    
    if (rc != SQLITE_OK) {
        std::cerr << "Failed to prepare delete session query: " << sqlite3_errmsg(db) << std::endl;
        return false;
    }
    
    sqlite3_bind_int64(stmt, 1, session_uid);
    rc = sqlite3_step(stmt);
    sqlite3_finalize(stmt);
    
    return rc == SQLITE_DONE;
}