# 🚀 Quick Start Guide

## Option 1: Command Line (Simple & Fast)

### 1. Rebuild (if entry point error)
```bash
cd tester
build.bat
```

### 2. Record a Session
```bash
# Start recording
build\bin\packet_recorder.exe -f sector_test.f124 -n "Sector Timing Test"

# Start F1 24, enable UDP telemetry (port 20777), drive some laps
# Press Ctrl+C when done
```

### 3. Test Your Dashboard
```bash
# Terminal 1: Start Atlas Racing dashboard
cd ..\dashboard
run-windows.bat

# Terminal 2: Replay session
cd ..\tester
build\bin\packet_replayer.exe -f sector_test.f124 -s 1.0

# Watch dashboard for sector timing data!
```

## Option 2: Web Interface (Full Features)

### 1. Start Web Interface
```bash
cd tester
start_web_interface.bat
```

### 2. Open Browser
- Go to: http://localhost:8081
- Drag & drop .f124 files to upload
- Drag & drop .mp4 videos for sync playback
- Use controls to replay at different speeds

### 3. Synchronized Testing
- Upload both F124 recording and MP4 screen recording
- Start synchronized playback
- Compare dashboard output with video

## 🛠️ Fixing "Entry Point Not Found"

If you get this error, rebuild with the fixes:

```bash
cd tester
# Clean build
rmdir /s build
build.bat
```

The executables should now work properly with Windows socket libraries.

## 🎯 Test Sector Timing Issue

### Record Sector Timing Data
```bash
build\bin\packet_recorder.exe -f sector_debug.f124 -n "Sector 3 Debug"
# Drive 3-5 clean laps in F1 24
# Complete full laps (don't restart)
```

### Replay & Debug
```bash
# Start dashboard with enhanced debug logging
cd ..\dashboard
run-windows.bat

# Look for debug messages in backend console:
# "🔍 Session History DEBUG (Car 0, Lap 2):"
# "Raw S3: XXXXX ms" 
# "Valid flags: 0xX (S3=✓ or ✗)"

# Replay session
cd ..\tester  
build\bin\packet_replayer.exe -f sector_debug.f124 -s 1.0
```

### Expected Results
- ✅ Backend shows Session History packets with sector 3 data
- ✅ Dashboard displays all three sector times  
- ✅ JSON files contain non-zero sector3_time values

## 🚨 Troubleshooting

### "Entry point not found"
- Rebuild with: `rmdir /s build && build.bat`
- Make sure you're using MSYS2/MinGW

### "No packets received" 
- Check F1 24 UDP settings (port 20777)
- Enable "Broadcast Mode" in F1 24 telemetry settings
- Test with dashboard first to confirm UDP works

### "Python not found"
- Install Python 3.6+ from python.org
- Or use command line tools directly (no Python needed)

### Web interface won't start
- Check if port 8081 is free
- Use command line tools as backup option

This testing suite will help you definitively solve the sector timing issue!