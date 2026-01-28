import { useState, useEffect } from 'react';
import { Progress } from './ui/progress';

interface F1TelemetryData {
  speed: number;
  rpm: number;
  gear: string;
  throttle: number;
  brake: number;
  currentLapTime: string;
  lastLapTime: string;
  bestLapTime: string;
  sector1: string;
  sector2: string;
  sector3: string;
  position: number;
  lapNumber: number;
  totalLaps: number;
  delta: number;
  ers: number;
  ersActive: boolean;
  battery: number;
  fuelRemaining: number;
  fuelLapsRemaining: number;
  brakeBalance: number;
  differential: number;
  maxRpm: number;
  drsActive: boolean;
}

type OverlayType = 'none' | 'brakeBalance' | 'differential' | 'flag';

interface FlagData {
  type: 'Green Flag' | 'Yellow Flag' | 'Red Flag';
  sector?: number;
  message: string;
}

export function F1DashboardV2() {
  const [telemetry, setTelemetry] = useState<F1TelemetryData>({
    speed: 298,
    rpm: 10500,
    gear: "6",
    throttle: 87,
    brake: 0,
    currentLapTime: "0:31.234",
    lastLapTime: "1:29.156",
    bestLapTime: "1:28.742",
    sector1: "28.945",
    sector2: "29.234",
    sector3: "30.563",
    position: 3,
    lapNumber: 13,
    totalLaps: 69,
    delta: +0.234,
    ers: 85,
    ersActive: true,
    battery: 73,
    fuelRemaining: 21.4,
    fuelLapsRemaining: 18,
    brakeBalance: 58.2,
    differential: 65,
    maxRpm: 13000,
    drsActive: false,
  });

  const [overlay, setOverlay] = useState<OverlayType>('none');
  const [overlayValue, setOverlayValue] = useState<number | string>('');
  const [flagData, setFlagData] = useState<FlagData>({ type: 'Green Flag', message: 'ALL CLEAR' });
  
  // State change timers for ERS and DRS
  const [ersLastChange, setErsLastChange] = useState<number>(Date.now());
  const [drsLastChange, setDrsLastChange] = useState<number>(Date.now());

  // Simulate real-time telemetry updates
  useEffect(() => {
    const interval = setInterval(() => {
      setTelemetry(prev => {
        const now = Date.now();
        let newErsActive = prev.ersActive;
        let newDrsActive = prev.drsActive;

        // ERS state logic: active for 1-3s, inactive for 6-7s
        if (prev.ersActive && (now - ersLastChange) > (1000 + Math.random() * 2000)) { // 1-3s active
          newErsActive = false;
          setErsLastChange(now);
        } else if (!prev.ersActive && (now - ersLastChange) > (6000 + Math.random() * 1000)) { // 6-7s inactive
          newErsActive = true;
          setErsLastChange(now);
        }

        // DRS state logic: active for 1-3s, inactive for 6-7s  
        if (prev.drsActive && (now - drsLastChange) > (1000 + Math.random() * 2000)) { // 1-3s active
          newDrsActive = false;
          setDrsLastChange(now);
        } else if (!prev.drsActive && (now - drsLastChange) > (6000 + Math.random() * 1000)) { // 6-7s inactive
          newDrsActive = true;
          setDrsLastChange(now);
        }

        return {
          ...prev,
          speed: Math.max(80, Math.min(350, prev.speed + (Math.random() - 0.5) * 35)),
          rpm: Math.max(4500, Math.min(13000, prev.rpm + (Math.random() - 0.5) * 800)),
          gear: Math.random() > 0.85 ? String(Math.max(1, Math.min(8, parseInt(prev.gear) + Math.floor((Math.random() - 0.5) * 2)))) : prev.gear,
          throttle: Math.max(0, Math.min(100, prev.throttle + (Math.random() - 0.5) * 45)),
          brake: Math.max(0, Math.min(100, prev.brake + (Math.random() - 0.5) * 35)),
          ers: Math.max(0, Math.min(100, prev.ers + (Math.random() - 0.5) * 6)),
          battery: Math.max(0, Math.min(100, prev.battery + (Math.random() - 0.5) * 3)),
          fuelRemaining: Math.max(0, prev.fuelRemaining - Math.random() * 0.03),
          delta: prev.delta + (Math.random() - 0.5) * 0.08,
          ersActive: newErsActive,
          drsActive: newDrsActive,
        };
      });
    }, 180);

    return () => clearInterval(interval);
  }, [ersLastChange, drsLastChange]);

  // Simulate setting changes and flag events
  useEffect(() => {
    const settingsInterval = setInterval(() => {
      const random = Math.random();
      
      if (random < 0.08) { // Brake balance change
        const newBB = Math.round(50 + Math.random() * 20);
        setTelemetry(prev => ({ ...prev, brakeBalance: newBB }));
        setOverlayValue(`${newBB}%`);
        setOverlay('brakeBalance');
        setTimeout(() => setOverlay('none'), 2000);
      } else if (random < 0.12) { // Differential change
        const newDiff = Math.round(45 + Math.random() * 35);
        setTelemetry(prev => ({ ...prev, differential: newDiff }));
        setOverlayValue(`${newDiff}%`);
        setOverlay('differential');
        setTimeout(() => setOverlay('none'), 2000);
      } else if (random < 0.16) { // Flag event
        const flags = [
          { type: 'Yellow Flag' as const, sector: 1, message: 'YELLOW FLAG SECTOR 1' },
          { type: 'Yellow Flag' as const, sector: 3, message: 'YELLOW FLAG SECTOR 3' },
          { type: 'Red Flag' as const, message: 'RED FLAG SESSION STOPPED' },
          { type: 'Green Flag' as const, message: 'GREEN FLAG ALL CLEAR' },
        ];
        const flagEvent = flags[Math.floor(Math.random() * flags.length)];
        setFlagData(flagEvent);
        setOverlay('flag');
        setTimeout(() => setOverlay('none'), 3000);
      }
    }, 6000);

    return () => clearInterval(settingsInterval);
  }, []);

  // Generate RPM LEDs (15 total)
  const generateRPMLeds = () => {
    const leds = [];
    const rpmPercentage = (telemetry.rpm / telemetry.maxRpm) * 100;
    const totalLeds = 15;
    const activeLeds = Math.round((rpmPercentage / 100) * totalLeds);

    for (let i = 0; i < totalLeds; i++) {
      let color = 'bg-gray-800/50';
      if (i < activeLeds) {
        if (i < 8) color = 'bg-green-500';
        else if (i < 12) color = 'bg-yellow-500';
        else color = 'bg-red-500';
      }
      
      leds.push(
        <div key={i} className={`w-8 h-4 rounded-sm ${color} border border-gray-700`}></div>
      );
    }
    return leds;
  };

  const getOverlayStyles = () => {
    switch (overlay) {
      case 'brakeBalance':
        return {
          background: 'bg-white',
          text: 'text-black',
          label: 'FBB'
        };
      case 'differential':
        return {
          background: 'bg-blue-600',
          text: 'text-white',
          label: 'DIFF'
        };
      case 'flag':
        if (flagData.type === 'Yellow Flag') return { background: 'bg-yellow-500', text: 'text-black' };
        if (flagData.type === 'Red Flag') return { background: 'bg-red-500', text: 'text-white' };
        return { background: 'bg-green-500', text: 'text-black' };
      default:
        return { background: '', text: '', label: '' };
    }
  };

  const renderOverlay = () => {
    if (overlay === 'none') return null;
    
    const styles = getOverlayStyles();
    
    if (overlay === 'flag') {
      return (
        <div className={`absolute inset-0 ${styles.background} flex items-center justify-center rounded-3xl z-30`}>
          <div className="text-center space-y-6">
            <div className={`text-8xl font-mono tracking-wider ${styles.text}`}>
              {flagData.type.toUpperCase()}
            </div>
            {flagData.sector && (
              <div className={`text-6xl font-mono ${styles.text}`}>
                SECTOR {flagData.sector}
              </div>
            )}
            <div className={`text-4xl font-mono tracking-wide ${styles.text}`}>
              {flagData.message}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className={`absolute inset-0 ${styles.background} flex items-center justify-center rounded-3xl z-30`}>
        <div className="text-center space-y-6">
          <div className={`text-6xl font-mono tracking-wider ${styles.text}`}>
            {styles.label}
          </div>
          <div className={`text-9xl font-mono tracking-tight ${styles.text}`}>
            {overlayValue}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#000000] text-white p-6">
      <div className="mx-auto max-w-[1400px]">
        <div className="mb-6">
          <h1 className="text-3xl tracking-tight text-white/90">F1 TELEMETRY V2</h1>
          <div className="h-0.5 w-32 bg-white mt-2"></div>
        </div>
        
        <div className="flex items-center justify-center min-h-[calc(100vh-220px)]">
          {/* DDU Screen Container - 16:9 aspect ratio */}
          <div className="bg-[#000000] border-4 border-gray-700 rounded-3xl relative overflow-hidden p-[32px] aspect-video w-full max-w-[1200px]">
            
            {/* RPM LEDs at the very top */}
            <div className="flex justify-center gap-2 mb-[77px] relative z-10 mt-[35px] mr-[0px] ml-[0px]">
              {generateRPMLeds()}
            </div>

            {/* Main 3-Column Layout with Vertical Dividers - shifted down more */}
            <div className="relative h-[calc(100%-200px)] grid grid-cols-3 gap-0 mt-12">
              
              {/* Vertical Divider Lines */}
              <div className="absolute left-1/3 top-0 bottom-0 w-px bg-white z-20"></div>
              <div className="absolute left-2/3 top-0 bottom-0 w-px bg-white z-20"></div>
              
              {/* Left Column - POS, LAP, FUEL, DRS */}
              <div className="relative flex flex-col">
                {/* POS */}
                <div className="flex-1 flex flex-col justify-center items-center border-b border-white px-6 py-4">
                  <div className="text-sm text-gray-400 tracking-wider mb-2">POS</div>
                  <div className="text-6xl font-mono text-white">{telemetry.position}</div>
                </div>
                
                {/* LAP */}
                <div className="flex-1 flex flex-col justify-center items-center border-b border-white px-6 py-4">
                  <div className="text-sm text-gray-400 tracking-wider mb-2">LAP</div>
                  <div className="text-4xl font-mono text-white">
                    {telemetry.lapNumber}/{telemetry.totalLaps}
                  </div>
                </div>
                
                {/* FUEL */}
                <div className="flex-1 flex flex-col justify-center items-center border-b border-white px-6 py-4">
                  <div className="text-sm text-blue-400 tracking-wider mb-2">FUEL</div>
                  <div className="text-3xl font-mono text-blue-400">
                    {telemetry.fuelRemaining.toFixed(1)}L
                  </div>
                  <div className="text-lg font-mono text-blue-400 mt-1">
                    {telemetry.fuelLapsRemaining} LAPS
                  </div>
                </div>
                
                {/* DRS */}
                <div className={`flex-1 flex flex-col justify-center items-center px-6 py-4 ${
                  telemetry.drsActive ? 'bg-green-500' : ''
                }`}>
                  <div className={`text-2xl font-mono tracking-wider ${
                    telemetry.drsActive ? 'text-black' : 'text-green-400'
                  }`}>
                    DRS
                  </div>
                </div>
              </div>

              {/* Center Column - GEAR, BATT */}
              <div className="relative flex flex-col items-center justify-center space-y-6">
                {/* Large Gear Display - made even bigger */}
                <div className="text-center">
                  <div className="text-[12rem] font-black text-green-400 p-8 w-72 h-72 flex items-center justify-center">
                    {telemetry.gear}
                  </div>
                </div>

                {/* Horizontal separator */}
                <div className="w-48 h-px bg-white"></div>

                {/* Battery below gear with more spacing */}
                <div className="text-center mt-6">
                  <div className="text-sm text-yellow-400 tracking-wider mb-2">BATT</div>
                  <div className="text-5xl font-mono text-yellow-400">
                    {Math.round(telemetry.battery)}
                  </div>
                </div>
              </div>

              {/* Right Column - DELTA, LAST LAP, CURRENT LAP, ERS */}
              <div className="relative flex flex-col">
                {/* DELTA */}
                <div className="flex-1 flex flex-col justify-center items-center border-b border-white px-6 py-4">
                  <div className="text-sm text-gray-400 tracking-wider mb-2">DELTA</div>
                  <div className={`text-4xl font-mono ${telemetry.delta < 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {telemetry.delta > 0 ? '+' : ''}{telemetry.delta.toFixed(3)}
                  </div>
                </div>

                {/* LAST LAP */}
                <div className="flex-1 flex flex-col justify-center items-center border-b border-white px-6 py-4">
                  <div className="text-sm text-gray-400 tracking-wider mb-2">LAST LAP</div>
                  <div className="text-3xl font-mono text-white">
                    {telemetry.lastLapTime}
                  </div>
                </div>

                {/* CURRENT LAP */}
                <div className="flex-1 flex flex-col justify-center items-center border-b border-white px-6 py-4">
                  <div className="text-sm text-gray-400 tracking-wider mb-2">CURRENT</div>
                  <div className="text-3xl font-mono text-white">
                    {telemetry.currentLapTime}
                  </div>
                </div>
                
                {/* ERS */}
                <div className={`flex-1 flex flex-col justify-center items-center px-6 py-4 ${
                  telemetry.ersActive ? 'bg-yellow-500' : ''
                }`}>
                  <div className={`text-2xl font-mono tracking-wider ${
                    telemetry.ersActive ? 'text-black' : 'text-yellow-400'
                  }`}>
                    ERS
                  </div>
                </div>
              </div>
            </div>

            {/* Overlay for settings changes and flags */}
            {renderOverlay()}
          </div>
        </div>
      </div>
    </div>
  );
}