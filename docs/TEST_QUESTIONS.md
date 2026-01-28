# ATLAS AI Test Questions for Short Race

## Setup Instructions

1. **Start Backend:**
   ```bash
   cd dashboard/backend/build
   ./atlas_racing_server.exe
   ```

2. **Start Frontend (Dev Mode):**
   ```bash
   cd dashboard/frontend
   npm start
   ```
   OR use production build you just created

3. **F1 24 Settings:**
   - Race length: SHORT (8-10 laps)
   - Mandatory pit stop: ENABLED
   - Telemetry: UDP ON, Port 20777, Format 2024

4. **Dashboard:**
   - Open http://localhost:3000
   - Enable FloatingAI Overlay
   - Enable **Broadcast Mode** in settings
   - Set PTT hotkey (default: V)

---

## Expected Broadcasts (You Should Hear These)

### **Lap 1 (Race Start):**
- **Expected:** "Great start! P{your_position}! Let's go!"
- **When:** After you complete lap 1

### **Lap 2-3 (Tire Warmup):**
- No broadcasts yet (ATLAS AI needs 3+ laps of data)

### **Lap 4+ (Strategic Broadcasts):**
- **Pit advantage detected:** "BOX BOX BOX"
- **Tires critical (<3 laps left):** "Tires critical. 2.5 laps maximum."
- **Fuel low:** "Fuel critical. 3.2 laps remaining."

### **Final Lap:**
- **Expected:** "Final lap! Bring it home! P{your_position}!"

---

## PTT Test Questions (Press V, Ask Question, Release V)

### **Position & Gaps - CRITICAL TESTS:**

**Q1: "What position am I?"**
- ✅ **Expected:** "P5" (or whatever your actual position is)
- ❌ **Wrong:** "You're in fifth position" (too wordy)
- ❌ **Wrong:** "No data available" (means bug)

**Q2: "Who's ahead?"**
- ✅ **Expected:** "Norris P4 +1.2s 5L tires" (exact name, position, gap, tire age)
- ❌ **Wrong:** "Lando Norris is ahead by about a second" (too vague)
- ❌ **Wrong:** "No significant gap" (NEVER say this)

**Q3: "Who's behind?"**
- ✅ **Expected:** "Hamilton P6 -0.8s 7L tires"
- ❌ **Wrong:** "Lewis Hamilton is behind you"

**Q4: "Gap to leader?"**
- ✅ **Expected:** "Leading" (if P1)
- ✅ **Expected:** "Verstappen P1 +8.5s" (if not P1)

---

### **Tire Questions:**

**Q5: "How are my tires?"**
- ✅ **Expected (with ATLAS AI):** "Mediums 6L old, deg +0.42s/lap, life 8.3L, perf 78%"
- ✅ **Expected (without ATLAS AI):** "Mediums 6L old, wear 25%"

**Q6: "When should I pit?"**
- ✅ **Expected:** "Pit now, delta 22.8s, advantage available" (if atlas_ai says yes)
- ✅ **Expected:** "Not yet, tires have 10L left"

**Q7: "Tire life?"**
- ✅ **Expected:** "8.3 laps remaining, 78% performance"

---

### **Fuel Questions:**

**Q8: "How's my fuel?"**
- ✅ **Expected:** "45.2kg, 6.5 laps remaining"
- ❌ **Wrong:** "Fuel looks good" (too vague)

**Q9: "Will I make it to the end?"**
- ✅ **Expected:** "Yes, 6.5 laps fuel, 4 laps to go"
- ✅ **Expected:** "No, 3.2 laps fuel, 5 to go. Lift and coast."

---

### **Pace Questions:**

**Q10: "What was my last lap?"**
- ✅ **Expected:** "1:32.456" (exact time)

**Q11: "What's my best lap?"**
- ✅ **Expected:** "1:31.234"

**Q12: "Am I faster than [driver ahead]?"**
- ✅ **Expected:** "No, Norris 1:31.8, you 1:32.5"
- ✅ **Expected:** "Yes, you 1:31.2, Hamilton 1:32.4"

---

### **Strategy Questions:**

**Q13: "Should I pit?"**
- ✅ **Expected:** "Yes, box now, delta 22.8s, break even 5.2 laps"
- ✅ **Expected:** "No, tires good for 12L"

**Q14: "Pit delta?"**
- ✅ **Expected:** "22.8 seconds" (track-specific from your database)

**Q15: "Can I undercut [driver ahead]?"**
- ✅ **Expected:** "Yes, pit now, they're on 12L tires"
- ✅ **Expected:** "No, gap too large at 5.2s"

---

## Debugging If Things Don't Work

### **No Broadcasts Heard:**

1. **Check DevMode Dashboard:**
   - Navigate to /devmode
   - Look for **"🤖 ATLAS AI - FUEL & TIRE STRATEGY"** section
   - Is it showing data? Or "N/A"?

2. **Check Browser Console (F12):**
   - Look for: `📡 Broadcast trigger: pit_call`
   - Look for: `🎙️ Speaking message: "BOX BOX BOX"`

3. **Check FloatingAI Settings:**
   - Is "Broadcast Mode" toggle **ON** (cyan color)?
   - Is "Race Engineer" toggle **ON**?

4. **Check TTS:**
   - Click "Test Voice" button
   - Do you hear "Radio check"?
   - If not: Check Windows volume, browser permissions

### **Wrong Position/Gap Info:**

1. **Check what AI sees:**
   - Press F12 (browser console)
   - Look for: `🤖 Full telemetry context sent to AI:`
   - Find the "POSITION:" line
   - Does it show correct data?

2. **If POSITION shows wrong data:**
   - Backend issue - check backend console
   - Look for: `[ATLAS AI] Opponent tracking: ahead=X behind=X`

3. **If POSITION shows correct but AI says wrong:**
   - AI hallucination - check system prompt
   - Console should show: `🎭 System prompt being used:`

### **ATLAS AI Shows N/A:**

**Normal for first 3 laps!**
- Fuel calculations need 3+ laps
- Tire degradation needs 5+ laps
- Check DevMode after lap 4

---

## Success Criteria

✅ **Broadcasts Working:**
- Hear "Great start" on lap 2
- Hear "Final lap" on last lap
- Hear "BOX BOX BOX" when pit advantage detected (lap 5+)

✅ **Position Data Correct:**
- AI always gives exact position (P1, P5, P12, etc.)
- AI gives exact gaps with 1 decimal (1.2s, 0.8s)
- AI gives opponent names correctly

✅ **Tire Data Correct:**
- Shows compound name (Softs, Mediums, Hards)
- Shows tire age in laps
- Shows degradation rate (after lap 5)

✅ **Fuel Data Correct:**
- Shows kg remaining
- Shows laps remaining
- Warns if fuel critical

---

## Known Limitations

1. **First 3 Laps:** ATLAS AI not ready yet (needs data)
2. **5-Lap Race:** Too short for full strategic analysis
3. **No Pit Stop:** Some features won't trigger without pit
4. **Practice/Quali:** Broadcasts only work in RACE sessions

---

## Recommended Test Race

- **Track:** Bahrain (pit delta 24.8s)
- **Length:** SHORT (8-10 laps)
- **AI Difficulty:** Medium (for realistic gaps)
- **Weather:** Dry
- **Assists:** Whatever you prefer
- **Mandatory Pit:** YES (to trigger pit broadcasts)

---

## If Everything Works:

You should hear:
1. Race start call on lap 2
2. Position updates when close to opponents
3. "BOX BOX BOX" around lap 5-6 (pit window)
4. Final lap call

You should get accurate answers to all 15 test questions above!

Good luck! 🏁
