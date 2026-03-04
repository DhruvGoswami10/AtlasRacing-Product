# Atlas Racing - Product Roadmap

**Goal**: Transform Atlas Racing from a research tool into a free, open-source product.
**Created**: February 2026
**Status**: Phase 1 - Clean Ship

---

## Current State Summary

Atlas Racing is a real-time sim racing telemetry dashboard with an AI-powered Race Engineer.
The core pipeline works end-to-end:

```
F1 Game -> UDP :20777 -> C++ Backend -> SSE :8080 -> React Dashboard -> LLM Race Engineer
```

### What Works
- C++ telemetry backend (11.6K lines, production-ready)
- React 18 + TypeScript frontend (34.4K lines, 50+ components)
- F1 24/25 full UDP parsing (16 packet types)
- AI Race Engineer (GPT-4o-mini, strategy tracking, personality modes)
- Broadcasting engine (16 event types, priority queue)
- Assetto Corsa shared memory (144 fields extracted)
- Voice system (Whisper STT + Edge-TTS + ElevenLabs)
- Comprehensive documentation (20+ files)

### What Needs Work
- 0% test coverage
- No CI/CD pipeline
- No Docker containerization
- Windows-only (C++ backend uses Win32 sockets)
- ~15-20% dead/duplicate code
- FloatingAIOverlay disconnected from real services
- DevModeDashboard is a 140KB monolith
- No first-run setup experience

---

## Phase 1: Clean Ship (1-2 weeks)

**Goal**: A codebase someone can clone, build, and run without confusion.

### 1.1 Dead Code Cleanup
- Remove `simple_websocket.cpp` (legacy, replaced by SSE)
- Remove duplicate type definitions (TelemetryData in FloatingAIOverlay)
- Remove unused services (`ai_context_manager.ts`, `event_driven_ai.ts`, `AIDashboard.tsx`)
- Remove `.bak` files and unnecessary duplicates
- Remove broken widgets (`ACMistakeDetectionWidget.tsx`)

### 1.2 Split DevModeDashboard
- Break the 140KB / 4000+ line monolith into sub-components
- Telemetry panel, packet inspector, service health, test buttons
- Each sub-component should be maintainable independently

### 1.3 First-Run Experience
- Setup wizard or clear CLI prompts for configuration
- OpenAI API key setup (optional - AI features disabled without it)
- Game selection (F1 24/25 or Assetto Corsa)
- Clear feedback when game is not running or not sending data

### 1.4 README Overhaul
- Add screenshots and GIF demos of the dashboard in action
- Feature list with status badges
- Troubleshooting FAQ for common issues
- Link to detailed docs for each component

### 1.5 Community Files
- CONTRIBUTING.md with development setup, code style, PR process
- Issue templates (bug report, feature request)
- Pull request template
- CODE_OF_CONDUCT.md

### 1.6 LICENSE Verification
- MIT License already present
- Verify all dependency licenses are compatible
- Add license headers if needed

---

## Phase 2: Quality & Trust (2-3 weeks)

**Goal**: Users and contributors can trust the software won't break.

### 2.1 Test Suite
- Unit tests for critical frontend services
  - `llm_engineer.ts`, `broadcasting_engine.ts`, `sse.ts`, `race_context.ts`
- C++ backend packet parsing tests
- Integration tests for SSE streaming

### 2.2 GitHub Actions CI
- Lint and type-check on every pull request
- Run tests automatically
- Build both backend and frontend
- Block merging if checks fail

### 2.3 Code Quality Enforcement
- ESLint + Prettier configuration
- Pre-commit hooks (husky + lint-staged)
- Consistent code style across all files

### 2.4 Error Handling
- React error boundaries (widget crash doesn't kill dashboard)
- Health endpoint on C++ backend (`/health`)
- Connection status indicators in UI
- Graceful degradation when services are unavailable

---

## Phase 3: Accessibility & Reach (3-4 weeks)

**Goal**: Anyone on any platform can use Atlas Racing.

### 3.1 Cross-Platform Backend
- Implement Linux/macOS socket layer (POSIX sockets)
- Cross-platform build system (CMake already supports this)
- Platform-specific launchers

### 3.2 Docker Compose
- One command to run everything: `docker-compose up`
- Separate containers for backend and frontend
- Volume mounts for configuration

### 3.3 Electron Installer
- Polish electron-builder configuration
- Test NSIS installer (Windows)
- DMG for macOS, AppImage for Linux
- Auto-update mechanism

### 3.4 LLM Provider Flexibility
- Ollama support (local, free, no API key needed)
- Claude API support
- Provider selection in settings UI
- Graceful fallback if no LLM configured

---

## Phase 4: Community & Growth (ongoing)

**Goal**: Build a thriving open-source community.

### 4.1 Feature Completion
- Wire FloatingAIOverlay to real AI/voice services
- Complete Assetto Corsa dashboard widgets
- Replay mode for post-race analysis

### 4.2 Extensibility
- Plugin/widget system for custom dashboards
- More game support (ACC, iRacing, rFactor 2)
- Theme customization

### 4.3 Community
- GitHub Discussions or Discord server
- Share setups, strategy profiles, dashboard layouts
- Contributor recognition

---

## Architecture Reference

```
atlas-racing/
  dashboard/
    backend/          C++ telemetry server (UDP + SSE)
    frontend/         React 18 + TypeScript dashboard
    integrations/     Game-specific bridges (AtlasLink for AC)
  tester/             Packet recorder/replayer for testing
  tools/              Utility scripts
  docs/               All documentation
  .github/            CI/CD workflows (Phase 2)
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | C++17 (CMake, MSYS2/MinGW64) |
| Frontend | React 18, TypeScript 4.9, Tailwind CSS, Radix UI |
| State | Zustand, React Context |
| AI | OpenAI GPT-4o-mini (extensible) |
| Voice | Whisper STT, Edge-TTS, ElevenLabs |
| Desktop | Electron 23 (optional) |
| Streaming | Server-Sent Events (SSE) |
