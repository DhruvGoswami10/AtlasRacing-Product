# Changelog

All notable changes to Atlas Racing will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- First-run setup guide on the dashboard selection screen
- CONTRIBUTING.md, CODE_OF_CONDUCT.md, and issue/PR templates
- Product roadmap documentation (docs/PRODUCT_ROADMAP.md)

### Changed
- Split DevModeDashboard (2,872 lines) into 6 focused sub-components
- Overhauled README with screenshots, troubleshooting, and architecture docs

### Removed
- Dead code: `simple_websocket.cpp` (replaced by SSE), `F1DashboardV2.tsx` (unused concept)

## [0.1.0] - 2026-02-28

### Added
- Core telemetry pipeline: F1 24/25 UDP parsing (16 packet types) via C++ backend
- SSE streaming from backend to React frontend
- 5 dashboards: F1 Pro, Endurance, Live Analysis, Race Director, Dev Mode
- AI Race Engineer with GPT-4o-mini (pit strategy, tyre advice, ERS management)
- Broadcasting engine with 16 event types (safety car, weather, battles)
- Assetto Corsa support via AtlasLink shared memory bridge (144 fields)
- Voice system: Whisper STT + Edge-TTS / ElevenLabs
- Standalone mode (no auth required)
