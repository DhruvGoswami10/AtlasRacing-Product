import { useState, useEffect, useRef } from 'react';
import { useTelemetry } from '../hooks/useTelemetry';
import { TelemetryData } from '../types/telemetry';

interface F1TelemetryData {
  speed: number;
  rpm: number;
  gear: string;
  throttle: number;
  brake: number;
  currentLapTime: string;
  estimatedLapTime: string;
  lastLapTime: string;
  bestLapTime: string;
  sector1: string;
  sector2: string;
  sector3: string;
  sector1Status: 'fastest' | 'personal' | 'none'; // purple, green, yellow
  sector2Status: 'fastest' | 'personal' | 'none';
  sector3Status: 'fastest' | 'personal' | 'none';
  position: number;
  lapNumber: number;
  totalLaps: number;
  delta: number;
  estimatedDelta: number;
  ers: number;
  ersDeploying: boolean; // true when ERS is actively deploying (mode > 0)
  fuelRemaining: number;
  fuelLapsRemaining: number;
  brakeBalance: number;
  differential: number;
  maxRpm: number;
  drsOpen: boolean;
  drsEnabled: boolean;
  sessionType: 'FP1' | 'FP2' | 'FP3' | 'Q1' | 'Q2' | 'Q3' | 'RACE' | 'TIME TRIAL';
  tyreCompound: 'SOFT' | 'MEDIUM' | 'HARD' | 'INTER' | 'WET';
  tyreWearFL: number;
  tyreWearFR: number;
  tyreWearRL: number;
  tyreWearRR: number;
  pitWindowOpen: boolean;
  pitWindowStart: number;
  pitWindowEnd: number;
}

type OverlayType = 'none' | 'brakeBalance' | 'differential' | 'flag';

interface FlagData {
  type: 'Green Flag' | 'Yellow Flag' | 'Red Flag';
  sector?: number;
  message: string;
}

// Helper function to convert telemetry status codes to strings
const getSectorStatus = (status?: number): 'fastest' | 'personal' | 'none' => {
  switch (status) {
    case 2: return 'fastest';  // Purple
    case 1: return 'personal'; // Green
    default: return 'none';    // Yellow
  }
};

const getSessionType = (sessionType?: number): 'FP1' | 'FP2' | 'FP3' | 'Q1' | 'Q2' | 'Q3' | 'RACE' | 'TIME TRIAL' => {
  switch (sessionType) {
    case 1: return 'FP1';
    case 2: return 'FP2';
    case 3: return 'FP3';
    case 5: return 'Q1';
    case 6: return 'Q2';
    case 7: return 'Q3';
    case 10: return 'RACE';
    case 18: return 'TIME TRIAL';
    default: return 'RACE';
  }
};

const formatTime = (timeInSeconds: number): string => {
  if (timeInSeconds <= 0) return "0:00.000";
  const minutes = Math.floor(timeInSeconds / 60);
  const seconds = (timeInSeconds % 60).toFixed(3);
  return `${minutes}:${seconds.padStart(6, '0')}`;
};

const formatSectorTime = (timeInSeconds: number): string => {
  if (timeInSeconds <= 0) return "0.000";
  return timeInSeconds.toFixed(3);
};

// Convert real telemetry to dashboard format
const convertTelemetry = (data: TelemetryData | null): F1TelemetryData => {
  if (!data) {
    // Fallback dummy data when no connection
    return {
      speed: 0,
      rpm: 0,
      gear: "N",
      throttle: 0,
      brake: 0,
      currentLapTime: "0:00.000",
      estimatedLapTime: "0:00.000",
      lastLapTime: "0:00.000",
      bestLapTime: "0:00.000",
      sector1: "0.000",
      sector2: "0.000",
      sector3: "0.000",
      sector1Status: 'none',
      sector2Status: 'none',
      sector3Status: 'none',
      position: 0,
      lapNumber: 0,
      totalLaps: 0,
      delta: 0,
      estimatedDelta: 0,
      ers: 0,
      ersDeploying: false,
      fuelRemaining: 0,
      fuelLapsRemaining: 0,
      brakeBalance: 50,
      differential: 50,
      maxRpm: 13000,
      drsOpen: false,
      drsEnabled: false,
      sessionType: 'RACE',
      tyreCompound: 'MEDIUM',
      tyreWearFL: 0,
      tyreWearFR: 0,
      tyreWearRL: 0,
      tyreWearRR: 0,
      pitWindowOpen: false,
      pitWindowStart: 0,
      pitWindowEnd: 0,
    };
  }

  return {
    // Basic telemetry - convert from backend format
    speed: Math.round(data.speed_kph || 0),
    rpm: data.rpm || 0,
    gear: data.gear === 0 ? "N" : data.gear === -1 ? "R" : String(data.gear),
    throttle: Math.round(data.throttle_percent || 0),
    brake: Math.round(data.brake_percent || 0),

    // Timing data - convert from seconds to formatted strings
    currentLapTime: formatTime(data.current_lap_time || 0),
    estimatedLapTime: formatTime(data.estimated_lap_time || 0),
    lastLapTime: formatTime(data.last_lap_time || 0),
    bestLapTime: formatTime(data.best_lap_time || 0),

    // Sector times - convert from seconds
    sector1: formatSectorTime(data.sector1_time || 0),
    sector2: formatSectorTime(data.sector2_time || 0),
    sector3: formatSectorTime(data.sector3_time || 0),

    // F1 Pro Dashboard fields - sector status colors
    sector1Status: getSectorStatus(data.sector1_status),
    sector2Status: getSectorStatus(data.sector2_status),
    sector3Status: getSectorStatus(data.sector3_status),

    // Position and lap data
    position: data.position || 0,
    lapNumber: data.current_lap_num || 0,
    totalLaps: data.total_laps || 0,

    // F1 Pro Dashboard fields - delta timing
    delta: data.delta_time || 0,
    estimatedDelta: data.delta_time || 0, // Use same delta for now

    // ERS and fuel data
    ers: Math.round(((data.ers_store_energy || 0) / 4.0) * 100), // Convert MJ (0-4) to percentage (0-100)
    ersDeploying: (data.ers_deploy_mode || 0) > 0, // Check if ERS is actively deploying
    fuelRemaining: data.fuel_in_tank || 0,
    fuelLapsRemaining: Math.round(data.fuel_remaining_laps || 0),

    // F1 Pro Dashboard fields - car setup
    brakeBalance: data.brake_bias || 50,
    // Fix: F1 24 sends differential differently in Race vs Time Trial
    // Time Trial: sends correct percentage (10-100)
    // Race: may send raw value that needs conversion
    differential: (() => {
      const raw = data.differential_on_throttle || 70;
      const sessionType = getSessionType(data.session_type);

      // Time Trial works correctly, don't change it
      if (sessionType === 'TIME TRIAL') {
        return Math.min(100, Math.max(10, raw));
      }

      // In Race mode, backend might not be sending the value at all
      // or sending 0, which defaults to 70
      if (raw === 0 || !data.differential_on_throttle) {
        return 70; // Default middle value
      }

      // If value is exactly 100, it might be clamped already
      if (raw === 100) {
        return 100;
      }

      // If value is > 100, it's likely a raw 0-255 value
      if (raw > 100) {
        // Map 0-255 to 10-100 range
        return Math.round(10 + (raw / 255) * 90);
      }

      // Otherwise clamp to 10-100 range
      return Math.min(100, Math.max(10, raw));
    })(),
    maxRpm: data.max_rpm || 13000,

    // F1 Pro Dashboard fields - DRS
    drsOpen: (data.drs_open || 0) === 1,
    drsEnabled: (data.drs_allowed || 0) === 1,

    // Session info
    sessionType: getSessionType(data.session_type),

    // Tyre data
    tyreCompound: (data.tire_compound || 'MEDIUM').toUpperCase() as any,
    tyreWearFL: Math.round(data.tire_wear?.[2] || 0), // FL - already in percentage
    tyreWearFR: Math.round(data.tire_wear?.[3] || 0), // FR - already in percentage
    tyreWearRL: Math.round(data.tire_wear?.[0] || 0), // RL - already in percentage
    tyreWearRR: Math.round(data.tire_wear?.[1] || 0), // RR - already in percentage

    // F1 Pro Dashboard fields - pit window
    pitWindowOpen: (data.pit_window_open || 0) === 1,
    pitWindowStart: data.pit_window_ideal_lap || 0,
    pitWindowEnd: data.pit_window_latest_lap || 0,
  };
};

export function F1ProDashboard() {
  const { telemetry: rawTelemetry, isConnected, connect } = useTelemetry();
  const [telemetry, setTelemetry] = useState<F1TelemetryData>(convertTelemetry(null));

  const [overlay, setOverlay] = useState<OverlayType>('none');
  const [overlayValue, setOverlayValue] = useState<number | string>('');
  const [flagData, setFlagData] = useState<FlagData>({ type: 'Green Flag', message: 'ALL CLEAR' });

  // Track previous values for change detection
  const prevBrakeBalanceRef = useRef<number>(50);
  const prevDifferentialRef = useRef<number>(50);
  const settingsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const flagTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastFlagTypeRef = useRef<string>('Green Flag');
  const lastFlagDataRef = useRef<string>('');  // Track last flag to prevent re-triggering

  // Connect to backend when component mounts
  useEffect(() => {
    connect();
  }, [connect]);

  // Connect to real telemetry data from backend
  useEffect(() => {
    if (rawTelemetry) {
      const newTelemetry = convertTelemetry(rawTelemetry);
      setTelemetry(newTelemetry);
    }
  }, [rawTelemetry]);

  // Monitor for real car setup changes to show overlays with progressive timeout
  useEffect(() => {
    // Check for brake balance changes (ignore initial value)
    if (prevBrakeBalanceRef.current !== telemetry.brakeBalance &&
        telemetry.brakeBalance > 0 &&
        prevBrakeBalanceRef.current > 0) {

      // Show overlay with current value
      setOverlayValue(`BB ${telemetry.brakeBalance.toFixed(1)}%`);
      setOverlay('brakeBalance');

      // Clear existing timeout if still adjusting
      if (settingsTimeoutRef.current) {
        clearTimeout(settingsTimeoutRef.current);
      }

      // Set new timeout - hide after 1.5 seconds of no changes
      settingsTimeoutRef.current = setTimeout(() => {
        setOverlay('none');
      }, 1500);
    }
    prevBrakeBalanceRef.current = telemetry.brakeBalance;

    // Check for differential changes (ignore initial value)
    if (prevDifferentialRef.current !== telemetry.differential &&
        telemetry.differential > 0 &&
        prevDifferentialRef.current > 0) {

      // Show overlay with current value
      setOverlayValue(`DIFF ${telemetry.differential}%`);
      setOverlay('differential');

      // Clear existing timeout if still adjusting
      if (settingsTimeoutRef.current) {
        clearTimeout(settingsTimeoutRef.current);
      }

      // Set new timeout - hide after 1.5 seconds of no changes
      settingsTimeoutRef.current = setTimeout(() => {
        setOverlay('none');
      }, 1500);
    }
    prevDifferentialRef.current = telemetry.differential;
  }, [telemetry.brakeBalance, telemetry.differential]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (settingsTimeoutRef.current) {
        clearTimeout(settingsTimeoutRef.current);
      }
    };
  }, []);

  // Monitor for flag changes from real F1 24 marshal zones
  useEffect(() => {
    // Create a flag signature to detect actual changes
    const currentFlagSignature = `${rawTelemetry?.safety_car_status || 0}-${JSON.stringify(rawTelemetry?.marshal_zone_flags || [])}`;

    // Only process if flags actually changed
    if (currentFlagSignature === lastFlagDataRef.current) {
      return; // No change, don't reset timers
    }
    lastFlagDataRef.current = currentFlagSignature;

    // Handle Safety Car and VSC
    if (rawTelemetry?.safety_car_status && rawTelemetry.safety_car_status > 0) {
      switch (rawTelemetry.safety_car_status) {
        case 1:
          setFlagData({ type: 'Yellow Flag', message: 'SAFETY CAR DEPLOYED' });
          setOverlay('flag');
          lastFlagTypeRef.current = 'Yellow Flag';
          flagTimeoutRef.current = setTimeout(() => {
            setOverlay('none');
            flagTimeoutRef.current = null;
          }, 3000);
          break;
        case 2:
          setFlagData({ type: 'Yellow Flag', message: 'VIRTUAL SAFETY CAR' });
          setOverlay('flag');
          lastFlagTypeRef.current = 'Yellow Flag';
          flagTimeoutRef.current = setTimeout(() => {
            setOverlay('none');
            flagTimeoutRef.current = null;
          }, 3000);
          break;
      }
    } else if (rawTelemetry?.marshal_zone_flags && rawTelemetry.marshal_zone_flags.length > 0) {
      // Check for flags in marshal zones (flag codes: 0=none, 1=green, 2=blue, 3=yellow, 4=red)
      const yellowFlags = rawTelemetry.marshal_zone_flags.filter(flag => flag === 3);
      const redFlags = rawTelemetry.marshal_zone_flags.filter(flag => flag === 4);
      const greenFlags = rawTelemetry.marshal_zone_flags.filter(flag => flag === 1);

      if (redFlags.length > 0) {
        setFlagData({ type: 'Red Flag', message: 'RED FLAG - SESSION STOPPED' });
        setOverlay('flag');
        lastFlagTypeRef.current = 'Red Flag';
        flagTimeoutRef.current = setTimeout(() => {
          setOverlay('none');
          flagTimeoutRef.current = null;
        }, 5000);
      } else if (yellowFlags.length > 0) {
        // Find which sector has the yellow flag (index in marshal_zone_flags)
        const yellowZoneIndex = rawTelemetry.marshal_zone_flags.findIndex(flag => flag === 3);
        // Convert zone index to sector (divide track into 3 sectors)
        const totalZones = rawTelemetry.marshal_zones_count || rawTelemetry.marshal_zone_flags.length || 15;
        // Calculate sector: zones are 0-indexed, sectors are 1-3
        const zonesPerSector = totalZones / 3;
        const sector = Math.ceil((yellowZoneIndex + 1) / zonesPerSector);

        setFlagData({ type: 'Yellow Flag', message: `YELLOW FLAG - SECTOR ${sector}` });
        setOverlay('flag');
        lastFlagTypeRef.current = 'Yellow Flag';
        flagTimeoutRef.current = setTimeout(() => {
          setOverlay('none');
          flagTimeoutRef.current = null;
        }, 3000);
      } else if (greenFlags.length > 0 && lastFlagTypeRef.current !== 'Green Flag') {
        // Show green flag only if we were previously under yellow/red
        setFlagData({ type: 'Green Flag', message: 'ALL CLEAR' });
        setOverlay('flag');
        lastFlagTypeRef.current = 'Green Flag';
        flagTimeoutRef.current = setTimeout(() => {
          setOverlay('none');
          flagTimeoutRef.current = null;
        }, 2000);
      }
    } else {
      // No flags detected, reset to green if we were under caution
      if (lastFlagTypeRef.current !== 'Green Flag') {
        setFlagData({ type: 'Green Flag', message: 'ALL CLEAR' });
        setOverlay('flag');
        lastFlagTypeRef.current = 'Green Flag';
        flagTimeoutRef.current = setTimeout(() => {
          setOverlay('none');
          flagTimeoutRef.current = null;
        }, 2000);
      }
    }
  }, [rawTelemetry, telemetry.brakeBalance, telemetry.differential]);

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
        <div key={i} className={`w-[120px] h-8 rounded-sm ${color} border border-gray-600`}></div>
      );
    }
    return leds;
  };

  const getSectorBarColor = (status: string) => {
    switch (status) {
      case 'fastest': return 'bg-purple-500';
      case 'personal': return 'bg-green-500';
      default: return 'bg-yellow-500';
    }
  };

  const getTyreCompoundColor = () => {
    switch (telemetry.tyreCompound) {
      case 'SOFT': return 'text-red-400';
      case 'MEDIUM': return 'text-yellow-400';
      case 'HARD': return 'text-white';
      case 'INTER': return 'text-green-400';
      case 'WET': return 'text-blue-400';
      default: return 'text-gray-400';
    }
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
          background: 'bg-slate-700',
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
    // Always render the overlay container for smooth transitions
    const styles = getOverlayStyles();
    const isVisible = overlay !== 'none';

    if (overlay === 'flag' || (overlay === 'none' && flagData.type !== 'Green Flag')) {
      return (
        <div className={`absolute inset-0 ${styles.background} flex items-center justify-center rounded-3xl z-10 transition-opacity duration-300 ease-in-out ${
          overlay === 'flag' ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}>
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
      <div className={`absolute inset-0 ${styles.background} flex items-center justify-center rounded-3xl z-10 transition-opacity duration-300 ease-in-out ${
        isVisible && (overlay === 'brakeBalance' || overlay === 'differential') ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}>
        <div className="text-center space-y-6">
          <div className={`text-6xl font-mono tracking-wider ${styles.text} transition-all duration-200`}>
            {styles.label}
          </div>
          <div className={`text-9xl font-[Metrophobic] tracking-tight ${styles.text} transition-all duration-200`}>
            {overlayValue}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="f1-pro-dashboard min-h-screen bg-[#050505] text-white p-6 pt-16 overflow-auto">
      <div className="mx-auto max-w-[1400px]">
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl tracking-tight text-white/90">F1 PRO DASHBOARD</h1>
              <div className="h-0.5 w-28 bg-white mt-2"></div>
            </div>

            {/* Connection Status */}
            <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm font-mono ${
              isConnected && rawTelemetry
                ? 'bg-green-900/30 text-green-400'
                : 'bg-red-900/30 text-red-400'
            }`}>
              <div className={`w-2 h-2 rounded-full ${
                isConnected && rawTelemetry ? 'bg-green-400' : 'bg-red-400'
              }`} />
              {isConnected && rawTelemetry ? 'LIVE TELEMETRY' : 'NO CONNECTION'}
            </div>
          </div>
        </div>
        
        <div className="flex items-center justify-center min-h-[calc(100vh-220px)]">
          {/* DDU Screen Container - 16:9 aspect ratio */}
          <div className="bg-[#000000] border-4 border-gray-700 rounded-3xl relative overflow-hidden p-[28px] w-full max-w-[1200px]" style={{ paddingBottom: `calc(1.75rem + var(--f1-bottom-padding))`, minHeight: `calc(var(--f1-main-height) + var(--f1-bottom-padding))` }}>
            
            {/* RPM LEDs with ERS and DRS on the same level */}
            <div className="grid grid-cols-3 items-center mb-6 gap-4">
              {/* ERS - Left side */}
              <div className="flex justify-start">
                <div className={`flex items-center justify-center px-4 py-2 rounded text-lg font-mono tracking-wider ${
                  // Show yellow background when ERS is actively deploying
                  telemetry.ersDeploying
                    ? 'bg-yellow-500 text-black'
                    : 'text-yellow-400'
                }`}>
                  ERS {Math.round(telemetry.ers)}%
                </div>
              </div>

              {/* RPM LEDs - Center */}
              <div className="flex justify-center gap-3">
                {generateRPMLeds()}
              </div>

              {/* DRS - Right side */}
              <div className="flex justify-end">
                <div className={`flex items-center justify-center px-4 py-2 rounded text-lg font-mono tracking-wider min-w-[120px] ${
                  telemetry.drsOpen ? 'bg-green-500 text-black' : 'text-green-400'
                }`}>
                  DRS {telemetry.drsOpen ? 'OPEN' : telemetry.drsEnabled ? 'AVAIL' : 'OFF'}
                </div>
              </div>
            </div>

            {/* Header Row - Position, Race Info, Session, Fuel */}
            <div className="grid grid-cols-4 mb-6 border-y border-white divide-x divide-white">
              <div className="flex flex-col justify-center items-center px-6 py-4 h-30">
                <div className="text-sm text-gray-400 tracking-wider mb-2">POS</div>
                <div className="text-4xl font-[Metrophobic]">P{telemetry.position}</div>
              </div>
              <div className="flex flex-col justify-center items-center px-6 py-4">
                <div className="text-sm text-gray-400 tracking-wider mb-2">LAP</div>
                <div className="text-3xl font-[Metrophobic]">{telemetry.lapNumber}/{telemetry.totalLaps}</div>
              </div>
              <div className="flex flex-col justify-center items-center px-6 py-4">
                <div className="text-sm text-gray-400 tracking-wider mb-2">SESSION</div>
                <div className="text-3xl font-[Metrophobic]">{telemetry.sessionType}</div>
              </div>
              <div className="flex flex-col justify-center items-center px-6 py-4">
                <div className="text-sm text-gray-400 tracking-wider mb-2">FUEL</div>
                <div className="text-3xl font-[Metrophobic] text-cyan-400">
                  {telemetry.fuelRemaining.toFixed(1)}L
                </div>
                <div className="text-xs text-cyan-400">{telemetry.fuelLapsRemaining} LAPS</div>
              </div>
            </div>

            {/* Main Content - Single Grid with Proper Cell Structure */}
            <div className="grid grid-cols-3 h-[calc(100%-200px)]  p-[0px] mx-[0px] my-[1px]">
              
              {/* Left Column - Timing Data */}
              <div className="border-r border-white flex flex-col divide-y divide-white">
                <div className="flex-1 flex flex-col justify-center items-center px-6 py-6">
                  <div className="text-lg text-gray-400 tracking-wider mb-3">DELTA</div>
                  <div className={`text-5xl font-[Metrophobic] ${
                    telemetry.delta < 0 ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {telemetry.delta > 0 ? '+' : ''}{telemetry.delta.toFixed(3)}
                  </div>
                </div>
                
                <div className="flex-1 flex flex-col justify-center items-center px-6 py-6">
                  <div className="text-lg text-gray-400 tracking-wider mb-3">ESTIMATED</div>
                  <div className="text-4xl font-[Metrophobic] text-[rgba(255,255,255,1)]">
                    {telemetry.estimatedLapTime}
                  </div>
                </div>

                <div className="flex-1 flex flex-col justify-center items-center px-6 py-6">
                  <div className="text-lg text-gray-400 tracking-wider mb-3">LAST</div>
                  <div className="text-4xl font-[Metrophobic] text-yellow-400">
                    {telemetry.lastLapTime}
                  </div>
                </div>

                <div className="flex-1 flex flex-col justify-center items-center px-6 py-6">
                  <div className="text-lg text-gray-400 tracking-wider mb-3">BEST</div>
                  <div className="text-4xl font-[Metrophobic] text-purple-400">
                    {telemetry.bestLapTime}
                  </div>
                </div>
              </div>

              {/* Center Column - Gear with Sectors */}
              <div className="border-r border-white flex flex-col justify-center items-center space-y-8 px-6">
                
                {/* Sector Timing Bars */}
                <div className="w-full">
                  <div className="grid grid-cols-3 gap-6">
                    <div className="text-center">
                      <div className="text-sm text-gray-400 mb-2">S1</div>
                      <div className={`h-4 rounded-full ${getSectorBarColor(telemetry.sector1Status)}`}></div>
                      <div className="text-lg font-[Metrophobic] mt-2">{telemetry.sector1}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-sm text-gray-400 mb-2">S2</div>
                      <div className={`h-4 rounded-full ${getSectorBarColor(telemetry.sector2Status)}`}></div>
                      <div className="text-lg font-[Metrophobic] mt-2">{telemetry.sector2}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-sm text-gray-400 mb-2">S3</div>
                      <div className={`h-4 rounded-full ${getSectorBarColor(telemetry.sector3Status)}`}></div>
                      <div className="text-lg font-[Metrophobic] mt-2">{telemetry.sector3}</div>
                    </div>
                  </div>
                </div>

                {/* Gear Display */}
                <div className="text-[200px] font-black text-[rgba(255,255,255,1)] leading-none font-[Oxanium]">
                  {telemetry.gear}
                </div>

                {/* Divider */}
                <div className="w-48 h-px bg-white"></div>
                
                {/* Speed */}
                <div className="text-center">
                  <div className="text-lg text-white-400 tracking-wider mb-3">SPEED</div>
                  <div className="text-6xl font-[Metrophobic] text-white-400">
                    {Math.round(telemetry.speed)}
                  </div>
                </div>
              </div>

              {/* Right Column - Tyre Data */}
              <div className="flex flex-col divide-y divide-white">
                <div className="flex-1 flex flex-col justify-center items-center px-6 py-6">
                  <div className="text-lg text-gray-400 tracking-wider mb-3">COMPOUND</div>
                  <div className={`text-4xl font-mono ${getTyreCompoundColor()}`}>
                    {telemetry.tyreCompound}
                  </div>
                </div>

                <div className="flex-1 flex flex-col justify-center items-center px-6 py-6">
                  <div className="text-lg text-gray-400 tracking-wider mb-4">TYRE WEAR (%)</div>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="text-center">
                      <div className="text-sm text-gray-400 mb-2">FL</div>
                      <div className="text-2xl font-[Metrophobic] text-white">
                        {Math.round(telemetry.tyreWearFL)}%
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-sm text-gray-400 mb-2">FR</div>
                      <div className="text-2xl font-[Metrophobic] text-white">
                        {Math.round(telemetry.tyreWearFR)}%
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-sm text-gray-400 mb-2">RL</div>
                      <div className="text-2xl font-[Metrophobic] text-white">
                        {Math.round(telemetry.tyreWearRL)}%
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-sm text-gray-400 mb-2">RR</div>
                      <div className="text-2xl font-[Metrophobic] text-white">
                        {Math.round(telemetry.tyreWearRR)}%
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex-1 flex flex-col justify-center items-center px-6 py-6">
                  <div className="text-lg text-gray-400 tracking-wider mb-3">PIT WINDOW</div>
                  <div className={`text-3xl font-[Metrophobic] ${
                    telemetry.pitWindowOpen ? 'text-green-400' : 'text-gray-400'
                  }`}>
                    {telemetry.pitWindowOpen ? 'OPEN' : 'CLOSED'}
                  </div>
                  <div className="text-lg font-[Metrophobic] text-gray-300 mt-2">
                    L{telemetry.pitWindowStart}-{telemetry.pitWindowEnd}
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom left - Settings */}
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
