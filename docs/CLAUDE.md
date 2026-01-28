# Atlas Racing - LLM Race Engineer Research Project

## Project Overview

Atlas Racing is a real-time telemetry dashboard for F1 24/25 with an integrated LLM Race Engineer. The primary purpose is collecting research data for a paper investigating:

> **"Can Large Language Models effectively serve as AI Race Engineers when provided with structured real-time telemetry context?"**

### Research Goals
1. Evaluate LLM contextual understanding of race strategy
2. Measure pit stop timing accuracy of LLM recommendations
3. Assess driver cognitive load impact
4. Analyze driver trust in LLM-generated advice

### Data Collection Target
- **30 races** at 50% distance
- **~1500 laps** total
- **Two seasons**: Baseline (no AI) vs LLM-assisted

---

## Folder Structure

```
atlas racing/
├── dashboard/                          # Main application
│   ├── backend/                        # C++ telemetry server
│   │   ├── src/
│   │   │   ├── core/
│   │   │   │   ├── udp_receiver.cpp    # UDP listener (port 20777)
│   │   │   │   ├── data_processor.cpp  # Telemetry processing + multi-car data
│   │   │   │   ├── websocket_server.cpp # SSE server (port 8080)
│   │   │   │   └── http_server.cpp     # REST API
│   │   │   ├── f1_24/
│   │   │   │   ├── f1_24_parser.cpp    # All 15 F1 24 packet types
│   │   │   │   └── f1_24_types.h       # Official packet structures
│   │   │   ├── games/ac/              # Assetto Corsa (not used for research)
│   │   │   └── main_unified.cpp       # Main entry point
│   │   ├── include/telemetry/         # Header files
│   │   ├── build/                     # Build output
│   │   │   └── atlas_racing_server.exe # Main executable
│   │   └── CMakeLists.txt
│   │
│   ├── frontend/                       # React dashboard
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── DevModeDashboard.tsx      # Development dashboard
│   │   │   │   ├── GPRaceBoard.tsx           # Race board with track map
│   │   │   │   ├── StrategyPanel.tsx         # Pit strategy display
│   │   │   │   ├── EngineerChat.tsx          # LLM chat interface
│   │   │   │   ├── ResearchReviewPanel.tsx   # Post-race outcome review
│   │   │   │   ├── TrackMapWithDrivers.tsx   # SVG track map
│   │   │   │   └── widgets/                  # 50+ telemetry widgets
│   │   │   ├── hooks/
│   │   │   │   ├── useTelemetry.ts           # SSE telemetry connection
│   │   │   │   ├── useResearchLogger.ts      # Research data collection
│   │   │   │   ├── useEngineerTriggers.ts    # LLM trigger system
│   │   │   │   ├── useLivePitStrategy.ts     # Pit window calculations
│   │   │   │   └── useTyreSets.ts            # Tyre set management
│   │   │   ├── services/
│   │   │   │   ├── llm_engineer.ts           # LLM Race Engineer service
│   │   │   │   └── research_data_exporter.ts # Export to JSON/CSV
│   │   │   ├── utils/
│   │   │   │   └── trackMapUtils.ts          # SVG path parsing
│   │   │   └── data/
│   │   │       └── trackMappings.ts          # Track ID to SVG mapping
│   │   ├── public/
│   │   │   └── resources/f1_2020/            # Track SVG files (22 tracks)
│   │   ├── build/                            # Production build
│   │   └── package.json
│   │
│   ├── run-windows.bat                 # Main launcher (double-click)
│   └── scripts/
│       └── build.bat                   # Build script
│
├── tester/                             # Recording & Replay tools
│   ├── recorder/
│   │   └── packet_recorder_f125.cpp    # F1 25 packet recorder
│   ├── replayer/
│   │   └── packet_replayer_f125.cpp    # F1 25 packet replayer
│   ├── build/
│   │   └── bin/
│   │       ├── packet_recorder_f125.exe
│   │       └── packet_replayer_f125.exe
│   ├── recordings/                     # Recorded sessions (.f125 files)
│   ├── build.bat                       # Build tester tools
│   └── web_interface/                  # Web replay interface
│
└── docs/
    └── CLAUDE.md                       # This file
```

---

## How to Build

### Prerequisites
- **MSYS2** with MinGW64 toolchain
- **Node.js** v18+
- **CMake** 3.15+

### Build Backend

**Important**: On Windows, the build requires proper TEMP directory configuration to avoid "Cannot create temporary file in C:\Windows\" errors.

**Method 1: Using Windows Command Prompt (Recommended)**

Open Command Prompt (cmd.exe) and run:
```cmd
cd dashboard\backend
mkdir build
cd build
set TMPDIR=C:\temp
set TMP=C:\temp
set TEMP=C:\temp
set PATH=C:\msys64\mingw64\bin;C:\msys64\usr\bin;%PATH%
cmake .. -G "Unix Makefiles"
make
```

**Method 2: Using Git Bash / MSYS2 Shell**

```bash
cd dashboard/backend
mkdir -p build && cd build
TMPDIR=/c/temp TMP=/c/temp TEMP=/c/temp PATH="/c/msys64/mingw64/bin:/c/msys64/usr/bin:$PATH" cmake .. -G "Unix Makefiles"
```

Then build with cmd (make doesn't inherit bash env vars properly):
```bash
cmd //c "set TMPDIR=C:\\temp && set TMP=C:\\temp && set TEMP=C:\\temp && set PATH=C:\\msys64\\mingw64\\bin;C:\\msys64\\usr\\bin;%PATH% && make"
```

**Output**:
- `backend/build/atlas_racing_server.exe` - Main unified server
- `backend/build/telemetry_server.exe` - Standalone telemetry server

### Build Frontend

```bash
cd dashboard/frontend
npm install          # First time only
npm run build        # Production build
```

Output: `frontend/build/` (production React app)

### Build Tester Tools

```bash
cd tester
build.bat            # Or: mkdir build && cd build && cmake .. -G "Unix Makefiles" && make
```

Output: `tester/build/bin/packet_recorder_f125.exe` and `packet_replayer_f125.exe`

---

## How to Run

### Running the Dashboard

**Method 1: Double-click `run-windows.bat`**
```
dashboard/run-windows.bat
```

This will:
1. Start the backend server (port 8080)
2. Start React dev server (port 3000)
3. Open browser to http://localhost:3000

**Method 2: Manual Start**
```bash
# Terminal 1 - Backend
cd dashboard/backend/build
atlas_racing_server.exe

# Terminal 2 - Frontend
cd dashboard/frontend
npm start
```

### F1 24/25 Game Setup
In F1 24/25 settings:
- **Telemetry**: UDP Telemetry = On
- **UDP Format**: 2024
- **UDP IP**: 127.0.0.1
- **UDP Port**: 20777
- **UDP Send Rate**: 60Hz (recommended)

---

## Recording & Replaying Sessions

### Recording a Race

**Location:** `tester/build/bin/`

```bash
cd tester/build/bin
packet_recorder_f125.exe -f "bahrain_race_1.f125" -n "Bahrain Race 1"
```

1. Start the recorder
2. Start F1 24/25 and begin your race
3. Race normally - all packets are captured
4. Press Ctrl+C when done
5. File saved to current directory

### Replaying a Recording

```bash
cd tester/build/bin
packet_replayer_f125.exe -f "bahrain_race_1.f125" -s 1.0
```

Options:
- `-s 1.0` - Normal speed
- `-s 2.0` - 2x speed
- `-s 0.5` - Half speed

The dashboard will receive replayed data as if the game was running live.

---

## Current Progress

### Working Features

| Feature | Status | Notes |
|---------|--------|-------|
| F1 24/25 UDP Parsing | Working | All 15 packet types |
| Real-time Telemetry | Working | 60Hz update rate |
| Multi-car Data | Working | All 20 drivers with gaps |
| Track Map (SVG) | Working | 22 tracks available |
| Driver Positions | Working | Live positions on track map |
| Pit Strategy Panel | Working | Plan A/B/C with BOX/PREPARE/HOLD |
| Tire Wear Display | Working | Per-corner wear % |
| LLM Race Engineer | Working | GPT-4o-mini integration |
| Engineer Triggers | Working | 10 decision point types |
| Research Logger | Working | Captures all LLM interactions |
| Research Review Panel | Working | Post-race outcome marking |
| Data Export | Working | JSON + CSV export |
| Packet Recorder | Working | F1 25 format (.f125) |
| Packet Replayer | Working | Variable speed playback |

### Research Components

| Component | Status | File |
|-----------|--------|------|
| Research Logger Hook | Complete | `useResearchLogger.ts` |
| Engineer Trigger System | Complete | `useEngineerTriggers.ts` |
| LLM Service (Stateful) | Complete | `llm_engineer.ts` |
| Data Exporter | Complete | `research_data_exporter.ts` |
| Review Panel UI | Complete | `ResearchReviewPanel.tsx` |

### Not Yet Implemented

| Feature | Priority | Notes |
|---------|----------|-------|
| Research Mode Toggle | High | Needs UI integration in DevModeDashboard |
| Auto lap telemetry logging | High | Per-lap CSV capture |
| Session summary auto-generation | Medium | Auto-generate after race |
| Tire degradation prediction | Low | ML model for pit lap prediction |
| ERS strategy recommendations | Low | Predictive battery management |

---

## Research Data Collection

### Data Files Per Race

**1. LLM Interactions (JSON)**
```json
{
  "raceId": "career_s1_r3_bahrain",
  "interactions": [
    {
      "id": 1,
      "timestamp": "2024-01-15T14:23:45.123Z",
      "lap": 12,
      "triggerType": "pit_window",
      "userInput": "Should I pit now?",
      "llmResponse": "Stay out. Tires good for 6 more laps...",
      "responseLatencyMs": 847,
      "followed": true,
      "outcome": "good",
      "notes": "Pitted lap 19, maintained position"
    }
  ]
}
```

**2. Lap Telemetry (CSV)**
```csv
lap,lap_time,tire_wear_fl,tire_wear_fr,tire_compound,fuel_remaining,position,...
1,92.345,2.1,2.3,Medium,95.2,5,...
```

**3. Race Summary (JSON)**
```json
{
  "raceId": "career_s1_r3_bahrain",
  "track": "Bahrain",
  "startingPosition": 8,
  "finishingPosition": 5,
  "totalLaps": 28,
  "llmInteractionsCount": 12,
  "adviceFollowedRate": 0.83
}
```

### Research Workflow

1. **Start Recording**: Run `packet_recorder_f125.exe`
2. **Enable Research Mode**: Toggle in dashboard (TBD)
3. **Race**: Interact with LLM engineer as needed
4. **Mark Outcomes**: Use Review Panel after each LLM interaction
5. **Export Data**: Click "Export All Data" button
6. **Stop Recording**: Ctrl+C in recorder window

---

## LLM Race Engineer

### Trigger Types (Decision Points)

| Trigger | Priority | Cooldown | Description |
|---------|----------|----------|-------------|
| `pit_window` | High | 5 laps | Pit window opening |
| `pit_window_optimal` | Critical | 3 laps | Optimal pit lap reached |
| `tire_warning` | Medium | 5 laps | Tire wear > 50% |
| `tire_critical` | Critical | 3 laps | Tire wear > 70% |
| `overtake_opportunity` | Medium | 3 laps | Gap to car ahead < 1.0s |
| `undercut_threat` | High | 5 laps | Car behind pitting |
| `position_change` | Medium | 2 laps | Position gained/lost |
| `gap_change` | Low | 5 laps | Gap changed significantly |
| `safety_car` | Critical | 1 lap | SC/VSC deployed |
| `weather_change` | High | 3 laps | Weather conditions changed |

### Strategy Stickiness

The LLM commits to recommendations that persist:
- "Box lap 15" - Tracked until executed or invalidated
- "Stay out until lap 20" - Strategy maintained across queries
- Auto-invalidates if conditions change significantly

---

## Key Files for Research

### Frontend Services
- `services/llm_engineer.ts` - LLM API integration with stateful strategy
- `services/research_data_exporter.ts` - JSON/CSV export functions

### React Hooks
- `hooks/useResearchLogger.ts` - Research data collection state
- `hooks/useEngineerTriggers.ts` - Decision point trigger detection
- `hooks/useLivePitStrategy.ts` - Heuristic pit strategy calculations

### Components
- `components/EngineerChat.tsx` - Chat interface with LLM
- `components/ResearchReviewPanel.tsx` - Post-race outcome review
- `components/StrategyPanel.tsx` - Visual pit strategy display

---

## Troubleshooting

### Dashboard not receiving data
1. Check F1 24/25 UDP settings (port 20777)
2. Verify backend is running (port 8080)
3. Check firewall settings

### Build errors
1. Ensure MSYS2 is in PATH (`C:\msys64\mingw64\bin;C:\msys64\usr\bin`)
2. **"Cannot create temporary file in C:\Windows\"**: Set TEMP vars before building:
   ```cmd
   set TMPDIR=C:\temp && set TMP=C:\temp && set TEMP=C:\temp
   ```
3. Delete `build/` folder and rebuild from scratch
4. Run cmake and make from Windows cmd.exe (not bash) for proper env inheritance

### Tester not recording
1. Start recorder BEFORE starting the game
2. Verify game UDP settings
3. Check file permissions in output directory

---

## Quick Reference

| What | How |
|------|-----|
| Start dashboard | `dashboard/run-windows.bat` |
| Build frontend | `cd dashboard/frontend && npm run build` |
| Build backend | See "Build Backend" section (requires TEMP env setup) |
| Build tester | `cd tester && build.bat` |
| Record race | `tester/build/bin/packet_recorder_f125.exe -f "session.f125"` |
| Replay race | `tester/build/bin/packet_replayer_f125.exe -f "session.f125"` |
| Export data | Click "Export All Data" in Research Review Panel |

---

## Research Timeline

**Week Goal**: 30 races (~1500 laps) of data collection

| Day | Races | Focus |
|-----|-------|-------|
| 1-2 | 5 | Baseline (no AI) |
| 3-5 | 15 | LLM-assisted |
| 6-7 | 10 | Mixed + edge cases |

**Data Analysis Metrics**:
- LLM response relevance (manual review)
- Pit timing accuracy (vs optimal hindsight)
- Advice follow rate
- Position improvement correlation
- Response latency distribution


in TIRES section
it shows perfect info

in Atlas AI | Fuel adn tyre strategy
in tire outlook
Don't understand the deg rate, remaining life does not show anything, stint progress shows 0% always and performance stays 100% always

in Pit window and metrics
I don't understand shit and tyre life is stuck at 999.0 laps
deg rate is at 0.00/lap
tyre performance is stuck at 100%
tyre stint stays 0%