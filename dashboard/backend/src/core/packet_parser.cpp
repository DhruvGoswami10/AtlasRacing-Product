#include <iostream>
#include <cstring>
#include "../f1_24/f1_24_types.h"

class PacketParser {
public:
    static bool parsePacketHeader(const char* data, PacketHeader& header) {
        if (!data) return false;
        
        memcpy(&header, data, sizeof(PacketHeader));
        
        // Debug: Always log first packet for troubleshooting
        static bool firstPacket = true;
        if (firstPacket) {
            std::cout << "🔍 First UDP Packet Received:" << std::endl;
            std::cout << "   Format: " << header.m_packetFormat << std::endl;
            std::cout << "   Game Year: " << (int)header.m_gameYear << std::endl;
            std::cout << "   Packet ID: " << (int)header.m_packetId << std::endl;
            std::cout << "   Session UID: " << header.m_sessionUID << std::endl;
            firstPacket = false;
        }

        // Validate F1 24/25 packet format (F1 25 can use either 2024 or 2025 format)
        if (header.m_packetFormat != 2024 && header.m_packetFormat != 2025) {
            static int errorCount = 0;
            if (errorCount < 5) {  // Only log first 5 errors
                std::cerr << "Invalid packet format: " << header.m_packetFormat
                          << " (gameYear: " << (int)header.m_gameYear << ")" << std::endl;
                errorCount++;
            }
            return false;
        }

        // Log which game is connected (only once per format/year combo)
        static int lastLoggedFormat = 0;
        static int lastLoggedYear = 0;
        if (header.m_packetFormat != lastLoggedFormat || header.m_gameYear != lastLoggedYear) {
            if (header.m_packetFormat == 2024 && header.m_gameYear == 24) {
                std::cout << "🏎️ F1 24 connected!" << std::endl;
            } else if (header.m_packetFormat == 2025 && header.m_gameYear == 25) {
                std::cout << "🏎️ F1 25 connected! (Format 2025)" << std::endl;
            } else if (header.m_packetFormat == 2024 && header.m_gameYear == 25) {
                std::cout << "🏎️ F1 25 connected! (Format 2024 compatibility)" << std::endl;
            } else {
                std::cout << "🏎️ Unknown F1 game connected: format=" << header.m_packetFormat
                          << ", year=" << (int)header.m_gameYear << std::endl;
            }
            lastLoggedFormat = header.m_packetFormat;
            lastLoggedYear = header.m_gameYear;
        }
        
        return true;
    }
    
    static bool parseCarTelemetryPacket(const char* data, size_t size, CarTelemetryData& telemetry) {
        if (size < sizeof(PacketCarTelemetryData)) {
            std::cerr << "Packet too small for car telemetry data" << std::endl;
            return false;
        }
        
        PacketCarTelemetryData packet;
        memcpy(&packet, data, sizeof(PacketCarTelemetryData));
        
        // Extract player car data (index 0 for single player)
        telemetry = packet.m_carTelemetryData[packet.m_header.m_playerCarIndex];
        
        return true;
    }
    
    static bool parseLapDataPacket(const char* data, size_t size, LapData& lapData) {
        if (size < sizeof(PacketLapData)) {
            std::cerr << "Packet too small for lap data" << std::endl;
            return false;
        }
        
        PacketLapData packet;
        memcpy(&packet, data, sizeof(PacketLapData));
        
        // Extract player car lap data
        lapData = packet.m_lapData[packet.m_header.m_playerCarIndex];
        
        return true;
    }
    
    static void logPacketInfo(const PacketHeader& header) {
        std::cout << "Packet ID: " << (int)header.m_packetId 
                  << ", Format: " << header.m_packetFormat
                  << ", Version: " << (int)header.m_packetVersion
                  << ", Session: " << header.m_sessionUID << std::endl;
    }
};