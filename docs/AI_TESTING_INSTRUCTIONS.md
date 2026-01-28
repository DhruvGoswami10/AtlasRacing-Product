# How to Test the AI Race Engineer

## 🚀 Quick Start

1. **Start the application** (you already did this):
   ```bash
   run-windows.bat
   ```

2. **Open your browser** and go to:
   ```
   http://localhost:3000
   ```

3. **Navigate to a dashboard with AI support**:

### Option A: Professional Dashboard (RECOMMENDED FOR TESTING)
1. Click on **F1 24** or **Assetto Corsa** from the main launcher
2. Click **"Professional"** dashboard
3. **Look for the GREEN PULSING BUTTON** in the top-right corner
4. Click it to open the AI panel!

### Option B: Pit Wall Dashboard  
1. Click on **F1 24** or **Assetto Corsa** from the main launcher
2. Click **"Pit Wall"** dashboard
3. **Look for the GREEN PULSING BUTTON** in the top-right corner
4. Click it to open the AI panel!

## 🔍 What to Look For

### Visual Indicators:
- **Green pulsing button** in top-right corner (when AI panel is closed)
- **Blue button** in top-right corner (when AI panel is open)
- **Chat icon** (speech bubble) in the button
- **Text saying "Look for the green AI button"** on waiting screens

### If You Don't See the Button:
1. **Check browser console** (F12 → Console tab) for error messages
2. **Look for debug logs** that say:
   - `"ProfessionalDashboard rendered, telemetry: false"`
   - `"AIRaceEngineerPanel rendered, isOpen: false"`
   - `"AI Toggle clicked"`

### Expected Behavior:
1. **Without telemetry** (no F1 24 running):
   - Green pulsing AI button should be visible
   - Clicking opens AI chat panel on the right
   - You can chat with AI even without game data

2. **With telemetry** (F1 24 running):
   - AI gets real-time data from your racing
   - Proactive alerts for tire temps, fuel, performance
   - More contextual responses

## 🗣️ Testing Voice Features
1. **Click the microphone button** in AI panel
2. **Allow microphone access** when prompted
3. **Speak your question** (e.g., "How are my tires?")
4. **AI should respond with voice**

## 🤖 Testing Different Personalities
1. **Click personality buttons** at top of AI panel:
   - **Professional**: Normal technical advice
   - **Unhinged**: Enthusiastic with strong language
   - **Roast Mode**: Brutally honest with humor

## 🐛 Troubleshooting

### If No AI Button Appears:
1. **Check the URL** - make sure you're on:
   - `http://localhost:3000/game/f1-24/dashboard/professional` OR
   - `http://localhost:3000/game/f1-24/dashboard/pit-wall`
2. **Check browser console** for JavaScript errors
3. **Refresh the page** (Ctrl+F5)
4. **Try a different dashboard** (Professional vs Pit Wall)

### If AI Panel Opens But Doesn't Work:
1. **Check console** for OpenAI API errors
2. **Verify environment variable** in `.env` file:
   ```
   REACT_APP_OPENAI_API_KEY=sk-proj-ZPX61BNXx8R7VRCBdpi...
   ```
3. **Check internet connection** (AI needs to reach OpenAI)

### If Voice Doesn't Work:
1. **Check microphone permissions** in browser
2. **Use Chrome or Edge** (better speech support)
3. **Check console** for voice service errors

## 📱 Browser Compatibility
- **Best**: Chrome, Edge (full voice support)
- **Good**: Firefox (limited voice features)
- **Not Supported**: Internet Explorer

## 🎮 URL Examples

Direct links to test:
- Professional Dashboard: `http://localhost:3000/game/f1-24/dashboard/professional`
- Pit Wall Dashboard: `http://localhost:3000/game/f1-24/dashboard/pit-wall`
- AC Professional: `http://localhost:3000/game/ac/dashboard/professional`

## 🔧 Debug Mode

Look in browser console (F12) for these debug messages:
```
ProfessionalDashboard rendered, telemetry: false
AIRaceEngineerPanel rendered, isOpen: false  
AIRaceEngineerPanel mounted
AI Toggle clicked (Professional Dashboard waiting state): false
```

If you see these messages, the AI system is working correctly!

---

**The green pulsing button should be impossible to miss - it's 60px wide, bright green, and pulses continuously!**