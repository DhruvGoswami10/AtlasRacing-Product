# Atlas Racing

Real-time sim racing telemetry dashboard with an AI-powered Race Engineer. Supports EA Sports F1 24/25 and Assetto Corsa.

## Features

- **Real-time Telemetry**: Live tyre wear, fuel, ERS, lap times, gaps, and weather data via UDP
- **AI Race Engineer**: LLM-powered strategist (OpenAI GPT) providing pit strategy, ERS management, and tactical advice
- **Broadcasting Engine**: Automated race event detection — safety cars, battles, weather changes, tyre warnings
- **Multiple Dashboards**: F1 Dashboard, Endurance Dashboard, Live Race Analysis, Race Director, Dev Mode
- **Multi-Game Support**: F1 24/25 via UDP, Assetto Corsa via AtlasLink shared memory bridge

## Quick Start

### Prerequisites

- Windows 10/11
- EA Sports F1 24 or F1 25 (or Assetto Corsa with AtlasLink)
- [Node.js 18+](https://nodejs.org/)
- OpenAI API key (optional — only needed for AI Race Engineer)

### Installation

```bash
git clone https://github.com/DhruvGoswami10/AtlasRacing-Product.git
cd AtlasRacing-Product

cd dashboard/frontend
npm install
```

### Running

**Option 1: Launcher (recommended)**
```bash
# From the dashboard/ folder:
run-windows.bat
```

**Option 2: Manual**
```bash
# Terminal 1: Start backend
cd dashboard/backend/build
atlas_racing_server.exe

# Terminal 2: Start frontend
cd dashboard/frontend
npm start
```

The dashboard opens at `http://localhost:3000`.

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
                                                 AI Race Engineer (OpenAI)
```

### Key Components

| Component | Description |
|-----------|-------------|
| `dashboard/backend/` | C++ telemetry server (UDP parsing, SSE streaming) |
| `dashboard/frontend/` | React dashboard with telemetry widgets |
| `dashboard/frontend/src/services/llm_engineer.ts` | AI race engineer with strategy prompts |
| `dashboard/frontend/src/services/broadcasting_engine.ts` | Event detection (SC, weather, battles) |
| `dashboard/integrations/AtlasLink/` | Assetto Corsa shared memory bridge |

## Configuration

| Variable | Description | Required |
|----------|-------------|----------|
| `REACT_APP_OPENAI_API_KEY` | OpenAI API key for AI Race Engineer | No (AI features disabled without it) |
| `REACT_APP_OPENAI_MODEL` | Model to use (default: `gpt-4o-mini`) | No |

## Tech Stack

- **Backend**: C++17 (UDP parsing, real-time processing, SSE streaming)
- **Frontend**: React 18, TypeScript, Tailwind CSS, Radix UI
- **AI**: OpenAI GPT-4o-mini via API
- **Desktop**: Electron (planned)

## License

MIT License - see [LICENSE](LICENSE) for details.
