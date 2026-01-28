# 📱 **FRONTEND DOCUMENTATION**
**Atlas Racing Dashboard - Frontend Architecture**

## **🔧 WORKING SERVICES & HOOKS** (To Preserve)

### **📡 SSE Service** - `src/services/sse.ts`
**Professional SSE connection to C++ backend on port 8080**

**Features:**
- Real-time telemetry streaming from backend
- Multi-car data support (20 cars)
- Race events (Packet 3 - 30+ event types)
- Car setup data (Packet 5)
- Tyre sets data (Packet 12)
- Live analysis data
- Automatic reconnection with exponential backoff
- Connection status monitoring

**Key Methods:**
```typescript
connect(): Promise<void>                    // Connect to backend SSE
onData(callback: (data: TelemetryData))     // Telemetry updates
onSession(callback: (session: SessionData)) // Session info
onMultiCar(callback: (data: MultiCarData)) // Multi-car dashboard
onEvents(callback: (event: RaceEvent))     // Race events
onTyreSets(callback: (tyreSets: TyreSetsData)) // F1 24 Packet 12
```

### **🤖 AI Service** - `src/services/ai_service.ts`
**OpenAI GPT-4o-mini integration with racing context**

**Features:**
- Real F1 24 gap data integration
- Strategy widget data extraction
- Sector analysis data extraction
- Voice personality modes (Normal/Unhinged/Roast)
- Rate limiting (3-second minimum between calls)
- Widget-based intelligence

### **🎤 Voice Services**
- **Whisper STT** - `src/services/whisper_service.ts`
- **Edge TTS** - `src/services/edge_tts_service.ts`

### **🔗 Telemetry Hook** - `src/hooks/useTelemetry.ts`
**Main hook for real-time telemetry data**

**Returns:**
- Live telemetry data from backend
- Connection status
- Multi-car data for pit wall view
- Race events stream

### **📊 TypeScript Definitions** - `src/types/telemetry.ts`
**Complete type definitions matching backend ProcessedTelemetry**

**Key Interfaces:**
```typescript
interface TelemetryData {
  // F1 24 & AC unified structure
  speed_kph: number;
  rpm: number;
  gear: number;
  throttle_percent: number;
  brake_percent: number;
  gap_to_car_ahead: number;    // Real F1 24 gap data
  gap_to_race_leader: number;
  tire_compound: string;
  ers_deployed_this_lap: number;
  // + 100+ more fields
}

interface MultiCarTelemetryData {
  // Pit wall multi-car view
  num_active_cars: number;
  cars: TelemetryData[];
}

interface TyreSetsData {
  // F1 24 Packet 12 - 20 tyre sets
  sets: TyreSetData[];
  fittedIdx: number;
}
```

---

## **🗑️ CURRENT BROKEN COMPONENTS** (To Delete)

### **❌ Broken Dashboards:**
- `F1DashboardV3.tsx` - Basic prototype
- `F1DashboardV4.tsx` - Basic prototype  
- `GTDashboard.tsx` - Basic prototype
- `LiveRaceAnalysis.tsx` - Broken
- `PostSessionAnalysis.tsx` - Broken

### **❌ Broken Navigation:**
- `MainMenu.tsx` - Basic prototype
- `GameDetails.tsx` - Basic prototype
- `DashboardSelection.tsx` - Basic prototype
- `App.tsx` - Simple navigation logic

### **❌ Missing Professional Features:**
- No real telemetry widget system
- No specialized F1/GT/AC dashboards
- No AI overlay system
- No professional racing UX patterns

---

## **🚀 REPLACEMENT WITH ATLAS OFFICIAL-7**

### **✅ Professional Dashboards:**
- `F1DashboardV4.tsx` - Professional F1 interface (40+ data points)
- `GTDashboard.tsx` - GT racing interface  
- `AIDashboard.tsx` - AI voice interface
- `LiveRaceAnalysis.tsx` - Analysis dashboard
- `PostSessionAnalysis.tsx` - Post-race analysis

### **✅ Professional Navigation:**
- `MainMenu.tsx` - Game launcher with status indicators
- `GameDetails.tsx` - Professional game connection interface
- `DashboardSelection.tsx` - Dashboard picker
- `AIOverlay.tsx` - Floating AI assistant

### **✅ Professional Features:**
- Comprehensive telemetry interfaces
- Sector timing with status indicators (fastest/personal)
- ERS, fuel management, setup controls
- Flag systems and session management
- Professional racing UX patterns

---

## **🔗 INTEGRATION PLAN**

### **Step 1: Preserve Working Services**
```bash
# Keep these files during migration
src/services/sse.ts
src/services/ai_service.ts  
src/services/whisper_service.ts
src/hooks/useTelemetry.ts
src/types/telemetry.ts
package.json (dependencies)
```

### **Step 2: Replace Everything Else**
```bash
# Copy from Atlas Official-7
src/components/ (all professional dashboards)
src/App.tsx (professional navigation)
src/index.css (professional styling)
```

### **Step 3: Connect Real Data**
```typescript
// Replace mock data in Atlas dashboards
const telemetryData = useTelemetry(); // Real backend data
const aiService = useAI(); // Real voice system
```

---

## **🎯 EXPECTED RESULT**
- **Professional racing interface** matching industry standards
- **Real-time telemetry** from powerful C++ backend
- **AI voice assistant** with racing context
- **Multi-game support** (F1 24 + AC)
- **Production-ready** system ready for competition use