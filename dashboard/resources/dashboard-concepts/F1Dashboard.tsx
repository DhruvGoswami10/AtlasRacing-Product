import { useState, useEffect } from 'react';
import { Progress } from './ui/progress';
import NurburgringNordschleife1 from '../imports/NurburgringNordschleife1';

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
  fuelRemaining: number;
  fuelLapsRemaining: number;
  brakeBalance: number;
  differential: number;
  maxRpm: number;
}

type OverlayType = 'none' | 'brakeBalance' | 'differential' | 'flag';

interface FlagData {
  type: 'Green Flag' | 'Yellow Flag' | 'Red Flag';
  sector?: number;
  message: string;
}

export function F1Dashboard() {
  const [telemetry, setTelemetry] = useState<F1TelemetryData>({
    speed: 312,
    rpm: 11800,
    gear: "7",
    throttle: 95,
    brake: 0,
    currentLapTime: "0:23.456",
    lastLapTime: "1:28.495",
    bestLapTime: "1:27.945",
    sector1: "29.456",
    sector2: "28.892",
    sector3: "29.597",
    position: 2,
    lapNumber: 15,
    totalLaps: 58,
    delta: -0.187,
    ers: 74,
    fuelRemaining: 18.7,
    fuelLapsRemaining: 12,
    brakeBalance: 55.5,
    differential: 60,
    maxRpm: 13000,
  });

  const [overlay, setOverlay] = useState<OverlayType>('none');
  const [overlayValue, setOverlayValue] = useState<number | string>('');
  const [flagData, setFlagData] = useState<FlagData>({ type: 'Green Flag', message: 'ALL CLEAR' });

  // Simulate real-time telemetry updates
  useEffect(() => {
    const interval = setInterval(() => {
      setTelemetry(prev => ({
        ...prev,
        speed: Math.max(50, Math.min(350, prev.speed + (Math.random() - 0.5) * 40)),
        rpm: Math.max(4000, Math.min(13000, prev.rpm + (Math.random() - 0.5) * 1000)),
        gear: Math.random() > 0.8 ? String(Math.max(1, Math.min(8, parseInt(prev.gear) + Math.floor((Math.random() - 0.5) * 3)))) : prev.gear,
        throttle: Math.max(0, Math.min(100, prev.throttle + (Math.random() - 0.5) * 50)),
        brake: Math.max(0, Math.min(100, prev.brake + (Math.random() - 0.5) * 40)),
        ers: Math.max(0, Math.min(100, prev.ers + (Math.random() - 0.5) * 8)),
        fuelRemaining: Math.max(0, prev.fuelRemaining - Math.random() * 0.05),
        delta: prev.delta + (Math.random() - 0.5) * 0.1,
      }));
    }, 150);

    return () => clearInterval(interval);
  }, []);

  // Simulate setting changes and flag events
  useEffect(() => {
    const settingsInterval = setInterval(() => {
      const random = Math.random();
      
      if (random < 0.1) { // 10% chance for brake balance change
        const newBB = Math.round(50 + Math.random() * 20); // 50-70%
        setTelemetry(prev => ({ ...prev, brakeBalance: newBB }));
        setOverlayValue(`${newBB}%`);
        setOverlay('brakeBalance');
        setTimeout(() => setOverlay('none'), 2000);
      } else if (random < 0.15) { // 5% chance for differential change
        const newDiff = Math.round(40 + Math.random() * 40); // 40-80%
        setTelemetry(prev => ({ ...prev, differential: newDiff }));
        setOverlayValue(`${newDiff}%`);
        setOverlay('differential');
        setTimeout(() => setOverlay('none'), 2000);
      } else if (random < 0.2) { // 5% chance for flag event
        const flags = [
          { type: 'Yellow Flag' as const, sector: 1, message: 'YELLOW FLAG SECTOR 1' },
          { type: 'Yellow Flag' as const, sector: 2, message: 'YELLOW FLAG SECTOR 2' },
          { type: 'Red Flag' as const, message: 'RED FLAG SESSION STOPPED' },
          { type: 'Green Flag' as const, message: 'GREEN FLAG ALL CLEAR' },
        ];
        const flagEvent = flags[Math.floor(Math.random() * flags.length)];
        setFlagData(flagEvent);
        setOverlay('flag');
        setTimeout(() => setOverlay('none'), 3000);
      }
    }, 5000);

    return () => clearInterval(settingsInterval);
  }, []);

  // Generate RPM LEDs
  const generateRPMLeds = () => {
    const leds = [];
    const rpmPercentage = (telemetry.rpm / telemetry.maxRpm) * 100;
    const totalLeds = 15;
    const activeLeds = Math.round((rpmPercentage / 100) * totalLeds);

    for (let i = 0; i < totalLeds; i++) {
      let color = 'bg-gray-800';
      if (i < activeLeds) {
        if (i < 8) color = 'bg-green-500';
        else if (i < 12) color = 'bg-yellow-500';
        else color = 'bg-red-500';
      }
      
      leds.push(
        <div key={i} className={`w-8 h-4 rounded-sm ${color} border border-gray-600`}></div>
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
        <div className={`absolute inset-0 ${styles.background} flex items-center justify-center rounded-3xl z-10`}>
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
      <div className={`absolute inset-0 ${styles.background} flex items-center justify-center rounded-3xl z-10`}>
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
          <h1 className="text-3xl tracking-tight text-white/90">F1 TELEMETRY</h1>
          <div className="h-0.5 w-28 bg-white mt-2"></div>
        </div>
        
        <div className="flex items-center justify-center min-h-[calc(100vh-220px)]">
        {/* DDU Screen Container - 16:9 aspect ratio */}
        <div className="bg-[#000000] border-4 border-gray-700 rounded-3xl relative overflow-hidden p-[28px] aspect-video w-full max-w-[1200px]">
          {/* RPM LEDs at the very top */}
          <div className="flex justify-center gap-2 mb-6">
            {generateRPMLeds()}
          </div>

          {/* Top Info Row - Race, Position, Lap, Delta */}
          <div className="grid grid-cols-4 gap-6 mb-8">
            <div className="text-center">
              <div className="text-3xl font-mono">{telemetry.lapNumber}</div>
              <div className="text-sm text-gray-400">LAP</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-mono">P{telemetry.position}</div>
              <div className="text-sm text-gray-400">POS</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-mono">{telemetry.lapNumber}/{telemetry.totalLaps}</div>
              <div className="text-sm text-gray-400">RACE</div>
            </div>
            <div className="text-center">
              <div className={`text-3xl font-mono ${telemetry.delta < 0 ? 'text-green-400' : 'text-red-400'}`}>
                {telemetry.delta > 0 ? '+' : ''}{telemetry.delta.toFixed(3)}
              </div>
              <div className="text-sm text-gray-400">DELTA</div>
            </div>
          </div>

          {/* Main Content Row */}
          <div className="grid grid-cols-12 gap-6 mb-8 flex-1">
            {/* Left Side - Lap Times */}
            <div className="col-span-4 space-y-6">
              <div className="text-center">
                <div className="text-sm text-gray-400 mb-2">CURRENT</div>
                <div className="text-4xl font-mono text-white border-2 border-gray-600 rounded p-4">
                  {telemetry.currentLapTime}
                </div>
              </div>
              
              <div className="text-center">
                <div className="text-sm text-gray-400 mb-2">LAST</div>
                <div className="text-3xl font-mono text-yellow-400 border-2 border-gray-600 rounded p-3">
                  {telemetry.lastLapTime}
                </div>
              </div>

              <div className="text-center">
                <div className="text-sm text-gray-400 mb-2">BEST</div>
                <div className="text-3xl font-mono text-green-400 border-2 border-gray-600 rounded p-3">
                  {telemetry.bestLapTime}
                </div>
              </div>

              {/* Sector Times */}
              <div className="grid grid-cols-3 gap-2">
                <div className="text-center">
                  <div className="text-xs text-gray-400">S1</div>
                  <div className="text-lg font-mono">{telemetry.sector1}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-gray-400">S2</div>
                  <div className="text-lg font-mono">{telemetry.sector2}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-gray-400">S3</div>
                  <div className="text-lg font-mono">{telemetry.sector3}</div>
                </div>
              </div>
            </div>

            {/* Center - Gear and Speed */}
            <div className="col-span-4 flex flex-col justify-center items-center space-y-6">
              <div className="text-center">
                <div className="text-9xl font-mono text-green-400 border-4 border-green-400 rounded-2xl p-8 w-48 h-48 flex items-center justify-center">
                  {telemetry.gear}
                </div>
              </div>
              
              <div className="text-center">
                <div className="text-6xl font-mono text-white">
                  {Math.round(telemetry.speed)}
                </div>
                <div className="text-2xl text-gray-400">KM/H</div>
              </div>

              <div className="text-center">
                <div className="text-4xl font-mono text-cyan-400">
                  {Math.round(telemetry.rpm)}
                </div>
                <div className="text-lg text-gray-400">RPM</div>
              </div>
            </div>

            {/* Right Side - Throttle and Brake Bars */}
            <div className="col-span-4 flex justify-center items-center space-x-8">
              {/* Throttle Bar */}
              <div className="flex flex-col items-center space-y-4">
                <div className="text-sm text-gray-400">THR</div>
                <div className="w-12 h-80 bg-gray-800 rounded-lg relative border-2 border-gray-600">
                  <div 
                    className="absolute bottom-0 left-0 right-0 bg-green-500 rounded-lg transition-all duration-100"
                    style={{ height: `${telemetry.throttle}%` }}
                  ></div>
                </div>
                <div className="text-2xl font-mono">{Math.round(telemetry.throttle)}</div>
              </div>

              {/* Brake Bar */}
              <div className="flex flex-col items-center space-y-4">
                <div className="text-sm text-gray-400">BRK</div>
                <div className="w-12 h-80 bg-gray-800 rounded-lg relative border-2 border-gray-600">
                  <div 
                    className="absolute bottom-0 left-0 right-0 bg-red-500 rounded-lg transition-all duration-100"
                    style={{ height: `${telemetry.brake}%` }}
                  ></div>
                </div>
                <div className="text-2xl font-mono">{Math.round(telemetry.brake)}</div>
              </div>
            </div>
          </div>

          {/* Bottom Section - ERS and Fuel */}
          <div className="grid grid-cols-2 gap-8">
            {/* ERS Bar */}
            <div className="space-y-3">
              <div className="text-center text-sm text-gray-400">ERS DEPLOYMENT</div>
              <div className="bg-gray-800 rounded-lg h-6 border-2 border-gray-600">
                <div 
                  className="h-full bg-gradient-to-r from-yellow-400 to-green-400 rounded transition-all duration-200"
                  style={{ width: `${telemetry.ers}%` }}
                ></div>
              </div>
              <div className="text-center text-2xl font-mono text-yellow-400">
                {Math.round(telemetry.ers)}%
              </div>
            </div>

            {/* Fuel */}
            <div className="text-center space-y-3">
              <div className="text-sm text-gray-400">FUEL</div>
              <div className="text-4xl font-mono text-cyan-400">
                {telemetry.fuelRemaining.toFixed(1)}L
              </div>
              <div className="text-xl font-mono text-gray-300">
                {telemetry.fuelLapsRemaining} LAPS
              </div>
            </div>
          </div>

          {/* Bottom left - Settings and Track Map */}
          <div className="absolute bottom-4 left-4 space-y-3">
            <div className="text-sm text-gray-400">
              BB: {telemetry.brakeBalance.toFixed(1)}% | DIFF: {telemetry.differential}%
            </div>
          </div>

          {/* Overlay */}
          {renderOverlay()}
        </div>
        </div>
      </div>
    </div>
  );
}