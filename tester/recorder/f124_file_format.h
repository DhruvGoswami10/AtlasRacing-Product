#pragma once
#include <cstdint>

// Atlas Racing F1 24 Recording File Format (.f124)
// This format captures complete F1 24 UDP sessions with precise timing

#pragma pack(push, 1)

// File header - 256 bytes
struct F124FileHeader {
    char magic[4];              // "F124" magic number
    uint32_t version;           // File format version (1)
    uint64_t created_timestamp; // Unix timestamp in milliseconds
    uint64_t total_packets;     // Total number of packets (filled at end)
    uint64_t duration_ms;       // Total session duration in milliseconds
    char session_name[64];      // Human-readable session name
    char track_name[32];        // Track name (if known)
    char game_version[16];      // F1 24 game version
    uint8_t reserved[120];      // Reserved for future use
};

// Packet record header - 8 bytes per packet
struct F124PacketRecord {
    uint64_t timestamp_ms;      // Milliseconds since recording start
    uint16_t packet_size;       // Size of following packet data
    uint8_t packet_id;          // F1 24 packet ID (0-14)
    uint8_t reserved;           // Reserved
    // Followed by [packet_size] bytes of raw F1 24 UDP data
};

#pragma pack(pop)

// File structure:
// 1. F124FileHeader (256 bytes)
// 2. Sequence of:
//    - F124PacketRecord (8 bytes)
//    - Raw packet data (variable size)

// Validation constants
static const char* F124_MAGIC = "F124";
static const uint32_t F124_VERSION = 1;
static const size_t F124_HEADER_SIZE = sizeof(F124FileHeader);
static const size_t F124_RECORD_SIZE = sizeof(F124PacketRecord);

// Maximum sizes
static const size_t MAX_PACKET_SIZE = 2048;
static const size_t MAX_SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours
static const size_t MAX_PACKETS_PER_SESSION = 1000000; // 1M packets max