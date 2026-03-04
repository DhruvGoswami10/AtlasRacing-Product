# Contributing to Atlas Racing

Thanks for your interest in contributing! This guide covers everything you need to get started.

## Development Setup

### Prerequisites

- **Windows 10/11** (backend uses Win32 sockets for now)
- **Node.js 18+** — [download](https://nodejs.org/)
- **MSYS2/MinGW64** — for building the C++ backend
- **Git**

### Getting the code

```bash
git clone https://github.com/DhruvGoswami10/AtlasRacing-Product.git
cd AtlasRacing-Product
```

### Frontend

```bash
cd dashboard/frontend
npm install
npm start          # development server on :3000
```

### Backend

```bash
cd dashboard/backend
mkdir build && cd build
cmake .. -G "MinGW Makefiles"
cmake --build . --config Release
./atlas_backend.exe   # SSE server on :8080
```

### Running both together

```bash
# From dashboard/ directory:
run-windows.bat
```

## Project Structure

```
dashboard/
├── backend/           # C++17 telemetry server
│   └── src/
│       ├── core/      # SSE server, packet parsing
│       ├── parsers/   # F1 UDP packet parsers
│       └── main.cpp
├── frontend/          # React 18 + TypeScript
│   └── src/
│       ├── components/   # UI components (50+)
│       ├── services/     # LLM engineer, broadcasting, SSE client
│       ├── context/      # Auth, telemetry providers
│       ├── hooks/        # Custom hooks
│       └── utils/        # Helpers and converters
└── integrations/      # Game bridges (AtlasLink for AC)
```

## Making Changes

### Branch naming

- `feat/short-description` — new features
- `fix/short-description` — bug fixes
- `docs/short-description` — documentation changes
- `refactor/short-description` — code refactoring

### Commit messages

Use clear, concise commit messages that describe **what** changed and **why**:

```
Add tyre degradation chart to F1 dashboard

Display real-time tyre wear trends using the last 10 laps of data.
Helps drivers identify degradation cliffs before they happen.
```

### Code style

- **TypeScript**: Follow the existing patterns in the codebase. We use TypeScript strict mode.
- **React**: Functional components with hooks. No class components.
- **CSS**: Tailwind CSS utility classes. Avoid custom CSS files.
- **C++**: C++17 standard. Follow the formatting in existing files.

### Before submitting

1. Make sure `npx tsc --noEmit` passes with no errors
2. Make sure `npm run build` succeeds
3. Test your changes with a live game session if possible

## Pull Request Process

1. Fork the repo and create your branch from `main`
2. Make your changes in focused, logical commits
3. Update documentation if your change affects the user experience
4. Open a PR with a clear title and description
5. Fill in the PR template — describe what changed and how to test it

### PR title format

- `feat: Add lap delta chart` — new feature
- `fix: Correct tyre temp display for AC` — bug fix
- `docs: Update game setup instructions` — documentation
- `refactor: Split DevMode into sub-components` — refactoring

## Reporting Issues

- **Bugs**: Use the [Bug Report](.github/ISSUE_TEMPLATE/bug_report.md) template
- **Features**: Use the [Feature Request](.github/ISSUE_TEMPLATE/feature_request.md) template
- Include your OS version, game, and steps to reproduce

## Getting Help

- Open a [Discussion](../../discussions) for questions
- Check existing issues before opening a new one
- Be specific — include error messages, screenshots, and steps to reproduce
