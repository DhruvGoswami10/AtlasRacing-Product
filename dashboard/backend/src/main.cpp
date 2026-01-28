#include <iostream>
#include <thread>
#include <chrono>
#include <signal.h>
#include <cstring>
#include <algorithm>
#include "../include/telemetry/udp_receiver.h"
#include "../include/telemetry/websocket_server.h"
#include "../include/telemetry/data_processor.h"
#include "f1_24/f1_24_types.h"

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

// F1_24_Parser functions
class F1_24_Parser {
public:
    static bool isValidF1Packet(const char* data, size_t size) {
        if (size < sizeof(PacketHeader)) {
            return false;
        }

        PacketHeader header;
        std::memcpy(&header, data, sizeof(PacketHeader));

        bool validFormat = (header.m_packetFormat == 2024 || header.m_packetFormat == 2025);
        bool validYear = (header.m_gameYear == 24 || header.m_gameYear == 25);
        bool validPacketId = (header.m_packetId <= PACKET_ID_LAP_POSITIONS);

        if (!validFormat || !validYear || !validPacketId) {
            return false;
        }

        return true;
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
            std::cerr << "Invalid car telemetry packet size: " << size << std::endl;
            return false;
        }
        
        PacketCarTelemetryData packet;
        memcpy(&packet, data, sizeof(PacketCarTelemetryData));
        
        if (packet.m_header.m_packetId != PACKET_ID_CAR_TELEMETRY) {
            std::cerr << "Not a car telemetry packet: " << (int)packet.m_header.m_packetId << std::endl;
            return false;
        }
        
        // Get player car data
        uint8_t playerIndex = packet.m_header.m_playerCarIndex;
        if (playerIndex >= 22) {
            std::cerr << "Invalid player car index: " << (int)playerIndex << std::endl;
            return false;
        }
        
        telemetry = packet.m_carTelemetryData[playerIndex];
        return true;
    }
    
    static bool parseLapData(const char* data, size_t size, LapData& lapData) {
        if (size < sizeof(PacketLapData)) {
            std::cerr << "Invalid lap data packet size: " << size << std::endl;
            return false;
        }
        
        PacketLapData packet;
        memcpy(&packet, data, sizeof(PacketLapData));
        
        if (packet.m_header.m_packetId != PACKET_ID_LAP_DATA) {
            std::cerr << "Not a lap data packet: " << (int)packet.m_header.m_packetId << std::endl;
            return false;
        }
        
        // Get player car data
        uint8_t playerIndex = packet.m_header.m_playerCarIndex;
        if (playerIndex >= 22) {
            std::cerr << "Invalid player car index: " << (int)playerIndex << std::endl;
            return false;
        }
        
        lapData = packet.m_lapData[playerIndex];
        return true;
    }
    
    static bool parseCarStatus(const char* data, size_t size, CarStatusData& statusData) {
        if (size < sizeof(PacketCarStatusData)) {
            std::cerr << "Invalid car status packet size: " << size << std::endl;
            return false;
        }
        
        PacketCarStatusData packet;
        memcpy(&packet, data, sizeof(PacketCarStatusData));
        
        if (packet.m_header.m_packetId != PACKET_ID_CAR_STATUS) {
            std::cerr << "Not a car status packet: " << (int)packet.m_header.m_packetId << std::endl;
            return false;
        }
        
        // Get player car data
        uint8_t playerIndex = packet.m_header.m_playerCarIndex;
        if (playerIndex >= 22) {
            std::cerr << "Invalid player car index: " << (int)playerIndex << std::endl;
            return false;
        }
        
        statusData = packet.m_carStatusData[playerIndex];
        return true;
    }
    
    static bool parseMotionData(const char* data, size_t size, CarMotionData& motionData) {
        if (size < sizeof(PacketMotionData)) {
            std::cerr << "Invalid motion packet size: " << size << std::endl;
            return false;
        }
        
        PacketMotionData packet;
        memcpy(&packet, data, sizeof(PacketMotionData));
        
        if (packet.m_header.m_packetId != PACKET_ID_MOTION) {
            std::cerr << "Not a motion packet: " << (int)packet.m_header.m_packetId << std::endl;
            return false;
        }
        
        // Get player car data
        uint8_t playerIndex = packet.m_header.m_playerCarIndex;
        if (playerIndex >= 22) {
            std::cerr << "Invalid player car index: " << (int)playerIndex << std::endl;
            return false;
        }
        
        motionData = packet.m_carMotionData[playerIndex];
        return true;
    }
    
    static bool parseSessionData(const char* data, size_t size, SessionData& sessionData) {
        if (size < sizeof(PacketSessionData)) {
            std::cerr << "Invalid session packet size: " << size << std::endl;
            return false;
        }
        
        PacketSessionData packet;
        memcpy(&packet, data, sizeof(PacketSessionData));
        
        if (packet.m_header.m_packetId != PACKET_ID_SESSION) {
            std::cerr << "Not a session packet: " << (int)packet.m_header.m_packetId << std::endl;
            return false;
        }
        
        sessionData = packet.m_sessionData;
        return true;
    }
    
    static bool parseSessionHistory(const char* data, size_t size, PacketSessionHistoryData& historyData) {
        if (size < sizeof(PacketSessionHistoryData)) {
            std::cerr << "Invalid session history packet size: " << size << std::endl;
            return false;
        }
        
        PacketSessionHistoryData packet;
        memcpy(&packet, data, sizeof(PacketSessionHistoryData));
        
        if (packet.m_header.m_packetId != PACKET_ID_SESSION_HISTORY) {
            std::cerr << "Not a session history packet: " << (int)packet.m_header.m_packetId << std::endl;
            return false;
        }
        
        historyData = packet;
        return true;
    }
    
    // Multi-car parsing functions for pit wall dashboard
    static bool parseAllCarTelemetry(const char* data, size_t size, PacketCarTelemetryData& packet) {
        if (size < sizeof(PacketCarTelemetryData)) {
            return false;
        }
        memcpy(&packet, data, sizeof(PacketCarTelemetryData));
        return packet.m_header.m_packetId == PACKET_ID_CAR_TELEMETRY;
    }
    
    static bool parseAllLapData(const char* data, size_t size, PacketLapData& packet) {
        if (size < sizeof(PacketLapData)) {
            return false;
        }
        memcpy(&packet, data, sizeof(PacketLapData));
        return packet.m_header.m_packetId == PACKET_ID_LAP_DATA;
    }
    
    static bool parseAllCarStatus(const char* data, size_t size, PacketCarStatusData& packet) {
        if (size < sizeof(PacketCarStatusData)) {
            return false;
        }
        memcpy(&packet, data, sizeof(PacketCarStatusData));
        return packet.m_header.m_packetId == PACKET_ID_CAR_STATUS;
    }

    static bool parseAllMotionData(const char* data, size_t size, PacketMotionData& packet) {
        if (size < sizeof(PacketMotionData)) {
            return false;
        }
        memcpy(&packet, data, sizeof(PacketMotionData));
        return packet.m_header.m_packetId == PACKET_ID_MOTION;
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
    
    static void logPacketStats(const char* data) {
        PacketHeader header;
        memcpy(&header, data, sizeof(PacketHeader));
        
        std::cout << "F1 24 Packet - ID: " << (int)header.m_packetId
                  << ", Session: " << header.m_sessionUID
                  << ", Frame: " << header.m_frameIdentifier
                  << ", Player: " << (int)header.m_playerCarIndex << std::endl;
    }
};

class F1TelemetryServer {
private:
    UDPReceiver udp_receiver;
    WebSocketServer ws_server;
    DataProcessor data_processor;
    bool running;
    
public:
    F1TelemetryServer() : running(false) {}
    
    bool initialize() {
        std::cout << "Initializing F1 24 Telemetry Server..." << std::endl;
        
        
        if (!udp_receiver.initialize()) {
            std::cerr << "Failed to initialize UDP receiver" << std::endl;
            return false;
        }
        
        if (!ws_server.start()) {
            std::cerr << "Failed to start WebSocket server" << std::endl;
            return false;
        }
        
        std::cout << "Server initialized successfully!" << std::endl;
        return true;
    }
    
    void run() {
        running = true;
        std::cout << "Starting telemetry processing loop..." << std::endl;
        std::cout << "Waiting for F1 24 UDP packets on port 20777..." << std::endl;
        
        char buffer[2048];
        uint64_t current_session = 0;
        
        while (running) {
            int bytes_received = udp_receiver.receivePacket(buffer);
            
            if (bytes_received > 0) {
                if (!F1_24_Parser::isValidF1Packet(buffer, bytes_received)) {
                    continue;
                }
                
                uint8_t packet_id = F1_24_Parser::getPacketId(buffer);
                uint16_t packet_format = F1_24_Parser::getPacketFormat(buffer);
                uint8_t game_year = F1_24_Parser::getGameYear(buffer);
                data_processor.setGameIdentification(packet_format, game_year);
                
                // Handle different packet types
                if (packet_id == PACKET_ID_CAR_TELEMETRY) {
                    // Single-car telemetry for individual widgets
                    CarTelemetryData telemetry;
                    if (F1_24_Parser::parseCarTelemetry(buffer, bytes_received, telemetry)) {
                        data_processor.updateTelemetryData(telemetry);
                        
                        // Broadcast current combined data
                        auto processed = data_processor.getCurrentData();
                        std::cout << "DEBUG: timestamp=" << processed.timestamp_ms << ", speed=" << processed.speed_kph << std::endl;
                        if (processed.timestamp_ms > 0) { // Check if we have valid data
                            std::string json_data = data_processor.toJSON(processed);
                            ws_server.broadcastTelemetry(json_data);
                            std::cout << "DEBUG: Broadcasting data" << std::endl;
                            
                            // Log occasionally
                            static int log_counter = 0;
                            if (++log_counter % 60 == 0) { // Every ~1 second at 60fps
                                data_processor.logTelemetry(processed);
                            }
                        } else {
                            std::cout << "DEBUG: No valid data to broadcast" << std::endl;
                        }
                    }
                    
                    // Multi-car telemetry for pit wall dashboard
                    PacketCarTelemetryData multi_telemetry;
                    if (F1_24_Parser::parseAllCarTelemetry(buffer, bytes_received, multi_telemetry)) {
                        data_processor.updateMultiCarTelemetryData(multi_telemetry);
                    }
                }
                else if (packet_id == PACKET_ID_LAP_DATA) {
                    // Single-car lap data for individual widgets
                    LapData lap_data;
                    if (F1_24_Parser::parseLapData(buffer, bytes_received, lap_data)) {
                        data_processor.updateLapData(lap_data);
                    }
                    
                    // Multi-car lap data for pit wall dashboard
                    PacketLapData multi_lap_data;
                    if (F1_24_Parser::parseAllLapData(buffer, bytes_received, multi_lap_data)) {
                        data_processor.updateMultiCarLapData(multi_lap_data);
                        
                        // Broadcast multi-car data for pit wall when we have complete data
                        if (data_processor.hasCompleteMultiCarData()) {
                            auto multi_car_data = data_processor.getMultiCarData();
                            std::string multi_car_json = data_processor.multiCarToJSON(multi_car_data);
                            ws_server.broadcastMultiCarData(multi_car_json);
                        }
                    }
                }
                else if (packet_id == PACKET_ID_CAR_STATUS) {
                    // Single-car status data
                    CarStatusData status_data;
                    if (F1_24_Parser::parseCarStatus(buffer, bytes_received, status_data)) {
                        data_processor.updateStatusData(status_data);
                    }
                    
                    // Multi-car status data for pit wall dashboard
                    PacketCarStatusData multi_status_data;
                    if (F1_24_Parser::parseAllCarStatus(buffer, bytes_received, multi_status_data)) {
                        data_processor.updateMultiCarStatusData(multi_status_data);
                    }
                }
                else if (packet_id == PACKET_ID_PARTICIPANTS) {
                    // Participants data for pit wall dashboard (driver names, teams)
                    PacketParticipantsData participants_data;
                    uint16_t participants_format = 0;
                    if (F1_24_Parser::parseParticipants(buffer, bytes_received, participants_data, participants_format)) {
                        data_processor.setGameIdentification(participants_format, participants_data.m_header.m_gameYear);
                        data_processor.updateParticipantsData(participants_data);
                        
                        static int participants_log_counter = 0;
                        if (++participants_log_counter % 300 == 0) { // Log every ~5 seconds
                            std::cout << "Updated participants data - Active cars: " 
                                      << (int)participants_data.m_numActiveCars << std::endl;
                        }
                    }
                }
                else if (packet_id == PACKET_ID_MOTION) {
                    CarMotionData motion_data;
                    if (F1_24_Parser::parseMotionData(buffer, bytes_received, motion_data)) {
                        // We need lap distance from lap data packet for track position
                        data_processor.updateMotionData(motion_data, 0.0f);
                    }

                    PacketMotionData multi_motion;
                    if (F1_24_Parser::parseAllMotionData(buffer, bytes_received, multi_motion)) {
                        data_processor.updateMultiCarMotionData(multi_motion);
                    }
                }
                else if (packet_id == PACKET_ID_SESSION) {
                    SessionData session_data;
                    if (F1_24_Parser::parseSessionData(buffer, bytes_received, session_data)) {
                        data_processor.updateSessionData(session_data);
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
                                std::cout << "Session History (Car " << (int)history_data.m_carIdx << ", Lap " << (int)history_data.m_numLaps << "): "
                                          << "S1=" << (latest_lap.m_sector1TimeMSPart / 1000.0f) << "s, "
                                          << "S2=" << (latest_lap.m_sector2TimeMSPart / 1000.0f) << "s, "
                                          << "S3=" << (latest_lap.m_sector3TimeMSPart / 1000.0f) << "s" << std::endl;
                            }
                        }
                    }
                }
                
                // Log packet info occasionally
                static int packet_counter = 0;
                if (++packet_counter % 300 == 0) { // Every ~5 seconds
                    F1_24_Parser::logPacketStats(buffer);
                }
            }
            
            // Small sleep to prevent excessive CPU usage
            std::this_thread::sleep_for(std::chrono::microseconds(100));
        }
    }
    
    void stop() {
        running = false;
        ws_server.stop();
        std::cout << "Server stopped." << std::endl;
    }
};

F1TelemetryServer* server = nullptr;

void signalHandler(int signal) {
    std::cout << "\nReceived signal " << signal << ", shutting down..." << std::endl;
    if (server) {
        server->stop();
    }
}

int main() {
    signal(SIGINT, signalHandler);
    signal(SIGTERM, signalHandler);
    
    server = new F1TelemetryServer();
    
    if (!server->initialize()) {
        std::cerr << "Failed to initialize server" << std::endl;
        delete server;
        return 1;
    }
    
    std::cout << "F1 24 Telemetry Server running..." << std::endl;
    std::cout << "- UDP listening on port 20777 for F1 24 data" << std::endl;
    std::cout << "- WebSocket server on port 8080 for dashboard" << std::endl;
    std::cout << "- Press Ctrl+C to stop" << std::endl;
    
    server->run();
    
    delete server;
    return 0;
}
