#include <iostream>
#include <thread>
#include <chrono>
#include <signal.h>
#include <cstring>
#include <memory>
#include <vector>
#include <set>
#include <iomanip>
#include <algorithm>
#include "../include/telemetry/udp_receiver.h"
#include "../include/telemetry/websocket_server.h"
#include "../include/telemetry/data_processor.h" 
#include "../include/telemetry/accurate_lap_predictor.h"
#include "f1_24/f1_24_types.h"

#ifdef _WIN32
#include "games/ac/ac_parser.cpp"
#endif
#ifdef WINDOWS_ACC_SUPPORT
#include "games/acc/acc_parser.cpp"
#endif
#ifdef WINDOWS_ATS_SUPPORT
#include "games/ats/ats_parser.cpp"
#endif

#pragma pack(push, 1)
struct LiveryColour_F125 {
    uint8_t red;
    uint8_t green;
    uint8_t blue;
};

struct ParticipantData2025 {
    uint8_t m_aiControlled;
    uint8_t m_driverId;
    uint8_t m_networkId;
    uint8_t m_teamId;
    uint8_t m_myTeam;
    uint8_t m_raceNumber;
    uint8_t m_nationality;
    char    m_name[32];
    uint8_t m_yourTelemetry;
    uint8_t m_showOnlineNames;
    uint16_t m_techLevel;
    uint8_t m_platform;
    uint8_t m_numColours;
    LiveryColour_F125 m_liveryColours[4];
};

struct PacketParticipantsData2025 {
    PacketHeader m_header;
    uint8_t m_numActiveCars;
    ParticipantData2025 m_participants[22];
};
#pragma pack(pop)

// F1_24_Parser functions (existing implementation)
class F1_24_Parser {
public:
    static bool isValidF1Packet(const char* data, size_t size) {
        if (size < sizeof(PacketHeader)) {
            return false;
        }

        PacketHeader header;
        memcpy(&header, data, sizeof(PacketHeader));

        // Support both F1 24 and F1 25 with both format types
        bool validFormat = (header.m_packetFormat == 2024 || header.m_packetFormat == 2025);
        bool validYear = (header.m_gameYear == 24 || header.m_gameYear == 25);
        // F1 25 has packet ID 15 (Lap Positions), F1 24 has up to 14
        bool validPacketId = (header.m_packetId <= PACKET_ID_LAP_POSITIONS);

        return validFormat && validYear && validPacketId;
    }
    
    static uint16_t getPacketFormat(const char* data) {
        PacketHeader header;
        std::memcpy(&header, data, sizeof(PacketHeader));
        return header.m_packetFormat;
    }

    static uint8_t getGameYear(const char* data) {
        PacketHeader header;
        std::memcpy(&header, data, sizeof(PacketHeader));
        return header.m_gameYear;
    }

    static uint8_t getPacketId(const char* data) {
        PacketHeader header;
        memcpy(&header, data, sizeof(PacketHeader));
        return header.m_packetId;
    }
    
    static bool parseCarTelemetry(const char* data, size_t size, CarTelemetryData& telemetry) {
        if (size < sizeof(PacketCarTelemetryData)) {
            return false;
        }
        
        PacketCarTelemetryData packet;
        memcpy(&packet, data, sizeof(PacketCarTelemetryData));
        
        if (packet.m_header.m_packetId != PACKET_ID_CAR_TELEMETRY) {
            return false;
        }
        
        uint8_t playerIndex = packet.m_header.m_playerCarIndex;
        if (playerIndex >= 22) {
            return false;
        }
        
        telemetry = packet.m_carTelemetryData[playerIndex];
        return true;
    }
    
    static bool parseLapData(const char* data, size_t size, LapData& lapData) {
        if (size < sizeof(PacketLapData)) {
            return false;
        }
        
        PacketLapData packet;
        memcpy(&packet, data, sizeof(PacketLapData));
        
        if (packet.m_header.m_packetId != PACKET_ID_LAP_DATA) {
            return false;
        }
        
        uint8_t playerIndex = packet.m_header.m_playerCarIndex;
        if (playerIndex >= 22) {
            return false;
        }
        
        lapData = packet.m_lapData[playerIndex];
        return true;
    }
    
    static bool parseCarStatus(const char* data, size_t size, CarStatusData& statusData) {
        if (size < sizeof(PacketCarStatusData)) {
            return false;
        }
        
        PacketCarStatusData packet;
        memcpy(&packet, data, sizeof(PacketCarStatusData));
        
        if (packet.m_header.m_packetId != PACKET_ID_CAR_STATUS) {
            return false;
        }
        
        uint8_t playerIndex = packet.m_header.m_playerCarIndex;
        if (playerIndex >= 22) {
            return false;
        }
        
        statusData = packet.m_carStatusData[playerIndex];
        return true;
    }
    
    static bool parseMotionData(const char* data, size_t size, CarMotionData& motionData) {
        if (size < sizeof(PacketMotionData)) {
            return false;
        }
        
        PacketMotionData packet;
        memcpy(&packet, data, sizeof(PacketMotionData));
        
        if (packet.m_header.m_packetId != PACKET_ID_MOTION) {
            return false;
        }
        
        uint8_t playerIndex = packet.m_header.m_playerCarIndex;
        if (playerIndex >= 22) {
            return false;
        }
        
        motionData = packet.m_carMotionData[playerIndex];
        return true;
    }
    
    static bool parseSessionData(const char* data, size_t size, SessionData& sessionData) {
        if (size < sizeof(PacketSessionData)) {
            return false;
        }
        
        PacketSessionData packet;
        memcpy(&packet, data, sizeof(PacketSessionData));
        
        if (packet.m_header.m_packetId != PACKET_ID_SESSION) {
            return false;
        }
        
        sessionData = packet.m_sessionData;
        return true;
    }
    
    static bool parseSessionHistory(const char* data, size_t size, PacketSessionHistoryData& historyData) {
        if (size < sizeof(PacketSessionHistoryData)) {
            return false;
        }
        
        PacketSessionHistoryData packet;
        memcpy(&packet, data, sizeof(PacketSessionHistoryData));
        
        if (packet.m_header.m_packetId != PACKET_ID_SESSION_HISTORY) {
            return false;
        }
        
        historyData = packet;
        return true;
    }
    
    static bool parseAllCarTelemetry(const char* data, size_t size, PacketCarTelemetryData& telemetryData) {
        if (size < sizeof(PacketCarTelemetryData)) {
            return false;
        }
        
        PacketCarTelemetryData packet;
        memcpy(&packet, data, sizeof(PacketCarTelemetryData));
        
        if (packet.m_header.m_packetId != PACKET_ID_CAR_TELEMETRY) {
            return false;
        }
        
        telemetryData = packet;
        return true;
    }
    
    static bool parseAllLapData(const char* data, size_t size, PacketLapData& lapData) {
        if (size < sizeof(PacketLapData)) {
            return false;
        }
        
        PacketLapData packet;
        memcpy(&packet, data, sizeof(PacketLapData));
        
        if (packet.m_header.m_packetId != PACKET_ID_LAP_DATA) {
            return false;
        }
        
        lapData = packet;
        return true;
    }
    
    static bool parseParticipants(const char* data, size_t size, PacketParticipantsData& packet, uint16_t& packet_format) {
        if (size < sizeof(PacketHeader) + 1) {
            std::cerr << "Participants packet too small: " << size << " bytes" << std::endl;
            return false;
        }

        PacketHeader header;
        std::memcpy(&header, data, sizeof(PacketHeader));

        if (header.m_packetId != PACKET_ID_PARTICIPANTS) {
            std::cerr << "Not a participants packet: " << (int)header.m_packetId << std::endl;
            return false;
        }

        packet_format = header.m_packetFormat;

        if (packet_format >= 2025) {
            if (size < sizeof(PacketParticipantsData2025)) {
                std::cerr << "Participants packet (2025) size mismatch: " << size
                          << " < " << sizeof(PacketParticipantsData2025) << std::endl;
                return false;
            }

            PacketParticipantsData2025 src{};
            std::memcpy(&src, data, sizeof(PacketParticipantsData2025));

            packet.m_header = src.m_header;
            packet.m_numActiveCars = src.m_numActiveCars;

            for (int i = 0; i < 22; i++) {
                const ParticipantData2025& src_part = src.m_participants[i];
                ParticipantData& dst = packet.m_participants[i];

                dst.m_aiControlled = src_part.m_aiControlled;
                dst.m_driverId = src_part.m_driverId;
                dst.m_networkId = src_part.m_networkId;
                dst.m_teamId = src_part.m_teamId;
                dst.m_myTeam = src_part.m_myTeam;
                dst.m_raceNumber = src_part.m_raceNumber;
                dst.m_nationality = src_part.m_nationality;

                std::memset(dst.m_name, 0, sizeof(dst.m_name));
                std::memcpy(dst.m_name, src_part.m_name,
                            std::min(sizeof(dst.m_name) - 1, sizeof(src_part.m_name)));

                dst.m_yourTelemetry = src_part.m_yourTelemetry;
                dst.m_showOnlineNames = src_part.m_showOnlineNames;
                dst.m_techLevel = src_part.m_techLevel;
                dst.m_platform = src_part.m_platform;
            }
        } else {
            if (size < sizeof(PacketParticipantsData)) {
                std::cerr << "Participants packet (2024) size mismatch: " << size
                          << " < " << sizeof(PacketParticipantsData) << std::endl;
                return false;
            }

            std::memcpy(&packet, data, sizeof(PacketParticipantsData));
            packet_format = packet.m_header.m_packetFormat;

            for (int i = 0; i < 22; i++) {
                packet.m_participants[i].m_name[sizeof(packet.m_participants[i].m_name) - 1] = '\0';
            }
        }

        return true;
    }


    static bool parseAllCarStatus(const char* data, size_t size, PacketCarStatusData& statusData) {
        if (size < sizeof(PacketCarStatusData)) {
            return false;
        }
        
        PacketCarStatusData packet;
        memcpy(&packet, data, sizeof(PacketCarStatusData));
        
        if (packet.m_header.m_packetId != PACKET_ID_CAR_STATUS) {
            return false;
        }
        
        statusData = packet;
        return true;
    }
    
    static bool parseCarDamage(const char* data, size_t size, CarDamageData& damageData, uint16_t& packetFormat) {
        if (size < sizeof(PacketCarDamageData)) {
            return false;
        }
        
        PacketCarDamageData packet;
        memcpy(&packet, data, sizeof(PacketCarDamageData));
        
        if (packet.m_header.m_packetId != PACKET_ID_CAR_DAMAGE) {
            return false;
        }

        packetFormat = packet.m_header.m_packetFormat;
        
        uint8_t playerIndex = packet.m_header.m_playerCarIndex;
        if (playerIndex >= 22) {
            return false;
        }
        
        damageData = packet.m_carDamageData[playerIndex];
        return true;
    }
    
    static bool parseEventData(const char* data, size_t size, PacketEventData& eventData) {
        if (size < sizeof(PacketEventData)) {
            return false;
        }
        
        PacketEventData packet;
        memcpy(&packet, data, sizeof(PacketEventData));
        
        if (packet.m_header.m_packetId != PACKET_ID_EVENT) {
            return false;
        }
        
        eventData = packet;
        return true;
    }
    
    static bool parseCarSetups(const char* data, size_t size, PacketCarSetupsData& setupData) {
        if (size < sizeof(PacketCarSetupsData)) {
            return false;
        }
        
        PacketCarSetupsData packet;
        memcpy(&packet, data, sizeof(PacketCarSetupsData));
        
        if (packet.m_header.m_packetId != PACKET_ID_CAR_SETUPS) {
            return false;
        }
        
        setupData = packet;
        return true;
    }
    
    static bool parseFinalClassification(const char* data, size_t size, PacketFinalClassificationData& classificationData) {
        if (size < sizeof(PacketFinalClassificationData)) {
            return false;
        }
        
        PacketFinalClassificationData packet;
        memcpy(&packet, data, sizeof(PacketFinalClassificationData));
        
        if (packet.m_header.m_packetId != PACKET_ID_FINAL_CLASSIFICATION) {
            return false;
        }
        
        classificationData = packet;
        return true;
    }
    
    static bool parseTyreSets(const char* data, size_t size, PacketTyreSetsData& tyreSetsData) {
        if (size < sizeof(PacketTyreSetsData)) {
            return false;
        }
        
        PacketTyreSetsData packet;
        memcpy(&packet, data, sizeof(PacketTyreSetsData));
        
        if (packet.m_header.m_packetId != PACKET_ID_TYRE_SETS) {
            return false;
        }
        
        tyreSetsData = packet;
        return true;
    }
    
    static bool parseTimeTrial(const char* data, size_t size, PacketTimeTrialData& timeTrialData) {
        if (size < sizeof(PacketTimeTrialData)) {
            return false;
        }
        
        PacketTimeTrialData packet;
        memcpy(&packet, data, sizeof(PacketTimeTrialData));
        
        if (packet.m_header.m_packetId != PACKET_ID_TIME_TRIAL) {
            return false;
        }
        
        timeTrialData = packet;
        return true;
    }
};

class UnifiedTelemetryServer {
private:
    // F1 24 components
    UDPReceiver udp_receiver;
    
    // Game-specific parsers (Windows shared memory)
#ifdef _WIN32
    std::unique_ptr<AC_Parser> ac_parser;
#endif
#ifdef WINDOWS_ACC_SUPPORT
    std::unique_ptr<ACC_Parser> acc_parser;
#endif
#ifdef WINDOWS_ATS_SUPPORT
    std::unique_ptr<ATS_Parser> ats_parser;
#endif
    
    // Shared components
    WebSocketServer ws_server;
    DataProcessor data_processor;
    AccurateLapPredictor lap_predictor;
    bool running;
    
    // Game detection
    enum ActiveGame {
        GAME_NONE,
        GAME_F1_24,
        GAME_AC,
        GAME_ACC,
        GAME_ATS
    };
    
    ActiveGame current_game;
    std::chrono::steady_clock::time_point last_game_check;
    
public:
    UnifiedTelemetryServer() : running(false), current_game(GAME_NONE) {
#ifdef _WIN32
        ac_parser = std::make_unique<AC_Parser>();
#endif
#ifdef WINDOWS_ACC_SUPPORT
        acc_parser = std::make_unique<ACC_Parser>();
#endif
#ifdef WINDOWS_ATS_SUPPORT
        ats_parser = std::make_unique<ATS_Parser>();
#endif
    }
    
    bool initialize() {
        std::cout << "=== Atlas Racing Multi-Game Telemetry Server ===" << std::endl;
        std::cout << "Initializing unified telemetry server..." << std::endl;
        
        
        if (!udp_receiver.initialize()) {
            std::cerr << "Failed to initialize UDP receiver" << std::endl;
            return false;
        }
        
        if (!ws_server.start()) {
            std::cerr << "Failed to start WebSocket server" << std::endl;
            return false;
        }
        
        std::cout << "✓ Server initialized successfully!" << std::endl;
        return true;
    }
    
    ActiveGame detectActiveGame() {
        // Check every 2 seconds to avoid excessive checking
        auto now = std::chrono::steady_clock::now();
        if (std::chrono::duration_cast<std::chrono::milliseconds>(now - last_game_check).count() < 2000) {
            return current_game;
        }
        last_game_check = now;
        
        // Check for active games with detailed logging
        static int debug_counter = 0;
        bool show_debug = (++debug_counter % 10 == 0); // Every ~20 seconds
        
        if (show_debug) {
            std::cout << "🔍 Scanning for active games..." << std::endl;
        }
        
#ifdef _WIN32
        // Check for Assetto Corsa first (since it's more explicit)
        bool ac_process_running = ac_parser && ac_parser->isGameRunning();
        
        if (show_debug) {
            std::cout << "AC Process (acs.exe): " << (ac_process_running ? "✓ RUNNING" : "✗ NOT FOUND") << std::endl;
        }
        
        if (ac_process_running) {
            bool ac_connected = ac_parser->isConnected();
            
            if (show_debug && !ac_connected) {
                std::cout << "AC Connection: ✗ NOT CONNECTED, attempting to initialize..." << std::endl;
            }
            
            if (ac_connected || ac_parser->initialize()) {
                if (current_game != GAME_AC) {
                    std::cout << "✅ Successfully detected and connected to Assetto Corsa!" << std::endl;
                    ac_parser->logConnectionInfo();
                    current_game = GAME_AC;
                } else if (show_debug) {
                    std::cout << "AC Connection: ✓ CONNECTED & ACTIVE" << std::endl;
                }
                return GAME_AC;
            } else if (show_debug) {
                std::cout << "AC Connection: ✗ FAILED TO INITIALIZE (check if AC is in live session)" << std::endl;
            }
        }
#endif
        
#ifdef WINDOWS_ACC_SUPPORT
        bool acc_process_running = acc_parser && acc_parser->isGameRunning();
        if (show_debug) {
            std::cout << "ACC Process (ACC.exe): " << (acc_process_running ? "✓ RUNNING" : "✗ NOT FOUND") << std::endl;
        }
        if (acc_process_running) {
            bool acc_connected = acc_parser->isConnected();
            if (acc_connected || acc_parser->initialize()) {
                if (current_game != GAME_ACC) {
                    std::cout << "✅ Successfully detected and connected to Assetto Corsa Competizione!" << std::endl;
                    current_game = GAME_ACC;
                }
                return GAME_ACC;
            }
        }
#endif

#ifdef WINDOWS_ATS_SUPPORT
        bool ats_process_running = ats_parser && ats_parser->isGameRunning();
        if (show_debug) {
            std::cout << "ATS Process (amtrucks.exe): " << (ats_process_running ? "✓ RUNNING" : "✗ NOT FOUND") << std::endl;
        }
        if (ats_process_running) {
            bool ats_connected = ats_parser->isConnected();
            if (ats_connected || ats_parser->initialize()) {
                if (current_game != GAME_ATS) {
                    std::cout << "✅ Successfully detected and connected to American Truck Simulator!" << std::endl;
                    current_game = GAME_ATS;
                }
                return GAME_ATS;
            }
        }
#endif

        // F1 24 detection happens passively in the main loop via UDP reception
        // Don't change current_game here - let UDP reception detect F1 24
        
        return current_game;
    }
    
    void run() {
        running = true;
        std::cout << "Starting unified telemetry processing loop..." << std::endl;
        std::cout << "Supported games:" << std::endl;
        std::cout << "  - F1 24/25 (UDP port 20777)" << std::endl;
#ifdef _WIN32
        std::cout << "  - Assetto Corsa (Shared Memory)" << std::endl;
#endif
#ifdef WINDOWS_ACC_SUPPORT
        std::cout << "  - Assetto Corsa Competizione (Shared Memory)" << std::endl;
#endif
#ifdef WINDOWS_ATS_SUPPORT
        std::cout << "  - American Truck Simulator (Shared Memory)" << std::endl;
#endif
        std::cout << "SSE server on port 8080" << std::endl;
        std::cout << "Scanning for active games..." << std::endl;
        
        char udp_buffer[2048];
        
        while (running) {
            // Detect active game
            ActiveGame detected_game = detectActiveGame();
            
            if (detected_game == GAME_AC) {
#ifdef _WIN32
                if (ac_parser && ac_parser->isConnected()) {
                    auto telemetry = ac_parser->readTelemetry();
                    if (telemetry.timestamp_ms > 0) {
                        std::string json_data = data_processor.toJSON(telemetry);
                        ws_server.broadcastTelemetry(json_data);
                        static int ac_log_counter = 0;
                        if (++ac_log_counter % 60 == 0) {
                            std::cout << "AC: Speed=" << telemetry.speed_kph << " km/h, RPM=" << telemetry.rpm 
                                      << ", Gear=" << (int)telemetry.gear << ", Lap=" << (int)telemetry.current_lap_num << std::endl;
                        }
                    }
                }
#endif
            }
#ifdef WINDOWS_ACC_SUPPORT
            else if (detected_game == GAME_ACC) {
                if (acc_parser && acc_parser->isConnected()) {
                    auto telemetry = acc_parser->readTelemetry();
                    if (telemetry.timestamp_ms > 0) {
                        std::string json_data = data_processor.toJSON(telemetry);
                        ws_server.broadcastTelemetry(json_data);
                        static int acc_log_counter = 0;
                        if (++acc_log_counter % 60 == 0) {
                            std::cout << "ACC: Speed=" << telemetry.speed_kph << " km/h, RPM=" << telemetry.rpm 
                                      << ", Gear=" << (int)telemetry.gear << ", Lap=" << (int)telemetry.current_lap_num << std::endl;
                        }
                    }
                }
            }
#endif
#ifdef WINDOWS_ATS_SUPPORT
            else if (detected_game == GAME_ATS) {
                if (ats_parser && ats_parser->isConnected()) {
                    auto telemetry = ats_parser->readTelemetry();
                    if (telemetry.timestamp_ms > 0) {
                        std::string json_data = data_processor.toJSON(telemetry);
                        ws_server.broadcastTelemetry(json_data);
                        static int ats_log_counter = 0;
                        if (++ats_log_counter % 60 == 0) {
                            std::cout << "ATS: Speed=" << telemetry.speed_kph << " km/h, RPM=" << telemetry.rpm 
                                      << ", Gear=" << (int)telemetry.gear << std::endl;
                        }
                    }
                }
            }
#endif
            else {
                // Try to receive F1 24/25 UDP data
                int bytes_received = udp_receiver.receivePacket(udp_buffer);

                if (bytes_received > 0) {
                    // Debug: Log first few packets to see what we're receiving
                    static int packet_debug_count = 0;
                    if (packet_debug_count < 20 && bytes_received >= sizeof(PacketHeader)) {
                        PacketHeader* header = (PacketHeader*)udp_buffer;
                        std::cout << "📦 UDP Packet #" << packet_debug_count++ << ": "
                                  << "format=" << header->m_packetFormat
                                  << ", year=" << (int)header->m_gameYear
                                  << ", id=" << (int)header->m_packetId
                                  << ", size=" << bytes_received << " bytes" << std::endl;
                    }

                    // Always try validation to see what happens
                    bool isValid = F1_24_Parser::isValidF1Packet(udp_buffer, bytes_received);

                    // Debug: Log validation result for first few attempts
                    static int validationLogCount = 0;
                    if (validationLogCount < 25) {
                        if (!isValid) {
                            std::cout << "❌ Packet #" << validationLogCount << " validation FAILED" << std::endl;
                        } else {
                            std::cout << "✅ Packet #" << validationLogCount << " validation PASSED!" << std::endl;
                        }
                        validationLogCount++;
                    }

                    if (isValid) {
                        if (current_game != GAME_F1_24) {
                            // Detect which F1 version
                            PacketHeader* header = (PacketHeader*)udp_buffer;
                            if (header->m_gameYear == 25) {
                                std::cout << "✓ Detected F1 25 telemetry data!" << std::endl;
                            } else {
                                std::cout << "✓ Detected F1 24 telemetry data!" << std::endl;
                            }
                            current_game = GAME_F1_24;
                        }
                        
                        // Process F1 24 packet for both single and multi-car data
                        processF1Packet(udp_buffer, bytes_received);
                        processF1MultiCarData(udp_buffer, bytes_received);
                    }
                }
            }
            
            // Small sleep to prevent excessive CPU usage
            std::this_thread::sleep_for(std::chrono::microseconds(100));
        }
    }
    
    void processF1Packet(const char* buffer, int bytes_received) {
        uint8_t packet_id = F1_24_Parser::getPacketId(buffer);
        uint16_t packet_format = F1_24_Parser::getPacketFormat(buffer);
        uint8_t game_year = F1_24_Parser::getGameYear(buffer);
        data_processor.setGameIdentification(packet_format, game_year);

        // Debug: Log packet IDs we're receiving
        static int packetCounts[20] = {0};
        static int logCounter = 0;
        if (packet_id < 20) {
            packetCounts[packet_id]++;
            if (logCounter++ % 300 == 0) {  // Every ~5 seconds
                std::cout << "📊 Packet counts: ";
                for (int i = 0; i <= 15; i++) {
                    if (packetCounts[i] > 0) {
                        std::cout << "ID" << i << "=" << packetCounts[i] << " ";
                    }
                }
                std::cout << std::endl;
                // Reset counts
                memset(packetCounts, 0, sizeof(packetCounts));
            }
        }

        // Handle different packet types (existing F1 logic)
        if (packet_id == PACKET_ID_CAR_TELEMETRY) {
            CarTelemetryData telemetry;
            if (F1_24_Parser::parseCarTelemetry(buffer, bytes_received, telemetry)) {
                data_processor.updateTelemetryData(telemetry);
                
                auto processed = data_processor.getCurrentData();
                if (processed.timestamp_ms > 0) {
                    std::string json_data = data_processor.toJSON(processed);
                    ws_server.broadcastTelemetry(json_data);
                    
                    // PHASE 7B: Generate and broadcast live analysis
                    auto analysis = lap_predictor.updateAnalysis(processed);
                    if (analysis.valid) {
                        std::string analysis_json = lap_predictor.analysisToJSON(analysis);
                        // Create combined analysis event for frontend
                        std::string analysis_event = std::string("{\"type\":\"live_analysis\",\"data\":") + analysis_json + "}";
                        ws_server.broadcastTelemetry(analysis_event);
                    }
                    
                    // Log occasionally
                    static int f1_log_counter = 0;
                    if (++f1_log_counter % 60 == 0) { // Every ~1 second
                        std::cout << "F1: Speed=" << processed.speed_kph << " km/h, RPM=" << processed.rpm 
                                  << ", Gear=" << (int)processed.gear << ", Lap=" << (int)processed.current_lap_num << std::endl;
                        
                        // Log analysis data if available
                        if (analysis.valid && lap_predictor.hasValidData()) {
                            std::cout << "📊 Analysis: Next lap=" << std::fixed << std::setprecision(3) << analysis.prediction.next_lap_time 
                                      << "s, Confidence=" << (analysis.prediction.confidence * 100) << "%"
                                      << ", Consistency=" << analysis.session.consistency_score << "%" << std::endl;
                        }
                    }
                }
            }
        }
        else if (packet_id == PACKET_ID_LAP_DATA) {
            LapData lap_data;
            if (F1_24_Parser::parseLapData(buffer, bytes_received, lap_data)) {
                data_processor.updateLapData(lap_data);
            }
        }
        else if (packet_id == PACKET_ID_CAR_STATUS) {
            CarStatusData status_data;
            if (F1_24_Parser::parseCarStatus(buffer, bytes_received, status_data)) {
                data_processor.updateStatusData(status_data);
            }
        }
        else if (packet_id == PACKET_ID_MOTION) {
            CarMotionData motion_data;
            if (F1_24_Parser::parseMotionData(buffer, bytes_received, motion_data)) {
                data_processor.updateMotionData(motion_data, 0.0f);
            }
        }
        else if (packet_id == PACKET_ID_SESSION) {
            SessionData session_data;
            if (F1_24_Parser::parseSessionData(buffer, bytes_received, session_data)) {
                // Check for session reset before updating data
                PacketSessionData session_packet;
                memcpy(&session_packet, buffer, sizeof(PacketSessionData));
                data_processor.checkForSessionReset(session_packet.m_header.m_sessionUID);

                data_processor.updateSessionData(session_data);
                
                // Check for flag changes and generate synthetic events
                auto flagChange = data_processor.checkForFlagChanges();
                if (flagChange.hasChange) {
                    std::cout << "🚩 Flag Change: " << flagChange.eventType << " - " << flagChange.message << std::endl;
                    
                    // Create synthetic event JSON
                    char flag_event_json[512];
                    snprintf(flag_event_json, sizeof(flag_event_json), 
                        "{"
                        "\"type\":\"race_event\","
                        "\"eventCode\":\"%s\","
                        "\"message\":\"%s\","
                        "\"timestamp\":%lld"
                        "}", 
                        flagChange.eventType.c_str(), flagChange.message.c_str(),
                        std::chrono::duration_cast<std::chrono::milliseconds>(
                            std::chrono::system_clock::now().time_since_epoch()).count()
                    );
                    
                    // Send to frontend via events stream
                    ws_server.broadcastEvents(flag_event_json);
                }
                
                // Check for player status changes (retirement, DNF, DSQ)
                auto retirementChange = data_processor.checkForPlayerRetirement();
                if (retirementChange.hasRetirement) {
                    std::cout << "🚪 Player Status Change: " << retirementChange.message << std::endl;
                    
                    // Determine appropriate event code based on status
                    std::string eventCode = "RTMT"; // Default to retirement
                    if (retirementChange.message.find("disqualified") != std::string::npos) {
                        eventCode = "DSQ";
                    } else if (retirementChange.message.find("did not finish") != std::string::npos) {
                        eventCode = "DNF"; // Custom event for DNF
                    }
                    
                    // Create status change event JSON
                    char status_event_json[512];
                    snprintf(status_event_json, sizeof(status_event_json), 
                        "{"
                        "\"type\":\"race_event\","
                        "\"eventCode\":\"%s\","
                        "\"driverName\":\"%s\","
                        "\"message\":\"%s\","
                        "\"timestamp\":%lld"
                        "}", 
                        eventCode.c_str(), retirementChange.driverName.c_str(), retirementChange.message.c_str(),
                        std::chrono::duration_cast<std::chrono::milliseconds>(
                            std::chrono::system_clock::now().time_since_epoch()).count()
                    );
                    
                    // Send to frontend via events stream
                    ws_server.broadcastEvents(status_event_json);
                }
            }
        }
        else if (packet_id == PACKET_ID_SESSION_HISTORY) {
            PacketSessionHistoryData history_data;
            if (F1_24_Parser::parseSessionHistory(buffer, bytes_received, history_data)) {
                // Update both single-car and multi-car data with Session History
                data_processor.updateSessionHistoryData(history_data);
                data_processor.updateMultiCarSessionHistory(history_data);
                
                // Log sector data occasionally for debugging
                static int sector_log_counter = 0;
                if (++sector_log_counter % 300 == 0) { // Every ~5 seconds
                    if (history_data.m_numLaps > 0) {
                        const LapHistoryData& latest_lap = history_data.m_lapHistoryData[history_data.m_numLaps - 1];
                        std::cout << "Unified Server - Session History (Car " << (int)history_data.m_carIdx << ", Lap " << (int)history_data.m_numLaps << "): "
                                  << "S1=" << (latest_lap.m_sector1TimeMSPart / 1000.0f) << "s, "
                                  << "S2=" << (latest_lap.m_sector2TimeMSPart / 1000.0f) << "s, "
                                  << "S3=" << (latest_lap.m_sector3TimeMSPart / 1000.0f) << "s" << std::endl;
                    }
                }
            }
        }
        else if (packet_id == PACKET_ID_CAR_DAMAGE) {
            CarDamageData damage_data;
            uint16_t packet_format = 0;
            if (F1_24_Parser::parseCarDamage(buffer, bytes_received, damage_data, packet_format)) {
                data_processor.updateCarDamageData(damage_data, packet_format);

                // Debug: Log tire wear updates (now as float percentages)
                static int damageLogCount = 0;
                if (damageLogCount++ % 60 == 0) {  // Every ~1 second
                    std::cout << "🛞 Tire wear: FL=" << std::fixed << std::setprecision(1)
                              << damage_data.m_tyresWear[2]
                              << "%, FR=" << damage_data.m_tyresWear[3]
                              << "%, RL=" << damage_data.m_tyresWear[0]
                              << "%, RR=" << damage_data.m_tyresWear[1] << "%" << std::endl;
                }
            } else {
                static bool loggedDamageError = false;
                if (!loggedDamageError) {
                    std::cout << "❌ Failed to parse CAR_DAMAGE packet (size: " << bytes_received << ")" << std::endl;
                    loggedDamageError = true;
                }
            }
        }
        else if (packet_id == PACKET_ID_PARTICIPANTS) {
            PacketParticipantsData participants_packet;
            uint16_t participants_format = 0;
            if (F1_24_Parser::parseParticipants(buffer, bytes_received, participants_packet, participants_format)) {
                data_processor.setGameIdentification(participants_format, participants_packet.m_header.m_gameYear);
                data_processor.updateParticipantsData(participants_packet);
                
                // Debug: Log participants data
                std::cout << "?? Participants packet received - Active cars: " << (int)participants_packet.m_numActiveCars << std::endl;
                for (int i = 0; i < std::min((int)participants_packet.m_numActiveCars, 3); i++) {
                    std::cout << "  Car " << i << ": " << participants_packet.m_participants[i].m_name 
                              << " (Team " << (int)participants_packet.m_participants[i].m_teamId << ")" << std::endl;
                }
                
                // Send multi-car data if we have complete data
                if (data_processor.hasCompleteMultiCarData()) {
                    auto multi_car_data = data_processor.getMultiCarData();
                    std::string json_data = data_processor.multiCarToJSON(multi_car_data);
                    ws_server.broadcastMultiCarData(json_data);
                    std::cout << "?? Multi-car data broadcast sent!" << std::endl;
                }
            }
        }
        else if (packet_id == PACKET_ID_EVENT) {
            PacketEventData event_packet;
            if (F1_24_Parser::parseEventData(buffer, bytes_received, event_packet)) {
                // Extract event string (4 bytes)
                char eventCode[5] = {0};
                memcpy(eventCode, event_packet.m_eventStringCode, 4);
                
                // Filter out events we don't want for AI analysis
                if (strcmp(eventCode, "BUTN") == 0 || strcmp(eventCode, "SPTP") == 0) {
                    // Skip button events and speed trap events - not strategically useful
                    return;
                }
                
                std::cout << "🏁 Race Event: " << eventCode << std::endl;

                // Update data processor with event code for packet 3 detection
                data_processor.updateEventData(eventCode);

                // Create JSON for event data with additional details
                char event_json[1024];
                
                // Handle overtake events with driver names
                if (strcmp(eventCode, "OVTK") == 0) {
                    uint8_t overtakingIdx = event_packet.m_eventDetails.overtake.overtakingVehicleIdx;
                    uint8_t beingOvertakenIdx = event_packet.m_eventDetails.overtake.beingOvertakenVehicleIdx;
                    
                    // Get driver names from participant data
                    std::string overtakingDriver = data_processor.getParticipantName(overtakingIdx);
                    std::string beingOvertakenDriver = data_processor.getParticipantName(beingOvertakenIdx);
                    
                    snprintf(event_json, sizeof(event_json), 
                        "{"
                        "\"type\":\"race_event\","
                        "\"eventCode\":\"%s\","
                        "\"overtakingIdx\":%d,"
                        "\"beingOvertakenIdx\":%d,"
                        "\"overtakingDriver\":\"%s\","
                        "\"beingOvertakenDriver\":\"%s\","
                        "\"timestamp\":%lld"
                        "}", 
                        eventCode, overtakingIdx, beingOvertakenIdx,
                        overtakingDriver.c_str(), beingOvertakenDriver.c_str(),
                        std::chrono::duration_cast<std::chrono::milliseconds>(
                            std::chrono::system_clock::now().time_since_epoch()).count()
                    );
                }
                // Handle penalty events with driver details
                else if (strcmp(eventCode, "PENA") == 0) {
                    uint8_t vehicleIdx = event_packet.m_eventDetails.penalty.vehicleIdx;
                    uint8_t penaltyType = event_packet.m_eventDetails.penalty.penaltyType;
                    uint8_t time = event_packet.m_eventDetails.penalty.time;
                    
                    // Skip false penalty events (penalties with 0 time are not real penalties)
                    if (time == 0) {
                        return;
                    }
                    
                    // Get driver name
                    std::string driverName = data_processor.getParticipantName(vehicleIdx);
                    
                    snprintf(event_json, sizeof(event_json), 
                        "{"
                        "\"type\":\"race_event\","
                        "\"eventCode\":\"%s\","
                        "\"vehicleIdx\":%d,"
                        "\"driverName\":\"%s\","
                        "\"penaltyType\":%d,"
                        "\"time\":%d,"
                        "\"timestamp\":%lld"
                        "}", 
                        eventCode, vehicleIdx, driverName.c_str(), penaltyType, time,
                        std::chrono::duration_cast<std::chrono::milliseconds>(
                            std::chrono::system_clock::now().time_since_epoch()).count()
                    );
                }
                // Handle fastest lap events with driver details
                else if (strcmp(eventCode, "FTLP") == 0) {
                    uint8_t vehicleIdx = event_packet.m_eventDetails.fastestLap.vehicleIdx;
                    float lapTime = event_packet.m_eventDetails.fastestLap.lapTime;
                    
                    // Get driver name
                    std::string driverName = data_processor.getParticipantName(vehicleIdx);
                    
                    // Format lap time as M:SS.mmm
                    int minutes = (int)(lapTime / 60.0f);
                    float seconds = lapTime - (minutes * 60.0f);
                    char formatted_time[16];
                    snprintf(formatted_time, sizeof(formatted_time), "%d:%06.3f", minutes, seconds);
                    
                    snprintf(event_json, sizeof(event_json), 
                        "{"
                        "\"type\":\"race_event\","
                        "\"eventCode\":\"%s\","
                        "\"vehicleIdx\":%d,"
                        "\"driverName\":\"%s\","
                        "\"lapTime\":%.3f,"
                        "\"formattedTime\":\"%s\","
                        "\"timestamp\":%lld"
                        "}", 
                        eventCode, vehicleIdx, driverName.c_str(), lapTime, formatted_time,
                        std::chrono::duration_cast<std::chrono::milliseconds>(
                            std::chrono::system_clock::now().time_since_epoch()).count()
                    );
                }
                // Handle retirement events
                else if (strcmp(eventCode, "RTMT") == 0) {
                    uint8_t vehicleIdx = event_packet.m_eventDetails.retirement.vehicleIdx;
                    
                    // Get driver name
                    std::string driverName = data_processor.getParticipantName(vehicleIdx);
                    
                    snprintf(event_json, sizeof(event_json), 
                        "{"
                        "\"type\":\"race_event\","
                        "\"eventCode\":\"%s\","
                        "\"vehicleIdx\":%d,"
                        "\"driverName\":\"%s\","
                        "\"timestamp\":%lld"
                        "}", 
                        eventCode, vehicleIdx, driverName.c_str(),
                        std::chrono::duration_cast<std::chrono::milliseconds>(
                            std::chrono::system_clock::now().time_since_epoch()).count()
                    );
                }
                // Handle collision events with driver details
                else if (strcmp(eventCode, "COLL") == 0) {
                    uint8_t vehicle1Idx = event_packet.m_eventDetails.collision.vehicle1Idx;
                    uint8_t vehicle2Idx = event_packet.m_eventDetails.collision.vehicle2Idx;
                    
                    // Get driver names
                    std::string driver1Name = data_processor.getParticipantName(vehicle1Idx);
                    std::string driver2Name = data_processor.getParticipantName(vehicle2Idx);
                    
                    snprintf(event_json, sizeof(event_json), 
                        "{"
                        "\"type\":\"race_event\","
                        "\"eventCode\":\"%s\","
                        "\"vehicle1Idx\":%d,"
                        "\"vehicle2Idx\":%d,"
                        "\"driver1Name\":\"%s\","
                        "\"driver2Name\":\"%s\","
                        "\"timestamp\":%lld"
                        "}", 
                        eventCode, vehicle1Idx, vehicle2Idx, driver1Name.c_str(), driver2Name.c_str(),
                        std::chrono::duration_cast<std::chrono::milliseconds>(
                            std::chrono::system_clock::now().time_since_epoch()).count()
                    );
                }
                // Generic event (no additional details)
                else {
                    snprintf(event_json, sizeof(event_json), 
                        "{"
                        "\"type\":\"race_event\","
                        "\"eventCode\":\"%s\","
                        "\"timestamp\":%lld"
                        "}", 
                        eventCode, 
                        std::chrono::duration_cast<std::chrono::milliseconds>(
                            std::chrono::system_clock::now().time_since_epoch()).count()
                    );
                }
                
                // Broadcast event to frontend
                ws_server.broadcastEvents(std::string(event_json));
            }
        }
        else if (packet_id == PACKET_ID_CAR_SETUPS) {
            PacketCarSetupsData setup_packet;
            if (F1_24_Parser::parseCarSetups(buffer, bytes_received, setup_packet)) {
                std::cout << "🔧 Car setups received for all cars" << std::endl;
                
                // Get player car setup
                uint8_t playerIndex = setup_packet.m_header.m_playerCarIndex;
                if (playerIndex < 22) {
                    const CarSetupData& playerSetup = setup_packet.m_carSetups[playerIndex];

                    // Update data processor with setup data - this will include it in main telemetry JSON
                    data_processor.updateCarSetupData(playerSetup);

                    // REMOVED DUPLICATE: No longer sending separate car_setup JSON
                    // Car setup data is now included in main telemetry via data_processor
                }
            }
        }
        else if (packet_id == PACKET_ID_FINAL_CLASSIFICATION) {
            PacketFinalClassificationData classification_packet;
            if (F1_24_Parser::parseFinalClassification(buffer, bytes_received, classification_packet)) {
                std::cout << "🏆 Final classification received - " << (int)classification_packet.m_numCars << " cars" << std::endl;
                
                // Create final results JSON for frontend
                char classification_json[4096];
                snprintf(classification_json, sizeof(classification_json), 
                    "{"
                    "\"type\":\"final_classification\","
                    "\"num_cars\":%d,"
                    "\"results\":[",
                    classification_packet.m_numCars
                );
                
                // Find positions we want to show: top 3 + player position
                uint8_t playerCarIdx = classification_packet.m_header.m_playerCarIndex;
                uint8_t playerPosition = 0;
                
                // Find player position
                for (int i = 0; i < classification_packet.m_numCars; i++) {
                    if (i == playerCarIdx) {
                        playerPosition = classification_packet.m_classificationData[i].m_position;
                        break;
                    }
                }
                
                // Collect positions to show (top 3 + player if not in top 3)
                std::vector<uint8_t> positionsToShow = {1, 2, 3};
                if (playerPosition > 3) {
                    positionsToShow.push_back(playerPosition);
                }
                
                bool first = true;
                for (uint8_t targetPos : positionsToShow) {
                    // Find the driver in this position
                    for (int i = 0; i < classification_packet.m_numCars; i++) {
                        const auto& result = classification_packet.m_classificationData[i];
                        if (result.m_position == targetPos) {
                            // Get driver name
                            std::string driverName = data_processor.getParticipantName(i);
                            
                            // Format lap time
                            float lapTimeSeconds = result.m_bestLapTimeInMS / 1000.0f;
                            
                            // Check for DSQ and create event (prevent spam)
                            if (result.m_resultStatus == 5) { // 5 = disqualified
                                static std::set<std::string> announced_dsqs;
                                if (announced_dsqs.find(driverName) == announced_dsqs.end()) {
                                    char dsq_event[256];
                                    snprintf(dsq_event, sizeof(dsq_event),
                                        "{"
                                        "\"type\":\"race_event\","
                                        "\"eventCode\":\"DSQ\","
                                        "\"driverName\":\"%s\","
                                        "\"timestamp\":%lld"
                                        "}",
                                        driverName.c_str(),
                                        std::chrono::duration_cast<std::chrono::milliseconds>(
                                            std::chrono::system_clock::now().time_since_epoch()).count()
                                    );
                                    
                                    ws_server.broadcastEvents(dsq_event);
                                    std::cout << "🚫 " << driverName << " disqualified" << std::endl;
                                    announced_dsqs.insert(driverName);
                                }
                            }
                            
                            char result_json[256];
                            snprintf(result_json, sizeof(result_json),
                                "%s{"
                                "\"position\":%d,"
                                "\"driver\":\"%s\","
                                "\"points\":%d,"
                                "\"laps_completed\":%d,"
                                "\"grid_position\":%d,"
                                "\"best_lap_time\":%.3f,"
                                "\"race_time\":%.3f,"
                                "\"penalties_time\":%d,"
                                "\"result_status\":%d,"
                                "\"is_player\":%s"
                                "}",
                                (!first ? "," : ""),
                                result.m_position,
                                driverName.c_str(),
                                result.m_points,
                                result.m_numLaps,
                                result.m_gridPosition,
                                lapTimeSeconds,
                                result.m_totalRaceTime,
                                result.m_penaltiesTime,
                                result.m_resultStatus,
                                (i == playerCarIdx ? "true" : "false")
                            );
                            
                            strcat(classification_json, result_json);
                            first = false;
                            break;
                        }
                    }
                }
                
                strcat(classification_json, "]");
                
                // Add timestamp
                char timestamp_json[64];
                snprintf(timestamp_json, sizeof(timestamp_json),
                    ",\"timestamp\":%lld}",
                    std::chrono::duration_cast<std::chrono::milliseconds>(
                        std::chrono::system_clock::now().time_since_epoch()).count()
                );
                strcat(classification_json, timestamp_json);
                
                // Broadcast final results
                ws_server.broadcastTelemetry(classification_json);
                
                // Also create a race results event (only once) with top 3 + player
                static bool results_announced = false;
                if (classification_packet.m_numCars > 0 && !results_announced) {
                    // Find top 3 drivers and player position
                    std::string topDrivers[3] = {"Unknown", "Unknown", "Unknown"};
                    std::string playerResult = "";
                    int playerPosition = 0;
                    
                    for (int i = 0; i < classification_packet.m_numCars; i++) {
                        const FinalClassificationData& result = classification_packet.m_classificationData[i];
                        std::string driverName = data_processor.getParticipantName(i);
                        
                        // Get top 3 positions
                        if (result.m_position >= 1 && result.m_position <= 3) {
                            topDrivers[result.m_position - 1] = driverName;
                        }
                        
                        // Check if this is the player
                        PacketHeader header;
                        memcpy(&header, buffer, sizeof(PacketHeader));
                        if (i == header.m_playerCarIndex) {
                            playerPosition = result.m_position;
                            playerResult = driverName;
                        }
                    }
                    
                    char results_event[1024];
                    snprintf(results_event, sizeof(results_event),
                        "{"
                        "\"type\":\"race_event\","
                        "\"eventCode\":\"RCWN\","
                        "\"winner\":\"%s\","
                        "\"p2\":\"%s\","
                        "\"p3\":\"%s\","
                        "\"playerPosition\":%d,"
                        "\"playerName\":\"%s\","
                        "\"timestamp\":%lld"
                        "}",
                        topDrivers[0].c_str(),
                        topDrivers[1].c_str(),
                        topDrivers[2].c_str(),
                        playerPosition,
                        playerResult.c_str(),
                        std::chrono::duration_cast<std::chrono::milliseconds>(
                            std::chrono::system_clock::now().time_since_epoch()).count()
                    );
                    
                    ws_server.broadcastEvents(results_event);
                    std::cout << "🏆 Race Results - Winner: " << topDrivers[0] << ", P2: " << topDrivers[1] << ", P3: " << topDrivers[2] << std::endl;
                    if (playerPosition > 0) {
                        std::cout << "👤 Player finished P" << playerPosition << ": " << playerResult << std::endl;
                    }
                    results_announced = true;
                }
            }
        }
        else if (packet_id == PACKET_ID_TYRE_SETS) {
            PacketTyreSetsData tyre_sets_packet;
            if (F1_24_Parser::parseTyreSets(buffer, bytes_received, tyre_sets_packet)) {
                std::cout << "🏎️ Tyre sets data received for car " << (int)tyre_sets_packet.m_carIdx << std::endl;
                
                // Only process player car tyre sets
                PacketHeader header;
                memcpy(&header, buffer, sizeof(PacketHeader));
                if (tyre_sets_packet.m_carIdx == header.m_playerCarIndex) {
                    // Update data processor with tyre sets count for packet 12 detection
                    data_processor.updateTyreSetsData(20); // F1 24 always has 20 tyre sets (13 dry + 7 wet)

                    // Create JSON for tyre sets data
                    std::string tyre_sets_json = "{\"type\":\"tyre_sets\",\"sets\":[";
                    
                    for (int i = 0; i < 20; i++) {
                        const TyreSetData& set = tyre_sets_packet.m_tyreSetData[i];
                        if (i > 0) tyre_sets_json += ",";
                        
                        char set_json[256];
                        snprintf(set_json, sizeof(set_json),
                            "{"
                            "\"id\":%d,"
                            "\"actualCompound\":%d,"
                            "\"visualCompound\":%d,"
                            "\"wear\":%d,"
                            "\"available\":%s,"
                            "\"recommendedSession\":%d,"
                            "\"lifeSpan\":%d,"
                            "\"usableLife\":%d,"
                            "\"lapDeltaTime\":%d,"
                            "\"fitted\":%s"
                            "}",
                            i,
                            set.m_actualTyreCompound,
                            set.m_visualTyreCompound,
                            set.m_wear,
                            set.m_available ? "true" : "false",
                            set.m_recommendedSession,
                            set.m_lifeSpan,
                            set.m_usableLife,
                            set.m_lapDeltaTime,
                            set.m_fitted ? "true" : "false"
                        );
                        tyre_sets_json += set_json;
                    }
                    
                    tyre_sets_json += "],\"fittedIdx\":" + std::to_string(tyre_sets_packet.m_fittedIdx) + "}";
                    
                    // Broadcast tyre sets to frontend
                    ws_server.broadcastTelemetry(tyre_sets_json);
                }
            }
        }
        else if (packet_id == PACKET_ID_TIME_TRIAL) {
            PacketTimeTrialData time_trial_packet;
            if (F1_24_Parser::parseTimeTrial(buffer, bytes_received, time_trial_packet)) {
                std::cout << "⏱️ Time trial data received" << std::endl;
                
                // TODO: Process time trial data for hotlap analysis
            }
        }
    }
    
    // Also process multi-car data when we get telemetry/lap data packets
    void processF1MultiCarData(const char* buffer, int bytes_received) {
        uint8_t packet_id = F1_24_Parser::getPacketId(buffer);
        uint16_t packet_format = F1_24_Parser::getPacketFormat(buffer);
        uint8_t game_year = F1_24_Parser::getGameYear(buffer);
        data_processor.setGameIdentification(packet_format, game_year);
        
        if (packet_id == PACKET_ID_CAR_TELEMETRY) {
            PacketCarTelemetryData telemetry_packet;
            if (F1_24_Parser::parseAllCarTelemetry(buffer, bytes_received, telemetry_packet)) {
                data_processor.updateMultiCarTelemetryData(telemetry_packet);
            }
        }
        else if (packet_id == PACKET_ID_LAP_DATA) {
            PacketLapData lap_packet;
            if (F1_24_Parser::parseAllLapData(buffer, bytes_received, lap_packet)) {
                // Check for race restart before updating lap data
                uint8_t playerIdx = lap_packet.m_header.m_playerCarIndex;
                if (playerIdx < 22) {
                    data_processor.checkForRaceRestart(
                        lap_packet.m_header.m_sessionTime,
                        lap_packet.m_header.m_frameIdentifier,
                        lap_packet.m_lapData[playerIdx].m_currentLapNum
                    );
                }

                data_processor.updateMultiCarLapData(lap_packet);
            }
        }
        else if (packet_id == PACKET_ID_CAR_STATUS) {
            PacketCarStatusData status_packet;
            if (F1_24_Parser::parseAllCarStatus(buffer, bytes_received, status_packet)) {
                data_processor.updateMultiCarStatusData(status_packet);
            }
        }
        
        // Broadcast multi-car data if complete
        if (data_processor.hasCompleteMultiCarData()) {
            auto multi_car_data = data_processor.getMultiCarData();
            std::string json_data = data_processor.multiCarToJSON(multi_car_data);
            ws_server.broadcastMultiCarData(json_data);
        }
    }
    
    void stop() {
        running = false;
        ws_server.stop();
        
#ifdef _WIN32
        if (ac_parser) { ac_parser->cleanup(); }
#endif
#ifdef WINDOWS_ACC_SUPPORT
        if (acc_parser) { acc_parser->cleanup(); }
#endif
#ifdef WINDOWS_ATS_SUPPORT
        if (ats_parser) { ats_parser->cleanup(); }
#endif
        
        std::cout << "Unified telemetry server stopped." << std::endl;
    }
    
    void printStatus() {
        std::cout << "\n=== Atlas Racing Server Status ===" << std::endl;
        std::cout << "Current game: ";
        switch (current_game) {
            case GAME_NONE: std::cout << "None (scanning...)" << std::endl; break;
            case GAME_F1_24: std::cout << "F1 24/25 (UDP)" << std::endl; break;
            case GAME_AC: std::cout << "Assetto Corsa (Shared Memory)" << std::endl; break;
            case GAME_ACC: std::cout << "ACC (Shared Memory)" << std::endl; break;
            case GAME_ATS: std::cout << "American Truck Simulator (Shared Memory)" << std::endl; break;
        }
        std::cout << "WebSocket server: Running on port 8080" << std::endl;
        std::cout << "===================================\n" << std::endl;
    }
};

UnifiedTelemetryServer* server = nullptr;

void signalHandler(int signal) {
    std::cout << "\nReceived signal " << signal << ", shutting down..." << std::endl;
    if (server) {
        server->stop();
    }
}

int main() {
    signal(SIGINT, signalHandler);
    signal(SIGTERM, signalHandler);
    
    server = new UnifiedTelemetryServer();
    
    if (!server->initialize()) {
        std::cerr << "Failed to initialize server" << std::endl;
        delete server;
        return 1;
    }
    
    server->printStatus();
    
    std::cout << "Atlas Racing Multi-Game Telemetry Server running..." << std::endl;
    std::cout << "Ready to receive telemetry from F1, AC, ACC, and ATS" << std::endl;
    std::cout << "Press Ctrl+C to stop" << std::endl;
    
    server->run();
    
    delete server;
    return 0;
}
