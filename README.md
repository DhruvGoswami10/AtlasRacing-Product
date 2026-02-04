# Atlas Racing — Research Project

Real-time F1 telemetry dashboard with an AI-powered LLM Race Engineer. Built for EA Sports F1 25 and used in a research study on human-AI collaboration in motorsport strategy.

This repository contains the **research version** of Atlas Racing, including 50 races of collected data across 5 participants. For details on the research findings, see [research_data/ANSWER!!.md](research_data/ANSWER!!.md) and [research_data/Research Overview for Supervisor.md](research_data/Research%20Overview%20for%20Supervisor.md).

## Features

- **Real-time Telemetry Dashboard**: Live tyre wear, fuel, ERS, lap times, gaps, and weather data via UDP
- **LLM Race Engineer**: AI strategist (OpenAI GPT) providing pit strategy, ERS management, and tactical advice
- **Research Mode**: Structured data collection for studying human-AI decision making
- **Broadcasting Engine**: Automated race event detection (safety cars, battles, weather changes)
- **Multiple Dashboards**: F1 Pro, GT Endurance, Live Race Analysis, GP Race Board, Dev Mode

## Quick Start

### Prerequisites

- Windows 10/11
- EA Sports F1 24 or F1 25
- [Node.js 18+](https://nodejs.org/)
- OpenAI API key (optional — required only for AI Race Engineer features)
- Pre-compiled backend included (`dashboard/backend/build/atlas_racing_server.exe`)

### Installation

```bash
# Clone the repository
git clone https://github.com/DhruvGoswami10/AtlasRacing-Research-Project-.git
cd AtlasRacing-Research-Project-

# Install frontend dependencies
cd dashboard/frontend
npm install

# Configure environment (optional — for AI features)
cp .env.example .env.local
# Edit .env.local and add your OpenAI API key:
#   REACT_APP_OPENAI_API_KEY=sk-your-key-here
```

### Running

**Option 1: Using the launcher (recommended)**
```bash
# From the dashboard/ folder:
run-windows.bat
```
This starts the backend server and frontend automatically.

**Option 2: Manual**
```bash
# Terminal 1: Start backend
cd dashboard/backend/build
atlas_racing_server.exe

# Terminal 2: Start frontend
cd dashboard/frontend
npm start
```

The dashboard opens at `http://localhost:3000`. It works without an OpenAI key — you just won't have the AI Race Engineer features.

### F1 Game Setup

1. Open F1 24/25 → **Settings** → **Telemetry Settings**
2. Set **UDP Telemetry** to **On**
3. Set **UDP Port** to **20777**
4. Set **UDP Format** to **2024** (or 2025)
5. Set **UDP Send Rate** to **60Hz**
6. Set **UDP IP Address** to **127.0.0.1**

## Architecture

```
F1 25 Game → UDP :20777 → C++ Backend → SSE :8080 → React Dashboard
                                                          ↓
                                                 LLM Race Engineer (OpenAI)
                                                          ↓
                                                 Research Data Logger
```

### Key Components

| Component | Description |
|-----------|-------------|
| `dashboard/backend/` | C++ telemetry server (UDP parsing, SSE streaming) |
| `dashboard/frontend/` | React dashboard with telemetry widgets |
| `dashboard/frontend/src/services/llm_engineer.ts` | LLM race engineer with strategy prompts |
| `dashboard/frontend/src/services/broadcasting_engine.ts` | Event detection (SC, weather, battles) |
| `dashboard/frontend/src/services/research_logger.ts` | Research data collection and export |
| `dashboard/integrations/AtlasLink/` | Assetto Corsa bridge integration |

## Research Data

The `research_data/` folder contains data from 50 races across 5 participants (902 laps, 1,415 LLM interactions, 22,300+ telemetry data points). See:

- **[ANSWER!!.md](research_data/ANSWER!!.md)** — Full research findings with data tables and ERS telemetry evidence
- **[Research Overview for Supervisor.md](research_data/Research%20Overview%20for%20Supervisor.md)** — Plain-language summary for non-specialist readers

### Data Structure

```
research_data/
├── Phase-1/          (P0: 10 pilot races, 100% distance)
│   └── Race-1/ ... Race-10/
│       ├── *_lap_telemetry.csv
│       ├── *_llm_interactions.json
│       └── *_race_summary.json
└── Phase-2/          (P1-P4: 40 study races, 50% distance)
    ├── P1/ (Race-1 to Race-10)
    ├── P2/ (Race-1 to Race-10)
    ├── P3/ (Race-1 to Race-10)
    └── P4/ (Race-1 to Race-10)
```

## Configuration

| Variable | Description | Required |
|----------|-------------|----------|
| `REACT_APP_OPENAI_API_KEY` | OpenAI API key for LLM engineer | No (AI features disabled without it) |
| `REACT_APP_OPENAI_MODEL` | Model to use (default: `gpt-4o-mini`) | No |
| `REACT_APP_SUPABASE_URL` | Supabase URL (cloud auth — not needed for standalone use) | No |
| `REACT_APP_SUPABASE_ANON_KEY` | Supabase anonymous key | No |

## Tech Stack

- **Backend**: C++17 (UDP parsing, real-time processing, SSE streaming)
- **Frontend**: React 18, TypeScript, Tailwind CSS, Radix UI
- **AI**: OpenAI GPT-4o-mini via API
- **Desktop**: Electron (optional)
- **Data**: Per-lap CSV telemetry, JSON interaction logs, JSON race summaries

## License

MIT License - see [LICENSE](LICENSE) for details.

## Acknowledgments

- F1 24/25 UDP telemetry specification by Codemasters/EA Sports
- AI powered by OpenAI GPT models via Anthropic Claude for research analysis
- Built with React, TypeScript, and Tailwind CSS
