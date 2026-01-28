# ⚡ QUICK TEST - 2 Minute Verification

## DO THIS FIRST:

### 1. Start Backend
```bash
cd dashboard/backend/build
./atlas_racing_server.exe
```
**Wait for:** `Waiting for F1 24 telemetry on UDP port 20777...`

### 2. Start Frontend
```bash
cd dashboard/frontend
npm start
```
**Wait for:** Browser opens to http://localhost:3000

### 3. Open Browser Console
Press **F12** → Click **Console** tab

### 4. Start F1 24
- Go to **Settings → Telemetry Settings**
- **UDP Telemetry:** ON
- **UDP Port:** 20777
- **Start any race** (even 3 laps)

---

## TEST 1: Backend Receiving Data (10 seconds)

### Backend Console Should Show:
```
[UDP] Received telemetry packet
[UDP] Received telemetry packet
[UDP] Received telemetry packet
```

**✅ PASS:** Backend receiving F1 24 data
**❌ FAIL:** Check F1 24 telemetry settings

---

## TEST 2: Frontend Receiving Data (10 seconds)

### Browser Console Should Show:
```
✅ Telemetry WebSocket connected!
🎮 Game detected: F1 24
📊 Telemetry update: P20, Lap 1/3
```

**✅ PASS:** Frontend connected to backend
**❌ FAIL:** Backend not running or port 8081 blocked

---

## TEST 3: DevMode Shows Live Data (20 seconds)

### In Browser:
1. Click **"Dev Mode"** button (top right)
2. Watch **BASIC section** → Speed/RPM should change as you drive
3. Drive for **3-4 laps**
4. Look for **"🤖 ATLAS AI"** section (appears lap 4+)

**✅ PASS:** Live telemetry working, ATLAS AI calculating
**❌ FAIL:** Data frozen → Backend not processing

---

## TEST 4: PTT Snapshot (30 seconds)

### In Browser Console:
1. **Drive to lap 3+**
2. **Press V** (or your PTT key)
3. **Say:** "what position"
4. **Release V**

### Console Should Show:
```
🎙️ User said: "what position"
📸 TELEMETRY SNAPSHOT at PTT press:
  - Connected: true ✅
  - Position: 15 ✅  ← YOUR ACTUAL POSITION
  - Lap: 3 / 3 ✅
  - Has atlas_ai: false (lap 3 is too early)

🤖 AI response: "P15"
```

**✅ PASS:** If AI says your correct position
**❌ FAIL:** If AI says wrong position → READ SNAPSHOT

### If Snapshot Shows Position: 15 but AI Says P10:
→ **AI HALLUCINATION** - System prompt not working

### If Snapshot Shows Position: undefined:
→ **NO TELEMETRY** - Backend/frontend not connected

---

## TEST 5: Broadcast (2 minutes)

### Setup:
1. Click **Atlas AI bubble** (bottom right)
2. Enable **"Broadcast Mode"** toggle (should turn cyan)
3. Click **"Test Voice"** button
4. **Hear:** "Radio check. I read you loud and clear."

**✅ PASS:** TTS working

### During Race:
1. **Drive to lap 2**
2. **Complete lap 2**
3. **Listen for:** "Great start! P{position}! Let's go!"

### Browser Console Should Show:
```
📡 Broadcast: Session type: Race Lap: 2
📡 🔥 BROADCAST TRIGGERED! race_start medium Great start! P15! Let's go!
🎙️ Speaking message: "Great start! P15! Let's go!"
```

**✅ PASS:** You hear broadcast on lap 2
**❌ FAIL:** Check console for broadcast logs

---

## RESULTS INTERPRETATION

### ✅ ALL TESTS PASS:
**System is working!** The issue is:
- AI hallucinating (system prompt needs tuning)
- Asking questions too early (lap 1-2, before ATLAS AI ready)
- Asking about features not implemented yet

### ❌ TEST 1 FAILS (Backend Not Receiving):
**Fix:** Check F1 24 telemetry settings

### ❌ TEST 2 FAILS (Frontend Not Connected):
**Fix:** Restart backend, check port 8081 not blocked

### ❌ TEST 3 FAILS (No Live Data):
**Fix:** Backend not processing, rebuild backend

### ❌ TEST 4 FAILS (Wrong Position in Snapshot):
**Fix:** Telemetry data structure wrong, check backend JSON

### ❌ TEST 4 FAILS (AI Says Wrong Position):
**Fix:** System prompt issue, AI not reading context

### ❌ TEST 5 FAILS (No Broadcast):
**Fix:**
- Broadcast mode not enabled
- Not a race session (Practice/Quali don't broadcast)
- TTS permissions blocked

---

## SEND ME THESE IF FAILED:

1. **Which test failed?** (1, 2, 3, 4, or 5)
2. **Backend console output** (last 20 lines)
3. **Browser console output** (screenshot or copy/paste)
4. **Exact question you asked** and **AI response**
5. **DevMode screenshot** (if test 3 failed)

This tells me EXACTLY where to fix! 🎯
