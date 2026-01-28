# Atlas Racing Testing Suite

A comprehensive packet recording, replay, and validation system for F1 24 telemetry testing.

## 🎯 Overview

This testing suite allows you to:
- **Record** all F1 24 UDP packets with precise timing
- **Replay** recorded sessions at any speed (0.1x to 10x)
- **Validate** dashboard accuracy against recorded data
- **Synchronize** with MP4 screen recordings for visual validation
- **Test** all dashboard features: live telemetry, analysis, and AI

## 🏗️ Architecture

```
F1 24 Game → UDP:20777 → Packet Recorder → .f124 binary files
                                              ↓
Web Interface → Session Manager → Packet Replayer → UDP:20777 → Atlas Dashboard
                     ↓                                   ↓
                MP4 Video Player ←——————————————— Synchronized Playback
```

## 📁 Structure

- `recorder/` - C++ UDP packet capture engine
- `replayer/` - C++ UDP packet replay engine  
- `web_interface/` - HTML/JS testing dashboard
- `scenarios/` - Pre-recorded test sessions
- `validation/` - Dashboard accuracy validation tools

## 🚀 Quick Start

1. **Record a session**: Run recorder while playing F1 24
2. **Upload session**: Drag .f124 file to web interface
3. **Add video**: Upload MP4 screen recording (optional)
4. **Replay**: Start synchronized playback to test dashboard

## 🎮 Use Cases

- **Debug sector timing issues** with precise packet inspection
- **Test dashboard updates** without playing F1 24
- **Validate AI analysis** against known session data
- **Reproduce bugs** consistently with recorded packets
- **Performance testing** with high-frequency packet streams