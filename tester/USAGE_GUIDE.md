# Atlas Racing Testing Suite - Complete Usage Guide

🎯 **Goal**: Record, replay, and validate F1 24 telemetry sessions with synchronized video playback to test all dashboard features without playing the game repeatedly.

## 🚀 Quick Start (5 minutes)

### Step 1: Build the Tools
```bash
cd tester
build.bat
```
This creates:
- `build/bin/packet_recorder.exe` - Records F1 24 UDP packets
- `build/bin/packet_replayer.exe` - Replays recorded sessions
- Web interface for managing everything

### Step 2: Record Your First Session
```bash
# Start recording
build/bin/packet_recorder.exe -f my_first_session.f124 -n "Monaco Practice"

# Start F1 24, enable UDP telemetry (port 20777), drive some laps
# Press Ctrl+C when done

# You now have a my_first_session.f124 file with all telemetry data
```

### Step 3: Test the Sector Timing Fix
```bash
# Start Atlas Racing dashboard
cd ../dashboard
run-windows.bat

# In another terminal, replay your session
cd ../tester
build/bin/packet_replayer.exe -f my_first_session.f124

# Watch the dashboard - you should now see all sector times including sector 3!
```

### Step 4: Advanced Testing with Web Interface
```bash
# Start the web server
cd web_interface
python server.py

# Open browser to http://localhost:8081
# Upload F124 files, sync with MP4 videos, control replay
```

## 📋 Complete Workflow

### Recording Phase

1. **Prepare F1 24**:
   - Enable UDP Telemetry in settings
   - Set port to 20777
   - Choose your test scenario (sector timing, pit stops, etc.)

2. **Start Recording**:
   ```bash
   packet_recorder.exe -f sector_timing_test.f124 -n "Sector Timing Debug Session"
   ```

3. **Start Screen Recording** (OBS Studio recommended):
   - Resolution: 1920x1080, 30fps
   - Save as MP4 format
   - Record both F1 24 game and dashboard if visible

4. **Execute Test Scenario**:
   - Drive clean laps focusing on the feature you want to test
   - Complete sectors, pit stops, weather changes, etc.
   - Note any issues or specific moments

5. **Stop Recording**: 
   - Ctrl+C in recorder terminal
   - Stop screen recording
   - You now have `.f124` + `.mp4` files

### Analysis Phase

1. **Immediate Validation**:
   ```bash
   # Check what was recorded
   packet_replayer.exe -f sector_timing_test.f124 --stats
   ```

2. **Live Testing**:
   ```bash
   # Start dashboard
   cd ../dashboard && run-windows.bat
   
   # Replay session
   cd ../tester
   packet_replayer.exe -f sector_timing_test.f124 -s 1.0
   ```

3. **Advanced Analysis**:
   - Open web interface (http://localhost:8081)
   - Upload both F124 and MP4 files
   - Use synchronized playback to compare dashboard vs game
   - Validate sector times, speeds, positions, etc.

### Debugging Phase

1. **Slow Motion Analysis**:
   ```bash
   # Replay at 0.1x speed to see exactly what happens
   packet_replayer.exe -f sector_timing_test.f124 -s 0.1
   ```

2. **Loop Problem Areas**:
   ```bash
   # Loop replay to study issue repeatedly
   packet_replayer.exe -f sector_timing_test.f124 -s 0.5 -l
   ```

3. **Packet Inspection**:
   ```bash
   # See detailed packet statistics
   packet_replayer.exe -f sector_timing_test.f124 --stats
   ```

## 🎯 Testing the Sector 3 Fix

### Record Sector Timing Session
```bash
# Record 3-5 clean laps focusing on sector boundaries
packet_recorder.exe -f sector3_debug.f124 -n "Sector 3 Debug Test"

# In F1 24:
# 1. Choose a track you know well (Monaco, Austria, etc.)
# 2. Drive 3-5 clean laps
# 3. Pay attention to sector transitions
# 4. Complete full laps (don't restart)
```

### Test the Fix
```bash
# Start dashboard with our enhanced debug logging
cd ../dashboard && run-windows.bat

# In the backend console, you should see:
# "🔍 Session History DEBUG (Car 0, Lap 2):"
# "  Raw S1: 16498ms, Raw S2: 29500ms, Raw S3: XXXXX ms"
# "  Valid flags: 0xX (S1=✓, S2=✓, S3=✓ or ✗)"

# Replay the session
cd ../tester
packet_replayer.exe -f sector3_debug.f124 -s 1.0

# Watch both:
# 1. Backend console for debug messages
# 2. Dashboard frontend for sector 3 values
```

### Expected Results
- ✅ **Backend logs show**: `S3=XX.XXXs` with non-zero values
- ✅ **Dashboard displays**: All three sector times
- ✅ **JSON sessions contain**: `"sector3_time": XX.XXX` instead of 0
- ✅ **Post-session analysis**: Shows realistic sector data

## 🎥 Video Synchronization

### Recording Both Game and Dashboard
```bash
# Terminal 1: Start dashboard
cd dashboard && run-windows.bat

# Terminal 2: Start recorder  
cd tester
packet_recorder.exe -f sync_test.f124 -n "Sync Test"

# Terminal 3: OBS Studio recording both F1 24 and dashboard
# Layout: F1 24 game on left, dashboard on right

# Drive test scenario, then stop both recording and OBS
```

### Synchronized Playback
1. **Upload both files** to web interface
2. **Start synchronized playback**:
   - F124 file replays packets to dashboard
   - MP4 video shows what should happen
   - Compare frame-by-frame for accuracy

3. **Validation points**:
   - Speed values match between video and dashboard
   - Sector transitions occur at same time
   - Lap counting is synchronized
   - Pit stops, DRS, ERS all match

## 🔧 Advanced Features

### Speed Control
```bash
# Test dashboard performance
packet_replayer.exe -f session.f124 -s 5.0    # 5x speed
packet_replayer.exe -f session.f124 -s 0.1    # Slow motion

# Stress test with high-frequency packets
packet_replayer.exe -f session.f124 -s 10.0   # Max speed
```

### Loop Testing
```bash
# Continuous replay for long-term stability testing
packet_replayer.exe -f session.f124 -s 2.0 -l

# Let it run for hours to test memory leaks, connection stability
```

### Packet Analysis
```bash
# See what packet types were recorded
packet_replayer.exe -f session.f124 --stats

# Expected output:
# Car Telemetry: 1200 packets
# Lap Data: 1200 packets  
# Session History: 15 packets  ← This is key for sector 3!
# Car Status: 600 packets
```

## 🎮 Use Cases

### 1. Debug Sector Timing (Our Current Issue)
- Record 3-lap session with focus on clean sector transitions
- Replay with enhanced debug logging enabled
- Verify Session History packets contain sector 3 data
- Compare dashboard output with expected timing

### 2. Test AI Analysis
- Record diverse driving scenarios (good/bad laps)
- Replay sessions through AI analysis engine
- Validate coaching suggestions match driving performance
- Test edge cases (crashes, pit stops, weather)

### 3. Performance Testing
- Record high-packet-rate sessions
- Replay at various speeds (0.1x to 10x)
- Monitor dashboard for dropped frames or lag
- Test with multiple concurrent sessions

### 4. Feature Development
- Record before implementing new feature
- Implement dashboard changes
- Replay same session to test new feature
- Iterate quickly without playing F1 24 repeatedly

### 5. Bug Reproduction
- When users report issues, have them send F124 + MP4 files
- Reproduce exact conditions locally
- Debug and fix with consistent data
- Verify fix works with same recorded session

## 🚨 Troubleshooting

### "No packets received"
- Check F1 24 UDP settings (port 20777, enabled)
- Verify Windows firewall allows UDP traffic
- Test with `telnet localhost 20777` while F1 24 runs

### "Session History packets missing"
- Enable F1 24 "Broadcast Mode" in telemetry settings
- Complete full laps (don't restart mid-lap)
- Check F1 24 version compatibility
- Use `--stats` to verify Session History packet count

### "Dashboard not connecting"
- Ensure dashboard is running on localhost:3000
- Check if backend server is receiving replay packets
- Verify no port conflicts (20777, 3000, 8080, 8081)

### "Video not synchronized"
- Start recording before driving
- Use consistent frame rates (30fps recommended)  
- Note timestamp when important events occur
- Calibrate timing offset in web interface

This testing suite eliminates the need to repeatedly play F1 24 while debugging, speeds up development significantly, and provides comprehensive validation of dashboard accuracy.