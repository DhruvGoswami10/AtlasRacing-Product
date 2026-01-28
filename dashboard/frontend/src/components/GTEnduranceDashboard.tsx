import { useEffect, useMemo, useRef, useState } from 'react';
import { useTelemetry } from '../hooks/useTelemetry';
import { convertTelemetry } from '../utils/telemetryConverter';

type OverlayType = 'none' | 'flag';

interface FlagData {
  type: 'Green Flag' | 'Yellow Flag' | 'Red Flag' | 'Blue Flag';
  sector?: number;
  message: string;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const toOneDecimal = (value?: number | null, fallback = 0): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.round(value * 10) / 10;
};

const toInteger = (value?: number | null, fallback = 0): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.round(value);
};

const formatSignedDelta = (value?: number | null, fractionDigits = 3): string => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '--';
  }

  if (Math.abs(value) < 0.0005) {
    return `0.${'0'.repeat(fractionDigits - 1)}0`;
  }

  return `${value > 0 ? '+' : '-'}${Math.abs(value).toFixed(fractionDigits)}`;
};

const formatSessionCountdown = (value?: number | null): string => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return '--:--.-';
  }

  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  const tenths = Math.floor((value - Math.floor(value)) * 10);

  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${tenths}`;
};

const normalizeSector = (sector?: number | null): number | undefined => {
  if (typeof sector !== 'number' || !Number.isFinite(sector)) {
    return undefined;
  }
  return Math.min(3, Math.max(1, Math.floor(sector) + 1));
};

const mapFlagData = (flag: string, sector?: number | null): FlagData => {
  const normalizedSector = normalizeSector(sector);

  switch (flag) {
    case 'Yellow':
      return {
        type: 'Yellow Flag',
        sector: normalizedSector,
        message: normalizedSector ? `YELLOW FLAG SECTOR ${normalizedSector}` : 'YELLOW FLAG'
      };
    case 'Red':
      return {
        type: 'Red Flag',
        message: 'RED FLAG SESSION STOPPED'
      };
    case 'Blue':
      return {
        type: 'Blue Flag',
        sector: normalizedSector,
        message: 'BLUE FLAG LET FASTER CAR PASS'
      };
    case 'Green':
      return {
        type: 'Green Flag',
        sector: normalizedSector,
        message: 'GREEN FLAG ALL CLEAR'
      };
    default:
      return {
        type: 'Green Flag',
        sector: normalizedSector,
        message: 'ALL CLEAR'
      };
  }
};

interface GTDisplayData {
  speed: number;
  rpm: number;
  maxRpm: number;
  gear: string;
  throttle: number;
  brake: number;
  fuelLevel: number;
  fuelPerLap: number;
  fuelLastLap: number;
  lapsOfFuel: number;
  tyreTemps: {
    frontLeft: number;
    frontRight: number;
    rearLeft: number;
    rearRight: number;
  };
  tyreWear: {
    frontLeft: number;
    frontRight: number;
    rearLeft: number;
    rearRight: number;
  };
  tractionControl: number;
  tcCut: number;
  brakeBalance: number;
  abs: number;
  engineMap: number;
  lapTime: string;
  lastLap: string;
  bestLap: string;
  timeDiff: string;
  delta: string;
  sessionTime: string;
  currentLap: number;
  totalLaps: number;
  position: number;
  trackCondition: string;
  session: string;
  gapAhead: number;
  gapBehind: number;
  currentStintTime: string;
  positionAfterPit: number;
}

export function GTEnduranceDashboard() {
  const { telemetry, liveAnalysis } = useTelemetry();
  const [overlay, setOverlay] = useState<OverlayType>('none');
  const [flagData, setFlagData] = useState<FlagData>({ type: 'Green Flag', message: 'ALL CLEAR' });

  const standardTelemetry = useMemo(() => convertTelemetry(telemetry), [telemetry]);

  const telemetryData = useMemo<GTDisplayData>(() => {
    const raw = (standardTelemetry.raw ?? {}) as Record<string, any>;
    const acExtended = (raw?.ac_extended ?? {}) as Record<string, any>;
    const atlasAI = (raw?.atlas_ai ?? {}) as Record<string, any>;

    const candidateMaxRpm = [
      telemetry?.max_rpm,
      acExtended.max_rpm,
      raw?.max_rpm
    ].find((value) => typeof value === 'number' && Number.isFinite(value) && value > 0) as number | undefined;

    const tractionSetting =
      typeof acExtended.traction_control_setting === 'number'
        ? Math.round(acExtended.traction_control_setting)
        : typeof raw?.traction_control_setting === 'number'
          ? Math.round(raw.traction_control_setting)
          : typeof raw?.tc === 'number'
            ? Math.round(raw.tc)
            : 0;

    const tcRaw = typeof raw?.tc === 'number' ? raw.tc : undefined;
    const tcCut = tcRaw !== undefined
      ? Math.round(clamp(1 - tcRaw, 0, 1) * 100)
      : tractionSetting;

    const absSetting =
      typeof acExtended.abs_setting === 'number'
        ? Math.round(acExtended.abs_setting)
        : typeof raw?.abs === 'number'
          ? Math.round(raw.abs)
          : 0;

    const engineMapCandidate = [
      raw?.engine_map,
      acExtended.engine_brake_setting,
      raw?.ers_deploy_mode
    ].find((value) => typeof value === 'number' && Number.isFinite(value)) as number | undefined;

    const lapDelta = liveAnalysis?.performance?.currentPaceVsOptimal ?? standardTelemetry.deltaTime;

    const gapAheadSeconds =
      typeof atlasAI?.opponent_ahead_1?.gap_seconds === 'number'
        ? atlasAI.opponent_ahead_1.gap_seconds
        : typeof atlasAI?.gap_ahead_seconds === 'number'
          ? atlasAI.gap_ahead_seconds
          : 0;

    const gapBehindSeconds =
      typeof atlasAI?.opponent_behind_1?.gap_seconds === 'number'
        ? atlasAI.opponent_behind_1.gap_seconds
        : typeof atlasAI?.gap_behind_seconds === 'number'
          ? atlasAI.gap_behind_seconds
          : 0;

    const stintProgress =
      typeof atlasAI?.tyre_stint_progress === 'number'
        ? clamp(atlasAI.tyre_stint_progress, 0, 1)
        : null;

    const pitRejoinPosition =
      typeof atlasAI?.pit_rejoin_position === 'number' && atlasAI.pit_rejoin_position > 0
        ? Math.round(atlasAI.pit_rejoin_position)
        : standardTelemetry.position || 0;

    return {
      speed: Math.round(Number.isFinite(standardTelemetry.speed) ? standardTelemetry.speed : 0),
      rpm: Math.round(Number.isFinite(standardTelemetry.rpm) ? standardTelemetry.rpm : 0),
      maxRpm: candidateMaxRpm ?? (standardTelemetry.rpm > 0 ? Math.max(standardTelemetry.rpm, 9000) : 9000),
      gear: standardTelemetry.gear || 'N',
      throttle: Math.round(clamp(standardTelemetry.throttle ?? 0, 0, 100)),
      brake: Math.round(clamp(standardTelemetry.brake ?? 0, 0, 100)),
      fuelLevel: toOneDecimal(standardTelemetry.fuelInTank, 0),
      fuelPerLap: toOneDecimal(atlasAI?.fuel_per_lap_average ?? atlasAI?.fuel_last_lap, 0),
      fuelLastLap: toOneDecimal(atlasAI?.fuel_last_lap, 0),
      lapsOfFuel: toOneDecimal(atlasAI?.fuel_laps_remaining_calculated ?? standardTelemetry.fuelRemainingLaps, 0),
      tyreTemps: {
        frontLeft: toInteger(standardTelemetry.tireTempFL, 0),
        frontRight: toInteger(standardTelemetry.tireTempFR, 0),
        rearLeft: toInteger(standardTelemetry.tireTempRL, 0),
        rearRight: toInteger(standardTelemetry.tireTempRR, 0),
      },
      tyreWear: {
        frontLeft: toInteger(standardTelemetry.tireWearFL, 0),
        frontRight: toInteger(standardTelemetry.tireWearFR, 0),
        rearLeft: toInteger(standardTelemetry.tireWearRL, 0),
        rearRight: toInteger(standardTelemetry.tireWearRR, 0),
      },
      tractionControl: tractionSetting ?? 0,
      tcCut: typeof tcCut === 'number' && Number.isFinite(tcCut) ? tcCut : tractionSetting ?? 0,
      brakeBalance: Number.isFinite(standardTelemetry.brakeBias) ? Math.round(standardTelemetry.brakeBias) : 0,
      abs: Number.isFinite(absSetting) ? absSetting : 0,
      engineMap: typeof engineMapCandidate === 'number' ? Math.round(engineMapCandidate) : 0,
      lapTime: standardTelemetry.currentLapTime || '00:00.000',
      lastLap: standardTelemetry.lastLapTime || '00:00.000',
      bestLap: standardTelemetry.bestLapTime || '00:00.000',
      timeDiff: formatSignedDelta(standardTelemetry.deltaTime),
      delta: formatSignedDelta(lapDelta),
      sessionTime: formatSessionCountdown(standardTelemetry.sessionTimeLeft),
      currentLap: standardTelemetry.currentLapNum || 0,
      totalLaps: standardTelemetry.totalLaps || 0,
      position: standardTelemetry.position || 0,
      trackCondition: standardTelemetry.weather ? standardTelemetry.weather.toUpperCase() : 'UNKNOWN',
      session: standardTelemetry.sessionType ? standardTelemetry.sessionType.toUpperCase() : 'SESSION',
      gapAhead: Number.isFinite(gapAheadSeconds) ? gapAheadSeconds : 0,
      gapBehind: Number.isFinite(gapBehindSeconds) ? gapBehindSeconds : 0,
      currentStintTime: stintProgress !== null ? `${Math.round(stintProgress * 100)}%` : '--',
      positionAfterPit: pitRejoinPosition,
    };
  }, [standardTelemetry, telemetry, liveAnalysis]);

  const previousFlagRef = useRef<string>('None');
  const flagTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const flag = standardTelemetry.flagType ?? 'None';
    if (flag === previousFlagRef.current) {
      return;
    }

    if (flagTimeoutRef.current) {
      clearTimeout(flagTimeoutRef.current);
      flagTimeoutRef.current = null;
    }

    if (flag === 'None') {
      setOverlay('none');
      setFlagData({ type: 'Green Flag', message: 'ALL CLEAR' });
    } else {
      const sector =
        typeof telemetry?.current_sector === 'number'
          ? telemetry.current_sector
          : standardTelemetry.currentSector;
      setFlagData(mapFlagData(flag, sector));
      setOverlay('flag');

      const timeoutDuration = flag === 'Green' ? 2000 : 4000;
      flagTimeoutRef.current = setTimeout(() => setOverlay('none'), timeoutDuration);
    }

    previousFlagRef.current = flag;
  }, [standardTelemetry.flagType, standardTelemetry.currentSector, telemetry?.current_sector]);

  useEffect(() => {
    return () => {
      if (flagTimeoutRef.current) {
        clearTimeout(flagTimeoutRef.current);
      }
    };
  }, []);

  const getTyreColor = (temp: number) => {
    if (temp < 70) return 'text-blue-400';
    if (temp < 90) return 'text-green-400';
    if (temp < 110) return 'text-yellow-400';
    return 'text-red-400';
  };

  const renderRpmLights = () => {
    const lights = [];
    const rpmPercentage = (telemetryData.rpm / telemetryData.maxRpm) * 100;
    const totalLights = 15;
    const activeLights = Math.floor((rpmPercentage / 100) * totalLights);

    for (let i = 0; i < totalLights; i++) {
      const isActive = i < activeLights;
      let lightClass = 'bg-gray-800';
      if (isActive) {
        if (i < 8) lightClass = 'bg-green-500';
        else if (i < 12) lightClass = 'bg-yellow-500';
        else lightClass = 'bg-red-500';
      }

      lights.push(
        <div
          key={i}
          className={`w-8 h-4 rounded-sm border border-gray-600 transition-all duration-75 ${lightClass}`}
        />
      );
    }

    return lights;
  };

  const getDeltaColor = (delta: string) => {
    if (delta.startsWith('+')) {
      return 'bg-red-600/80 text-red-100'; // Positive delta (slower) = red
    } else if (delta.startsWith('-')) {
      return 'bg-green-600/80 text-green-100'; // Negative delta (faster) = green
    }
    return 'bg-gray-600/80 text-gray-100'; // Neutral
  };

  const getPositionAfterPitColor = (currentPosition: number, positionAfterPit: number) => {
    if (positionAfterPit < currentPosition) {
      return 'text-green-400'; // Gaining positions = green
    } else if (positionAfterPit > currentPosition) {
      return 'text-red-400'; // Losing positions = red
    }
    return 'text-white'; // Same position = white
  };

  const getOverlayStyles = () => {
    switch (overlay) {
      case 'flag':
        if (flagData.type === 'Yellow Flag') return { background: 'bg-yellow-500', text: 'text-black' };
        if (flagData.type === 'Red Flag') return { background: 'bg-red-500', text: 'text-white' };
        if (flagData.type === 'Blue Flag') return { background: 'bg-blue-500', text: 'text-white' };
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
        <div className={`absolute inset-0 ${styles.background} flex items-center justify-center rounded-lg z-10`}>
          <div className="text-center space-y-4">
            <div className={`text-6xl font-oxanium font-bold tracking-wider ${styles.text}`}>
              {flagData.type.toUpperCase()}
            </div>
            {flagData.sector && (
              <div className={`text-4xl font-oxanium font-bold ${styles.text}`}>
                SECTOR {flagData.sector}
              </div>
            )}
            <div className={`text-2xl font-oxanium tracking-wide ${styles.text}`}>
              {flagData.message}
            </div>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="gt-endurance-dashboard-container">
      <div className="gt-endurance-dashboard-wrapper">
        <div className="mb-6">
          <h1 className="text-3xl tracking-tight text-white/90">GT TELEMETRY</h1>
          <div className="h-0.5 w-28 bg-white mt-2"></div>
        </div>

        <div className="gt-main-display">
          <div className="gt-endurance-dashboard-frame">
            {/* Header Section */}
            <div className="gt-header">
              <div className="flex items-center gap-4">
                <div className="text-red-500 tracking-widest text-xl font-zen-dots">
                  {telemetryData.session}
                </div>
                <div className="text-gray-400 text-lg">|</div>
                <div className="text-gray-300 text-lg font-oxanium font-bold">
                  P{telemetryData.position}
                </div>
                <div className="text-gray-400 text-lg">|</div>
                <div className="text-gray-300 text-lg font-oxanium font-bold">
                  LAP {telemetryData.currentLap}/{telemetryData.totalLaps}
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="bg-gray-900/60 text-gray-200 px-3 py-1 rounded border border-gray-700 text-sm font-zen-dots">
                  {telemetryData.trackCondition}
                </div>
                <div className="text-gray-300 font-oxanium text-xl font-bold">
                  {telemetryData.sessionTime}
                </div>
              </div>
            </div>

            {/* RPM Lights */}
            <div className="flex justify-center gap-2 mb-6">
              {renderRpmLights()}
            </div>

            {/* Main Grid Layout */}
            <div className="gt-main-grid">
              {/* Left Panel */}
              <div className="gt-left-panel">
                {/* Fuel Panel */}
                <div className="gt-panel">
                  <div className="text-orange-500 text-sm tracking-wider mb-3 text-center font-zen-dots">
                    FUEL
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-400" style={{ fontSize: 'var(--gt-label-size)' }}>Level</span>
                      <span className="text-white font-oxanium font-bold" style={{ fontSize: 'var(--gt-data-size)' }}>
                        {telemetryData.fuelLevel} L
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400" style={{ fontSize: 'var(--gt-label-size)' }}>Per Lap</span>
                      <span className="text-white font-oxanium font-bold" style={{ fontSize: 'var(--gt-data-size)' }}>
                        {telemetryData.fuelPerLap} L
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400" style={{ fontSize: 'var(--gt-label-size)' }}>Laps Left</span>
                      <span className="text-white font-oxanium font-bold" style={{ fontSize: 'var(--gt-data-size)' }}>
                        {telemetryData.lapsOfFuel}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Strategy Panel */}
                <div className="gt-panel gt-strategy-panel">
                  <div className="text-orange-500 text-sm tracking-wider mb-3 text-center font-zen-dots">
                    STRATEGY
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-400" style={{ fontSize: 'var(--gt-label-size)' }}>Gap Ahead</span>
                      <span className="text-white font-oxanium font-bold" style={{ fontSize: 'var(--gt-data-size)' }}>
                        +{telemetryData.gapAhead.toFixed(3)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400" style={{ fontSize: 'var(--gt-label-size)' }}>Gap Behind</span>
                      <span className="text-white font-oxanium font-bold" style={{ fontSize: 'var(--gt-data-size)' }}>
                        +{telemetryData.gapBehind.toFixed(3)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400" style={{ fontSize: 'var(--gt-label-size)' }}>Stint Time</span>
                      <span className="text-orange-400 font-oxanium font-bold" style={{ fontSize: 'var(--gt-data-size)' }}>
                        {telemetryData.currentStintTime}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400" style={{ fontSize: 'var(--gt-label-size)' }}>Pos after Pit</span>
                      <span className={`font-oxanium font-bold ${getPositionAfterPitColor(telemetryData.position, telemetryData.positionAfterPit)}`}
                            style={{ fontSize: 'var(--gt-data-size)' }}>
                        P{telemetryData.positionAfterPit}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Center Column */}
              <div className="gt-center-column">
                {/* Delta Display */}
                <div className={`gt-delta-display ${getDeltaColor(telemetryData.delta)}`}>
                  {telemetryData.delta}
                </div>

                {/* Gear Display */}
                <div className="gt-gear-display text-white">
                  {telemetryData.gear}
                </div>

                {/* Speed Display */}
                <div className="gt-speed-display">
                  <div>{Math.round(telemetryData.speed)}</div>
                  <div className="text-xl">KM/H</div>
                </div>

                {/* Flag Overlay */}
                {renderOverlay()}
              </div>

              {/* Right Panel */}
              <div className="gt-right-panel">
                {/* Timing Panel */}
                <div className="gt-panel">
                  <div className="text-orange-500 text-sm tracking-wider mb-3 text-center font-zen-dots">
                    TIMING
                  </div>
                  <div className="space-y-3">
                    <div className="text-center">
                      <div className="text-gray-400 mb-1" style={{ fontSize: 'var(--gt-label-size)' }}>ESTIMATED</div>
                      <div className="text-white font-metrophobic font-bold" style={{ fontSize: 'var(--gt-data-size)' }}>
                        {telemetryData.lapTime}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-gray-400 mb-1" style={{ fontSize: 'var(--gt-label-size)' }}>LAST</div>
                      <div className="text-yellow-400 font-metrophobic" style={{ fontSize: 'var(--gt-data-size)' }}>
                        {telemetryData.lastLap}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-gray-400 mb-1" style={{ fontSize: 'var(--gt-label-size)' }}>BEST</div>
                      <div className="text-purple-400 font-metrophobic font-bold" style={{ fontSize: 'var(--gt-data-size)' }}>
                        {telemetryData.bestLap}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Tyre Panel */}
                <div className="gt-panel">
                  <div className="text-orange-500 text-sm tracking-wider mb-3 text-center font-zen-dots">
                    TYRES
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {/* FL */}
                    <div className="text-center">
                      <div className="text-gray-400 mb-1" style={{ fontSize: 'var(--gt-label-size)' }}>FL</div>
                      <div className="flex justify-center space-x-2">
                        <div className={`font-oxanium font-bold ${getTyreColor(telemetryData.tyreTemps.frontLeft)}`}
                             style={{ fontSize: 'var(--gt-data-size)' }}>
                          {telemetryData.tyreTemps.frontLeft}°
                        </div>
                        <div className="font-oxanium font-bold text-white" style={{ fontSize: 'var(--gt-data-size)' }}>
                          {telemetryData.tyreWear.frontLeft}%
                        </div>
                      </div>
                    </div>
                    {/* FR */}
                    <div className="text-center">
                      <div className="text-gray-400 mb-1" style={{ fontSize: 'var(--gt-label-size)' }}>FR</div>
                      <div className="flex justify-center space-x-2">
                        <div className="font-oxanium font-bold text-white" style={{ fontSize: 'var(--gt-data-size)' }}>
                          {telemetryData.tyreWear.frontRight}%
                        </div>
                        <div className={`font-oxanium font-bold ${getTyreColor(telemetryData.tyreTemps.frontRight)}`}
                             style={{ fontSize: 'var(--gt-data-size)' }}>
                          {telemetryData.tyreTemps.frontRight}°
                        </div>
                      </div>
                    </div>
                    {/* RL */}
                    <div className="text-center">
                      <div className="text-gray-400 mb-1" style={{ fontSize: 'var(--gt-label-size)' }}>RL</div>
                      <div className="flex justify-center space-x-2">
                        <div className={`font-oxanium font-bold ${getTyreColor(telemetryData.tyreTemps.rearLeft)}`}
                             style={{ fontSize: 'var(--gt-data-size)' }}>
                          {telemetryData.tyreTemps.rearLeft}°
                        </div>
                        <div className="font-oxanium font-bold text-white" style={{ fontSize: 'var(--gt-data-size)' }}>
                          {telemetryData.tyreWear.rearLeft}%
                        </div>
                      </div>
                    </div>
                    {/* RR */}
                    <div className="text-center">
                      <div className="text-gray-400 mb-1" style={{ fontSize: 'var(--gt-label-size)' }}>RR</div>
                      <div className="flex justify-center space-x-2">
                        <div className="font-oxanium font-bold text-white" style={{ fontSize: 'var(--gt-data-size)' }}>
                          {telemetryData.tyreWear.rearRight}%
                        </div>
                        <div className={`font-oxanium font-bold ${getTyreColor(telemetryData.tyreTemps.rearRight)}`}
                             style={{ fontSize: 'var(--gt-data-size)' }}>
                          {telemetryData.tyreTemps.rearRight}°
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Atlas Logo */}
            <div className="absolute bottom-1 left-12">
              <img
                src="/Atlas-logo-white-txt.png"
                alt="Atlas Racing"
                className="opacity-100"
                style={{
                  width: 'var(--gt-logo-size)',
                  height: 'var(--gt-logo-size)'
                }}
              />
            </div>

            {/* Bottom Controls */}
            <div className="gt-controls-grid">
              {/* TC */}
              <div className="gt-control-button bg-gray-900/60 border border-gray-700">
                <div className="text-gray-300 font-zen-dots" style={{ fontSize: 'var(--gt-controls-label-size)' }}>TC</div>
                <div className="text-gray-100 font-oxanium font-bold" style={{ fontSize: 'var(--gt-controls-data-size)' }}>
                  {telemetryData.tractionControl}
                </div>
              </div>
              {/* TC CUT */}
              <div className="gt-control-button bg-gray-900/60 border border-gray-700">
                <div className="text-gray-300 font-zen-dots" style={{ fontSize: 'var(--gt-controls-label-size)' }}>TC CUT</div>
                <div className="text-gray-100 font-oxanium font-bold" style={{ fontSize: 'var(--gt-controls-data-size)' }}>
                  {telemetryData.tcCut}
                </div>
              </div>
              {/* BB */}
              <div className="gt-control-button bg-gray-900/60 border border-gray-700">
                <div className="text-red-400 font-zen-dots" style={{ fontSize: 'var(--gt-controls-label-size)' }}>BB</div>
                <div className="text-red-400 font-oxanium font-bold" style={{ fontSize: 'var(--gt-controls-data-size)' }}>
                  {telemetryData.brakeBalance}
                </div>
              </div>
              {/* ABS */}
              <div className="gt-control-button bg-gray-900/60 border border-gray-700">
                <div className="text-yellow-400 font-zen-dots" style={{ fontSize: 'var(--gt-controls-label-size)' }}>ABS</div>
                <div className="text-yellow-400 font-oxanium font-bold" style={{ fontSize: 'var(--gt-controls-data-size)' }}>
                  {telemetryData.abs}
                </div>
              </div>
              {/* MAP */}
              <div className="gt-control-button bg-gray-900/60 border border-gray-700">
                <div className="text-green-400 font-zen-dots" style={{ fontSize: 'var(--gt-controls-label-size)' }}>MAP</div>
                <div className="text-green-400 font-oxanium font-bold" style={{ fontSize: 'var(--gt-controls-data-size)' }}>
                  {telemetryData.engineMap}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
