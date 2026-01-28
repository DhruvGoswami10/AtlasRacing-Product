# F1 24 Dashboard

A high-performance, real-time telemetry dashboard for F1 24 with native macOS support. Built with C++ backend for zero-latency UDP processing and React frontend for modern UI.

## 🚀 Quick Start

### Prerequisites
- macOS (tested on macOS 12+)
- F1 24 Game
- Homebrew (for dependencies)

### Installation
```bash
# Clone the repository
git clone <repository-url>
cd dashboard

# Run setup script (installs dependencies and builds)
./scripts/setup.sh

# Or manually install dependencies
brew install cmake node nlohmann-json spdlog sqlite3 boost
```

### Running the Dashboard

**Full Dashboard (Recommended)**
```bash
./scripts/run.sh
```

**Development Mode Options**
```bash
# Backend only (C++ telemetry server)
./scripts/run.sh --backend-only

# Frontend only (React app)
./scripts/run.sh --frontend-only

# Web version (no Electron)
./scripts/run.sh --no-electron

# Production mode (requires build)
./scripts/run.sh --production
```

**Manual Component Start**
```bash
# Start backend manually
cd backend/build
./telemetry_server

# Start frontend manually
cd frontend
npm start
```

### F1 24 Game Setup

**Important**: Configure F1 24 before running the dashboard:

1. Open F1 24 → **Settings** → **Telemetry Settings**
2. Set **UDP Telemetry** to **On**
3. Set **UDP Port** to **20777**
4. Set **UDP Format** to **2024**
5. Set **UDP Send Rate** to **60Hz** (recommended)
6. Set **UDP IP Address** to **127.0.0.1** (localhost)

## 🏗️ Architecture

### Data Flow
```
F1 24 Game → UDP :20777 → C++ Backend → WebSocket :8080 → React Frontend :3000
```

### Port Configuration
- **20777**: F1 24 UDP telemetry input
- **8080**: WebSocket server for real-time data streaming
- **3000**: React development server (frontend)

### Components
- **Backend**: C++ telemetry engine for UDP parsing and WebSocket streaming
- **Frontend**: React dashboard with real-time widgets
- **Electron**: Native macOS app wrapper

## 📁 Project Structure

```
dashboard/
├── backend/                    # C++ telemetry engine
│   ├── src/core/              # Core UDP and WebSocket functionality
│   ├── src/f1_24/             # F1 24 specific parsing
│   ├── include/telemetry/     # Header files
│   └── build/                 # Compiled executables
├── frontend/                   # React dashboard
│   ├── src/components/        # React components
│   ├── src/widgets/           # Dashboard widgets
│   ├── electron/              # Electron wrapper
│   └── build/                 # Production build
├── scripts/                   # Build and run scripts
├── resources/                 # F1 24 spec and designs
└── ai/                        # AI assistants (future)
```

## 🔧 Development

### Building the Project
```bash
# Build both backend and frontend
./scripts/build.sh

# Build with packaging
./scripts/build.sh --package

# Build with tests
./scripts/build.sh --test
```

### Development Workflow
```bash
# 1. Start backend in development mode
cd backend/build
./telemetry_server

# 2. Start frontend in development mode
cd frontend
npm start

# 3. Start F1 24 and begin racing
```

### Available npm Scripts (Frontend)
```bash
npm start          # Start development server
npm run build      # Build for production
npm test           # Run tests
npm run electron   # Start Electron app
npm run electron-dev # Start Electron with dev server
```

## 🐛 Debugging

### Common Issues

**Backend Not Starting**
```bash
# Check if backend executable exists
ls -la backend/build/telemetry_server

# If not found, rebuild
./scripts/build.sh

# Check port availability
lsof -i :20777
lsof -i :8080
```

**Frontend Not Connecting**
```bash
# Check if backend is running
curl http://localhost:8080/health

# Check WebSocket connection
curl -H "Upgrade: websocket" http://localhost:8080/ws
```

**F1 24 Not Sending Data**
```bash
# Test UDP port
nc -u -l 20777  # Listen on UDP port
# Then start F1 24 - you should see data

# Check F1 24 telemetry settings
# Ensure UDP is enabled and port is 20777
```

**React Development Server Issues**
```bash
# Clear npm cache
npm cache clean --force

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install

# Check port 3000 availability
lsof -i :3000
```

### Debug Mode

**Backend Debug Mode**
```bash
# Build in debug mode
cd backend/build
cmake .. -DCMAKE_BUILD_TYPE=Debug
make

# Run with debugging
./telemetry_server --verbose
```

**Frontend Debug Mode**
```bash
# Start with debug logging
REACT_APP_DEBUG=true npm start

# Open browser dev tools
# WebSocket messages are logged to console
```

**Electron Debug Mode**
```bash
# Enable dev tools
npm run electron-dev

# Or manually
ELECTRON_IS_DEV=1 npm run electron
```

### Monitoring

**Real-time Monitoring**
```bash
# Monitor UDP traffic
sudo tcpdump -i lo0 -n udp port 20777

# Monitor WebSocket connections
netstat -an | grep 8080

# Monitor system resources
htop
```

**Log Files**
- Backend logs: `backend/build/telemetry.log`
- Frontend logs: Browser console
- Electron logs: `~/Library/Logs/f1-24-dashboard/`

### Performance Debugging

**Backend Performance**
```bash
# Profile with instruments (macOS)
xcrun xctrace record --template "Time Profiler" --launch -- ./telemetry_server

# Check memory usage
ps aux | grep telemetry_server
```

**Frontend Performance**
```bash
# React profiler
npm install --save-dev @welldone-software/why-did-you-render

# Bundle analysis
npm run build
npx webpack-bundle-analyzer build/static/js/*.js
```

## 🔍 Troubleshooting

### Network Issues
```bash
# Reset network stack
sudo dscacheutil -flushcache
sudo killall -HUP mDNSResponder

# Check firewall
sudo pfctl -s rules | grep 20777
```

### Port Conflicts
```bash
# Kill processes on ports
./scripts/run.sh  # Script handles port cleanup automatically

# Manual port cleanup
lsof -ti:20777 | xargs kill
lsof -ti:8080 | xargs kill
lsof -ti:3000 | xargs kill
```

### Build Issues
```bash
# Clean build
rm -rf backend/build frontend/build
./scripts/build.sh

# Check dependencies
brew list | grep -E "cmake|node|nlohmann|spdlog|sqlite|boost"
```

## 📊 Widget Development

### Adding New Widgets
1. Create widget component in `frontend/src/components/widgets/`
2. Add widget to `frontend/src/components/widgets/index.ts`
3. Include in dashboard layout JSON files
4. Add telemetry data mapping in `useTelemetry.ts`

### Widget Structure
```typescript
interface Widget {
  id: string;
  name: string;
  component: React.ComponentType<WidgetProps>;
  defaultProps?: any;
  dependencies: string[]; // Required telemetry data
}
```

## 🎮 Usage

### Racing Session
1. **Start Dashboard**: `./scripts/run.sh`
2. **Configure F1 24**: Set UDP telemetry to port 20777
3. **Start F1 24**: Begin practice/qualifying/race session
4. **Monitor**: Real-time telemetry appears in dashboard
5. **Analyze**: Review session data and performance metrics

### Keyboard Shortcuts (Electron)
- `Cmd+R`: Reload dashboard
- `Cmd+Shift+R`: Hard reload
- `F12`: Toggle developer tools
- `Cmd+Q`: Quit application

### Dashboard Layouts
- **Minimal**: Essential telemetry only
- **Professional**: Full pit wall view
- **Custom**: Create your own layout

## 🚧 Known Limitations

- macOS only (Windows/Linux support planned)
- F1 24 specific (other games planned)
- No multiplayer session support yet
- Limited historical data storage

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Test with F1 24
4. Submit pull request

## 📄 License

MIT License - see LICENSE file for details

## 🔗 Links

- [F1 24 Telemetry Documentation](resources/Data%20Output%20from%20F1%2024%20v27.2x.txt)
- [Dashboard Design Mockups](resources/dashboard-designs/)
- [Project Context](claude.md)

## 📞 Support

For issues and questions:
1. Check this README's troubleshooting section
2. Review logs in debug mode
3. Create GitHub issue with logs and system info