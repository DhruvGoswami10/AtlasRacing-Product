# Atlas Racing Dashboard - Windows Setup Guide

This guide provides step-by-step instructions for setting up the Atlas Racing Dashboard on Windows with full support for both F1 24 and Assetto Corsa.

## 🎯 Overview

Windows is the **primary platform** for Atlas Racing Dashboard because:
- **Full Game Support**: Both F1 24 and Assetto Corsa work perfectly
- **AC Shared Memory**: Only available on Windows
- **Network Hub**: Acts as telemetry bridge for other devices
- **Optimal Performance**: Best gaming and telemetry experience

## 🛠️ Prerequisites

### Required Software
- **Windows 10** (version 1909 or later) or **Windows 11**
- **Visual Studio 2019** or **Visual Studio 2022** with C++ development tools
- **CMake 3.15** or later
- **Git for Windows**
- **Node.js 18** or later
- **vcpkg** (for C++ package management)

### Optional but Recommended
- **Visual Studio Code** for frontend development
- **Windows Terminal** for better command line experience
- **Windows Subsystem for Linux (WSL)** for additional dev tools

## 📦 Step-by-Step Installation

### 1. Install Development Environment

#### Visual Studio 2022 (Recommended)
1. Download **Visual Studio 2022 Community** (free)
2. During installation, select:
   - **Desktop development with C++** workload
   - **CMake tools for Visual Studio**
   - **Git for Windows** (if not already installed)
   - **Windows 10/11 SDK** (latest version)

#### CMake Installation
```powershell
# Option 1: Download from cmake.org
# Option 2: Via Chocolatey (if installed)
choco install cmake

# Option 3: Via winget
winget install Kitware.CMake
```

#### Node.js Installation
```powershell
# Option 1: Download from nodejs.org
# Option 2: Via Chocolatey
choco install nodejs

# Option 3: Via winget
winget install OpenJS.NodeJS
```

### 2. Install vcpkg (C++ Package Manager)

```powershell
# Clone vcpkg
git clone https://github.com/Microsoft/vcpkg.git C:\vcpkg

# Bootstrap vcpkg
cd C:\vcpkg
.\bootstrap-vcpkg.bat

# Integrate with Visual Studio
.\vcpkg integrate install

# Install required packages
.\vcpkg install sqlite3:x64-windows
```

### 3. Clone and Build Atlas Racing Dashboard

```powershell
# Clone the repository
git clone <repository-url> C:\AtlasRacing
cd C:\AtlasRacing\dashboard

# Build the project
.\scripts\build.sh

# Or manually build:
mkdir backend\build
cd backend\build
cmake .. -DCMAKE_TOOLCHAIN_FILE=C:\vcpkg\scripts\buildsystems\vcpkg.cmake
cmake --build . --config Release
```

### 4. Install Frontend Dependencies

```powershell
# Install npm dependencies
cd frontend
npm install

# Build frontend (optional, for production)
npm run build
```

## 🚀 Running the Dashboard

### Quick Start
```powershell
# From the dashboard root directory
.\scripts\run.sh

# Or run components separately:
.\scripts\run.sh --backend-only    # Backend only
.\scripts\run.sh --no-electron     # Web version
```

### Manual Start
```powershell
# Start backend
cd backend\build
.\atlas_racing_server.exe

# Start frontend (new terminal)
cd frontend
npm start

# Start Electron app (new terminal)
cd frontend
npm run electron-dev
```

## 🎮 Game Setup

### F1 24 Configuration
1. **Launch F1 24**
2. **Go to Settings → Telemetry Settings**
3. **Configure as follows**:
   - UDP Telemetry: **ON**
   - UDP IP Address: **127.0.0.1**
   - UDP Port: **20777**
   - UDP Send Rate: **60Hz**
   - UDP Format: **2024**
4. **Start any session** (Practice, Qualifying, Race)

### Assetto Corsa Configuration
1. **Launch Assetto Corsa** (Steam, Content Manager, or any launcher)
2. **Start any session type**:
   - Practice
   - Race
   - Hotlap
   - Time Attack
   - Drift
3. **No additional setup required** - Dashboard connects automatically

## 🔧 Windows-Specific Features

### AC Shared Memory Integration
- **Automatic Detection**: Scans for `acs.exe` process
- **Shared Memory Access**: Reads `acpmf_physics`, `acpmf_graphics`, `acpmf_static`
- **Unicode Support**: Handles wide character strings properly
- **Process Monitoring**: Detects when AC starts/stops

### Network Bridge Functionality
```powershell
# Your Windows PC acts as a telemetry hub
# Other devices can connect to:
# http://YOUR_WINDOWS_IP:8080

# Check your IP address:
ipconfig | findstr IPv4

# Example: Other devices connect to http://192.168.1.100:8080
```

### Windows Firewall Setup
If other devices can't connect:
```powershell
# Allow port 8080 through Windows Firewall
New-NetFirewallRule -DisplayName "Atlas Racing Dashboard" -Direction Inbound -Protocol TCP -LocalPort 8080 -Action Allow

# Or use GUI:
# Control Panel → System and Security → Windows Defender Firewall
# → Advanced Settings → Inbound Rules → New Rule
# Select Port → TCP → 8080 → Allow
```

## 📋 Dependencies and Libraries

### Backend Dependencies (C++)
```xml
<!-- vcpkg.json equivalent -->
{
  "name": "atlas-racing-backend",
  "version": "1.0.0",
  "dependencies": [
    "sqlite3"
  ]
}
```

### Windows API Libraries (Automatically Linked)
- **kernel32.lib**: Core Windows functions
- **user32.lib**: User interface functions
- **psapi.lib**: Process and system information API
- **advapi32.lib**: Advanced Windows services

### Frontend Dependencies (package.json)
```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "typescript": "^5.0.0",
    "electron": "^25.0.0",
    "tailwindcss": "^3.3.0",
    "framer-motion": "^10.0.0",
    "recharts": "^2.7.0"
  }
}
```

## 🐛 Troubleshooting

### Common Build Issues

#### 1. CMake Cannot Find vcpkg
```powershell
# Ensure vcpkg toolchain is specified
cmake .. -DCMAKE_TOOLCHAIN_FILE=C:\vcpkg\scripts\buildsystems\vcpkg.cmake

# Or set environment variable
set VCPKG_ROOT=C:\vcpkg
```

#### 2. SQLite3 Not Found
```powershell
# Install SQLite3 via vcpkg
cd C:\vcpkg
.\vcpkg install sqlite3:x64-windows

# Check if installed
.\vcpkg list sqlite3
```

#### 3. Visual Studio Build Tools Missing
```powershell
# Install Visual Studio Build Tools
winget install Microsoft.VisualStudio.2022.BuildTools

# Or install full Visual Studio Community
winget install Microsoft.VisualStudio.2022.Community
```

### AC Connection Issues

#### 1. Shared Memory Access Denied
```powershell
# Run as Administrator
# Right-click on atlas_racing_server.exe → "Run as administrator"

# Or run PowerShell as Administrator and launch from there
```

#### 2. AC Process Not Detected
```powershell
# Check if AC is running
Get-Process | Where-Object {$_.ProcessName -eq "acs"}

# Ensure AC is in a live session, not in menu
```

#### 3. Unicode/Wide Character Issues
- Ensure your Visual Studio project has Unicode support enabled
- Check that `-DUNICODE -D_UNICODE` flags are set in CMake

### F1 24 Connection Issues

#### 1. UDP Port Blocked
```powershell
# Check if port 20777 is in use
netstat -an | findstr 20777

# Test UDP connection
Test-NetConnection -ComputerName localhost -Port 20777
```

#### 2. Windows Firewall Blocking
```powershell
# Allow F1 24 through firewall
New-NetFirewallRule -DisplayName "F1 24 Telemetry" -Direction Inbound -Protocol UDP -LocalPort 20777 -Action Allow
```

## 🔄 Development Workflow

### Recommended Development Setup
1. **Backend Development**: Visual Studio 2022
2. **Frontend Development**: Visual Studio Code
3. **Version Control**: Git for Windows
4. **Terminal**: Windows Terminal

### Build Scripts
```powershell
# Clean build
.\scripts\build.sh --clean

# Development build
.\scripts\build.sh

# Production build
.\scripts\build.sh --production

# Package for distribution
.\scripts\build.sh --package
```

### Testing
```powershell
# Run backend tests
cd backend\build
.\tests.exe

# Run frontend tests
cd frontend
npm test

# Integration tests
npm run test:integration
```

## 🌐 Network Configuration

### Multi-Device Setup
1. **Windows PC** (Gaming Machine):
   - Runs games (F1 24, AC)
   - Runs Atlas Racing Dashboard backend
   - Acts as telemetry hub

2. **Other Devices** (Phones, Tablets, Macs):
   - Connect to Windows PC's IP address
   - View telemetry remotely
   - Same dashboard experience

### Network Troubleshooting
```powershell
# Check if backend is running
netstat -an | findstr 8080

# Test from another device
# Use browser: http://YOUR_WINDOWS_IP:8080

# Check network connectivity
ping YOUR_WINDOWS_IP
```

## 📈 Performance Optimization

### Windows-Specific Optimizations
1. **Disable Windows Game Mode** (can interfere with telemetry)
2. **Set High Performance Power Plan**
3. **Disable Windows Defender real-time scanning** for project folder
4. **Use SSD storage** for better file I/O performance

### Visual Studio Settings
```xml
<!-- In your project settings -->
<PropertyGroup>
  <WindowsTargetPlatformVersion>10.0</WindowsTargetPlatformVersion>
  <PlatformToolset>v143</PlatformToolset>
  <CharacterSet>Unicode</CharacterSet>
  <ConfigurationType>Application</ConfigurationType>
</PropertyGroup>
```

## 🔐 Security Considerations

### Windows Security
- **Run as Administrator** only when necessary
- **Allow firewall exceptions** for specific ports only
- **Keep Windows updated** for security patches
- **Use Windows Defender** or other antivirus

### Network Security
- **Local network only** - don't expose to internet
- **Use strong WiFi passwords** for device connections
- **Consider VPN** for remote access if needed

This comprehensive Windows setup guide ensures optimal performance and functionality for the Atlas Racing Dashboard with both F1 24 and Assetto Corsa support.