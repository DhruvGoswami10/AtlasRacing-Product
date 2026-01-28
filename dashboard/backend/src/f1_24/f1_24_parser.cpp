#include "f1_24_types.h"
#include <iostream>
#include <cstring>
#include <algorithm>

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

class F1_24_Parser {
public:
    static bool isValidF1Packet(const char* data, size_t size) {
        // Debug: Log the very first validation attempt
        static bool veryFirstLog = true;
        if (veryFirstLog) {
            std::cout << "🔍 F1 Parser: First validation - size=" << size
                      << ", PacketHeader size=" << sizeof(PacketHeader) << " bytes" << std::endl;
            veryFirstLog = false;
        }

        if (size < sizeof(PacketHeader)) {
            static int sizeErrorCount = 0;
            if (sizeErrorCount++ < 3) {
                std::cout << "❌ Packet too small: " << size << " < " << sizeof(PacketHeader) << std::endl;
            }
            return false;
        }

        PacketHeader header;
        memcpy(&header, data, sizeof(PacketHeader));

        // Debug: Log first packet and format changes
        static bool firstLog = true;
        static int lastLoggedFormat = 0;
        static int lastLoggedYear = 0;
        if (firstLog || (header.m_packetFormat != lastLoggedFormat || header.m_gameYear != lastLoggedYear)) {
            std::cout << "📦 F1 Packet Validation: format=" << header.m_packetFormat
                      << ", gameYear=" << (int)header.m_gameYear
                      << ", packetId=" << (int)header.m_packetId
                      << ", size=" << size << " bytes" << std::endl;
            lastLoggedFormat = header.m_packetFormat;
            lastLoggedYear = header.m_gameYear;
            firstLog = false;
        }

        // Support both F1 24 and F1 25 with both format types
        bool validFormat = (header.m_packetFormat == 2024 || header.m_packetFormat == 2025);
        bool validYear = (header.m_gameYear == 24 || header.m_gameYear == 25);
        bool validPacketId = (header.m_packetId <= PACKET_ID_LAP_POSITIONS);

        // Log validation failures for debugging
        if (!validFormat || !validYear || !validPacketId) {
            static int errorCount = 0;
            if (errorCount++ < 5) {
                std::cout << "❌ Invalid F1 packet: format=" << header.m_packetFormat
                          << " (valid=" << validFormat << "), year=" << (int)header.m_gameYear
                          << " (valid=" << validYear << "), id=" << (int)header.m_packetId
                          << " (valid=" << validPacketId << ")" << std::endl;
            }
        }

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
    
    // Multi-car parsing functions for pit wall dashboard
    static bool parseAllCarTelemetry(const char* data, size_t size, PacketCarTelemetryData& packet) {
        if (size < sizeof(PacketCarTelemetryData)) {
            std::cerr << "Invalid car telemetry packet size: " << size << std::endl;
            return false;
        }
        
        memcpy(&packet, data, sizeof(PacketCarTelemetryData));
        
        if (packet.m_header.m_packetId != PACKET_ID_CAR_TELEMETRY) {
            std::cerr << "Not a car telemetry packet: " << (int)packet.m_header.m_packetId << std::endl;
            return false;
        }
        
        return true;
    }
    
    static bool parseAllLapData(const char* data, size_t size, PacketLapData& packet) {
        if (size < sizeof(PacketLapData)) {
            std::cerr << "Invalid lap data packet size: " << size << std::endl;
            return false;
        }
        
        memcpy(&packet, data, sizeof(PacketLapData));
        
        if (packet.m_header.m_packetId != PACKET_ID_LAP_DATA) {
            std::cerr << "Not a lap data packet: " << (int)packet.m_header.m_packetId << std::endl;
            return false;
        }
        
        return true;
    }
    
    static bool parseAllCarStatus(const char* data, size_t size, PacketCarStatusData& packet) {
        if (size < sizeof(PacketCarStatusData)) {
            std::cerr << "Invalid car status packet size: " << size << std::endl;
            return false;
        }
        
        memcpy(&packet, data, sizeof(PacketCarStatusData));
        
        if (packet.m_header.m_packetId != PACKET_ID_CAR_STATUS) {
            std::cerr << "Not a car status packet: " << (int)packet.m_header.m_packetId << std::endl;
            return false;
        }
        
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

            // Ensure legacy names are null terminated
            for (int i = 0; i < 22; i++) {
                packet.m_participants[i].m_name[sizeof(packet.m_participants[i].m_name) - 1] = '\0';
            }
        }

        return true;
    }
    
    static bool parseAllCarDamage(const char* data, size_t size, PacketCarDamageData& packet) {
        if (size < sizeof(PacketCarDamageData)) {
            std::cerr << "Invalid car damage packet size: " << size << std::endl;
            return false;
        }
        
        memcpy(&packet, data, sizeof(PacketCarDamageData));
        
        if (packet.m_header.m_packetId != PACKET_ID_CAR_DAMAGE) {
            std::cerr << "Not a car damage packet: " << (int)packet.m_header.m_packetId << std::endl;
            return false;
        }
        
        return true;
    }
    
    static bool parseSessionHistory(const char* data, size_t size, PacketSessionHistoryData& packet) {
        if (size < sizeof(PacketSessionHistoryData)) {
            std::cerr << "Invalid session history packet size: " << size << std::endl;
            return false;
        }
        
        memcpy(&packet, data, sizeof(PacketSessionHistoryData));
        
        if (packet.m_header.m_packetId != PACKET_ID_SESSION_HISTORY) {
            std::cerr << "Not a session history packet: " << (int)packet.m_header.m_packetId << std::endl;
            return false;
        }
        
        return true;
    }
    
    // Helper function to extract sector 3 time from lap history data
    static uint32_t getSector3TimeMS(const LapHistoryData& lapHistory) {
        // Convert sector 3 time from minutes:milliseconds format to total milliseconds
        return (uint32_t)lapHistory.m_sector3TimeMinutesPart * 60000 + lapHistory.m_sector3TimeMSPart;
    }
    
    // Helper function to check if sector 3 is valid
    static bool isSector3Valid(const LapHistoryData& lapHistory) {
        return (lapHistory.m_lapValidBitFlags & 0x08) != 0; // Bit 3 set = sector 3 valid
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
