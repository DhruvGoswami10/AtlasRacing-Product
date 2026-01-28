# 🔍 DEBUG GUIDE - Finding Why AI Gets Wrong Data

## THE PROBLEM

**Symptoms:**
- AI says P10 when you're P6
- AI says 80% tire damage on lap 1 (impossible)
- No broadcasts heard
- Old/stale data in responses
- Position/gap info wrong

**Root Causes to Check:**

1. ❌ Telemetry not reaching frontend
2. ❌ Telemetry reaching frontend but stale/cached
3. ❌ AI not receiving telemetry (passed as undefined)
4. ❌ Backend not calculating ATLAS AI data
5. ❌ Broadcast system not running

---

## STEP 1: Check Backend is Running

### Start Backend:
```bash
cd dashboard/backend/build
./atlas_racing_server.exe
```

### Expected Output:
```
=== ATLAS RACING TELEMETRY SERVER ===
WebSocket server started on ws://localhost:8081
HTTP server started on http://localhost:8080
Waiting for F1 24 telemetry on UDP port 20777...
```

### Backend Console During Race:
You should see:
```
[UDP] Received telemetry packet (SessionData)
[UDP] Received telemetry packet (LapData)
[ATLAS AI] Fuel tracking: 3 laps completed, calculating...
[ATLAS AI] Opponent tracking: ahead=1 behind=1
[ATLAS AI] Pit strategy: delta=24.8s advantage=0
```

**❌ If you DON'T see `[ATLAS AI]` logs:**
- Backend compiled with old code
- Run `scripts/build.bat` again

---

## STEP 2: Check Frontend Connection

### Open Browser Console (F12)

### On Dashboard Load:
```
🔌 Connecting to telemetry WebSocket...
✅ Telemetry WebSocket connected!
🎮 Game detected: F1 24
```

### During Race:
```
📊 Telemetry update: P6, Lap 3/10
```

**❌ If you see `❌ Telemetry WebSocket disconnected`:**
- Backend not running
- Wrong port (should be 8081)
- Firewall blocking connection

**❌ If you see `🎮 Game detected: Not Connected`:**
- F1 24 not sending telemetry
- Check F1 24 settings: UDP ON, Port 20777

---

## STEP 3: Check Real-Time Telemetry Data

### Open DevMode Dashboard:
Navigate to: **http://localhost:3000/devmode**

### Check These Sections:

#### **BASIC Section:**
- Speed should change as you drive
- RPM should change with gear
- If these are frozen → **backend not receiving F1 24 data**

#### **🤖 ATLAS AI Section (Should appear on Lap 4+):**
```
FUEL CALCULATIONS:
Fuel/Lap Avg: 2.34 kg/lap ✅
Last Lap: 2.45 kg ✅
Laps Remaining: 6.5 laps ✅

TIRE DEGRADATION:
Deg Rate: +0.342s/lap ✅
Life Remaining: 8.3 laps ✅
Performance: 82% ✅

PIT STRATEGY:
Pit Delta: 24.8s ✅
Advantage: YES ✅
Break Even: 5.2 laps ✅

NEARBY OPPONENTS:
↑ P5: Norris (1.2s | Age: 7L) ✅
↓ P7: Hamilton (-0.8s | Age: 5L) ✅
```

**❌ If ATLAS AI shows "N/A" on Lap 5+:**
- Backend not calculating (check backend console for `[ATLAS AI]` logs)
- Need to rebuild backend with latest code

**❌ If ATLAS AI section doesn't exist:**
- Need to rebuild frontend
- Old version deployed

---

## STEP 4: Check PTT Snapshot Logging

### Press PTT (V key) and Ask: "What position?"

### Expected Console Output:
```
🎙️ User said: "what position"
📸 TELEMETRY SNAPSHOT at PTT press:
  - Connected: true ✅
  - Position: 6 ✅
  - Lap: 5 / 10 ✅
  - Tire compound: "Mediums" ✅
  - Has atlas_ai: true ✅
  - Has multiCarData: true 20 cars ✅
  - Atlas AI opponent ahead: "Norris" ✅
  - Atlas AI opponent behind: "Hamilton" ✅

🤖 Full telemetry context sent to AI:
RACE DATA:
Lap: 5/10
POSITION: P6
Ahead: Norris P5 +1.2s (7L tires) ✅
Behind: Hamilton P7 -0.8s (5L tires) ✅
...

🤖 AI response: "P6"
```

### **🚨 CRITICAL CHECKS:**

**If you see:**
```
  - Connected: false ❌
```
→ Backend not connected, restart backend

**If you see:**
```
  - Position: undefined ❌
  - Lap: undefined / undefined ❌
```
→ Telemetry not reaching frontend, check WebSocket connection

**If you see:**
```
  - Has atlas_ai: false ❌
```
→ Backend not calculating ATLAS AI, check backend logs

**If you see:**
```
  - Atlas AI opponent ahead: undefined ❌
```
→ No opponent tracking, check backend opponent calculation

**If AI response says P10 but snapshot shows P6:**
→ AI hallucinating, context not being sent properly

---

## STEP 5: Check Broadcast Monitoring

### Expected Console Output Every ~5 Seconds:
```
📡 Broadcast: Session type: Race Lap: 5
📡 Broadcast: Monitoring... (no triggers)
```

### On Lap 2 (Race Start):
```
📡 Broadcast: Session type: Race Lap: 2
📡 🔥 BROADCAST TRIGGERED! race_start medium Great start! P6! Let's go!
🎙️ Speaking message: "Great start! P6! Let's go!"
```

### **🚨 BROADCAST DEBUG:**

**If you see:**
```
📡 Broadcast: DISABLED ❌
```
→ Open FloatingAI settings, enable "Broadcast Mode" toggle

**If you see:**
```
📡 Broadcast: No telemetry ❌
```
→ Backend not sending data, check Step 1

**If you see:**
```
📡 Broadcast: Not a race session, skipping ❌
```
→ You're in Practice/Quali, broadcasts only work in Race

**If you see:**
```
📡 Broadcast: Session type: undefined Lap: undefined ❌
```
→ Telemetry data structure wrong, check backend JSON output

**If broadcast triggers but no sound:**
→ Check browser volume
→ Check Windows volume
→ Click "Test Voice" button in settings
→ Check browser audio permissions

---

## STEP 6: Manual Telemetry Test

### Open Browser Console and Type:
```javascript
// Check if useTelemetry hook is working
const telemetryData = window.__TELEMETRY_DEBUG__;
console.log('Current telemetry:', telemetryData);
```

### Or Add Temporary Debug Button:

In DevMode, add this to show live data:
```javascript
console.log('LIVE TELEMETRY CHECK:');
console.log('Position:', telemetry?.position);
console.log('Lap:', telemetry?.current_lap_num);
console.log('ATLAS AI:', telemetry?.atlas_ai);
```

---

## STEP 7: Backend JSON Verification

### Check Backend is Sending Correct Data:

Open: **http://localhost:8080/current**

### Expected JSON:
```json
{
  "position": 6,
  "current_lap_num": 5,
  "total_laps": 10,
  "tire_compound": "Mediums",
  "atlas_ai": {
    "fuel_per_lap_average": 2.34,
    "tyre_degradation_rate": 0.342,
    "opponent_ahead_1": {
      "driver_name": "Norris",
      "position": 5,
      "gap_seconds": 1.2,
      "tyre_age": 7
    },
    "opponent_behind_1": {
      "driver_name": "Hamilton",
      "position": 7,
      "gap_seconds": 0.8,
      "tyre_age": 5
    }
  }
}
```

**❌ If `atlas_ai` is missing:**
- Backend not calculating (check backend console)
- Need lap 4+ for calculations to start

**❌ If opponent names are empty:**
- Multi-car data not being received
- Check F1 24 sending all packet types

---

## COMMON ISSUES & FIXES

### Issue: "AI says P10, I'm P6"

**Cause:** AI not receiving fresh telemetry

**Fix:**
1. Check console for `📸 TELEMETRY SNAPSHOT`
2. Verify `Position: 6` in snapshot
3. If snapshot shows 6 but AI says 10 → AI hallucination, system prompt issue
4. If snapshot shows undefined → Telemetry not reaching frontend

---

### Issue: "No Broadcasts Heard"

**Cause:** Multiple possible issues

**Fix Checklist:**
- [ ] Backend running? (Check Step 1)
- [ ] Broadcast Mode enabled? (Check FloatingAI settings)
- [ ] Race session? (Not Practice/Quali)
- [ ] Lap 2+? (Race start broadcasts on lap 2)
- [ ] Browser audio working? (Click "Test Voice")
- [ ] Console shows triggers? (Look for `📡 🔥 BROADCAST TRIGGERED!`)

---

### Issue: "80% Tire Damage on Lap 1"

**Cause:** Wrong property being read (tire_wear vs damage)

**Fix:**
- Check if backend is sending `tire_wear` as percentage (0-1) or (0-100)
- Check console snapshot shows correct wear values
- If backend shows correct but AI wrong → Context formatting issue

---

### Issue: "Old/Stale Data"

**Cause:** Telemetry not updating in real-time

**Fix:**
1. Check DevMode dashboard - is data changing?
2. If DevMode frozen → Backend not receiving F1 24 data
3. If DevMode updating but AI stale → PTT snapshot not capturing latest
4. Add timestamps to verify: Check `realTelemetry.timestamp` vs `Date.now()`

---

## VERIFICATION CHECKLIST

Run through this in order:

### ✅ Backend Working:
- [ ] Backend console shows `[ATLAS AI]` logs
- [ ] http://localhost:8080/current shows data
- [ ] Backend console shows position changes as you drive

### ✅ Frontend Connected:
- [ ] Console shows `✅ Telemetry WebSocket connected!`
- [ ] DevMode dashboard shows live data
- [ ] ATLAS AI section appears on lap 4+

### ✅ PTT Working:
- [ ] Console shows snapshot when PTT pressed
- [ ] Snapshot shows correct position
- [ ] Snapshot shows atlas_ai data
- [ ] AI receives context (check `🤖 Full telemetry context` log)

### ✅ Broadcast Working:
- [ ] Console shows `📡 Broadcast: Monitoring...`
- [ ] Lap 2 triggers race start broadcast
- [ ] Console shows `📡 🔥 BROADCAST TRIGGERED!`
- [ ] TTS speaks the message

---

## NUCLEAR OPTION: Clean Rebuild

If nothing works:

```bash
# 1. Clean backend
cd dashboard/backend
rm -rf build
cd ..

# 2. Rebuild backend
scripts/build.bat

# 3. Clean frontend
cd frontend
rm -rf build node_modules
npm install

# 4. Rebuild frontend
npm run build

# 5. Start backend
cd ../backend/build
./atlas_racing_server.exe

# 6. Start frontend
cd ../../frontend
npm start

# 7. Start F1 24 with telemetry enabled

# 8. Open http://localhost:3000 and open console (F12)
```

---

## WHAT TO SEND ME FOR DEBUGGING

If still broken, send:

1. **Backend Console Output** (copy 20-30 lines during race)
2. **Browser Console Output** (F12, copy logs when you press PTT)
3. **DevMode Screenshot** (showing ATLAS AI section)
4. **PTT Snapshot Log** (the `📸 TELEMETRY SNAPSHOT` section)
5. **What AI Actually Said** vs **What You Expected**

Example:
```
Asked: "What position?"
Expected: "P6"
Got: "P10"
Snapshot showed: Position: 6 ✅
AI hallucinated? YES
```

This will tell me exactly where the chain breaks! 🔍
