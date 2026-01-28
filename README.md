# Atlas Racing

Real-time F1 telemetry dashboard with an AI-powered race engineer. Built for F1 24/25 with research capabilities to study human-AI collaboration in motorsport strategy.

## Features

- **Real-time Telemetry Dashboard**: Live tire wear, fuel, ERS, lap times, gaps, and weather data
- **LLM Race Engineer**: AI strategist that provides pit strategy, weather calls, and ERS management
- **Research Mode**: Structured data collection for studying human-AI decision making
- **Broadcasting Engine**: Automated race event detection (safety cars, battles, weather changes)

## Quick Start

### Prerequisites
- Windows 10/11 (macOS support available)
- F1 24 or F1 25 game
- Node.js 18+
- OpenAI API key (for LLM features)

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/atlas-racing.git
cd atlas-racing

# Install frontend dependencies
cd dashboard/frontend
npm install

# Configure environment
cp .env.example .env.local
# Edit .env.local and add your OpenAI API key

# Start the dashboard
npm start
```

### F1 Game Setup

1. Open F1 24/25 → **Settings** → **Telemetry Settings**
2. Set **UDP Telemetry** to **On**
3. Set **UDP Port** to **20777**
4. Set **UDP Format** to **2024** (or 2025)
5. Set **UDP Send Rate** to **60Hz**
6. Set **UDP IP Address** to **127.0.0.1**

## Architecture

```
F1 Game → UDP :20777 → Python Bridge → WebSocket :8080 → React Dashboard
                                                              ↓
                                                    LLM Race Engineer (OpenAI)
                                                              ↓
                                                    Research Data Logger
```

### Key Components

| Component | Description |
|-----------|-------------|
| `dashboard/frontend/` | React dashboard with telemetry widgets |
| `services/llm_engineer.ts` | LLM race engineer with strategy prompts |
| `services/broadcasting_engine.ts` | Event detection (SC, weather, battles) |
| `services/research_logger.ts` | Research data collection and export |
| `dashboard/integrations/AtlasLink/` | Python UDP bridge for F1 telemetry |

## Research Mode

Atlas Racing includes a research data collection system for studying human-AI collaboration in motorsport strategy decisions.

### Data Collection

When research mode is enabled (LLM season type), the system captures:

- **Per-lap telemetry**: Position, gaps, tire wear, fuel, ERS, weather
- **LLM interactions**: Every AI call with context, response, and latency
- **Strategy decisions**: Pit stops, compound changes, followed/overridden status
- **Post-race review**: Driver feedback on AI recommendation quality

### Export Format

```
research_data/
├── S1_llm_R1_Interlagos_lap_telemetry.csv    # Per-lap data
├── S1_llm_R1_Interlagos_llm_interactions.json # All LLM calls
└── S1_llm_R1_Interlagos_race_summary.json    # Race metadata
```

### Research Protocol

1. **Control races** (Season Type: Control): No AI, driver makes all decisions
2. **LLM races** (Season Type: LLM): AI provides strategy, driver can follow or override
3. Compare performance and decision quality between conditions

## Development

### Project Structure

```
atlas-racing/
├── dashboard/
│   ├── frontend/          # React app
│   │   ├── src/
│   │   │   ├── components/    # UI components
│   │   │   ├── hooks/         # React hooks
│   │   │   ├── services/      # Core services
│   │   │   └── widgets/       # Dashboard widgets
│   │   └── .env.example
│   └── integrations/      # Game integrations
├── docs/                  # Documentation
├── research_data/         # Exported research data
└── tools/                 # Utility scripts
```

### Running in Development

```bash
cd dashboard/frontend
npm start                  # Start React dev server on :3000
```

### Building for Production

```bash
cd dashboard/frontend
npm run build
```

## Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `REACT_APP_OPENAI_API_KEY` | OpenAI API key for LLM engineer | Yes (for AI) |
| `REACT_APP_OPENAI_MODEL` | Model to use (default: gpt-4o-mini) | No |
| `REACT_APP_SUPABASE_URL` | Supabase URL for cloud features | No |
| `REACT_APP_SUPABASE_ANON_KEY` | Supabase anonymous key | No |

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see [LICENSE](LICENSE) for details.

## Acknowledgments

- F1 24/25 telemetry specification by Codemasters/EA Sports
- Built with React, TypeScript, and Tailwind CSS
- AI powered by OpenAI GPT models

## Support

For issues and questions, please [open an issue](https://github.com/yourusername/atlas-racing/issues).
