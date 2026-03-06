/*
 * Atlas Core - Lightweight Telemetry Forwarder
 *
 * Reads shared memory from racing/sim games (AC, ACC, ATS) and forwards
 * telemetry as JSON over UDP. Runs in the system tray with a console
 * status window.
 *
 * Usage: atlas-core.exe [--host IP] [--port PORT] [--hz RATE]
 * Default: localhost:20777 @ 60Hz
 *
 * Build: build.bat (requires MinGW/MSYS2 g++)
 */

#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>
#include <shellapi.h>
#include <tlhelp32.h>

#include <string>
#include <sstream>
#include <iomanip>
#include <thread>
#include <atomic>
#include <mutex>
#include <vector>
#include <chrono>
#include <cstdint>
#include <cstddef>
#include <cmath>
#include <cstdio>
#include <cstring>

// Game shared memory struct definitions (from the main backend)
#include "ac_types.h"
#include "acc_types.h"
#include "ats_types.h"
#include "resource.h"

// ================================================================
//  Constants
// ================================================================

static const char* SM_PHYSICS  = "Local\\acpmf_physics";
static const char* SM_GRAPHICS = "Local\\acpmf_graphics";
static const char* SM_STATIC   = "Local\\acpmf_static";
static const char* SM_ATS      = "Local\\SCSTelemetry";

#define WM_TRAYICON    (WM_USER + 1)
#define ID_TRAY_SHOW   1001
#define ID_TRAY_EXIT   1002

// ================================================================
//  Global State
// ================================================================

enum class Game { None, AC, ACC, ATS };

static std::atomic<bool> g_running{true};
static char g_targetHost[256] = "127.0.0.1";
static int  g_targetPort = 20777;
static int  g_hz = 60;

// Tray
static NOTIFYICONDATAA g_nid = {};
static HWND g_trayHwnd = nullptr;
static HICON g_appIcon = nullptr;
static bool g_appIconOwned = false;

// Network
static SOCKET g_sock = INVALID_SOCKET;
static sockaddr_in g_dest = {};

// SSE server
static int g_ssePort = 8080;
static std::mutex g_sseMtx;
static std::vector<SOCKET> g_sseClients;

// Discovery beacon
static int g_beaconPort = 20780;
static const char* g_gameName = "None";

// Shared memory handles
static HANDLE g_hPhysics  = nullptr;
static HANDLE g_hGraphics = nullptr;
static HANDLE g_hStatic   = nullptr;
static void*  g_pPhysics  = nullptr;
static void*  g_pGraphics = nullptr;
static void*  g_pStatic   = nullptr;

// Minimal view of RenCloud's Local\SCSTelemetry map used by ATS/ETS2 plugin.
// Offsets are fixed by the plugin's shared-memory layout (rev 10+).
#pragma pack(push, 1)
struct ATSSharedMemoryView {
    uint8_t sdkActive;
    uint8_t _pad0[3];
    uint8_t paused;
    uint8_t _pad1[3];
    uint64_t telemetryTime;
    uint64_t simulatedTime;
    uint64_t renderTime;
    int64_t multiplayerTimeOffset;

    uint8_t _padToZone3[500 - 40];
    int32_t restStop;
    int32_t gear;
    int32_t gearDashboard;
    int32_t hshifterResulting[32];
    int32_t jobDeliveredEarnedXp;
    uint8_t _padToZone4[700 - 644];

    float scale;
    float fuelCapacity;
    float fuelWarningFactor;
    float adblueCapacity;
    float adblueWarningFactor;
    float airPressureWarning;
    float airPressureEmergency;
    float oilPressureWarning;
    float waterTemperatureWarning;
    float batteryVoltageWarning;
    float engineRpmMax;

    uint8_t _padToTruckFloats[948 - 744];
    float speed;                // m/s
    float engineRpm;
    float userSteer;            // -1..1
    float userThrottle;         // 0..1
    float userBrake;            // 0..1
    float userClutch;           // 0..1
    float gameSteer;
    float gameThrottle;
    float gameBrake;
    float gameClutch;
    float cruiseControlSpeed;   // m/s
    float airPressure;
    float brakeTemperature;
    float fuel;
    float fuelAvgConsumption;
    float fuelRange;
    float adblue;
    float oilPressure;
    float oilTemperature;
    float waterTemperature;
    float batteryVoltage;
    float lightsDashboard;
    float wearEngine;
    float wearTransmission;
    float wearCabin;
    float wearChassis;
    float wearWheels;
    float truckOdometer;
    float routeDistance;
    float routeTime;
    float speedLimit;           // m/s

    uint8_t _padToWorld[2200 - 1072];
    double worldX;
    double worldY;
    double worldZ;
    double rotationX;
    double rotationY;
    double rotationZ;
};
#pragma pack(pop)

static_assert(offsetof(ATSSharedMemoryView, speed) == 948, "ATS speed offset mismatch");
static_assert(offsetof(ATSSharedMemoryView, worldX) == 2200, "ATS worldX offset mismatch");
static_assert(sizeof(ATSSharedMemoryView) >= 2248, "ATS view size too small");

// ================================================================
//  Utilities
// ================================================================

static std::string timestamp() {
    SYSTEMTIME st;
    GetLocalTime(&st);
    char buf[16];
    snprintf(buf, sizeof(buf), "%02d:%02d:%02d", st.wHour, st.wMinute, st.wSecond);
    return buf;
}

static bool isProcessRunning(const char* name) {
    HANDLE snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
    if (snap == INVALID_HANDLE_VALUE) return false;
    PROCESSENTRY32 pe = {};
    pe.dwSize = sizeof(pe);
    bool found = false;
    if (Process32First(snap, &pe)) {
        do {
            if (_stricmp(pe.szExeFile, name) == 0) { found = true; break; }
        } while (Process32Next(snap, &pe));
    }
    CloseHandle(snap);
    return found;
}

static void updateTrayTip(const char* text) {
    if (!g_trayHwnd) return;
    strncpy(g_nid.szTip, text, sizeof(g_nid.szTip) - 1);
    Shell_NotifyIconA(NIM_MODIFY, &g_nid);
}

static void printColoredAtlasCoreBanner() {
    HANDLE hOut = GetStdHandle(STD_OUTPUT_HANDLE);
    CONSOLE_SCREEN_BUFFER_INFO info{};
    WORD originalAttrs = 0;
    bool hasAttrs = false;
    if (hOut != INVALID_HANDLE_VALUE && GetConsoleScreenBufferInfo(hOut, &info)) {
        originalAttrs = info.wAttributes;
        hasAttrs = true;
    }

    // Use a darker red tone in terminal-safe color attributes.
    if (hOut != INVALID_HANDLE_VALUE) {
        SetConsoleTextAttribute(hOut, FOREGROUND_RED);
    }

    printf(" █████╗ ████████╗██╗      █████╗ ███████╗       ██████╗ ██████╗ ██████╗ ███████╗\n");
    printf("██╔══██╗╚══██╔══╝██║     ██╔══██╗██╔════╝      ██╔════╝██╔═══██╗██╔══██╗██╔════╝\n");
    printf("███████║   ██║   ██║     ███████║███████╗█████╗██║     ██║   ██║██████╔╝█████╗  \n");
    printf("██╔══██║   ██║   ██║     ██╔══██║╚════██║╚════╝██║     ██║   ██║██╔══██╗██╔══╝  \n");
    printf("██║  ██║   ██║   ███████╗██║  ██║███████║      ╚██████╗╚██████╔╝██║  ██║███████╗\n");
    printf("╚═╝  ╚═╝   ╚═╝   ╚══════╝╚═╝  ╚═╝╚══════╝       ╚═════╝ ╚═════╝ ╚═╝  ╚═╝╚══════╝\n");
    printf("\n");

    if (hasAttrs && hOut != INVALID_HANDLE_VALUE) {
        SetConsoleTextAttribute(hOut, originalAttrs);
    }
}

static uint64_t nowEpochMs() {
    FILETIME ft;
    GetSystemTimeAsFileTime(&ft);
    ULARGE_INTEGER uli;
    uli.LowPart = ft.dwLowDateTime;
    uli.HighPart = ft.dwHighDateTime;
    // FILETIME epoch (1601-01-01) -> Unix epoch (1970-01-01)
    return (uli.QuadPart - 116444736000000000ULL) / 10000ULL;
}

static std::string getLocalIPv4() {
    char hostname[256] = {};
    if (gethostname(hostname, sizeof(hostname)) != 0) {
        return "127.0.0.1";
    }

    struct addrinfo hints = {}, *result = nullptr;
    hints.ai_family = AF_INET;
    hints.ai_socktype = SOCK_STREAM;

    std::string selected = "127.0.0.1";
    if (getaddrinfo(hostname, nullptr, &hints, &result) == 0 && result) {
        for (auto* it = result; it; it = it->ai_next) {
            char ipStr[64] = "127.0.0.1";
            auto* addr = (sockaddr_in*)it->ai_addr;
            inet_ntop(AF_INET, &addr->sin_addr, ipStr, sizeof(ipStr));
            if (strcmp(ipStr, "127.0.0.1") != 0) {
                selected = ipStr;
                break;
            }
            selected = ipStr;
        }
        freeaddrinfo(result);
    }
    return selected;
}

static std::string wideToUtf8(const wchar_t* in) {
    if (!in || !*in) return "";
    char out[256] = {};
    int n = WideCharToMultiByte(CP_UTF8, 0, in, -1, out, (int)sizeof(out), nullptr, nullptr);
    if (n <= 0) return "";
    return out;
}

static std::string jsonEscape(const std::string& in) {
    std::string out;
    out.reserve(in.size() + 16);
    for (char ch : in) {
        switch (ch) {
            case '\"': out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\b': out += "\\b"; break;
            case '\f': out += "\\f"; break;
            case '\n': out += "\\n"; break;
            case '\r': out += "\\r"; break;
            case '\t': out += "\\t"; break;
            default:
                if ((unsigned char)ch < 0x20) {
                    char tmp[8];
                    snprintf(tmp, sizeof(tmp), "\\u%04x", (unsigned char)ch);
                    out += tmp;
                } else {
                    out += ch;
                }
                break;
        }
    }
    return out;
}

static float clamp01ToPercentWear(float rawWear) {
    if (rawWear > 1.5f) {
        float wear = 100.0f - rawWear;
        if (wear < 0.0f) wear = 0.0f;
        if (wear > 100.0f) wear = 100.0f;
        return wear;
    }
    float wear = (1.0f - rawWear) * 100.0f;
    if (wear < 0.0f) wear = 0.0f;
    if (wear > 100.0f) wear = 100.0f;
    return wear;
}

static float sanitizeFloat(float value, float fallback = 0.0f) {
    return std::isfinite(value) ? value : fallback;
}

static double sanitizeDouble(double value, double fallback = 0.0) {
    return std::isfinite(value) ? value : fallback;
}

static float clampFloat(float value, float minValue, float maxValue) {
    if (value < minValue) return minValue;
    if (value > maxValue) return maxValue;
    return value;
}

static float clamp01(float value) {
    return clampFloat(sanitizeFloat(value), 0.0f, 1.0f);
}

static float clampPercent(float value) {
    return clampFloat(sanitizeFloat(value), 0.0f, 100.0f);
}

static std::string sanitizeAsciiLabel(const char* raw, size_t maxLen) {
    if (!raw || maxLen == 0) return "";
    std::string out;
    out.reserve(maxLen);
    for (size_t i = 0; i < maxLen && raw[i] != '\0'; ++i) {
        unsigned char ch = static_cast<unsigned char>(raw[i]);
        if (ch < 32 || ch > 126) break;
        out.push_back(static_cast<char>(ch));
    }
    while (!out.empty() && out.back() == ' ') out.pop_back();
    return out;
}

// ================================================================
//  Shared Memory
// ================================================================

static void closeSharedMemory() {
    if (g_pPhysics)  { UnmapViewOfFile(g_pPhysics);  g_pPhysics  = nullptr; }
    if (g_pGraphics) { UnmapViewOfFile(g_pGraphics); g_pGraphics = nullptr; }
    if (g_pStatic)   { UnmapViewOfFile(g_pStatic);   g_pStatic   = nullptr; }
    if (g_hPhysics)  { CloseHandle(g_hPhysics);  g_hPhysics  = nullptr; }
    if (g_hGraphics) { CloseHandle(g_hGraphics); g_hGraphics = nullptr; }
    if (g_hStatic)   { CloseHandle(g_hStatic);   g_hStatic   = nullptr; }
}

static bool openACMemory() {
    closeSharedMemory();
    g_hPhysics  = OpenFileMappingA(FILE_MAP_READ, FALSE, SM_PHYSICS);
    g_hGraphics = OpenFileMappingA(FILE_MAP_READ, FALSE, SM_GRAPHICS);
    g_hStatic   = OpenFileMappingA(FILE_MAP_READ, FALSE, SM_STATIC);
    if (!g_hPhysics || !g_hGraphics) { closeSharedMemory(); return false; }
    g_pPhysics  = MapViewOfFile(g_hPhysics,  FILE_MAP_READ, 0, 0, sizeof(AC::SPageFilePhysics));
    g_pGraphics = MapViewOfFile(g_hGraphics, FILE_MAP_READ, 0, 0, sizeof(AC::SPageFileGraphic));
    if (g_hStatic) g_pStatic = MapViewOfFile(g_hStatic, FILE_MAP_READ, 0, 0, sizeof(AC::SPageFileStatic));
    return g_pPhysics && g_pGraphics;
}

static bool openACCMemory() {
    closeSharedMemory();
    g_hPhysics  = OpenFileMappingA(FILE_MAP_READ, FALSE, SM_PHYSICS);
    g_hGraphics = OpenFileMappingA(FILE_MAP_READ, FALSE, SM_GRAPHICS);
    g_hStatic   = OpenFileMappingA(FILE_MAP_READ, FALSE, SM_STATIC);
    if (!g_hPhysics || !g_hGraphics) { closeSharedMemory(); return false; }
    g_pPhysics  = MapViewOfFile(g_hPhysics,  FILE_MAP_READ, 0, 0, sizeof(ACC::SPageFilePhysics));
    g_pGraphics = MapViewOfFile(g_hGraphics, FILE_MAP_READ, 0, 0, sizeof(ACC::SPageFileGraphic));
    if (g_hStatic) g_pStatic = MapViewOfFile(g_hStatic, FILE_MAP_READ, 0, 0, sizeof(ACC::SPageFileStatic));
    return g_pPhysics && g_pGraphics;
}

static bool openATSMemory() {
    closeSharedMemory();
    g_hPhysics = OpenFileMappingA(FILE_MAP_READ, FALSE, SM_ATS);
    if (!g_hPhysics) return false;
    // Map the complete shared-memory object so larger/newer layouts are visible.
    g_pPhysics = MapViewOfFile(g_hPhysics, FILE_MAP_READ, 0, 0, 0);
    return g_pPhysics != nullptr;
}

// ================================================================
//  JSON Helpers
// ================================================================

static void jf(std::ostringstream& s, const char* k, float v) {
    s << '"' << k << "\":" << std::fixed << std::setprecision(1) << sanitizeFloat(v) << ',';
}
static void jfd(std::ostringstream& s, const char* k, double v, int precision = 3) {
    s << '"' << k << "\":" << std::fixed << std::setprecision(precision) << sanitizeDouble(v) << ',';
}
static void ju64(std::ostringstream& s, const char* k, uint64_t v) {
    s << '"' << k << "\":" << v << ',';
}
static void ji(std::ostringstream& s, const char* k, int v) {
    s << '"' << k << "\":" << v << ',';
}
static void js(std::ostringstream& s, const char* k, const char* v) {
    s << '"' << k << "\":\"" << v << "\",";
}
static void jss(std::ostringstream& s, const char* k, const std::string& v) {
    s << '"' << k << "\":\"" << jsonEscape(v) << "\",";
}
static void ja4(std::ostringstream& s, const char* k, float a, float b, float c, float d) {
    s << '"' << k << "\":[" << std::fixed << std::setprecision(1)
      << sanitizeFloat(a) << ',' << sanitizeFloat(b) << ','
      << sanitizeFloat(c) << ',' << sanitizeFloat(d) << "],";
}
static void jtiretemps(std::ostringstream& s,
                       float s0, float s1, float s2, float s3,
                       float i0, float i1, float i2, float i3) {
    s << "\"tire_temps\":{"
      << "\"surface\":[" << std::fixed << std::setprecision(1)
      << sanitizeFloat(s0) << ',' << sanitizeFloat(s1) << ','
      << sanitizeFloat(s2) << ',' << sanitizeFloat(s3) << "],"
      << "\"inner\":[" << sanitizeFloat(i0) << ',' << sanitizeFloat(i1)
      << ',' << sanitizeFloat(i2) << ',' << sanitizeFloat(i3) << "]"
      << "},";
}

static std::string finishJSON(std::ostringstream& o) {
    std::string r = o.str();
    if (!r.empty() && r.back() == ',') r.back() = '}';
    else r += '}';
    return r;
}

// ================================================================
//  Game-Specific JSON Builders
// ================================================================

static std::string buildACJSON() {
    auto* p = (AC::SPageFilePhysics*)g_pPhysics;
    auto* g = (AC::SPageFileGraphic*)g_pGraphics;
    auto* s = g_pStatic ? (AC::SPageFileStatic*)g_pStatic : nullptr;

    const int lap = g->completedLaps + 1;
    const float wear0 = clamp01ToPercentWear(p->tyreWear[0]);
    const float wear1 = clamp01ToPercentWear(p->tyreWear[1]);
    const float wear2 = clamp01ToPercentWear(p->tyreWear[2]);
    const float wear3 = clamp01ToPercentWear(p->tyreWear[3]);
    const int pitWindowIdeal = s ? s->PitWindowStart : 0;
    const int pitWindowLatest = s ? s->PitWindowEnd : 0;
    int pitWindowOpen = 0;
    if (pitWindowIdeal > 0 && pitWindowLatest >= pitWindowIdeal) {
        pitWindowOpen = (lap >= pitWindowIdeal && lap <= pitWindowLatest) ? 1 : 0;
    }

    std::ostringstream o;
    o << '{';
    ju64(o, "timestamp", nowEpochMs());
    jf(o, "speed_kph", p->speedKmh);
    ji(o, "rpm", p->rpms);
    ji(o, "max_rpm", s ? s->maxRpm : 9000);
    ji(o, "gear", p->gear - 1); // AC: 0=R, 1=N, 2=1st
    jf(o, "throttle_percent", p->gas * 100.0f);
    jf(o, "brake_percent", p->brake * 100.0f);
    jf(o, "steering_angle", p->steerAngle);
    jf(o, "clutch", p->clutch * 100.0f);
    jfd(o, "current_lap_time", (double)g->iCurrentTime / 1000.0, 3);
    jfd(o, "last_lap_time", (double)g->iLastTime / 1000.0, 3);
    jfd(o, "best_lap_time", (double)g->iBestTime / 1000.0, 3);
    ji(o, "position", g->position);
    ji(o, "current_lap_num", lap);
    ji(o, "current_sector", g->currentSectorIndex);
    ji(o, "pit_status", g->isInPit ? 1 : 0);
    jtiretemps(o,
               p->tyreTempO[0], p->tyreTempO[1], p->tyreTempO[2], p->tyreTempO[3],
               p->tyreTempI[0], p->tyreTempI[1], p->tyreTempI[2], p->tyreTempI[3]);
    ja4(o, "tire_pressure", p->wheelsPressure[0], p->wheelsPressure[1],
        p->wheelsPressure[2], p->wheelsPressure[3]);
    ja4(o, "tire_wear", wear0, wear1, wear2, wear3);
    jf(o, "fuel_in_tank", p->fuel);
    jfd(o, "fuel_remaining_laps", 0.0, 2);
    ji(o, "fuel_mix", 1);
    ji(o, "drs_allowed", p->drsAvailable ? 1 : 0);
    ji(o, "drs_open", p->drsEnabled ? 1 : 0);
    ji(o, "ers_deploy_mode", 0);
    jf(o, "ers_store_energy", p->kersCharge);
    ja4(o, "brake_temperature", p->brakeTemp[0], p->brakeTemp[1], p->brakeTemp[2], p->brakeTemp[3]);
    js(o, "game_name", "Assetto Corsa");
    jss(o, "car_name", s ? wideToUtf8(s->carModel) : std::string());
    jss(o, "track_name", s ? wideToUtf8(s->track) : std::string());
    jf(o, "world_position_x", g->carCoordinates[0]);
    jf(o, "world_position_y", g->carCoordinates[2]);
    jf(o, "lap_distance", s ? g->normalizedCarPosition * s->trackSPlineLength : 0.0f);
    ji(o, "session_type", g->session);
    ji(o, "session_time_left", g->sessionTimeLeft > 0.0f ? (int)g->sessionTimeLeft : 0);
    ji(o, "total_laps", g->numberOfLaps > 0 ? g->numberOfLaps : 0);
    ji(o, "weather", 0);
    ji(o, "track_temperature", (int)p->roadTemp);
    ji(o, "air_temperature", (int)p->airTemp);
    ji(o, "pit_window_ideal_lap", pitWindowIdeal);
    ji(o, "pit_window_latest_lap", pitWindowLatest);
    ji(o, "pit_window_open", pitWindowOpen);
    jf(o, "brake_bias", p->brakeBias);
    ji(o, "traction_control_setting", (int)p->tc);
    ji(o, "abs_setting", (int)p->abs);
    ji(o, "engine_brake_setting", p->engineBrake);
    ji(o, "fuel_map_setting", p->ersPowerLevel);
    ji(o, "fuel_map_max", s ? s->ersPowerControllerCount : 0);
    ji(o, "penalties_enabled", s ? s->penaltiesEnabled : 0);
    jf(o, "penalty_time", g->penaltyTime);
    ji(o, "numberOfTyresOut", p->numberOfTyresOut);
    ji(o, "flag_type", g->flag);
    ji(o, "is_in_pit", g->isInPit);
    ji(o, "is_in_pitlane", g->isInPitLane);
    ji(o, "mandatory_pit_done", g->mandatoryPitDone);
    jf(o, "normalized_car_position", g->normalizedCarPosition);

    // AC-specific extended aliases used by some dashboard panels.
    ja4(o, "tyre_temp_inner", p->tyreTempI[0], p->tyreTempI[1], p->tyreTempI[2], p->tyreTempI[3]);
    ja4(o, "tyre_temp_middle", p->tyreTempM[0], p->tyreTempM[1], p->tyreTempM[2], p->tyreTempM[3]);
    ja4(o, "tyre_temp_outer", p->tyreTempO[0], p->tyreTempO[1], p->tyreTempO[2], p->tyreTempO[3]);

    // Legacy aliases kept for backwards compatibility.
    js(o, "game", "AC");
    jf(o, "speed", p->speedKmh);
    jf(o, "throttle", p->gas * 100.0f);
    jf(o, "brake", p->brake * 100.0f);
    jf(o, "steering", p->steerAngle);
    jf(o, "fuel", p->fuel);
    jf(o, "fuel_capacity", s ? s->maxFuel : 0.0f);
    ji(o, "lap", lap);
    ji(o, "sector", g->currentSectorIndex);
    ji(o, "pit", g->isInPit);
    ja4(o, "tyre_temp", p->tyreCoreTemperature[0], p->tyreCoreTemperature[1],
        p->tyreCoreTemperature[2], p->tyreCoreTemperature[3]);
    ja4(o, "tyre_wear", wear0, wear1, wear2, wear3);
    ja4(o, "tyre_pressure", p->wheelsPressure[0], p->wheelsPressure[1],
        p->wheelsPressure[2], p->wheelsPressure[3]);
    ja4(o, "brake_temp", p->brakeTemp[0], p->brakeTemp[1], p->brakeTemp[2], p->brakeTemp[3]);
    jf(o, "world_x", g->carCoordinates[0]);
    jf(o, "world_y", g->carCoordinates[2]);

    return finishJSON(o);
}

static std::string buildACCJSON() {
    auto* p = (ACC::SPageFilePhysics*)g_pPhysics;
    auto* g = (ACC::SPageFileGraphic*)g_pGraphics;
    auto* s = g_pStatic ? (ACC::SPageFileStatic*)g_pStatic : nullptr;

    const int lap = g->completedLaps + 1;
    int player = g->playerCarID;
    if (player < 0 || player >= 60) player = 0;
    const float wear0 = clamp01ToPercentWear(p->tyreWear[0]);
    const float wear1 = clamp01ToPercentWear(p->tyreWear[1]);
    const float wear2 = clamp01ToPercentWear(p->tyreWear[2]);
    const float wear3 = clamp01ToPercentWear(p->tyreWear[3]);
    const int pitWindowIdeal = s ? s->PitWindowStart : 0;
    const int pitWindowLatest = s ? s->PitWindowEnd : 0;
    int pitWindowOpen = 0;
    if (pitWindowIdeal > 0 && pitWindowLatest >= pitWindowIdeal) {
        pitWindowOpen = (lap >= pitWindowIdeal && lap <= pitWindowLatest) ? 1 : 0;
    }

    std::ostringstream o;
    o << '{';
    ju64(o, "timestamp", nowEpochMs());
    jf(o, "speed_kph", p->speedKmh);
    ji(o, "rpm", p->rpms);
    ji(o, "max_rpm", s ? s->maxRpm : p->currentMaxRpm);
    ji(o, "gear", p->gear - 1);
    jf(o, "throttle_percent", p->gas * 100.0f);
    jf(o, "brake_percent", p->brake * 100.0f);
    jf(o, "steering_angle", p->steerAngle);
    jf(o, "clutch", p->clutch * 100.0f);
    jfd(o, "current_lap_time", (double)g->iCurrentTime / 1000.0, 3);
    jfd(o, "last_lap_time", (double)g->iLastTime / 1000.0, 3);
    jfd(o, "best_lap_time", (double)g->iBestTime / 1000.0, 3);
    jfd(o, "delta_time", (double)g->iDeltaLapTime / 1000.0, 3);
    jfd(o, "estimated_lap_time", (double)g->iEstimatedLapTime / 1000.0, 3);
    ji(o, "position", g->position);
    ji(o, "current_lap_num", lap);
    ji(o, "current_sector", g->currentSectorIndex);
    ji(o, "pit_status", g->isInPit ? 1 : 0);
    jtiretemps(o,
               p->tyreTempO[0], p->tyreTempO[1], p->tyreTempO[2], p->tyreTempO[3],
               p->tyreTempI[0], p->tyreTempI[1], p->tyreTempI[2], p->tyreTempI[3]);
    ja4(o, "tire_pressure", p->wheelsPressure[0], p->wheelsPressure[1],
        p->wheelsPressure[2], p->wheelsPressure[3]);
    ja4(o, "tire_wear", wear0, wear1, wear2, wear3);
    jf(o, "fuel_in_tank", p->fuel);
    jfd(o, "fuel_remaining_laps", g->fuelEstimatedLaps, 2);
    ji(o, "fuel_mix", g->EngineMap);
    ji(o, "drs_allowed", p->drsAvailable ? 1 : 0);
    ji(o, "drs_open", p->drsEnabled ? 1 : 0);
    ji(o, "ers_deploy_mode", 0);
    jf(o, "ers_store_energy", p->kersCharge);
    ja4(o, "brake_temperature", p->brakeTemp[0], p->brakeTemp[1], p->brakeTemp[2], p->brakeTemp[3]);
    js(o, "game_name", "ACC");
    jss(o, "car_name", s ? wideToUtf8(s->carModel) : std::string());
    jss(o, "track_name", s ? wideToUtf8(s->track) : std::string());
    jf(o, "world_position_x", g->carCoordinates[player][0]);
    jf(o, "world_position_y", g->carCoordinates[player][2]);
    jf(o, "lap_distance", s ? g->normalizedCarPosition * s->trackSPlineLength : 0.0f);
    ji(o, "session_type", g->session);
    ji(o, "session_time_left", g->sessionTimeLeft > 0.0f ? (int)g->sessionTimeLeft : 0);
    ji(o, "total_laps", g->numberOfLaps > 0 ? g->numberOfLaps : 0);
    ji(o, "weather", g->rainIntensity);
    ji(o, "track_temperature", (int)p->roadTemp);
    ji(o, "air_temperature", (int)p->airTemp);
    ji(o, "pit_window_ideal_lap", pitWindowIdeal);
    ji(o, "pit_window_latest_lap", pitWindowLatest);
    ji(o, "pit_window_open", pitWindowOpen);
    ji(o, "traction_control_setting", g->TC);
    ji(o, "traction_control_setting_secondary", g->TCCut);
    ji(o, "abs_setting", g->ABS);
    ji(o, "engine_brake_setting", p->engineBrake);
    ji(o, "fuel_map_setting", g->EngineMap);
    ji(o, "fuel_map_max", s ? s->ersPowerControllerCount : 0);
    jf(o, "brake_bias", p->brakeBias);
    ji(o, "flag_type", g->flag);
    ji(o, "is_in_pit", g->isInPit);
    ji(o, "is_in_pitlane", g->isInPitLane);
    ji(o, "mandatory_pit_done", g->mandatoryPitDone);
    jf(o, "normalized_car_position", g->normalizedCarPosition);
    jfd(o, "fuel_per_lap", g->fuelXLap, 3);
    jfd(o, "gap_ahead_seconds", g->gapAhead / 1000.0, 3);
    jfd(o, "gap_behind_seconds", g->gapBehind / 1000.0, 3);

    // Legacy aliases kept for backwards compatibility.
    js(o, "game", "ACC");
    jf(o, "speed", p->speedKmh);
    jf(o, "throttle", p->gas * 100.0f);
    jf(o, "brake", p->brake * 100.0f);
    jf(o, "steering", p->steerAngle);
    jf(o, "fuel", p->fuel);
    jf(o, "fuel_capacity", s ? s->maxFuel : 0.0f);
    ji(o, "lap", lap);
    ji(o, "sector", g->currentSectorIndex);
    ji(o, "pit", g->isInPit);
    ji(o, "tc", g->TC);
    ji(o, "tc_cut", g->TCCut);
    ji(o, "abs", g->ABS);
    ji(o, "engine_map", g->EngineMap);
    ji(o, "rain", g->rainIntensity);
    ji(o, "grip", g->trackGripStatus);
    jfd(o, "fuel_est_laps", g->fuelEstimatedLaps, 2);
    ja4(o, "tyre_temp", p->tyreCoreTemperature[0], p->tyreCoreTemperature[1],
        p->tyreCoreTemperature[2], p->tyreCoreTemperature[3]);
    ja4(o, "tyre_wear", wear0, wear1, wear2, wear3);
    ja4(o, "tyre_pressure", p->wheelsPressure[0], p->wheelsPressure[1],
        p->wheelsPressure[2], p->wheelsPressure[3]);
    ja4(o, "brake_temp", p->brakeTemp[0], p->brakeTemp[1], p->brakeTemp[2], p->brakeTemp[3]);
    jf(o, "world_x", g->carCoordinates[player][0]);
    jf(o, "world_y", g->carCoordinates[player][2]);

    return finishJSON(o);
}

static std::string buildATSJSON() {
    auto* t = (ATSSharedMemoryView*)g_pPhysics;
    auto* legacy = (ATS::SCSTelemetry*)g_pPhysics;

    const float speedMps = sanitizeFloat(t->speed);
    const float speedKph = speedMps * 3.6f;
    const float rpm = sanitizeFloat(t->engineRpm);
    const float maxRpm = sanitizeFloat(t->engineRpmMax);
    const int gear = (t->gearDashboard != 0) ? t->gearDashboard : t->gear;
    const float throttle01 = clamp01(t->userThrottle);
    const float brake01 = clamp01(t->userBrake);
    const float clutch01 = clamp01(t->userClutch);
    const float steer01 = clampFloat(sanitizeFloat(t->userSteer), -1.0f, 1.0f);
    const float commonBrakeTemp = clampFloat(sanitizeFloat(t->brakeTemperature), 0.0f, 2000.0f);
    const float wearEngine = clampPercent(t->wearEngine * 100.0f);
    const float wearTrans = clampPercent(t->wearTransmission * 100.0f);
    const float wearCabin = clampPercent(t->wearCabin * 100.0f);
    const float wearChassis = clampPercent(t->wearChassis * 100.0f);
    const float wearWheels = clampPercent(t->wearWheels * 100.0f);
    const float fuel = clampFloat(sanitizeFloat(t->fuel), 0.0f, 1000000.0f);
    const float fuelCapacity = clampFloat(sanitizeFloat(t->fuelCapacity), 0.0f, 1000000.0f);
    const float fuelRangeKm = clampFloat(sanitizeFloat(t->fuelRange), 0.0f, 1000000.0f);
    const float cruiseSpeedKph = clampFloat(sanitizeFloat(t->cruiseControlSpeed) * 3.6f, 0.0f, 500.0f);
    const int cruiseOn = cruiseSpeedKph > 0.5f ? 1 : 0;
    const float oilTemp = clampFloat(sanitizeFloat(t->oilTemperature), 0.0f, 300.0f);
    const float waterTemp = clampFloat(sanitizeFloat(t->waterTemperature), 0.0f, 300.0f);
    const float batteryV = clampFloat(sanitizeFloat(t->batteryVoltage), 0.0f, 100.0f);
    const float airPressure = clampFloat(sanitizeFloat(t->airPressure), 0.0f, 300.0f);
    const float speedLimitKph = clampFloat(sanitizeFloat(t->speedLimit) * 3.6f, 0.0f, 300.0f);
    const float navDistKm = clampFloat(sanitizeFloat(t->routeDistance) / 1000.0f, 0.0f, 100000.0f);
    const float navTimeMin = clampFloat(sanitizeFloat(t->routeTime) / 60.0f, 0.0f, 100000.0f);
    const float worldX = (float)sanitizeDouble(t->worldX);
    const float worldY = (float)sanitizeDouble(t->worldZ);
    const float heading = (float)sanitizeDouble(t->rotationY);
    const std::string carName = sanitizeAsciiLabel(legacy->truckModel, sizeof(legacy->truckModel));

    std::ostringstream o;
    o << '{';
    ju64(o, "timestamp", nowEpochMs());
    jf(o, "speed_kph", speedKph);
    ji(o, "rpm", (int)rpm);
    ji(o, "max_rpm", (int)maxRpm);
    ji(o, "gear", gear);
    jf(o, "throttle_percent", throttle01 * 100.0f);
    jf(o, "brake_percent", brake01 * 100.0f);
    jf(o, "steering_angle", steer01 * 100.0f);
    jf(o, "clutch", clutch01 * 100.0f);
    jfd(o, "current_lap_time", 0.0, 3);
    jfd(o, "last_lap_time", 0.0, 3);
    jfd(o, "best_lap_time", 0.0, 3);
    ji(o, "position", 0);
    ji(o, "current_lap_num", 0);
    ji(o, "current_sector", 0);
    ji(o, "pit_status", 0);
    jtiretemps(o, commonBrakeTemp, commonBrakeTemp, commonBrakeTemp, commonBrakeTemp, 0.0f, 0.0f, 0.0f, 0.0f);
    ja4(o, "tire_pressure", 0.0f, 0.0f, 0.0f, 0.0f);
    ja4(o, "tire_wear", wearWheels, wearWheels, wearWheels, wearWheels);
    jf(o, "fuel_in_tank", fuel);
    jfd(o, "fuel_remaining_laps", 0.0, 2);
    ji(o, "fuel_mix", 1);
    ji(o, "drs_allowed", 0);
    ji(o, "drs_open", 0);
    ji(o, "ers_deploy_mode", 0);
    jf(o, "ers_store_energy", 0.0f);
    ja4(o, "brake_temperature", commonBrakeTemp, commonBrakeTemp, commonBrakeTemp, commonBrakeTemp);
    js(o, "game_name", "ATS");
    jss(o, "car_name", carName);
    jss(o, "track_name", "");
    jf(o, "world_position_x", worldX);
    jf(o, "world_position_y", worldY);
    jf(o, "lap_distance", 0.0f);
    ji(o, "session_type", 0);
    ji(o, "session_time_left", 0);
    ji(o, "total_laps", 0);
    ji(o, "weather", 0);
    ji(o, "track_temperature", (int)waterTemp);
    ji(o, "air_temperature", (int)oilTemp);
    jf(o, "brake_bias", 50.0f);

    // Legacy aliases kept for backwards compatibility.
    js(o, "game", "ATS");
    jf(o, "speed", speedKph);
    jf(o, "throttle", throttle01 * 100.0f);
    jf(o, "brake", brake01 * 100.0f);
    jf(o, "steering", steer01);
    jf(o, "fuel", fuel);
    jf(o, "fuel_capacity", fuelCapacity);
    jf(o, "fuel_range_km", fuelRangeKm);
    jf(o, "cruise_speed", cruiseSpeedKph);
    ji(o, "cruise_on", cruiseOn);
    jf(o, "oil_temp", oilTemp);
    jf(o, "water_temp", waterTemp);
    jf(o, "battery_v", batteryV);
    jf(o, "brake_temp_avg", commonBrakeTemp);
    jf(o, "air_pressure", airPressure);
    ji(o, "retarder", 0);
    jf(o, "speed_limit", speedLimitKph);
    jf(o, "nav_dist_km", navDistKm);
    jf(o, "nav_time_min", navTimeMin);
    jf(o, "cargo_kg", 0.0f);
    jf(o, "cargo_damage", 0.0f);
    jf(o, "wear_engine", wearEngine);
    jf(o, "wear_trans", wearTrans);
    jf(o, "wear_cabin", wearCabin);
    jf(o, "wear_chassis", wearChassis);
    jf(o, "wear_wheels", wearWheels);
    jf(o, "world_x", worldX);
    jf(o, "world_y", worldY);
    jf(o, "heading", heading);

    return finishJSON(o);
}

// ================================================================
//  SSE Server (so the frontend can connect directly to Atlas Core)
// ================================================================

static void sseHandleClient(SOCKET client) {
    // Read HTTP request (we only care that it's a GET)
    char buf[2048];
    int n = recv(client, buf, sizeof(buf) - 1, 0);
    if (n <= 0) { closesocket(client); return; }
    buf[n] = '\0';

    // CORS preflight
    if (strstr(buf, "OPTIONS")) {
        const char* resp =
            "HTTP/1.1 200 OK\r\n"
            "Access-Control-Allow-Origin: *\r\n"
            "Access-Control-Allow-Methods: GET, OPTIONS\r\n"
            "Access-Control-Allow-Headers: *\r\n"
            "Content-Length: 0\r\n\r\n";
        send(client, resp, (int)strlen(resp), 0);
        closesocket(client);
        return;
    }

    // /api/discover endpoint (for direct Atlas Core discovery compatibility)
    if (strstr(buf, "GET /api/discover")) {
        std::string ip = getLocalIPv4();
        std::ostringstream body;
        body << "{\"instances\":[{\"ip\":\"" << jsonEscape(ip)
             << "\",\"ssePort\":" << g_ssePort
             << ",\"game\":\"" << jsonEscape(g_gameName ? g_gameName : "None")
             << "\",\"age\":0}],\"source\":\"atlas-core\"}";
        std::string bodyStr = body.str();

        std::ostringstream resp;
        resp << "HTTP/1.1 200 OK\r\n"
             << "Content-Type: application/json\r\n"
             << "Access-Control-Allow-Origin: *\r\n"
             << "Content-Length: " << bodyStr.size() << "\r\n\r\n"
             << bodyStr;
        std::string respStr = resp.str();
        send(client, respStr.c_str(), (int)respStr.size(), 0);
        closesocket(client);
        return;
    }

    // /api/info endpoint (for pairing and QR code panel)
    if (strstr(buf, "GET /api/info")) {
        std::string ip = getLocalIPv4();
        std::ostringstream body;
        body << "{\"ip\":\"" << jsonEscape(ip) << "\",\"port\":" << g_ssePort
             << ",\"version\":\"1.1.0\",\"name\":\"Atlas Core\"}";
        std::string bodyStr = body.str();

        std::ostringstream resp;
        resp << "HTTP/1.1 200 OK\r\n"
             << "Content-Type: application/json\r\n"
             << "Access-Control-Allow-Origin: *\r\n"
             << "Content-Length: " << bodyStr.size() << "\r\n\r\n"
             << bodyStr;
        std::string respStr = resp.str();
        send(client, respStr.c_str(), (int)respStr.size(), 0);
        closesocket(client);
        return;
    }

    // SSE telemetry/events stream
    if (strstr(buf, "GET /telemetry") || strstr(buf, "GET /events")) {
        const char* headers =
            "HTTP/1.1 200 OK\r\n"
            "Content-Type: text/event-stream\r\n"
            "Cache-Control: no-cache\r\n"
            "Connection: keep-alive\r\n"
            "Access-Control-Allow-Origin: *\r\n"
            "Access-Control-Allow-Headers: Cache-Control\r\n\r\n";
        send(client, headers, (int)strlen(headers), 0);

        const char* connectedMsg =
            "data: {\"type\":\"connected\",\"message\":\"Atlas Core Telemetry Server\"}\n\n";
        send(client, connectedMsg, (int)strlen(connectedMsg), 0);

        // Add to SSE client list
        std::lock_guard<std::mutex> lock(g_sseMtx);
        g_sseClients.push_back(client);
        printf("\n[%s] SSE client connected (%d total)\n", timestamp().c_str(), (int)g_sseClients.size());
        return; // Keep socket open
    }

    // Default: 404
    const char* resp = "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n";
    send(client, resp, (int)strlen(resp), 0);
    closesocket(client);
}

static void sseBroadcast(const std::string& json) {
    std::string payload = "data: " + json + "\n\n";
    std::lock_guard<std::mutex> lock(g_sseMtx);
    auto it = g_sseClients.begin();
    while (it != g_sseClients.end()) {
        int sent = send(*it, payload.c_str(), (int)payload.size(), 0);
        if (sent <= 0) {
            closesocket(*it);
            it = g_sseClients.erase(it);
        } else {
            ++it;
        }
    }
}

static void sseServerThread() {
    SOCKET listenSock = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    if (listenSock == INVALID_SOCKET) {
        printf("[ERROR] SSE server socket failed\n");
        return;
    }

    int opt = 1;
    setsockopt(listenSock, SOL_SOCKET, SO_REUSEADDR, (char*)&opt, sizeof(opt));

    sockaddr_in addr = {};
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = INADDR_ANY;
    addr.sin_port = htons((u_short)g_ssePort);

    if (bind(listenSock, (sockaddr*)&addr, sizeof(addr)) == SOCKET_ERROR) {
        printf("[ERROR] SSE bind to port %d failed (port in use?)\n", g_ssePort);
        closesocket(listenSock);
        return;
    }

    listen(listenSock, 10);
    printf("[%s] SSE server listening on port %d\n", timestamp().c_str(), g_ssePort);

    while (g_running) {
        fd_set readfds;
        FD_ZERO(&readfds);
        FD_SET(listenSock, &readfds);
        timeval tv = { 1, 0 }; // 1-second timeout so we can check g_running

        if (select(0, &readfds, nullptr, nullptr, &tv) > 0) {
            SOCKET client = accept(listenSock, nullptr, nullptr);
            if (client != INVALID_SOCKET) {
                std::thread(sseHandleClient, client).detach();
            }
        }
    }

    closesocket(listenSock);
}

// ================================================================
//  Discovery Beacon (so dashboards auto-find this instance)
// ================================================================

static void beaconThread() {
    SOCKET bsock = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
    if (bsock == INVALID_SOCKET) {
        printf("[WARN] Beacon socket creation failed\n");
        return;
    }

    int broadcast = 1;
    setsockopt(bsock, SOL_SOCKET, SO_BROADCAST, (char*)&broadcast, sizeof(broadcast));

    sockaddr_in bcast = {};
    bcast.sin_family = AF_INET;
    bcast.sin_port = htons((u_short)g_beaconPort);
    bcast.sin_addr.s_addr = INADDR_BROADCAST;

    const std::string localIP = getLocalIPv4();

    printf("[%s] Discovery beacon on UDP port %d\n", timestamp().c_str(), g_beaconPort);

    while (g_running) {
        char beacon[256];
        snprintf(beacon, sizeof(beacon),
            "{\"service\":\"atlas-core\",\"ip\":\"%s\",\"ssePort\":%d,\"game\":\"%s\",\"version\":\"1.1.0\"}",
            localIP.c_str(), g_ssePort, g_gameName);
        sendto(bsock, beacon, (int)strlen(beacon), 0, (sockaddr*)&bcast, sizeof(bcast));
        Sleep(2000);
    }
    closesocket(bsock);
}

// ================================================================
//  System Tray
// ================================================================

static LRESULT CALLBACK TrayWndProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam) {
    switch (msg) {
    case WM_TRAYICON:
        if (lParam == WM_RBUTTONUP) {
            POINT pt;
            GetCursorPos(&pt);
            HMENU menu = CreatePopupMenu();
            AppendMenuA(menu, MF_STRING, ID_TRAY_SHOW, "Show Console");
            AppendMenuA(menu, MF_SEPARATOR, 0, nullptr);
            AppendMenuA(menu, MF_STRING, ID_TRAY_EXIT, "Exit Atlas Core");
            SetForegroundWindow(hwnd);
            TrackPopupMenu(menu, TPM_RIGHTALIGN, pt.x, pt.y, 0, hwnd, nullptr);
            DestroyMenu(menu);
        } else if (lParam == WM_LBUTTONDBLCLK) {
            HWND con = GetConsoleWindow();
            if (con) { ShowWindow(con, SW_SHOW); SetForegroundWindow(con); }
        }
        break;
    case WM_COMMAND:
        if (LOWORD(wParam) == ID_TRAY_EXIT) {
            g_running = false;
            PostQuitMessage(0);
        } else if (LOWORD(wParam) == ID_TRAY_SHOW) {
            HWND con = GetConsoleWindow();
            if (con) { ShowWindow(con, SW_SHOW); SetForegroundWindow(con); }
        }
        break;
    case WM_DESTROY:
        Shell_NotifyIconA(NIM_DELETE, &g_nid);
        break;
    }
    return DefWindowProcA(hwnd, msg, wParam, lParam);
}

static void trayThread(HINSTANCE hInst) {
    WNDCLASSA wc = {};
    wc.lpfnWndProc = TrayWndProc;
    wc.hInstance = hInst;
    wc.lpszClassName = "AtlasCoreClass";
    g_appIcon = (HICON)LoadImageA(
        hInst, MAKEINTRESOURCEA(IDI_APPICON), IMAGE_ICON, 0, 0, LR_DEFAULTSIZE);
    if (g_appIcon) {
        g_appIconOwned = true;
    } else {
        g_appIcon = LoadIcon(nullptr, IDI_APPLICATION);
        g_appIconOwned = false;
    }
    wc.hIcon = g_appIcon;
    RegisterClassA(&wc);

    g_trayHwnd = CreateWindowExA(0, "AtlasCoreClass", "Atlas Core", 0,
        0, 0, 0, 0, HWND_MESSAGE, nullptr, hInst, nullptr);

    g_nid.cbSize = sizeof(g_nid);
    g_nid.hWnd = g_trayHwnd;
    g_nid.uID = 1;
    g_nid.uFlags = NIF_ICON | NIF_TIP | NIF_MESSAGE;
    g_nid.uCallbackMessage = WM_TRAYICON;
    g_nid.hIcon = g_appIcon;
    strcpy_s(g_nid.szTip, "Atlas Core - Starting...");
    Shell_NotifyIconA(NIM_ADD, &g_nid);

    MSG msg;
    while (GetMessage(&msg, nullptr, 0, 0) > 0) {
        TranslateMessage(&msg);
        DispatchMessage(&msg);
    }
}

// ================================================================
//  Main
// ================================================================

int main(int argc, char* argv[]) {
    SetConsoleOutputCP(CP_UTF8);

    // Parse command-line args
    for (int i = 1; i < argc; i++) {
        if (strcmp(argv[i], "--host") == 0 && i + 1 < argc)
            strncpy(g_targetHost, argv[++i], sizeof(g_targetHost) - 1);
        else if (strcmp(argv[i], "--port") == 0 && i + 1 < argc)
            g_targetPort = atoi(argv[++i]);
        else if (strcmp(argv[i], "--hz") == 0 && i + 1 < argc)
            g_hz = atoi(argv[++i]);
        else if (strcmp(argv[i], "--sse-port") == 0 && i + 1 < argc)
            g_ssePort = atoi(argv[++i]);
        else if (strcmp(argv[i], "--help") == 0) {
            printf("Atlas Core - Lightweight Telemetry Forwarder\n\n");
            printf("Usage: atlas-core.exe [options]\n");
            printf("  --host IP       UDP target IP    (default: 127.0.0.1)\n");
            printf("  --port PORT     UDP target port  (default: 20777)\n");
            printf("  --sse-port PORT SSE server port  (default: 8080)\n");
            printf("  --hz RATE       Send rate in Hz  (default: 60)\n");
            return 0;
        }
    }

    // Banner
    printf("\n");
    printColoredAtlasCoreBanner();
    printf("  Lightweight Telemetry Forwarder\n");
    printf("\n");
    printf("  UDP    : %s:%d @ %dHz\n", g_targetHost, g_targetPort, g_hz);
    printf("  SSE    : http://0.0.0.0:%d/telemetry\n", g_ssePort);
    printf("  Beacon : UDP broadcast port %d (auto-discovery)\n", g_beaconPort);
    printf("  Games  : Assetto Corsa | ACC | ATS\n");
    printf("  Tray   : Right-click tray icon to show/exit\n");
    printf("\n");

    // Winsock init
    WSADATA wsa;
    if (WSAStartup(MAKEWORD(2, 2), &wsa) != 0) {
        printf("[ERROR] WSAStartup failed (%d)\n", WSAGetLastError());
        return 1;
    }

    // UDP socket
    g_sock = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
    if (g_sock == INVALID_SOCKET) {
        printf("[ERROR] Socket creation failed\n");
        WSACleanup();
        return 1;
    }
    g_dest.sin_family = AF_INET;
    g_dest.sin_port = htons((u_short)g_targetPort);
    inet_pton(AF_INET, g_targetHost, &g_dest.sin_addr);

    // Start SSE server thread
    std::thread sse(sseServerThread);
    sse.detach();

    // Start discovery beacon thread
    std::thread beacon(beaconThread);
    beacon.detach();

    // Start tray icon on a background thread
    std::thread tray(trayThread, GetModuleHandle(nullptr));
    tray.detach();

    // Wait briefly for threads to initialize
    Sleep(300);

    printf("[%s] Scanning for games...\n", timestamp().c_str());

    Game currentGame = Game::None;
    bool memConnected = false;
    const char* gameName = "None";
    auto lastStatTime = std::chrono::steady_clock::now();
    int pktCount = 0;

    while (g_running) {
        // --- Detect running game ---
        Game detected = Game::None;
        if (isProcessRunning("acs.exe") || isProcessRunning("AssettoCorsa.exe"))
            detected = Game::AC;
        else if (isProcessRunning("ACC.exe"))
            detected = Game::ACC;
        else if (isProcessRunning("amtrucks.exe"))
            detected = Game::ATS;

        // --- Game changed ---
        if (detected != currentGame) {
            if (memConnected) {
                closeSharedMemory();
                memConnected = false;
                printf("\n[%s] %s disconnected\n", timestamp().c_str(), gameName);
            }
            currentGame = detected;

            switch (currentGame) {
                case Game::AC:  gameName = "Assetto Corsa"; break;
                case Game::ACC: gameName = "ACC";           break;
                case Game::ATS: gameName = "ATS";           break;
                default:        gameName = "None";          break;
            }
            g_gameName = gameName;

            if (currentGame == Game::None) {
                updateTrayTip("Atlas Core - No game detected");
                printf("[%s] No game detected, scanning...\n", timestamp().c_str());
                Sleep(2000);
                continue;
            }
            printf("[%s] Detected: %s\n", timestamp().c_str(), gameName);
        }

        // --- Connect shared memory ---
        if (!memConnected && currentGame != Game::None) {
            bool ok = false;
            switch (currentGame) {
                case Game::AC:  ok = openACMemory();  break;
                case Game::ACC: ok = openACCMemory(); break;
                case Game::ATS: ok = openATSMemory(); break;
                default: break;
            }
            if (ok) {
                memConnected = true;
                printf("[%s] Shared memory connected - forwarding to %s:%d\n",
                    timestamp().c_str(), g_targetHost, g_targetPort);
                char tip[128];
                snprintf(tip, sizeof(tip), "Atlas Core - %s (forwarding)", gameName);
                updateTrayTip(tip);
            } else {
                Sleep(1000);
                continue;
            }
        }

        // --- Read telemetry and send UDP ---
        if (memConnected) {
            std::string json;
            float speed = 0;
            int rpm = 0, gear = 0;

            switch (currentGame) {
                case Game::AC: {
                    json = buildACJSON();
                    auto* p = (AC::SPageFilePhysics*)g_pPhysics;
                    speed = p->speedKmh; rpm = p->rpms; gear = p->gear - 1;
                    break;
                }
                case Game::ACC: {
                    json = buildACCJSON();
                    auto* p = (ACC::SPageFilePhysics*)g_pPhysics;
                    speed = p->speedKmh; rpm = p->rpms; gear = p->gear - 1;
                    break;
                }
                case Game::ATS: {
                    json = buildATSJSON();
                    auto* t = (ATSSharedMemoryView*)g_pPhysics;
                    speed = sanitizeFloat(t->speed) * 3.6f;
                    rpm = (int)sanitizeFloat(t->engineRpm);
                    gear = (t->gearDashboard != 0) ? t->gearDashboard : t->gear;
                    break;
                }
                default: break;
            }

            if (!json.empty()) {
                sendto(g_sock, json.c_str(), (int)json.size(), 0,
                    (sockaddr*)&g_dest, sizeof(g_dest));
                sseBroadcast(json);
                pktCount++;
            }

            // Update console stats once per second
            auto now = std::chrono::steady_clock::now();
            auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(now - lastStatTime).count();
            if (ms >= 1000) {
                printf("\r  [%s] %s | %d pkt/s | %.0f km/h | %d RPM | Gear %d       ",
                    timestamp().c_str(), gameName, pktCount, speed, rpm, gear);
                fflush(stdout);

                char tip[128];
                snprintf(tip, sizeof(tip), "Atlas Core - %s | %d pkt/s | %.0f km/h",
                    gameName, pktCount, speed);
                updateTrayTip(tip);

                pktCount = 0;
                lastStatTime = now;
            }
        }

        Sleep(1000 / g_hz);
    }

    // Cleanup
    closeSharedMemory();
    if (g_sock != INVALID_SOCKET) closesocket(g_sock);
    WSACleanup();
    if (g_trayHwnd) {
        Shell_NotifyIconA(NIM_DELETE, &g_nid);
        PostMessage(g_trayHwnd, WM_CLOSE, 0, 0);
    }
    if (g_appIconOwned && g_appIcon) {
        DestroyIcon(g_appIcon);
        g_appIcon = nullptr;
    }

    printf("\n\nAtlas Core stopped.\n");
    return 0;
}
