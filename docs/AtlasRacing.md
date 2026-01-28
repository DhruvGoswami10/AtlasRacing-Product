# Atlas Racing: A Comprehensive Technical Documentation

## Research Paper Reference Documentation

**Author:** Atlas Racing Development Team
**Version:** 1.0
**Last Updated:** December 2024

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Architecture Overview](#2-system-architecture-overview)
3. [Backend Implementation](#3-backend-implementation)
   - 3.1 [C++ Telemetry Engine](#31-c-telemetry-engine)
   - 3.2 [UDP Receiver Implementation](#32-udp-receiver-implementation)
   - 3.3 [Packet Parser System](#33-packet-parser-system)
   - 3.4 [Data Processor](#34-data-processor)
   - 3.5 [WebSocket/SSE Server](#35-websocketsse-server)
4. [Game Integrations](#4-game-integrations)
   - 4.1 [F1 24 UDP Integration](#41-f1-24-udp-integration)
   - 4.2 [Assetto Corsa Shared Memory](#42-assetto-corsa-shared-memory)
5. [Frontend Implementation](#5-frontend-implementation)
   - 5.1 [React Architecture](#51-react-architecture)
   - 5.2 [Real-Time Data Flow](#52-real-time-data-flow)
   - 5.3 [Dashboard Components](#53-dashboard-components)
   - 5.4 [State Management](#54-state-management)
6. [AI and Machine Learning Systems](#6-ai-and-machine-learning-systems)
   - 6.1 [AI Race Engineer](#61-ai-race-engineer)
   - 6.2 [Lap Prediction Algorithms](#62-lap-prediction-algorithms)
   - 6.3 [Pit Strategy Calculator](#63-pit-strategy-calculator)
   - 6.4 [Live Analysis Processor](#64-live-analysis-processor)
   - 6.5 [Voice Integration](#65-voice-integration)
7. [Companion Projects](#7-companion-projects)
   - 7.1 [Pits-n-Giggles Python Backend](#71-pits-n-giggles-python-backend)
   - 7.2 [Tester Recording/Replay System](#72-tester-recordingreplay-system)
8. [Data Structures and Protocols](#8-data-structures-and-protocols)
9. [Performance Characteristics](#9-performance-characteristics)
10. [Future ML Integration Points](#10-future-ml-integration-points)
11. [Appendices](#11-appendices)

---

## 1. Executive Summary

**Atlas Racing** is a sophisticated, multi-game telemetry dashboard ecosystem designed for sim racing enthusiasts and professional racing engineers. The system combines high-performance C++ backend processing with modern React frontends to deliver real-time, low-latency telemetry visualization and AI-powered race engineering assistance.

### Key Features

- **Multi-Game Support:** F1 24/25 (UDP), Assetto Corsa (Shared Memory), with ATS planned
- **Real-Time Telemetry:** 60Hz data processing with sub-16ms latency
- **AI Race Engineer:** GPT-4 powered voice assistant with real telemetry context
- **Predictive Analytics:** Multi-factor lap prediction with ERS/DRS modeling
- **Pit Strategy Planning:** Three-option strategy calculator with 25 track-specific configurations
- **Voice Control:** Whisper speech-to-text with Edge TTS responses
- **Desktop Application:** Electron-wrapped React dashboard

### Technical Stack

| Layer | Technology |
|-------|------------|
| Backend | C++17, CMake, Cross-platform sockets |
| Frontend | React 18, TypeScript, TailwindCSS |
| Desktop | Electron 23.x |
| AI | OpenAI GPT-4o-mini, Whisper, Edge TTS |
| Communication | Server-Sent Events (SSE), HTTP |
| Database | SQLite (session storage) |

---

## 2. System Architecture Overview

### High-Level Data Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           GAME LAYER                                     │
├─────────────────────────────────────────────────────────────────────────┤
│  F1 24/25 Game          Assetto Corsa          ATS (Future)             │
│       ↓                       ↓                      ↓                   │
│   UDP :20777           Shared Memory            SCS SDK                  │
└───────┬───────────────────────┬──────────────────────┬──────────────────┘
        │                       │                      │
        ▼                       ▼                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      C++ TELEMETRY ENGINE                               │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐                │
│  │ UDP Receiver│  │ Packet Parser │  │ AC Shared Memory│                │
│  │  (Port 20777)│  │ (15 packet   │  │    Reader       │                │
│  └──────┬──────┘  │  types)       │  └────────┬────────┘                │
│         │         └──────┬───────┘            │                         │
│         └────────────────┼────────────────────┘                         │
│                          ▼                                              │
│              ┌───────────────────────┐                                  │
│              │    Data Processor     │                                  │
│              │  (194+ telemetry      │                                  │
│              │   fields unified)     │                                  │
│              └───────────┬───────────┘                                  │
│                          │                                              │
│         ┌────────────────┼────────────────┐                            │
│         ▼                ▼                ▼                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                     │
│  │ Lap         │  │ Pit Strategy│  │ Live        │                     │
│  │ Predictor   │  │ Calculator  │  │ Analysis    │                     │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                     │
│         └────────────────┼────────────────┘                            │
│                          ▼                                              │
│              ┌───────────────────────┐                                  │
│              │  WebSocket/SSE Server │                                  │
│              │      (Port 8080)      │                                  │
│              └───────────┬───────────┘                                  │
└──────────────────────────┼──────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       FRONTEND LAYER                                     │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Electron Desktop App                          │   │
│  │  ┌─────────────────────────────────────────────────────────┐    │   │
│  │  │                  React Application                       │    │   │
│  │  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │    │   │
│  │  │  │ Telemetry    │  │ Auth         │  │ AI Race      │  │    │   │
│  │  │  │ Context      │  │ Context      │  │ Engineer     │  │    │   │
│  │  │  └──────┬───────┘  └──────────────┘  └──────┬───────┘  │    │   │
│  │  │         │                                    │          │    │   │
│  │  │         ▼                                    ▼          │    │   │
│  │  │  ┌────────────────────────────────────────────────┐    │    │   │
│  │  │  │              Dashboard Components              │    │    │   │
│  │  │  │  • F1ProDashboard    • GTEnduranceDashboard   │    │    │   │
│  │  │  │  • DevModeDashboard  • LiveRaceAnalysis       │    │    │   │
│  │  │  │  • GPRaceBoard       • 30+ Widgets            │    │    │   │
│  │  │  └────────────────────────────────────────────────┘    │    │   │
│  │  └─────────────────────────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Backend Implementation

### 3.1 C++ Telemetry Engine

The backend is implemented in C++17 and serves as the high-performance data processing layer.

#### Source File Structure

```
backend/
├── src/
│   ├── core/
│   │   ├── udp_receiver.cpp        # UDP socket listener
│   │   ├── packet_parser.cpp       # Packet identification
│   │   ├── data_processor.cpp      # Central data aggregator (1000+ lines)
│   │   ├── websocket_server.cpp    # SSE server implementation
│   │   ├── accurate_lap_predictor.cpp  # Multi-factor prediction
│   │   ├── pit_strategy_calculator.cpp # Strategy planning
│   │   ├── live_analysis_processor.cpp # Real-time analysis
│   │   └── http_server.cpp         # REST API endpoints
│   ├── f1_24/
│   │   ├── f1_24_parser.cpp        # F1 24 packet extraction
│   │   └── f1_24_types.h           # Official UDP packet structures
│   ├── games/ac/
│   │   ├── ac_shared_memory.cpp    # Windows shared memory reader
│   │   ├── ac_parser.cpp           # AC telemetry parser (144 fields)
│   │   └── ac_types.h              # AC memory structures
│   ├── storage/
│   │   └── sqlite_store.cpp        # Session recording
│   ├── main.cpp                    # Legacy F1 24-only entry
│   └── main_unified.cpp            # Multi-game entry (PRIMARY)
├── include/telemetry/
│   └── [Header files for all components]
├── build/
│   ├── atlas_racing_server.exe     # Multi-game (current)
│   └── telemetry_server.exe        # F1 24 only (legacy)
└── CMakeLists.txt
```

### 3.2 UDP Receiver Implementation

**File:** `src/core/udp_receiver.cpp`

The UDP receiver creates a non-blocking socket bound to port 20777 (F1 24's official telemetry port).

```cpp
class UDPReceiver {
private:
    static const int F1_24_PORT = 20777;
    static const int BUFFER_SIZE = 2048;
    SOCKET socket_fd;
    struct sockaddr_in server_addr;

public:
    bool initialize() {
        // 1. WSAStartup on Windows (Winsock 2.2)
        // 2. Create AF_INET SOCK_DGRAM (UDP) socket
        // 3. Bind to 0.0.0.0:20777 (all interfaces)
        // 4. Returns immediately - non-blocking
    }

    int receivePacket(char* buffer) {
        // recvfrom() to receive UDP packet
        // Returns bytes received or -1 on error
    }
};
```

**Key Design Decisions:**
- Non-blocking sockets for high throughput
- Cross-platform support (Windows WSA, Unix POSIX)
- 2048-byte buffer accommodates all F1 24 packet sizes
- Zero-copy packet passing to parser

### 3.3 Packet Parser System

**File:** `src/core/packet_parser.cpp`, `src/f1_24/f1_24_types.h`

The parser validates and identifies F1 24/25 UDP packets using the official EA Sports packet format.

#### F1 24 Packet Types (15 Total)

| ID | Name | Size | Key Data |
|----|------|------|----------|
| 0 | Motion Data | ~1464 | World position X/Y/Z, G-forces, velocities |
| 1 | Session Data | ~644 | Track ID, weather, session type, marshal zones |
| 2 | Lap Data | ~1131 | **Real gap data**, sector times, penalties |
| 3 | Event Data | ~45 | Race events (FTLP, PENA, COLL, etc.) |
| 4 | Participants | ~1306 | Driver names, team IDs (22 drivers) |
| 5 | Car Setups | ~1107 | Wing angles, suspension, brake bias |
| 6 | Car Telemetry | ~1352 | Speed, RPM, gear, throttle, brake, temps |
| 7 | Car Status | ~1239 | Fuel, ERS, DRS, tire compound/age |
| 8 | Final Classification | ~1020 | Race results, points, penalties |
| 9 | Lobby Info | ~1218 | Multiplayer lobby data |
| 10 | Car Damage | ~953 | Wing, floor, engine, gearbox damage |
| 11 | Session History | ~1460 | Lap history, sector times per lap |
| 12 | Tyre Sets Data | ~231 | 20 tyre sets with wear and deltas |
| 13 | Motion Ex | ~217 | Extended physics (PC only) |
| 14 | Lap Positions | ~49 | Finished lap tracking |

#### Packet Header Structure

```cpp
struct PacketHeader {
    uint16_t m_packetFormat;      // 2024 or 2025
    uint8_t  m_gameYear;          // 24 or 25
    uint8_t  m_gameMajorVersion;
    uint8_t  m_gameMinorVersion;
    uint8_t  m_packetVersion;
    uint8_t  m_packetId;          // 0-14
    uint64_t m_sessionUID;
    float    m_sessionTime;
    uint32_t m_frameIdentifier;
    uint32_t m_overallFrameIdentifier;
    uint8_t  m_playerCarIndex;
    uint8_t  m_secondaryPlayerCarIndex;
};
```

### 3.4 Data Processor

**File:** `src/core/data_processor.cpp` (~1000+ lines)

The Data Processor is the central aggregator that combines all packet types into a unified `ProcessedTelemetry` structure with 194+ fields.

#### ProcessedTelemetry Structure (Abbreviated)

```cpp
struct ProcessedTelemetry {
    // === CORE TELEMETRY (Packet 6) ===
    float speed_kph;
    uint16_t rpm;
    int8_t gear;                    // -1=R, 0=N, 1-8=gears
    float throttle_percent;
    float brake_percent;
    uint16_t steering_angle;

    // === REAL GAP DATA (Packet 2) ===
    float gap_to_car_ahead;         // Actual F1 24 data
    float gap_to_race_leader;       // Not estimated!

    // === TIRE DATA ===
    uint8_t tyre_compound_actual;   // 16=C5, 17=C4, ... 20=C1, 7=inter, 8=wet
    uint8_t tyre_age_laps;
    uint8_t tyre_surface_temp[4];   // FL, FR, RL, RR
    float tyre_wear[4];             // % wear (0-100)
    float tyre_pressure[4];         // PSI
    uint16_t brake_temperature[4];  // °C

    // === ERS & DRS (Packet 7) ===
    uint8_t drs_allowed;
    uint8_t drs_open;
    uint8_t ers_deploy_mode;        // 0=none, 1=med, 2=hotlap, 3=overtake
    float ers_store_energy;         // Joules (0-4 MJ)
    float ers_deployed_this_lap;

    // === FUEL SYSTEM ===
    float fuel_in_tank;             // kg
    float fuel_remaining_laps;      // MFD calculation
    float fuel_per_lap_average;     // Rolling average

    // === SESSION DATA ===
    float current_lap_time;
    float last_lap_time;
    float best_lap_time;
    uint8_t position;
    uint8_t current_lap_num;
    uint32_t sector1_time_ms;
    uint32_t sector2_time_ms;
    uint32_t sector3_time_ms;

    // === CAR DAMAGE (Packet 10) ===
    float front_left_wing_damage;
    float front_right_wing_damage;
    float engine_damage;
    float gearbox_damage;

    // === STRATEGY DATA ===
    struct PitStrategyPlan {
        char label[16];
        uint8_t total_stops;
        float projected_total_time;
        float confidence;
        PitStrategyStopDetail stops[3];
    } pit_plan_primary, pit_plan_alternative, pit_plan_third;

    // === METADATA ===
    char game_name[16];             // "F1 24" or "Assetto Corsa"
    uint64_t timestamp_ms;
};
```

#### Key Processing Methods

| Method | Packet | Purpose |
|--------|--------|---------|
| `updateTelemetryData()` | 6 | Speed, RPM, gear, inputs, temps |
| `updateLapData()` | 2 | Real gaps, sectors, penalties |
| `updateStatusData()` | 7 | ERS, DRS, fuel, compound |
| `updateCarSetupData()` | 5 | Wing, suspension, brake bias |
| `updateCarDamageData()` | 10 | All damage values |
| `updateMultiCarLapData()` | 2 | All 22 drivers for pit wall |
| `toJSON()` | - | Serialize to JSON string |

### 3.5 WebSocket/SSE Server

**File:** `src/core/websocket_server.cpp`

The server uses Server-Sent Events (SSE) over HTTP for real-time data streaming to the frontend.

#### Architecture

```cpp
class WebSocketServer {
private:
    static const int WS_PORT = 8080;
    std::vector<int> telemetry_clients;   // SSE telemetry subscribers
    std::vector<int> events_clients;      // Race events subscribers
    std::vector<int> state_sync_clients;  // State sync subscribers

public:
    void broadcastTelemetry(const std::string& json);
    void broadcastEvents(const std::string& json);
    void broadcastMultiCarData(const std::string& json);
    void broadcastAnalysis(const std::string& json);
};
```

#### SSE Protocol Implementation

```
Client Request:
GET /telemetry HTTP/1.1
Accept: text/event-stream
Connection: keep-alive

Server Response:
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache

data: {"speed_kph":320,"rpm":12000,...}\n\n
data: {"speed_kph":322,"rpm":12050,...}\n\n
```

**Key Features:**
- Non-blocking sockets for ~100 concurrent clients
- Separate pools for telemetry, events, and analysis
- Automatic client cleanup on disconnection
- ~60Hz broadcast frequency when game data available

---

## 4. Game Integrations

### 4.1 F1 24 UDP Integration

F1 24 broadcasts telemetry via UDP on port 20777 at approximately 60Hz.

#### Data Accuracy

| Data Type | Source | Accuracy |
|-----------|--------|----------|
| Gap to car ahead | Packet 2: `m_deltaToCarInFront` | **Exact** (milliseconds) |
| Gap to leader | Packet 2: `m_deltaToRaceLeader` | **Exact** (milliseconds) |
| Tire wear | Packet 7: `m_tyresWear[4]` | Exact percentage |
| ERS energy | Packet 7: `m_ersStoreEnergy` | Exact Joules |
| Sector times | Packet 2: `m_sector*TimeInMS` | Millisecond precision |

#### Packet Frequency Analysis

| Packet ID | Name | Typical Frequency |
|-----------|------|-------------------|
| 6 | Car Telemetry | 60 Hz |
| 0 | Motion Data | 60 Hz |
| 2 | Lap Data | 60 Hz |
| 7 | Car Status | 4 Hz |
| 1 | Session Data | 2 Hz |
| 3 | Event Data | On occurrence |

### 4.2 Assetto Corsa Shared Memory

**Files:** `src/games/ac/ac_shared_memory.cpp`, `ac_parser.cpp`

Assetto Corsa exposes telemetry through Windows shared memory rather than UDP.

#### Shared Memory Segments

| Segment Name | Size | Contents |
|--------------|------|----------|
| `acpmf_physics` | 1357 bytes | Core physics data |
| `acpmf_graphics` | 360+ bytes | Lap/session graphics |
| `acpmf_static` | 210+ bytes | Static car/track info |

#### Extracted Fields (144 Total)

- **Physics:** Speed, RPM, gear, throttle, brake, G-forces
- **Tires:** 3-zone temperatures (inner/middle/outer × 4)
- **Suspension:** Travel, wheel loads, slip ratios
- **Contact:** Patch coordinates, normals per wheel
- **Performance:** Real-time delta meter
- **Session:** Track position, spline data, laps

#### Platform Limitation

Assetto Corsa shared memory is **Windows-only**. Mac/Linux users cannot access AC telemetry directly.

---

## 5. Frontend Implementation

### 5.1 React Architecture

The frontend is built with React 18, TypeScript, and TailwindCSS, wrapped in Electron for desktop deployment.

#### File Structure

```
frontend/
├── src/
│   ├── components/
│   │   ├── F1ProDashboard.tsx      # Professional F1 dashboard
│   │   ├── GTEnduranceDashboard.tsx # GT/Endurance racing
│   │   ├── DevModeDashboard.tsx    # Debug/dev view (2000+ lines)
│   │   ├── LiveRaceAnalysis.tsx    # Live analysis view
│   │   ├── GPRaceBoard.tsx         # Multi-car race board
│   │   ├── DashboardSelection.tsx  # Dashboard picker
│   │   ├── ui/                     # 30+ Radix UI components
│   │   └── widgets/                # 30+ telemetry widgets
│   ├── hooks/
│   │   ├── useTelemetry.ts         # Main telemetry hook
│   │   ├── useLivePitStrategy.ts   # Strategy calculations
│   │   ├── useErsAdvisor.ts        # ERS recommendations
│   │   └── [15+ custom hooks]
│   ├── services/
│   │   ├── sse.ts                  # SSE client (355 lines)
│   │   ├── race_context.ts         # AI context builder (1277 lines)
│   │   ├── analysis_engine.ts      # Performance analysis
│   │   └── strategy_calculator.ts  # Strategy computation
│   ├── context/
│   │   ├── TelemetryContext.tsx    # Real-time data context
│   │   └── AuthContext.tsx         # User authentication
│   ├── types/
│   │   └── telemetry.ts            # TypeScript interfaces (662 lines)
│   ├── App.tsx                     # Main application
│   └── index.tsx                   # React entry point
├── electron/
│   └── main.js                     # Electron entry (216 lines)
└── package.json
```

### 5.2 Real-Time Data Flow

```
C++ Backend (UDP/Shared Memory)
    ↓
Data Processor (ProcessedTelemetry)
    ↓
JSON Serialization
    ↓
SSE Server (Port 8080)
    ↓
┌─────────────────────────────────────────┐
│     TelemetrySSE Client (Browser)       │
│                                         │
│  EventSource connects to /telemetry     │
│                                         │
│  Message Types:                         │
│  • type: 'telemetry'    → 60 Hz        │
│  • type: 'multicar'     → 10 Hz        │
│  • type: 'session'      → On change    │
│  • type: 'race_event'   → On event     │
│  • type: 'live_analysis'→ 10 Hz        │
└────────────────┬────────────────────────┘
                 ↓
┌─────────────────────────────────────────┐
│     TelemetryContext (React State)      │
│                                         │
│  telemetry: TelemetryData | null        │
│  multiCarData: MultiCarTelemetryData    │
│  connectionStatus: 'connected' | ...    │
│  liveAnalysis: AnalysisResult           │
└────────────────┬────────────────────────┘
                 ↓
┌─────────────────────────────────────────┐
│     useTelemetry() Hook                 │
│                                         │
│  Components subscribe to context        │
│  Re-render on state changes (~60Hz)     │
└────────────────┬────────────────────────┘
                 ↓
    Dashboard Components Display Data
```

### 5.3 Dashboard Components

#### F1ProDashboard (850 lines)

Professional F1 24 dashboard with:
- Grid-based responsive layout
- Sector timing with color coding (purple=fastest, green=personal best)
- ERS/DRS deployment indicators
- Tire compound and age display
- Pit window status
- Brake balance and differential controls

#### GTEnduranceDashboard (800+ lines)

GT/Endurance racing optimized with:
- Central large gear display (10rem)
- Side-mounted speed displays
- Real-time delta vs personal best
- RPM lights with redline visualization
- 3-zone tire temperature display
- Flag system (green/yellow/red/blue)

#### DevModeDashboard (2000+ lines)

Complete raw telemetry viewer:
- All 100+ telemetry fields
- Multi-car data with full driver grid
- Real-time gap calculations
- Track map with dynamic outline building
- ERS advisor panel
- Strategy panel with recommendations
- Live analysis outputs

### 5.4 State Management

Atlas Racing uses React Context API (not Redux/Zustand) for state management.

#### TelemetryContext

```typescript
interface TelemetryContextValue {
  telemetry: TelemetryData | null;
  session: SessionData | null;
  isConnected: boolean;
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  multiCarData: MultiCarTelemetryData | null;
  liveAnalysis: AnalysisResult | null;
  connect(): Promise<void>;
  disconnect(): void;
  retry(): Promise<void>;
}
```

**Provider wraps entire app in index.tsx:**
```typescript
<TelemetryProvider>
  <AuthProvider>
    <App />
  </AuthProvider>
</TelemetryProvider>
```

---

## 6. AI and Machine Learning Systems

### 6.1 AI Race Engineer

The AI race engineer provides real-time racing advice using GPT-4 with full telemetry context.

#### System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    AI Race Engineer Pipeline                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │ Telemetry    │───▶│ Race Context │───▶│ OpenAI GPT   │      │
│  │ Data (60Hz)  │    │ Builder      │    │ 4o-mini      │      │
│  └──────────────┘    └──────────────┘    └──────┬───────┘      │
│                                                  │               │
│                                                  ▼               │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │ Audio Output │◀───│ Edge TTS     │◀───│ Text Response│      │
│  │ (Browser)    │    │ (British     │    │ (18 words    │      │
│  └──────────────┘    │  engineer)   │    │  max)        │      │
│                      └──────────────┘    └──────────────┘      │
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐                          │
│  │ Voice Input  │───▶│ Whisper STT  │───▶ (Back to GPT)        │
│  │ (Push-to-    │    │ (ggml-base)  │                          │
│  │  talk)       │    └──────────────┘                          │
│  └──────────────┘                                               │
└─────────────────────────────────────────────────────────────────┘
```

#### Race Context Builder (`race_context.ts` - 1277 lines)

Builds comprehensive snapshots for AI prompts:

```typescript
interface RaceSnapshot {
  // Position & Timing
  position: number;
  currentLap: number;
  totalLaps: number;
  gapToCarAhead: number;      // Real F1 24 data
  gapToLeader: number;        // Real F1 24 data

  // Tire State
  tireCompound: string;
  tireAge: number;
  tireWear: number[];
  tireDegradationRate: number;

  // Fuel State
  fuelRemaining: number;
  fuelPerLap: number;
  fuelMargin: number;

  // ERS State
  ersPercentage: number;
  ersMode: string;
  ersAttackGap: number;
  ersDefendGap: number;

  // Strategy
  pitPlanPrimary: PitPlan;
  pitPlanAlternative: PitPlan;
  pitWindowOpen: boolean;

  // Field Summary
  allDrivers: DriverSummary[];
}
```

#### Prompt Engineering

**Broadcast Mode (18-word limit):**
```
P{position} L{lap}/{total} | Gap +{gap}s to {driver_ahead}
Tires: {compound} {age}L | Fuel: {margin} laps margin
ERS: {percentage}% | {pit_recommendation}
Field: {brief_summary}
Recent: {last_3_broadcasts}
```

**Conversation Mode (Full context):**
- Complete telemetry breakdown
- Detailed tire analysis
- Fuel efficiency scoring
- ERS strategy guidance
- Damage reports
- Historical broadcast context

#### Personality Modes

| Mode | Style | Use Case |
|------|-------|----------|
| Normal | Professional, factual | Serious racing |
| Unhinged | Aggressive, casual | Entertainment |
| Roast | Humorous criticism | Fun sessions |

### 6.2 Lap Prediction Algorithms

**File:** `src/core/accurate_lap_predictor.cpp` (~400 lines)

#### Multi-Factor Prediction Model

```cpp
PredictionResult calculateMultiFactorPrediction(const ProcessedTelemetry& telemetry) {
    // 1. Base pace (average of fuel-corrected best 3 laps)
    float base_pace = calculateBasePace();

    // 2. ERS effect (0.28s per MJ deployed)
    float ersEffect = calculateERSEffect(telemetry);

    // 3. DRS effect (track-specific, 0.25-0.46s)
    float drsEffect = calculateDRSEffect(telemetry);

    // 4. Fuel effect (0.035s per kg)
    float fuelEffect = calculateFuelEffect(current_fuel, next_lap_fuel);

    // 5. Tire degradation (compound-specific curves)
    float tireDeg = calculateTireDegradation(tire_age, compound);

    // 6. Track evolution (linear regression on recent laps)
    float trackEvolution = calculateTrackEvolution();

    // 7. Driver learning curve
    float learning = calculateDriverLearning();

    // Final prediction
    return base_pace + fuelEffect + tireDeg + learning + trackEvolution;
}
```

#### ERS Time Benefit Model

```cpp
static float calculateERSTimeBenefit(
    float deployedThisLap,
    float storeEnergy,
    uint8_t deployMode
) {
    static constexpr float MAX_ERS_MJ = 4.0f;
    static constexpr float TIME_PER_MJ = 0.28f;  // 280ms per MJ

    float efficiency = DEPLOYMENT_EFFICIENCY;
    switch(deployMode) {
        case 0: return 0.0f;              // No deployment
        case 1: efficiency *= 0.7f;  break; // Medium
        case 2: efficiency *= 0.95f; break; // Hotlap
        case 3: efficiency *= 0.9f;  break; // Overtake
    }

    return deployedThisLap * TIME_PER_MJ * efficiency;
}
```

#### DRS Gains by Track (Researched Data)

```cpp
const float trackDRSGains[25] = {
    0.25f,  // Bahrain
    0.42f,  // Saudi Arabia
    0.38f,  // Australia
    0.32f,  // Japan
    0.28f,  // China
    0.35f,  // Miami
    0.22f,  // Monaco (MINIMUM - tight track)
    0.30f,  // Canada
    0.28f,  // Spain
    0.34f,  // Austria
    0.33f,  // Great Britain
    0.29f,  // Hungary
    0.40f,  // Belgium
    0.31f,  // Netherlands
    0.45f,  // Monza (long straights)
    0.29f,  // Singapore
    0.27f,  // Azerbaijan
    0.26f,  // United States
    0.33f,  // Mexico
    0.38f,  // Brazil
    0.46f,  // Las Vegas (MAXIMUM)
    0.30f,  // Qatar
    0.34f,  // Abu Dhabi
};
```

#### Tire Degradation Curves

```cpp
std::map<uint8_t, float> degradationRates = {
    {16, 0.08f},  // C5 (softest) - 80ms/lap
    {17, 0.06f},  // C4 - 60ms/lap
    {18, 0.045f}, // C3 - 45ms/lap
    {19, 0.035f}, // C2 - 35ms/lap
    {20, 0.025f}, // C1 (hardest) - 25ms/lap
    {7,  0.02f},  // Inter - 20ms/lap
    {8,  0.015f}  // Wet - 15ms/lap
};

// Non-linear degradation after 15 laps
float degradation = age * ratePerLap;
if (age > 15.0f) {
    degradation += (age - 15.0f) * 0.02f;  // Accelerated wear
}
```

### 6.3 Pit Strategy Calculator

**File:** `src/core/pit_strategy_calculator.cpp` (~400 lines)

#### Track-Specific Pit Delta Times

```cpp
const float PIT_DELTA_F1_24[25] = {
    24.8f,  // Bahrain
    18.8f,  // Saudi Arabia
    16.9f,  // Australia (FASTEST)
    21.2f,  // Japan
    22.5f,  // China
    25.3f,  // Miami
    20.1f,  // Monaco
    19.8f,  // Canada
    21.7f,  // Spain
    18.5f,  // Austria
    33.6f,  // Great Britain (SLOWEST)
    22.4f,  // Hungary
    22.8f,  // Belgium
    19.6f,  // Netherlands
    26.1f,  // Monza
    29.8f,  // Singapore
    24.2f,  // Azerbaijan
    23.5f,  // United States
    21.9f,  // Mexico
    22.3f,  // Brazil
    25.7f,  // Las Vegas
    24.1f,  // Qatar
    23.8f,  // Abu Dhabi
};
```

#### Three-Option Strategy Planning

```cpp
struct PitStrategyResult {
    // Plan A - Conservative (stay out)
    StrategyPlanOption plan_a;

    // Plan B - Balanced (one-stop)
    StrategyPlanOption plan_b;

    // Plan C - Aggressive (two-stop)
    StrategyPlanOption plan_c;

    // Recommendation
    bool is_advantageous;
    int laps_to_break_even;
    uint8_t cheap_pit_opportunity;  // Safety car detection
};

struct StrategyPlanOption {
    char label[16];
    uint8_t total_stops;
    float projected_total_time;
    float delta_vs_best;
    float confidence;

    struct StopDetail {
        float target_lap;
        float window_open;
        float window_close;
        uint8_t compound_visual;
        float expected_stint_length;
    } stops[3];
};
```

### 6.4 Live Analysis Processor

**File:** `src/core/live_analysis_processor.cpp` (~400 lines)

#### Five Analysis Components

1. **Pace vs Optimal**
   ```cpp
   PaceAnalysis calculatePaceVsOptimal() {
       float optimal = best_s1 + best_s2 + best_s3;
       float projected = current_s1 + current_s2 + current_s3;
       return { delta: projected - optimal };
   }
   ```

2. **Lap Predictions** (with ERS/DRS adjustments)
   - Linear regression on last 5 laps
   - ERS time benefit subtraction
   - DRS time benefit subtraction
   - Temperature penalty calculation
   - Fuel weight penalty

3. **Tire Performance Index**
   ```cpp
   float performance = 100.0f;
   performance -= tempPenalty;     // ±2% per °C from optimal
   performance -= agePenalty;      // Increases after 15 laps
   performance -= wearPenalty;     // Based on max wear
   ```

4. **Consistency Analysis**
   - Standard deviation of fuel-corrected lap times
   - Classification: excellent (95%+), good (85%+), average, poor

5. **Degradation Trend**
   - Linear regression slope (seconds per lap)
   - Classification: improving, stable, degrading
   - Next lap prediction

### 6.5 Voice Integration

#### Whisper Speech-to-Text

- **Model:** ggml-base.en.bin (147MB English model)
- **Implementation:** C++ Whisper.cpp with Node.js bindings
- **Activation:** Push-to-talk (configurable: Space, F1-F4, Ctrl)
- **Processing:** WebM → WAV → Whisper → Text

#### Edge TTS Text-to-Speech

- **Provider:** Microsoft Edge TTS (free)
- **Voice:** en-GB-ThomasNeural (British racing engineer)
- **Service:** Python Flask on port 5001
- **Configuration:** Rate +5%, Pitch -11Hz

#### Voice Command Flow

```
User Press Hotkey → Audio Capture → Whisper STT
                                        ↓
                                 Transcript Text
                                        ↓
                         Race Context + Telemetry Snapshot
                                        ↓
                              OpenAI GPT-4 API Call
                                        ↓
                              Text Response (18 words)
                                        ↓
                              Edge TTS Synthesis
                                        ↓
                              Audio Playback to User
```

---

## 7. Companion Projects

### 7.1 Pits-n-Giggles Python Backend

**Location:** `pits-n-giggles/`

An alternative Python-based telemetry dashboard with unique features.

#### Architecture

- **Framework:** Quart (async Flask) + Socket.IO
- **Pattern:** Lock-free single-writer state management
- **Philosophy:** "Knowing why you crashed is almost as fun as not crashing!"

#### Unique Features Not in Main Dashboard

1. **Tire Wear Extrapolator**
   - Simple linear regression for degradation prediction
   - Adapts to actual driving style
   - Safety car interruption handling

2. **Fuel Rate Recommender**
   - Dynamic consumption models
   - Segment-based analysis
   - Per-lap tracking

3. **Overtake Analyzer**
   - Event detection and logging
   - Historical analysis
   - JSON/CSV export

4. **Collision Analyzer**
   - Impact detection
   - Driver identification
   - Metadata logging

5. **Packet Capture/Replay**
   - Custom F1PktCap format
   - zlib compression
   - Debug replay capability

### 7.2 Tester Recording/Replay System

**Location:** `tester/`

Development utility for testing without running games.

#### Recording (`packet_recorder.cpp`)

```cpp
// File Format
struct F124FileHeader {  // 256 bytes
    char magic[4];       // "F124"
    uint32_t version;    // 1
    uint64_t timestamp;
    char session_name[64];
    char track_name[64];
};

struct F124PacketRecord {  // 8 bytes
    uint32_t timestamp_ms;
    uint16_t packet_size;
    uint8_t packet_id;
    uint8_t reserved;
};
```

#### Replay (`packet_replayer.cpp`)

- Speed control: 0.1x to 10x
- Loop mode for stress testing
- Control file for pause/resume
- Packet statistics display

#### Test Scenarios

| Scenario | Purpose | Packets |
|----------|---------|---------|
| sector_timing_test.f124 | Sector transitions | ~14,400 |
| race_start_5laps.f124 | Position changes | ~21,600 |
| pit_stop_sequence.f124 | Tire changes | ~10,800 |
| weather_change.f124 | Dynamic weather | ~28,800 |
| crash_safety_car.f124 | Yellow flags | ~36,000 |
| high_frequency.f124 | 60Hz stress test | ~7,200 |

#### Web Interface

- **Port:** 8081
- **Features:**
  - Game selection (F1 24, F1 25, AC, ACC)
  - Recording controls
  - Session management
  - Embedded dashboard view
  - Playback controls with speed slider

---

## 8. Data Structures and Protocols

### TelemetryData TypeScript Interface

```typescript
interface TelemetryData {
  // Identification
  game_name?: string;
  timestamp_ms: number;

  // Core Telemetry
  speed_kph: number;
  rpm: number;
  gear: number;
  throttle_percent: number;
  brake_percent: number;
  steering_angle: number;

  // Timing
  current_lap_time: number;
  last_lap_time: number;
  best_lap_time: number;
  sector1_time: number;
  sector2_time: number;
  sector3_time: number;
  current_sector: number;
  position: number;
  current_lap_num: number;

  // Gaps (Real F1 24 Data)
  gap_to_car_ahead?: number;
  gap_to_race_leader?: number;

  // Tires
  tyre_compound_actual: number;
  tyre_compound_visual: number;
  tyre_age_laps: number;
  tyre_wear: number[];
  tyre_surface_temp: number[];
  tyre_inner_temp: number[];
  tyre_pressure: number[];
  brake_temperature: number[];

  // Fuel
  fuel_in_tank: number;
  fuel_remaining_laps: number;
  fuel_mix: number;

  // ERS & DRS
  ers_store_energy: number;
  ers_deploy_mode: number;
  ers_deployed_this_lap: number;
  drs_allowed: number;
  drs_activation_distance: number;

  // Damage
  front_left_wing_damage: number;
  front_right_wing_damage: number;
  rear_wing_damage: number;
  floor_damage: number;
  engine_damage: number;
  gearbox_damage: number;

  // Setup (Packet 5)
  car_setup?: CarSetupData;

  // AI Strategy
  atlas_ai?: AtlasAIData;
}
```

### Multi-Car Data Structure

```typescript
interface MultiCarTelemetryData {
  type: "multicar";
  num_active_cars: number;
  cars: CarData[];
}

interface CarData {
  car_index: number;
  driver_name: string;
  team_id: number;
  position: number;
  current_lap: number;
  gap_to_leader: number;
  gap_to_car_ahead: number;
  tyre_compound: number;
  tyre_age: number;
  fuel_remaining_laps: number;
  pit_status: number;
  penalties: number;
  is_player: number;
  world_position_x: number;
  world_position_y: number;
  world_position_z: number;
}
```

### SSE Message Types

| Type | Frequency | Content |
|------|-----------|---------|
| `telemetry` | 60 Hz | Single-car ProcessedTelemetry |
| `multicar` | 10 Hz | All 22 drivers' data |
| `session` | On change | Session metadata |
| `race_event` | On event | Event code + details |
| `car_setup` | On change | Packet 5 data |
| `tyre_sets` | On change | Packet 12 data |
| `live_analysis` | 10 Hz | Analysis results |

---

## 9. Performance Characteristics

### Backend Performance

| Metric | Value |
|--------|-------|
| Packet Reception | ~60 Hz |
| Data Processing | <1 ms/packet |
| JSON Serialization | ~0.5 ms |
| SSE Broadcast | ~0.1 ms/client |
| Analysis Update | 1 Hz (throttled) |
| Prediction Update | 0.5 Hz |
| Memory Usage | ~15 MB |
| CPU Usage | <5% single core |

### Frontend Performance

| Metric | Value |
|--------|-------|
| State Updates | 60 Hz |
| React Re-renders | 60 Hz (optimized) |
| SSE Message Handling | <1 ms |
| Context Propagation | <1 ms |
| Total Latency | <16 ms (game to display) |

### Network Characteristics

| Path | Latency |
|------|---------|
| UDP → Backend | <1 ms |
| Backend → SSE | <1 ms |
| SSE → Browser | ~5-10 ms |
| Total | <16 ms |

---

## 10. Future ML Integration Points

Atlas Racing is architected to support future machine learning enhancements:

### Recommended ML Integration Areas

1. **Lap Time Prediction Enhancement**
   - Replace linear regression with LSTM/Transformer
   - Train on historical session data
   - Consider track position, traffic, temperature trends

2. **Tire Degradation Modeling**
   - Neural network for non-linear degradation curves
   - Factor in driving style, track temperature, compound
   - Predict cliff points

3. **Optimal Pit Strategy**
   - Reinforcement learning for strategy optimization
   - Consider race dynamics, weather probability
   - Multi-agent modeling for competitor behavior

4. **Driving Style Analysis**
   - Clustering for driver categorization
   - Anomaly detection for mistakes
   - Similarity matching with pro drivers

5. **Real-Time Coaching**
   - Corner-by-corner analysis
   - Throttle/brake optimization suggestions
   - Reference lap comparison

### Data Collection Points

```
Available for ML Training:
├── Per-frame telemetry (60 Hz)
│   ├── Speed, RPM, gear, inputs
│   ├── Tire temps, pressures, wear
│   ├── ERS state, fuel level
│   └── Position, sector times
├── Per-lap aggregates
│   ├── Lap times, sector times
│   ├── Fuel consumption
│   ├── Tire wear delta
│   └── ERS deployment
├── Session metadata
│   ├── Track, weather, session type
│   ├── Car setup
│   └── Competitor data
└── Events
    ├── Pit stops, penalties
    ├── Collisions, track limits
    └── Flag conditions
```

### Suggested Architecture for ML Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│                    Data Collection Layer                     │
│  (SQLite store extended with time-series optimization)      │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                    Feature Engineering                       │
│  • Rolling statistics (5, 10, 20 lap windows)               │
│  • Delta calculations (vs baseline, vs competitors)         │
│  • Track normalization (corner-by-corner)                   │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                    Model Training Pipeline                   │
│  • Offline training on historical sessions                  │
│  • Transfer learning from pro driver data                   │
│  • Continuous improvement with user sessions                │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                    Inference Engine                          │
│  • ONNX Runtime for cross-platform deployment               │
│  • Sub-10ms inference for real-time predictions             │
│  • Fallback to heuristics if model unavailable              │
└─────────────────────────────────────────────────────────────┘
```

---

## 11. Appendices

### A. Build Instructions

#### Backend (C++)

```bash
cd dashboard/backend
mkdir build && cd build
cmake ..
cmake --build . --config Release
```

**Output:**
- `atlas_racing_server.exe` - Multi-game server
- `libatlas_racing_telemetry.a` - Static library

#### Frontend (React/Electron)

```bash
cd dashboard/frontend
npm install
npm start           # Development server (port 3000)
npm run build       # Production build
npm run electron-pack  # Desktop app
```

### B. Configuration Files

#### F1 24 UDP Settings (In-Game)

| Setting | Recommended |
|---------|-------------|
| UDP Telemetry | Enabled |
| UDP Broadcast | Enabled |
| UDP Port | 20777 |
| UDP Send Rate | 60 Hz |
| UDP Format | 2024 |

#### Environment Variables

```env
VITE_BACKEND_URL=http://localhost:8080
VITE_TTS_URL=http://localhost:5001
OPENAI_API_KEY=sk-...
```

### C. Troubleshooting

| Issue | Solution |
|-------|----------|
| No telemetry data | Check F1 24 UDP settings, firewall port 20777 |
| Dashboard not connecting | Ensure backend running on port 8080 |
| AI not responding | Check OpenAI API key, rate limits |
| Voice not working | Verify Whisper model downloaded, TTS service running |
| AC not detected | Windows only, check shared memory permissions |

### D. API Reference

#### SSE Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /telemetry` | Single-car telemetry stream |
| `GET /multicar` | All cars telemetry stream |
| `GET /events` | Race events stream |
| `GET /analysis` | Live analysis stream |

#### HTTP Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/status` | GET | Server status |
| `/api/session` | GET | Current session info |
| `/api/history` | GET | Session history |

---

## Document Metadata

- **Project:** Atlas Racing Telemetry Dashboard
- **Repository:** Local development
- **Primary Language:** C++17, TypeScript, Python
- **License:** Proprietary
- **Documentation Version:** 1.0
- **Total Lines of Code:** ~50,000+
- **Components:** Backend (C++), Frontend (React), AI Services, Companion Apps

---

*This documentation was generated for research paper reference purposes. Atlas Racing represents a comprehensive approach to real-time sim racing telemetry analysis with AI-powered race engineering.*
