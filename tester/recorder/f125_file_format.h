#pragma once
#include <cstdint>

// Atlas Racing F1 25 Recording File Format (.f125)
// Captures F1 25 UDP sessions with precise timing metadata

#pragma pack(push, 1)

struct F125FileHeader {
    char magic[4];              // "F125" magic number
    uint32_t version;           // File format version (1)
    uint64_t created_timestamp; // Unix timestamp in milliseconds
    uint64_t total_packets;     // Total packets recorded (set on close)
    uint64_t duration_ms;       // Total session duration (set on close)
    char session_name[64];      // Optional session description
    char track_name[32];        // Optional track name
    char game_version[16];      // Game version string
    uint8_t reserved[120];      // Reserved for future use
};

struct F125PacketRecord {
    uint64_t timestamp_ms;      // Milliseconds since recording start
    uint16_t packet_size;       // Size of the UDP payload
    uint8_t packet_id;          // Packet type identifier
    uint8_t reserved;           // Reserved for alignment
    // Followed by packet_size bytes of raw F1 25 UDP data
};

#pragma pack(pop)

static const char* F125_MAGIC = "F125";
static const uint32_t F125_VERSION = 1;
static const size_t F125_HEADER_SIZE = sizeof(F125FileHeader);
static const size_t F125_RECORD_SIZE = sizeof(F125PacketRecord);
static const size_t F125_MAX_PACKET_SIZE = 2048;
static const size_t F125_MAX_PACKETS_PER_SESSION = 1000000;
