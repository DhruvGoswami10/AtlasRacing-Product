# Pre-recorded Test Scenarios

This directory contains pre-recorded F1 24 telemetry sessions for testing various dashboard features and edge cases.

## 📁 Available Scenarios

### Core Testing Scenarios

| Scenario | Description | Duration | Packets | Key Features |
|----------|-------------|----------|---------|--------------|
| `sector_timing_test.f124` | 3-lap session focused on sector transitions | ~4 min | ~14,400 | Session History packets, all sector timings |
| `race_start_5laps.f124` | Full grid, 5-lap race with position changes | ~6 min | ~21,600 | Multi-car data, overtakes, position changes |
| `pit_stop_sequence.f124` | In/out laps with tire changes | ~3 min | ~10,800 | Pit status changes, tire compound changes |
| `weather_change.f124` | Dynamic weather during session | ~8 min | ~28,800 | Weather transitions, changing track conditions |
| `crash_safety_car.f124` | Yellow flags and safety car deployment | ~10 min | ~36,000 | Event packets, safety car status changes |

### Edge Case Testing

| Scenario | Description | Purpose |
|----------|-------------|---------|
| `invalid_lap_data.f124` | Session with invalid lap times | Test validation logic |
| `connection_loss.f124` | Simulated UDP packet loss | Test reconnection handling |
| `high_frequency.f124` | 60Hz packet stream for 2 minutes | Test performance under load |
| `minimal_session.f124` | Single lap with minimal data | Test basic functionality |

### AI Training Scenarios

| Scenario | Description | Purpose |
|----------|-------------|---------|
| `perfect_lap_monaco.f124` | Optimal Monaco lap from pro driver | AI analysis training |
| `beginner_mistakes.f124` | Common driving errors for coaching | AI coaching system training |
| `tire_strategy.f124` | Multi-stint race with tire management | Strategy AI training |

## 🎥 Video Recordings

Each F124 file has a corresponding MP4 screen recording for visual validation:

- `scenario_name.f124` - Raw telemetry data
- `scenario_name.mp4` - Synchronized screen recording
- `scenario_name.json` - Metadata and validation checkpoints

## 🛠️ Creating New Scenarios

### Recording a New Scenario

1. **Start the recorder:**
   ```bash
   packet_recorder.exe -f new_scenario.f124 -n "Scenario Description"
   ```

2. **Record your screen** (OBS Studio recommended):
   - Resolution: 1920x1080
   - Frame rate: 30fps
   - Format: MP4 (H.264)

3. **Play F1 24** with the desired scenario
   - Ensure UDP telemetry is enabled (port 20777)
   - Complete the full scenario without interruption

4. **Stop recording** (Ctrl+C) when session is complete

5. **Add metadata:**
   ```json
   {
     "name": "New Scenario",
     "description": "Description of what this tests",
     "track": "Monaco",
     "duration_seconds": 240,
     "expected_laps": 3,
     "key_features": ["sector_timing", "weather_change"],
     "validation_points": [
       {
         "timestamp_ms": 60000,
         "expected_speed": 285,
         "expected_sector": 2
       }
     ]
   }
   ```

### Testing Your Scenario

1. **Replay with validation:**
   ```bash
   packet_replayer.exe -f new_scenario.f124 --stats
   ```

2. **Test with dashboard:**
   - Start Atlas Racing dashboard
   - Open web interface and load scenario
   - Verify all telemetry displays correctly

3. **Visual validation:**
   - Load both F124 and MP4 files in web interface
   - Compare dashboard output with video recording
   - Check synchronization timing

## 🎯 Validation Checklist

When creating or testing scenarios, verify:

- [ ] All packet types are present (Telemetry, Lap Data, Session History, etc.)
- [ ] Sector timing data is complete (sectors 1, 2, and 3)
- [ ] Multi-car data is included if applicable  
- [ ] Event packets for important moments (pit stops, crashes, etc.)
- [ ] Session metadata is accurate (track, weather, duration)
- [ ] Video synchronization is correct
- [ ] Dashboard displays match expected values
- [ ] AI analysis produces reasonable insights

## 🚀 Usage Examples

### Quick Sector Timing Test
```bash
# Record 3 laps focusing on sector transitions
packet_recorder.exe -f sector_test.f124 -n "Sector Timing Test"
# (Drive 3 clean laps in F1 24)
# Ctrl+C to stop

# Replay at normal speed
packet_replayer.exe -f sector_test.f124 -s 1.0

# Check for sector 3 timing issues
packet_replayer.exe -f sector_test.f124 --stats
```

### Performance Testing
```bash
# Replay at 5x speed to test dashboard performance
packet_replayer.exe -f race_start_5laps.f124 -s 5.0 -l

# Monitor dashboard for lag or missed packets
```

### AI Development
```bash
# Replay coaching scenario slowly for AI analysis
packet_replayer.exe -f beginner_mistakes.f124 -s 0.5

# AI can analyze driving patterns in detail
```

These scenarios provide comprehensive test coverage for all dashboard features and help ensure reliable telemetry processing across different racing conditions.