import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTelemetry } from '../hooks/useTelemetry';
import { Card } from './ui/card';
import { convertTelemetry, StandardizedTelemetry, getTireCompound, getVisualCompound } from '../utils/telemetryConverter';
import { TYRE_COMPOUNDS } from '../types/telemetry';
import type { MultiCarTelemetryData, RaceEvent, TelemetryData } from '../types/telemetry';
import { Key, Eye, EyeOff, ExternalLink, FlaskConical } from 'lucide-react';
import { DevModeTrackMap, TrackOpponent, MapPoint as TrackMapPoint } from './DevModeTrackMap';
import { useErsAdvisor } from '../hooks/useErsAdvisor';
import { StrategyPanel } from './StrategyPanel';
import { useRaceEvents } from '../hooks/useRaceEvents';
import { DevModeAtlasLinkPanel } from './DevModeAtlasLinkPanel';
import { EngineerChat } from './EngineerChat';
import { useEngineerTriggers } from '../hooks/useEngineerTriggers';
import { usePitStopTracker } from '../hooks/usePitStopTracker';
import { useLivePitStrategy } from '../hooks/useLivePitStrategy';
import { useTyreSets } from '../hooks/useTyreSets';
import { ResearchReviewPanel } from './ResearchReviewPanel';
import {
  getResearchLogger,
  isResearchEnabled,
  TRACK_NAMES,
  WEATHER_NAMES,
  type LapRow,
} from '../services/research_logger';

const fuelStatusStyles = [
  { label: 'Optimal', className: 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/40' },
  { label: 'Monitor', className: 'bg-amber-500/20 text-amber-200 border border-amber-500/40' },
  { label: 'Critical', className: 'bg-rose-600/20 text-rose-200 border border-rose-500/40' },
] as const;

const tyreStatusStyles = [
  { label: 'Healthy', className: 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/40' },
  { label: 'Caution', className: 'bg-amber-500/20 text-amber-200 border border-amber-500/40' },
  { label: 'Critical', className: 'bg-rose-600/20 text-rose-200 border border-rose-500/40' },
] as const;

const pitStatusStyles = [
  { label: 'Hold', className: 'bg-slate-600/20 text-slate-200 border border-slate-600/40' },
  { label: 'Plan', className: 'bg-amber-500/20 text-amber-200 border border-amber-500/40' },
  { label: 'Box Now', className: 'bg-rose-600/20 text-rose-200 border border-rose-500/40' },
] as const;

const ersModeStyles = [
  { label: 'Balanced', className: 'bg-sky-500/20 text-sky-200 border border-sky-500/40' },
  { label: 'Harvest', className: 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/40' },
  { label: 'Attack', className: 'bg-orange-500/20 text-orange-200 border border-orange-500/40' },
  { label: 'Defend', className: 'bg-rose-600/20 text-rose-200 border border-rose-500/40' },
] as const;

function pickStatusStyle<T>(map: readonly T[], index?: number): T {
  if (typeof index !== 'number' || Number.isNaN(index)) {
    return map[0];
  }
  const clamped = Math.max(0, Math.min(map.length - 1, Math.trunc(index)));
  return map[clamped];
}

const compassFromDegrees = (value: number | undefined | null) => {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '--';
  }
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const normalised = ((value % 360) + 360) % 360;
  const index = Math.round(normalised / 45) % directions.length;
  return `${Math.round(normalised)}° ${directions[index]}`;
};

const resolveCompoundLabel = (visual?: number, actual?: number): string => {
  const normaliseId = (value: number | undefined) =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 && value !== 255 ? value : undefined;

  const maybeActual = normaliseId(actual);
  const maybeVisual = normaliseId(visual);

  const normalise = (value: string | undefined) => {
    if (!value) return null;
    return value.toLowerCase() === 'unknown' ? null : value;
  };

  const candidates = [
    maybeVisual !== undefined ? normalise(getVisualCompound(maybeVisual)) : null,
    maybeActual !== undefined ? normalise(getTireCompound(maybeActual)) : null,
    maybeActual !== undefined ? normalise(TYRE_COMPOUNDS[maybeActual]) : null,
    maybeVisual !== undefined ? normalise(TYRE_COMPOUNDS[maybeVisual]) : null,
  ].filter((value): value is string => Boolean(value));

  if (candidates.length > 0) {
    return candidates[0];
  }

  if (maybeActual !== undefined) {
    return `C${maybeActual}`;
  }
  if (maybeVisual !== undefined) {
    return `C${maybeVisual}`;
  }

  return 'Unknown';
};

type DeltaMode = 'personal' | 'session' | 'last';
type MapPoint = TrackMapPoint;

type DerivedMultiCarEntry = {
  raw: MultiCarTelemetryData['cars'][number];
  carIndex: number;
  driver: string;
  position?: number;
  gapToLeader: number | null;
  intervalToAhead: number | null;
  gapToPlayer: number | null;
  distanceToPlayer: number | null;
  worldPoint: MapPoint | null;
  isPlayer: boolean;
};

export function DevModeDashboard() {
  const { telemetry: rawTelemetry, multiCarData, connectionStatus } = useTelemetry();
  const raceEvents = useRaceEvents();
  const pitStopTracker = usePitStopTracker(rawTelemetry as TelemetryData | null);

  // Data logging state (for research paper data collection)
  const [dataLogging, setDataLogging] = useState(false); // actively logging
  const [seasonType, setSeasonType] = useState<'control' | 'llm'>('llm');
  const [seasonNumber, setSeasonNumber] = useState(1);
  const [raceNumber, setRaceNumber] = useState(1);
  const [participantId, setParticipantId] = useState('P0');
  const [difficulty, setDifficulty] = useState(80);
  const [showPostRaceReview, setShowPostRaceReview] = useState(false);
  const [loggedLapCount, setLoggedLapCount] = useState(0);
  const [loggedInteractionCount, setLoggedInteractionCount] = useState(0);
  // Research mode: derived from seasonType - LLM season = research mode ON
  // This controls: 1) CTRL suppression, 2) Decisive LLM prompts, 3) Broadcast→LLM routing
  const researchMode = seasonType === 'llm';
  const lastLoggedLapRef = useRef(0);
  const lastWeatherRef = useRef<string>('');
  const lastSafetyCarRef = useRef<number>(0);
  // Track sector times during lap (they reset at lap boundary)
  const lastSector1Ref = useRef<number>(0);
  const lastSector2Ref = useRef<number>(0);
  // Track highest lap seen and last valid lap time (game may reset these after race ends)
  const maxLapSeenRef = useRef<number>(0);
  const lastValidLapTimeRef = useRef<number>(0); // last_lap_time in seconds
  const lastValidTelemetryRef = useRef<any>(null); // snapshot for stop handler
  const totalLapsRef = useRef<number>(0); // total race laps from start config
  const prevTickErsRef = useRef<number>(0); // ERS % from previous telemetry tick
  const stintLapCountRef = useRef<number>(0); // laps completed on current tire set
  const lastLoggedCompoundRef = useRef<string>('unknown'); // compound of last logged lap
  // Track pit laps that need compound_to backfilled (deferred until compound actually changes)
  const pendingPitLapRef = useRef<number | null>(null);

  // Live pit strategy for engineer triggers (needs standardized telemetry)
  const { tyreSets } = useTyreSets();
  const stdTelemetryForStrategy = rawTelemetry ? convertTelemetry(rawTelemetry) : null;
  const liveStrategy = useLivePitStrategy({
    telemetry: stdTelemetryForStrategy,
    multiCarData: multiCarData ?? null,
    tyreSets,
  });

  // Generate proactive engineer triggers from telemetry changes
  const engineerTriggers = useEngineerTriggers(
    rawTelemetry as unknown as Record<string, unknown>,
    multiCarData,
    liveStrategy.ready ? liveStrategy : null,
    { enabled: connectionStatus === 'connected' }
  );

  const [gapDisplayMode, setGapDisplayMode] = useState<'leader' | 'interval'>('leader');
  const [deltaMode, setDeltaMode] = useState<DeltaMode>('personal');
  const [playerHistory, setPlayerHistory] = useState<MapPoint[]>([]);
  const [trackOutline, setTrackOutline] = useState<MapPoint[]>([]);
  const trackCapturedRef = useRef(false);
  const sessionUidRef = useRef<number | string | undefined>(undefined);
  const lastLapDistanceRef = useRef<number | null>(null);

  // LLM Race Engineer state
  const [openaiApiKey, setOpenaiApiKey] = useState<string>(() => {
    // Load from localStorage on mount
    if (typeof window !== 'undefined') {
      return localStorage.getItem('atlas_openai_key') || '';
    }
    return '';
  });
  const [showApiKey, setShowApiKey] = useState(false);

  // Save API key to localStorage when it changes
  useEffect(() => {
    if (typeof window !== 'undefined' && openaiApiKey) {
      localStorage.setItem('atlas_openai_key', openaiApiKey);
    }
  }, [openaiApiKey]);

  // Manual start logging handler
  const handleStartLogging = () => {
    const t = rawTelemetry as any;
    const trackId = t?.track_id ?? -1;
    const totalLaps = t?.total_laps ?? 0;
    const trackName = TRACK_NAMES[trackId] ?? `Track ${trackId}`;

    const logger = getResearchLogger();
    logger.startRace({
      track: trackName,
      trackId,
      seasonType,
      seasonNumber,
      raceNumber,
      totalLaps,
      difficulty,
      startingPosition: t?.position ?? 0,
      participantId,
    });

    // Initialize to the current lap so the first log fires on the NEXT lap transition
    const currentLap = t?.current_lap_num ?? 0;
    lastLoggedLapRef.current = currentLap;
    maxLapSeenRef.current = currentLap;
    lastValidLapTimeRef.current = 0;
    lastValidTelemetryRef.current = t;
    totalLapsRef.current = totalLaps;
    lastWeatherRef.current = WEATHER_NAMES[t?.weather ?? 0] ?? 'Unknown';
    lastSafetyCarRef.current = t?.safety_car_status ?? 0;
    lastSector1Ref.current = 0;
    lastSector2Ref.current = 0;
    prevTickErsRef.current = Math.round(((t?.ers_store_energy ?? 0) / 4.0) * 100);
    stintLapCountRef.current = t?.tire_age_laps ?? 0;
    lastLoggedCompoundRef.current = t?.tire_compound ?? 'unknown';
    pendingPitLapRef.current = null;
    setLoggedLapCount(0);
    setLoggedInteractionCount(0);
    setDataLogging(true);
    console.log(`[DataLog] Started on lap ${currentLap}: ${trackName} (S${seasonNumber}R${raceNumber})`);
  };

  // Manual stop logging handler → logs final lap, then shows post-race review form
  const handleStopLogging = () => {
    // Use tracked refs because the game may reset telemetry values after race ends
    const maxLap = maxLapSeenRef.current;
    const t = lastValidTelemetryRef.current ?? rawTelemetry as any;

    // If there's an unlogged final lap, capture it
    // lastLoggedLapRef tracks transitions: when set to N, it means we logged lap N-1
    // The final lap to log = lastLoggedLapRef (the lap we transitioned TO but didn't log)
    const lapToLog = lastLoggedLapRef.current;
    const withinRace = totalLapsRef.current > 0 ? lapToLog <= totalLapsRef.current : true;
    if (maxLap >= lastLoggedLapRef.current && maxLap > 0 && withinRace && t) {
      const logger = getResearchLogger();
      const tireWear = t.tire_wear as number[] | undefined;
      const fl = tireWear?.[0] ?? 0;
      const fr = tireWear?.[1] ?? 0;
      const rl = tireWear?.[2] ?? 0;
      const rr = tireWear?.[3] ?? 0;

      // Get gaps from multiCarData
      const playerCar = multiCarData?.cars?.find((c: any) => c.is_player === 1);
      const playerPos = playerCar?.position ?? t.position ?? 0;
      const carBehind = multiCarData?.cars?.find((c: any) => c.position === playerPos + 1);

      // Use the last valid lap time we recorded (game may have reset last_lap_time)
      const lastLapMs = lastValidLapTimeRef.current > 0
        ? Math.round(lastValidLapTimeRef.current * 1000)
        : (t.last_lap_time ? Math.round(t.last_lap_time * 1000) : null);

      // Compute sector3 from total - s1 - s2 if all available
      const s1ms = lastSector1Ref.current ? Math.round(lastSector1Ref.current * 1000) : null;
      const s2ms = lastSector2Ref.current ? Math.round(lastSector2Ref.current * 1000) : null;
      const s3ms = (lastLapMs && s1ms && s2ms) ? lastLapMs - s1ms - s2ms : null;

      // Detect compound change and update stint for final lap
      const currentCompound = t.tire_compound ?? 'unknown';
      if (currentCompound !== lastLoggedCompoundRef.current) {
        stintLapCountRef.current = 0;
        // If compound changed, backfill pending pit lap
        if (pendingPitLapRef.current !== null) {
          logger.updateLapPitCompound(pendingPitLapRef.current, currentCompound);
          pendingPitLapRef.current = null;
        }
        lastLoggedCompoundRef.current = currentCompound;
      }
      stintLapCountRef.current++;

      const pitThisLap = t.pit_status === 1 || t.pit_status === 2;

      const lapRow: LapRow = {
        lap: lapToLog,
        lap_time_ms: lastLapMs,
        sector1_ms: s1ms,
        sector2_ms: s2ms,
        sector3_ms: s3ms,
        position: t.position ?? 0,
        gap_ahead_s: playerCar?.gap_to_car_ahead ?? null,
        gap_behind_s: carBehind?.gap_to_car_ahead ?? null,
        tire_compound: currentCompound,
        tire_age: stintLapCountRef.current,
        tire_wear_max: Math.max(fl, fr, rl, rr),
        tire_wear_fl: fl,
        tire_wear_fr: fr,
        tire_wear_rl: rl,
        tire_wear_rr: rr,
        fuel_remaining_laps: t.fuel_remaining_laps ?? 0,
        ers_percent: prevTickErsRef.current,
        ers_mode: t.ers_deploy_mode ?? 0,
        weather: WEATHER_NAMES[t.weather ?? 0] ?? 'Unknown',
        track_temp_c: t.track_temperature ?? 0,
        air_temp_c: t.air_temperature ?? 0,
        safety_car_status: t.safety_car_status === 1 ? 'SC' : t.safety_car_status === 2 ? 'VSC' : 'none',
        pit_this_lap: pitThisLap,
        pit_compound_to: null, // Will be backfilled if compound changes after pit
        drs_used: (t.drs_allowed === 1) || (t.drs_open === 1),
      };
      logger.logLap(lapRow);
      // Mark as pending if this lap had a pit (though on final lap it likely won't be backfilled)
      if (pitThisLap) {
        pendingPitLapRef.current = lapToLog;
      }
      pendingPitLapRef.current = null; // Clear pending since we're stopping
      setLoggedLapCount(logger.getLapCount());
      console.log(`[DataLog] Final lap ${lapToLog} logged on Stop`);
    }
    setDataLogging(false);
    setShowPostRaceReview(true);
  };

  // Log laps while dataLogging is active
  useEffect(() => {
    if (!dataLogging || !rawTelemetry || connectionStatus !== 'connected') return;

    const t = rawTelemetry as any;
    const currentLap = t.current_lap_num ?? 0;
    const logger = getResearchLogger();

    // Capture ERS from previous tick BEFORE updating (for end-of-lap accuracy)
    const prevTickErs = prevTickErsRef.current;
    prevTickErsRef.current = Math.round(((t.ers_store_energy ?? 0) / 4.0) * 100);

    // Track the highest lap and last valid telemetry (game may reset values after race ends)
    if (currentLap > maxLapSeenRef.current) {
      maxLapSeenRef.current = currentLap;
    }
    if (t.last_lap_time && t.last_lap_time > 0) {
      lastValidLapTimeRef.current = t.last_lap_time;
    }
    lastValidTelemetryRef.current = t;

    // Track sector times as they appear during the lap (they reset at lap boundary)
    const s1 = t.sector1_time as number ?? 0;
    const s2 = t.sector2_time as number ?? 0;
    if (s1 > 0) lastSector1Ref.current = s1;
    if (s2 > 0) lastSector2Ref.current = s2;

    // Log completed laps (lap transition detected)
    // lastLoggedLapRef is initialized to the lap when Start was clicked,
    // so this only fires on the NEXT lap transition (completing the previous lap)
    if (currentLap > lastLoggedLapRef.current) {
      const tireWear = t.tire_wear as number[] | undefined;
      const fl = tireWear?.[0] ?? 0;
      const fr = tireWear?.[1] ?? 0;
      const rl = tireWear?.[2] ?? 0;
      const rr = tireWear?.[3] ?? 0;

      // Get gaps from multiCarData (gap_to_car_ahead exists per-car, not on raw telemetry)
      const playerCar = multiCarData?.cars?.find((c: any) => c.is_player === 1);
      const playerPos = playerCar?.position ?? t.position ?? 0;
      const carBehind = multiCarData?.cars?.find((c: any) => c.position === playerPos + 1);

      // Compute sector3 from last_lap_time - s1 - s2 if available
      const lastLapMs = t.last_lap_time ? Math.round(t.last_lap_time * 1000) : null;
      const s1ms = lastSector1Ref.current ? Math.round(lastSector1Ref.current * 1000) : null;
      const s2ms = lastSector2Ref.current ? Math.round(lastSector2Ref.current * 1000) : null;
      const s3ms = (lastLapMs && s1ms && s2ms) ? lastLapMs - s1ms - s2ms : null;

      // Detect compound change (pit stop) and track stint length
      const currentCompound = t.tire_compound ?? 'unknown';
      if (currentCompound !== lastLoggedCompoundRef.current) {
        // Compound changed — pit stop occurred, reset stint counter
        stintLapCountRef.current = 0;

        // Backfill the previous pit lap's compound_to now that we know the new compound
        if (pendingPitLapRef.current !== null) {
          logger.updateLapPitCompound(pendingPitLapRef.current, currentCompound);
          pendingPitLapRef.current = null;
        }

        lastLoggedCompoundRef.current = currentCompound;
      }
      stintLapCountRef.current++;

      // Check if this lap had a pit stop (we'll need to backfill compound_to on next lap)
      const pitThisLap = t.pit_status === 1 || t.pit_status === 2;
      const lapToLog = currentLap - 1;

      const lapRow: LapRow = {
        lap: lapToLog,
        lap_time_ms: lastLapMs,
        sector1_ms: s1ms,
        sector2_ms: s2ms,
        sector3_ms: s3ms,
        position: t.position ?? 0,
        gap_ahead_s: playerCar?.gap_to_car_ahead ?? null,
        gap_behind_s: carBehind?.gap_to_car_ahead ?? null,
        tire_compound: currentCompound,
        tire_age: stintLapCountRef.current,
        tire_wear_max: Math.max(fl, fr, rl, rr),
        tire_wear_fl: fl,
        tire_wear_fr: fr,
        tire_wear_rl: rl,
        tire_wear_rr: rr,
        fuel_remaining_laps: t.fuel_remaining_laps ?? 0,
        ers_percent: prevTickErs,
        ers_mode: t.ers_deploy_mode ?? 0,
        weather: WEATHER_NAMES[t.weather ?? 0] ?? 'Unknown',
        track_temp_c: t.track_temperature ?? 0,
        air_temp_c: t.air_temperature ?? 0,
        safety_car_status: t.safety_car_status === 1 ? 'SC' : t.safety_car_status === 2 ? 'VSC' : 'none',
        pit_this_lap: pitThisLap,
        // Set pit_compound_to to null for now; will be backfilled on next lap when compound changes
        pit_compound_to: null,
        drs_used: (t.drs_allowed === 1) || (t.drs_open === 1),
      };

      logger.logLap(lapRow);

      // If this lap had a pit stop, mark it as pending for compound_to backfill
      if (pitThisLap) {
        pendingPitLapRef.current = lapToLog;
      }
      lastLoggedLapRef.current = currentLap;
      setLoggedLapCount(logger.getLapCount());

      // Reset sector refs for the new lap
      lastSector1Ref.current = 0;
      lastSector2Ref.current = 0;
    }

    // Track weather changes
    const currentWeather = WEATHER_NAMES[t.weather ?? 0] ?? 'Unknown';
    if (currentWeather !== lastWeatherRef.current && lastWeatherRef.current) {
      logger.logWeatherChange(currentLap, lastWeatherRef.current, currentWeather);
      lastWeatherRef.current = currentWeather;
    }

    // Track safety cars (detect transitions to SC/VSC and back)
    const scStatus = t.safety_car_status ?? 0;
    if (scStatus > 0 && lastSafetyCarRef.current === 0) {
      logger.logSafetyCar(scStatus === 1 ? 'full' : 'virtual');
    }
    lastSafetyCarRef.current = scStatus;

    // Update interaction count from logger
    setLoggedInteractionCount(logger.getAllInteractions().length);
  }, [rawTelemetry, multiCarData, dataLogging, connectionStatus]);

  // Log pit stops while dataLogging is active
  useEffect(() => {
    if (!dataLogging) return;

    const logger = getResearchLogger();
    if (pitStopTracker.lastStopLap && pitStopTracker.stopsCompleted > 0) {
      const t = rawTelemetry as any;
      const tireWear = t?.tire_wear as number[] | undefined;
      const maxWear = tireWear ? Math.max(...tireWear) : 0;

      logger.logPitStop({
        lap: pitStopTracker.lastStopLap,
        compoundFrom: pitStopTracker.lastCompound ?? 'unknown',
        compoundTo: pitStopTracker.currentCompound ?? 'unknown',
        positionBefore: t?.position ?? 0,
        positionAfter: t?.position ?? 0,
        triggeredBy: seasonType === 'llm' ? 'llm' : 'driver',
      });
    }
  }, [pitStopTracker.stopsCompleted, dataLogging, seasonType]);

  const appendPoint = (points: MapPoint[], point: MapPoint, minDistanceSq: number, limit?: number) => {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      return points;
    }
    if (points.length === 0) {
      const next = [...points, point];
      if (limit && next.length > limit) {
        return next.slice(next.length - limit);
      }
      return next;
    }
    const last = points[points.length - 1];
    const deltaX = point.x - last.x;
    const deltaY = point.y - last.y;
    if (deltaX * deltaX + deltaY * deltaY < minDistanceSq) {
      return points;
    }
    const next = [...points, point];
    if (limit && next.length > limit) {
      return next.slice(next.length - limit);
    }
    return next;
  };


  const worldPosXRaw = (rawTelemetry as any)?.world_position_x;
  const worldPosYRaw = (rawTelemetry as any)?.world_position_y;
  const sessionUid = (rawTelemetry as any)?.session_uid;

  const worldPosX =
    typeof worldPosXRaw === 'number' && Number.isFinite(worldPosXRaw) ? worldPosXRaw : null;
  const worldPosY =
    typeof worldPosYRaw === 'number' && Number.isFinite(worldPosYRaw) ? worldPosYRaw : null;

  useEffect(() => {
    if (sessionUid === undefined || sessionUid === null) {
      return;
    }
    if (sessionUidRef.current !== undefined && sessionUidRef.current !== sessionUid) {
      setPlayerHistory([]);
      setTrackOutline([]);
      trackCapturedRef.current = false;
      lastLapDistanceRef.current = null;
    }
    sessionUidRef.current = sessionUid;
  }, [sessionUid]);

  useEffect(() => {
    if (worldPosX === null || worldPosY === null) {
      return;
    }

    const currentPoint: MapPoint = { x: worldPosX, y: worldPosY };
    const trailLimit =
      trackOutline.length > 0
        ? Math.max(1600, Math.min(5000, trackOutline.length * 2))
        : 1600;

    setPlayerHistory((previous) => appendPoint(previous, currentPoint, 0.04, trailLimit));

    if (!trackCapturedRef.current) {
      setTrackOutline((previous) => appendPoint(previous, currentPoint, 0.09, 6000));
    }
  }, [worldPosX, worldPosY, trackOutline.length]);

  // Convert raw telemetry using universal converter
  const telemetry: StandardizedTelemetry = convertTelemetry(rawTelemetry);

  // Determine which game is connected
  const gameConnected = telemetry.gameName;
  const isF124 = gameConnected === 'F1 24';
  const isAC = gameConnected === 'Assetto Corsa';
  const atlasAI = (rawTelemetry as any)?.atlas_ai;
  const lapDistance =
    typeof telemetry.lapDistance === 'number' && Number.isFinite(telemetry.lapDistance)
      ? telemetry.lapDistance
      : null;
  const currentLapNumber =
    typeof telemetry.currentLapNum === 'number' && Number.isFinite(telemetry.currentLapNum)
      ? telemetry.currentLapNum
      : null;

  useEffect(() => {
    if (lapDistance === null) {
      return;
    }

    const previous = lastLapDistanceRef.current;
    const outlineLength = trackOutline.length;

    if (!trackCapturedRef.current) {
      const crossedStartLine = previous !== null && previous > 300 && lapDistance < 50 && outlineLength > 50;
      const lapAdvanced = currentLapNumber !== null && currentLapNumber > 1 && outlineLength > 50;

      if (crossedStartLine || lapAdvanced) {
        trackCapturedRef.current = true;
      }
    } else if (outlineLength < 10) {
      trackCapturedRef.current = false;
    }

    lastLapDistanceRef.current = lapDistance;
  }, [lapDistance, currentLapNumber, trackOutline.length]);

  const fuelStatusStyle = pickStatusStyle(fuelStatusStyles, atlasAI?.fuel_strategy_status);
  const pitStatusStyle = pickStatusStyle(pitStatusStyles, atlasAI?.pit_strategy_status);
  const pitStopMandatoryLabel = isF124
    ? pitStopTracker.mandatoryStopCompleted
      ? 'Done'
      : 'Pending'
    : 'N/A';
  const pitStopMandatoryClass = isF124
    ? pitStopTracker.mandatoryStopCompleted
      ? 'text-emerald-300'
      : 'text-amber-300'
    : 'text-gray-500';
  const pitStopCurrentCompound =
    pitStopTracker.currentCompound ||
    telemetry.tireCompoundVisual ||
    telemetry.tireCompoundActual ||
    'Unknown';

  const playerPosition = useMemo(() => {
    if (worldPosX === null || worldPosY === null) {
      return null;
    }
    return { x: worldPosX, y: worldPosY };
  }, [worldPosX, worldPosY]);
  const playerRacePosition =
    typeof telemetry.position === 'number' && Number.isFinite(telemetry.position)
      ? telemetry.position
      : null;

  const multiCarDerived = useMemo(() => {
    const emptyResult = { player: null as DerivedMultiCarEntry | null, entries: [] as DerivedMultiCarEntry[] };

    if (!multiCarData?.cars || multiCarData.cars.length === 0) {
      return emptyResult;
    }

    const finiteNumber = (value: unknown): number | null =>
      typeof value === 'number' && Number.isFinite(value) ? value : null;

    const carsWithIndex = multiCarData.cars.map((car, index) => ({
      car,
      index,
      carIndex: typeof car.car_index === 'number' ? car.car_index : index,
    }));

    const playerCarEntry =
      carsWithIndex.find((entry) => entry.car.is_player === 1) ||
      (playerRacePosition !== null
        ? carsWithIndex.find((entry) => entry.car.position === playerRacePosition)
        : undefined) ||
      carsWithIndex[0];

    if (!playerCarEntry) {
      return emptyResult;
    }

    const positionSorted = carsWithIndex
      .filter((entry) => typeof entry.car.position === 'number' && entry.car.position > 0)
      .sort((a, b) => (a.car.position ?? 99) - (b.car.position ?? 99));

    const gapToLeaderByPosition = new Map<number, number | null>();
    positionSorted.forEach((entry) => {
      const position = entry.car.position!;
      if (position === 1) {
        gapToLeaderByPosition.set(1, 0);
        return;
      }

      const directGap = finiteNumber(entry.car.gap_to_leader);
      if (directGap !== null) {
        gapToLeaderByPosition.set(position, directGap);
        return;
      }

      const prevGap = gapToLeaderByPosition.get(position - 1);
      const gapAhead = finiteNumber(entry.car.gap_to_car_ahead);
      if (prevGap !== undefined && prevGap !== null && gapAhead !== null) {
        gapToLeaderByPosition.set(position, prevGap + gapAhead);
        return;
      }

      gapToLeaderByPosition.set(position, prevGap ?? null);
    });

    const playerGapToLeader =
      finiteNumber(playerCarEntry.car.gap_to_leader) ??
      (typeof playerCarEntry.car.position === 'number'
        ? gapToLeaderByPosition.get(playerCarEntry.car.position) ?? null
        : null) ??
      0;

    const entries: DerivedMultiCarEntry[] = carsWithIndex.map((entry) => {
      const { car, carIndex } = entry;
      const position = typeof car.position === 'number' ? car.position : undefined;
      const driverName = (car.driver_name || '').trim();
      const gapToLeader =
        finiteNumber(car.gap_to_leader) ?? (position ? gapToLeaderByPosition.get(position) ?? null : null);

      let intervalToAhead: number | null = finiteNumber(car.gap_to_car_ahead);
      if ((intervalToAhead === null || intervalToAhead <= 0) && position && position > 1) {
        const previousGap = gapToLeaderByPosition.get(position - 1);
        if (gapToLeader !== null && previousGap !== undefined && previousGap !== null) {
          intervalToAhead = gapToLeader - previousGap;
        }
      }

      let worldPoint: MapPoint | null = null;
      if (typeof car.world_position_x === 'number' && Number.isFinite(car.world_position_x) &&
          typeof car.world_position_y === 'number' && Number.isFinite(car.world_position_y)) {
        worldPoint = { x: car.world_position_x, y: car.world_position_y };
      }
      if (entry === playerCarEntry && playerPosition) {
        worldPoint = playerPosition;
      }

      const distanceToPlayer =
        entry === playerCarEntry
          ? 0
          : worldPoint && playerPosition
            ? Math.hypot(worldPoint.x - playerPosition.x, worldPoint.y - playerPosition.y)
            : null;

      const gapToPlayer =
        entry === playerCarEntry
          ? 0
          : gapToLeader !== null && playerGapToLeader !== null
            ? gapToLeader - playerGapToLeader
            : null;

      return {
        raw: car,
        carIndex,
        driver: driverName || (position ? `Car P${position}` : `Car ${carIndex}`),
        position,
        gapToLeader,
        intervalToAhead,
        gapToPlayer,
        distanceToPlayer,
        worldPoint,
        isPlayer: entry === playerCarEntry,
      };
    });

    entries.sort((left, right) => {
      if (left.position && right.position) {
        return left.position - right.position;
      }
      if (left.position) return -1;
      if (right.position) return 1;
      return left.carIndex - right.carIndex;
    });

    const playerEntry = entries.find((entry) => entry.isPlayer) ?? null;

    return { player: playerEntry, entries };
  }, [multiCarData, playerPosition, playerRacePosition]);

  const playerCarPosition = multiCarDerived.player?.position ?? playerRacePosition;

  const trackOpponents: TrackOpponent[] = useMemo(() => {
    if (multiCarDerived.entries.length === 0) {
      return [];
    }

    return multiCarDerived.entries
      .filter((entry) => !entry.isPlayer)
      .map((entry) => {
        const opponentPosition = entry.position;
        const playerPositionValue = playerCarPosition;
        const isAhead =
          typeof playerPositionValue === 'number' && typeof opponentPosition === 'number'
            ? opponentPosition < playerPositionValue
            : undefined;

        return {
          id: `${entry.carIndex}-${entry.raw.race_number ?? 'car'}`,
          driver: entry.driver,
          position: opponentPosition,
          isAhead,
          gapToPlayer: entry.gapToPlayer,
          distanceToPlayer: entry.distanceToPlayer,
          point: entry.worldPoint ?? { x: NaN, y: NaN },
        } as TrackOpponent;
      })
      .sort((left, right) => {
        const leftDistance = left.distanceToPlayer ?? Number.POSITIVE_INFINITY;
        const rightDistance = right.distanceToPlayer ?? Number.POSITIVE_INFINITY;
        return leftDistance - rightDistance;
      });
  }, [multiCarDerived.entries, playerCarPosition]);

  const aheadOpponents = useMemo(
    () => trackOpponents.filter((opponent) => opponent.isAhead),
    [trackOpponents],
  );
  const behindOpponents = useMemo(
    () => trackOpponents.filter((opponent) => opponent.isAhead === false),
    [trackOpponents],
  );
  const primaryAhead = aheadOpponents[0];
  const primaryBehind = behindOpponents[0];

  const formatGap = (gap?: number | null) => {
    if (gap === null || gap === undefined || !Number.isFinite(gap)) {
      return null;
    }
    const absoluteValue = Math.abs(gap);
    const sign = gap >= 0 ? '+' : '-';
    const decimals = absoluteValue >= 10 ? 1 : 2;
    return `${sign}${absoluteValue.toFixed(decimals)}s`;
  };

  const asNumber = (value: unknown) =>
    typeof value === 'number' && Number.isFinite(value) ? value : null;

  const fuelPerLap = asNumber(atlasAI?.fuel_per_lap_average);
  const fuelLapsRemaining = asNumber(atlasAI?.fuel_laps_remaining_calculated);
  const fuelMargin = asNumber(atlasAI?.fuel_margin_laps);
  const fuelTargetSave = asNumber(atlasAI?.fuel_target_save_per_lap);
  const tyreDegradation = asNumber(atlasAI?.tyre_degradation_rate);
  const tyreLifeRemaining = asNumber(atlasAI?.tyre_life_remaining_laps);
  const tyrePerformance = asNumber(atlasAI?.tyre_performance_index);
  const tyreStintProgress = asNumber(atlasAI?.tyre_stint_progress);
  const pitDelta = asNumber(atlasAI?.pit_delta_time);
  const pitDeltaWing = asNumber(atlasAI?.pit_delta_with_wing);
  const pitNetDelta = asNumber(atlasAI?.pit_net_time_delta);
  const pitStayOutLoss = asNumber(atlasAI?.pit_time_loss_no_pit);
  const ersAttackGap = asNumber(atlasAI?.ers_attack_gap);
  const ersDefendGap = asNumber(atlasAI?.ers_defend_gap);
  const ersHarvestGap = asNumber(atlasAI?.ers_harvest_gap);
  const ersAdvisor = useErsAdvisor({
    telemetry,
    rawTelemetry: rawTelemetry ?? null,
    attackThreshold: ersAttackGap,
    defendThreshold: ersDefendGap,
    harvestThreshold: ersHarvestGap,
    aheadOpponent: primaryAhead,
    behindOpponent: primaryBehind,
  });
  const ersStatusStyle = useMemo(() => {
    switch (ersAdvisor.mode) {
      case 'harvest':
        return ersModeStyles[1];
      case 'attack':
        return ersModeStyles[2];
      case 'defend':
        return ersModeStyles[3];
      default:
        return ersModeStyles[0];
    }
  }, [ersAdvisor.mode]);
  const fuelCalcReady = Boolean(atlasAI?.fuel_calc_ready);
  const fuelModelReady = isF124 ? telemetry.currentLapNum >= 2 : fuelCalcReady;
  const f1FuelExtraLaps = isF124
    ? asNumber((rawTelemetry as any)?.fuel_remaining_laps ?? telemetry.fuelRemainingLaps)
    : null;
  const f1LapsRemaining =
    isF124 && telemetry.totalLaps > 0
      ? Math.max(0, telemetry.totalLaps - telemetry.currentLapNum)
      : null;
  const f1FuelRangeLaps =
    f1FuelExtraLaps !== null && f1LapsRemaining !== null
      ? Math.max(0, f1LapsRemaining + f1FuelExtraLaps)
      : null;
  const displayFuelPerLap = fuelModelReady ? fuelPerLap : null;
  const displayFuelLapsRemaining = fuelModelReady
    ? isF124
      ? f1FuelRangeLaps
      : fuelLapsRemaining
    : null;
  const displayFuelMargin = fuelModelReady
    ? isF124
      ? f1FuelExtraLaps
      : fuelMargin
    : null;
  const displayFuelTargetSave = fuelModelReady ? fuelTargetSave : null;
  const rawVisualCompound = (rawTelemetry as any)?.tyre_compound_visual;
  const rawActualCompound = (rawTelemetry as any)?.tyre_compound_actual;
  const tyreCompoundDisplay = resolveCompoundLabel(rawVisualCompound, rawActualCompound);
  const tyreCompoundVisualOnly = resolveCompoundLabel(rawVisualCompound, undefined);
  const tyreCompoundActualOnly = resolveCompoundLabel(undefined, rawActualCompound);
  const pitWindowStatus = (() => {
    const ideal = telemetry.pitWindowIdealLap;
    const latest = telemetry.pitWindowLatestLap;
    const currentLap = telemetry.currentLapNum || 0;
    if (!ideal || !latest) {
      return 'none';
    }
    if (currentLap < ideal - 2) {
      return 'upcoming';
    }
    if (currentLap <= latest + 1) {
      return 'active';
    }
    return 'passed';
  })();
  const pitWindowBadge = (() => {
    switch (pitWindowStatus) {
      case 'active':
        return { label: 'Window Active', className: 'text-amber-300' };
      case 'upcoming':
        return { label: 'Window Upcoming', className: 'text-blue-300' };
      case 'passed':
        return { label: 'Window Passed', className: 'text-slate-400' };
      default:
        return { label: 'No Window', className: 'text-gray-500' };
    }
  })();

  const acExtended = isAC ? (rawTelemetry as any)?.ac_extended ?? null : null;
  const tyreTempSurface = useMemo(
    () => [
      telemetry.tireTempFL,
      telemetry.tireTempFR,
      telemetry.tireTempRL,
      telemetry.tireTempRR,
    ],
    [telemetry.tireTempFL, telemetry.tireTempFR, telemetry.tireTempRL, telemetry.tireTempRR],
  );
  const tyreCoreData = useMemo(() => {
    const telemetryInner: (number | null)[] = [
      telemetry.tireTempInnerFL ?? null,
      telemetry.tireTempInnerFR ?? null,
      telemetry.tireTempInnerRL ?? null,
      telemetry.tireTempInnerRR ?? null,
    ];
    const acCoreTemps: (number | null)[] = [
      acExtended?.tyre_core_temperature?.[0] ?? null,
      acExtended?.tyre_core_temperature?.[1] ?? null,
      acExtended?.tyre_core_temperature?.[2] ?? null,
      acExtended?.tyre_core_temperature?.[3] ?? null,
    ];

    const candidates: (number | null)[] = telemetryInner.map((telemetryValue, index) => {
      const acCoreValue = acCoreTemps[index];

      if (isAC && typeof acCoreValue === 'number' && Number.isFinite(acCoreValue)) {
        return acCoreValue;
      }

      if (typeof telemetryValue === 'number' && Number.isFinite(telemetryValue)) {
        return telemetryValue;
      }

      if (typeof acCoreValue === 'number' && Number.isFinite(acCoreValue)) {
        return acCoreValue;
      }

      return null;
    });

    const fallbackFlags: boolean[] = [false, false, false, false];
    const resolved = candidates.map((value, index) => {
      if (typeof value === 'number' && Number.isFinite(value) && value > 0.5) {
        return value;
      }
      const surfaceValue = tyreTempSurface?.[index] ?? null;
      if (typeof surfaceValue === 'number' && Number.isFinite(surfaceValue)) {
        fallbackFlags[index] = true;
        return surfaceValue;
      }
      return null;
    });

    return {
      values: resolved,
      fallback: fallbackFlags,
    };
  }, [
    telemetry.tireTempInnerFL,
    telemetry.tireTempInnerFR,
    telemetry.tireTempInnerRL,
    telemetry.tireTempInnerRR,
    tyreTempSurface,
    acExtended,
    isAC,
  ]);
  const tyreTempInner = tyreCoreData.values;
  const tyreTempInnerFallback = tyreCoreData.fallback;
  const formatTempDisplay = (value: number | null | undefined) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return 'N/A';
    }
    return `${value.toFixed(1)}°C`;
  };
  const sanitizeControlValue = (value: number | null | undefined) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return null;
    }
    if (value >= 250 || value < 0) {
      return null;
    }
    return value;
  };
  const formatDiscreteSetting = (value: number | null, maxSteps: number) => {
    if (value === null) {
      return 'N/A';
    }
    if (value <= 0) {
      return 'OFF';
    }
    const clamped = Math.max(1, Math.min(maxSteps + 1, Math.round(value)));
    return `${clamped}/${maxSteps + 1}`;
  };
  const acFuelInTank = isAC
    ? asNumber((rawTelemetry as any)?.fuel_in_tank ?? telemetry.fuelInTank)
    : null;
  const acMaxFuel = isAC ? asNumber(acExtended?.max_fuel ?? (rawTelemetry as any)?.max_fuel) : null;
  const acFuelPercent =
    isAC && acFuelInTank !== null && acMaxFuel && acMaxFuel > 0
      ? (acFuelInTank / acMaxFuel) * 100
      : null;
  let acFuelRemaining = isAC
    ? asNumber(atlasAI?.fuel_laps_remaining_calculated ?? telemetry.fuelRemainingLaps)
    : null;
  let acFuelMargin = isAC ? asNumber(atlasAI?.fuel_margin_laps) : null;
  const acFuelPerLap = isAC
    ? asNumber(atlasAI?.fuel_per_lap_average ?? (rawTelemetry as any)?.fuel_per_lap_average)
    : null;
  const acFuelTargetSave = isAC
    ? asNumber(atlasAI?.fuel_target_save_per_lap ?? (rawTelemetry as any)?.fuel_target_save_per_lap)
    : null;
  const acFuelLastLap = isAC
    ? asNumber(atlasAI?.fuel_last_lap ?? (rawTelemetry as any)?.fuel_last_lap)
    : null;
  const acFuelCalcReady = isAC ? Boolean(atlasAI?.fuel_calc_ready) : false;
  const acFuelStrategyStatus = isAC ? atlasAI?.fuel_strategy_status ?? null : null;
  const acFuelReady = isAC
    ? acFuelCalcReady ||
      (acFuelPerLap !== null && acFuelPerLap > 0.1 && telemetry.currentLapNum >= 2)
    : acFuelCalcReady;
  const derivedFuelRemaining =
    isAC && acFuelPerLap !== null && acFuelPerLap > 0.01 && acFuelInTank !== null && acFuelInTank > 0
      ? acFuelInTank / acFuelPerLap
      : null;
  const lapsCompleted = isAC ? Math.max(0, telemetry.currentLapNum - 1) : 0;
  const lapsRemainingTarget =
    isAC && telemetry.totalLaps > 0
      ? Math.max(0, telemetry.totalLaps - lapsCompleted)
      : null;
  const derivedFuelMargin =
    isAC && derivedFuelRemaining !== null && lapsRemainingTarget !== null
      ? derivedFuelRemaining - lapsRemainingTarget
      : null;
  if (isAC && derivedFuelRemaining !== null) {
    acFuelRemaining = derivedFuelRemaining;
  }
  if (isAC && derivedFuelMargin !== null) {
    acFuelMargin = derivedFuelMargin;
  }
  const acFuelStatusLabel = isAC
    ? (() => {
        if (!atlasAI) {
          return 'No model';
        }
        if (!acFuelReady) {
          return 'Warming up';
        }
        if (acFuelStrategyStatus === 2) {
          return 'CRITICAL - Box';
        }
        if (acFuelStrategyStatus === 1) {
          return 'Monitor';
        }
        return 'Optimal';
      })()
    : null;
  const acFuelStatusClass = isAC
    ? (!atlasAI
        ? 'text-gray-500'
        : !acFuelReady
          ? 'text-gray-400'
          : acFuelStrategyStatus === 2
            ? 'text-red-400 font-semibold'
            : acFuelStrategyStatus === 1
              ? 'text-yellow-300'
              : 'text-green-400')
    : '';
  const acFuelPerLapDisplay = isAC
    ? acFuelReady && acFuelPerLap !== null
      ? acFuelPerLap
      : acFuelPerLap !== null
        ? 0
        : null
    : acFuelPerLap;
  const acFuelLastLapDisplay = isAC
    ? acFuelReady && acFuelLastLap !== null
      ? acFuelLastLap
      : acFuelLastLap !== null
        ? 0
        : null
    : acFuelLastLap;
  const acFuelRemainingDisplay = isAC
    ? acFuelReady && acFuelRemaining !== null
      ? acFuelRemaining
      : acFuelReady
        ? null
        : 0
    : acFuelRemaining;
  const acFuelMarginDisplay = isAC
    ? acFuelReady && acFuelMargin !== null
      ? acFuelMargin
      : acFuelReady
        ? null
        : 0
    : acFuelMargin;
  const acFuelMarginClass = isAC
    ? !acFuelReady || acFuelMarginDisplay === null
      ? 'text-gray-400'
      : acFuelMarginDisplay >= 0
        ? 'text-green-400'
        : 'text-red-400'
    : acFuelMargin === null
      ? 'text-gray-400'
      : acFuelMargin >= 0
        ? 'text-green-400'
        : 'text-red-400';
  const acAidFuelRate = isAC
    ? asNumber(acExtended?.aid_fuel_rate ?? (rawTelemetry as any)?.aid_fuel_rate)
    : null;
  const rawLastLapSeconds = isAC ? asNumber((rawTelemetry as any)?.last_lap_time) : null;
  const rawCurrentLapSeconds = isAC ? asNumber((rawTelemetry as any)?.current_lap_time) : null;
  const rawBestLapSeconds = isAC ? asNumber((rawTelemetry as any)?.best_lap_time) : null;
  const lapSecondsForRate =
    (rawLastLapSeconds !== null && rawLastLapSeconds > 1 ? rawLastLapSeconds : null) ??
    (rawCurrentLapSeconds !== null && rawCurrentLapSeconds > 1 ? rawCurrentLapSeconds : null) ??
    (rawBestLapSeconds !== null && rawBestLapSeconds > 1 ? rawBestLapSeconds : null);
  const acFuelRatePerHour = isAC
    ? acFuelReady && acFuelPerLap !== null && lapSecondsForRate !== null
      ? (acFuelPerLap / lapSecondsForRate) * 3600.0
      : null
    : acAidFuelRate !== null && acAidFuelRate > 0
      ? acAidFuelRate * 3600.0
      : null;
  const acPenaltyTime = isAC ? asNumber((rawTelemetry as any)?.penalty_time) : null;
  const acTyresOut = isAC
    ? (rawTelemetry as any)?.numberOfTyresOut ?? (rawTelemetry as any)?.number_of_tyres_out ?? 0
    : 0;
  const acLapInvalid = isAC
    ? Boolean(
        (rawTelemetry as any)?.lap_invalidated ||
          (rawTelemetry as any)?.lap_invalid ||
          telemetry.lapInvalid,
      )
    : false;
  const acSurfaceGrip = isAC ? asNumber(acExtended?.surface_grip) : null;
  const acWindSpeed = isAC ? asNumber(acExtended?.wind_speed) : null;
  const acWindDirection = isAC ? asNumber(acExtended?.wind_direction) : null;
  const acPerformanceMeter = isAC ? asNumber(acExtended?.performance_meter) : null;
  const acBrakeBias = isAC
    ? (() => {
        const raw =
          acExtended?.brake_bias ?? (rawTelemetry as any)?.brake_bias ?? telemetry.brakeBias;
        if (typeof raw === 'number' && Number.isFinite(raw)) {
          if (raw > 1.5) {
            return raw;
          }
          return raw * 100;
        }
        return null;
      })()
    : null;
  const acTcPrimary = sanitizeControlValue(
    isAC
      ? asNumber(
          acExtended?.traction_control_setting ??
            (rawTelemetry as any)?.traction_control_setting ??
            telemetry.tc,
        )
      : null,
  );
  const acTcSecondary = sanitizeControlValue(
    isAC
      ? asNumber(
          acExtended?.traction_control_setting_secondary ??
            (rawTelemetry as any)?.traction_control_setting_secondary ??
            telemetry.tc2,
        )
      : null,
  );
  const acAbsSetting = sanitizeControlValue(
    isAC
      ? asNumber(acExtended?.abs_setting ?? (rawTelemetry as any)?.abs_setting ?? telemetry.abs)
      : null,
  );
  const rawFuelMapSetting = isAC
    ? asNumber(
        acExtended?.fuel_map_setting ?? (rawTelemetry as any)?.fuel_map_setting ?? telemetry.fuelMapSetting,
      )
    : null;
  const rawFuelMapMax = isAC
    ? asNumber(
        acExtended?.fuel_map_max ?? (rawTelemetry as any)?.fuel_map_max ?? telemetry.fuelMapMax,
      )
    : null;
  const acFuelMapSetting = sanitizeControlValue(rawFuelMapSetting);
  const acFuelMapMax = rawFuelMapMax && rawFuelMapMax > 0 ? rawFuelMapMax : null;
  const acEngineBrakeSetting = isAC
    ? asNumber(
        acExtended?.engine_brake_setting ??
          (rawTelemetry as any)?.engine_brake_setting ??
          telemetry.engineBrake,
      )
    : null;
  const fallbackBrakeBiasDisplay =
    typeof telemetry.brakeBias === 'number' && Number.isFinite(telemetry.brakeBias)
      ? telemetry.brakeBias.toFixed(1)
      : '50.0';
  const AC_TC_MAX = 10;
  const AC_ABS_MAX = 11;
  const acWheelSlip: number[] | null = isAC ? acExtended?.wheel_slip ?? null : null;
  const acWheelLoad: number[] | null = isAC ? acExtended?.wheel_load ?? null : null;
  const acCoreTemps: number[] | null = isAC ? acExtended?.tyre_core_temperature ?? null : null;
  const acOuterTemps: number[] | null = isAC ? acExtended?.tyre_temp_outer ?? null : null;
  const acInnerTemps: number[] | null = isAC ? acExtended?.tyre_temp_inner ?? null : null;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const acOpponentCallouts = useMemo(() => {
    if (!isAC || !atlasAI) {
      return [];
    }
    const lines: string[] = [];
    const describeOpponent = (label: string, opp: any) => {
      if (!opp || typeof opp.position !== 'number' || opp.position <= 0) {
        return null;
      }
      const name = (opp.driver_name || '').trim() || `P${opp.position}`;
      const gap = Number.isFinite(opp.gap_seconds)
        ? `${opp.gap_seconds >= 0 ? '+' : '-'}${Math.abs(opp.gap_seconds).toFixed(1)}s`
        : '--';
      const tyreAge =
        typeof opp.tyre_age === 'number' && opp.tyre_age >= 0 ? `${opp.tyre_age}L` : '-';
      const tyreCompound = resolveCompoundLabel(opp.tyre_compound, opp.tyre_compound);
      return `${label}: ${name} ${gap} | ${tyreAge} | ${tyreCompound}`;
    };
    const aheadPrimary = describeOpponent('Ahead', atlasAI.opponent_ahead_1);
    const aheadSecondary = describeOpponent('Next', atlasAI.opponent_ahead_2);
    const behindPrimary = describeOpponent('Behind', atlasAI.opponent_behind_1);
    const behindSecondary = describeOpponent('Chasing', atlasAI.opponent_behind_2);
    [aheadPrimary, aheadSecondary, behindPrimary, behindSecondary]
      .filter((entry): entry is string => Boolean(entry))
      .forEach((entry) => lines.push(entry));
    if (!lines.length && primaryAhead) {
      const gap = formatGap(primaryAhead.gapToPlayer) ?? '';
      lines.push(`Ahead: ${primaryAhead.driver} ${gap}`.trim());
    }
    if (!lines.length && primaryBehind) {
      const gap = formatGap(primaryBehind.gapToPlayer) ?? '';
      lines.push(`Behind: ${primaryBehind.driver} ${gap}`.trim());
    }
    return lines;
  }, [atlasAI, isAC, primaryAhead, primaryBehind]);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const acFuelCallouts = useMemo(() => {
    if (!isAC) {
      return [];
    }
    const lines: string[] = [];
    if (acFuelInTank !== null) {
      const tankLine =
        acFuelPercent !== null && Number.isFinite(acFuelPercent)
          ? `${acFuelInTank.toFixed(1)}L (${acFuelPercent.toFixed(0)}%)`
          : `${acFuelInTank.toFixed(1)}L`;
      lines.push(`Fuel: ${tankLine}`);
    }
    if (acFuelReady && acFuelPerLap !== null && acFuelPerLap > 0) {
      lines.push(`Burn: ${acFuelPerLap.toFixed(2)} kg/lap`);
    }
    if (acFuelReady && acFuelRemainingDisplay !== null) {
      lines.push(`Remain: ${acFuelRemainingDisplay.toFixed(1)} laps`);
    }
    if (acFuelReady && acFuelMarginDisplay !== null) {
      lines.push(
        `Margin: ${acFuelMarginDisplay >= 0 ? '+' : ''}${acFuelMarginDisplay.toFixed(2)} laps`,
      );
    }
    if (acFuelTargetSave !== null && acFuelTargetSave > 0.0001) {
      lines.push(`Save Target: ${(acFuelTargetSave * 100).toFixed(1)}%/lap`);
    }
    if (!acFuelReady) {
      lines.push('Fuel model warming up');
    }
    if (atlasAI?.pit_strategy_status === 2) {
      lines.push('Call: BOX THIS LAP');
    } else if (atlasAI?.pit_strategy_status === 1) {
      lines.push('Plan stop soon');
    }
    return lines;
  }, [
    acFuelInTank,
    acFuelMarginDisplay,
    acFuelPercent,
    acFuelPerLap,
    acFuelReady,
    acFuelRemainingDisplay,
    acFuelTargetSave,
    atlasAI?.pit_strategy_status,
    isAC,
  ]);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const acPenaltyAlerts = useMemo(() => {
    if (!isAC) {
      return [];
    }
    const alerts: string[] = [];
    if (acLapInvalid) {
      alerts.push('Lap invalidated - all four off');
    }
    if (!acLapInvalid && acTyresOut >= 4) {
      alerts.push('All four wheels beyond track limits');
    }
    if (acPenaltyTime !== null && acPenaltyTime > 0.05) {
      alerts.push(`Penalty time: ${acPenaltyTime.toFixed(1)}s`);
    }
    const penaltyFlag = (rawTelemetry as any)?.flag_type;
    if (typeof penaltyFlag === 'number' && penaltyFlag === 6) {
      alerts.push('Black flag active - clear penalty');
    }
    return alerts;
  }, [acLapInvalid, acPenaltyTime, acTyresOut, isAC, rawTelemetry]);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const acTrackConditionCallouts = useMemo(() => {
    if (!isAC) {
      return [];
    }
    const lines: string[] = [];
    if (acSurfaceGrip !== null && Number.isFinite(acSurfaceGrip)) {
      lines.push(`Grip: ${(acSurfaceGrip * 100).toFixed(1)}%`);
    }
    if (acPerformanceMeter !== null && Number.isFinite(acPerformanceMeter)) {
      lines.push(`Performance meter: ${(acPerformanceMeter * 100).toFixed(0)}%`);
    }
    if (acWindSpeed !== null) {
      lines.push(
        `Wind: ${acWindSpeed.toFixed(1)} km/h ${compassFromDegrees(acWindDirection)}`,
      );
    }
    if (Number.isFinite(telemetry.trackTemp)) {
      lines.push(`Track: ${telemetry.trackTemp.toFixed(1)}°C`);
    }
    if (Number.isFinite(telemetry.airTemp)) {
      lines.push(`Air: ${telemetry.airTemp.toFixed(1)}°C`);
    }
    return lines;
  }, [
    acPerformanceMeter,
    acSurfaceGrip,
    acWindDirection,
    acWindSpeed,
    isAC,
    telemetry.airTemp,
    telemetry.trackTemp,
  ]);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const acTyreGripCallouts = useMemo(() => {
    if (!isAC) {
      return [];
    }
    const lines: string[] = [];
    if (acCoreTemps && acCoreTemps.length >= 4) {
      const frontAvg = (acCoreTemps[0] + acCoreTemps[1]) / 2;
      const rearAvg = (acCoreTemps[2] + acCoreTemps[3]) / 2;
      const delta = frontAvg - rearAvg;
      if (Math.abs(delta) >= 3) {
        lines.push(
          delta > 0
            ? `Front axle +${delta.toFixed(1)}°C hotter`
            : `Rear axle +${Math.abs(delta).toFixed(1)}°C hotter`,
        );
      }
      const hottestIndex = acCoreTemps.indexOf(Math.max(...acCoreTemps));
      if (hottestIndex > -1) {
        const wheelNames = ['FL', 'FR', 'RL', 'RR'];
        lines.push(
          `Hottest: ${wheelNames[hottestIndex]} ${acCoreTemps[hottestIndex].toFixed(1)}°C`,
        );
      }
    }
    if (acOuterTemps && acInnerTemps && acOuterTemps.length >= 4 && acInnerTemps.length >= 4) {
      const spreads = acOuterTemps
        .map((outer, idx) => {
          const inner = acInnerTemps[idx];
          if (!Number.isFinite(outer) || !Number.isFinite(inner)) {
            return null;
          }
          return outer - inner;
        })
        .filter((value): value is number => value !== null);
      if (spreads.length) {
        const maxSpread = spreads.sort((a, b) => Math.abs(b) - Math.abs(a))[0];
        if (Math.abs(maxSpread) > 8) {
          lines.push(
            `${maxSpread > 0 ? 'Outer shoulders hot' : 'Inside shoulders hot'} (${maxSpread.toFixed(1)}°C)`,
          );
        }
      }
    }
    if (acWheelSlip && acWheelSlip.length >= 4) {
      const maxSlip = Math.max(
        ...acWheelSlip.map((value) => (Number.isFinite(value) ? value : 0)),
      );
      if (maxSlip > 0.25) {
        lines.push(`Wheel slip spike: ${(maxSlip * 100).toFixed(0)}%`);
      }
    }
    if (acWheelLoad && acWheelLoad.length >= 4) {
      const frontLoad = acWheelLoad[0] + acWheelLoad[1];
      const rearLoad = acWheelLoad[2] + acWheelLoad[3];
      if (Number.isFinite(frontLoad) && Number.isFinite(rearLoad) && frontLoad + rearLoad > 0) {
        const loadDelta = ((frontLoad - rearLoad) / (frontLoad + rearLoad)) * 100;
        if (Math.abs(loadDelta) > 6) {
          lines.push(
            loadDelta > 0
              ? `Load forward biased (+${loadDelta.toFixed(1)}%)`
              : `Load rear biased (${loadDelta.toFixed(1)}%)`,
          );
        }
      }
    }
    if (!lines.length && acSurfaceGrip !== null) {
      lines.push(`Grip steady at ${(acSurfaceGrip * 100).toFixed(1)}%`);
    }
    return lines;
  }, [acCoreTemps, acInnerTemps, acOuterTemps, acSurfaceGrip, acWheelLoad, acWheelSlip, isAC]);

  const fuelMarginClass =
    displayFuelMargin === null
      ? 'text-gray-400'
      : displayFuelMargin < 0
        ? 'text-rose-300 font-semibold'
        : displayFuelMargin < 0.5
          ? 'text-amber-300'
          : 'text-green-400';

  const tyreWearValues = [
    telemetry.tireWearFL,
    telemetry.tireWearFR,
    telemetry.tireWearRL,
    telemetry.tireWearRR,
  ].filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const maxTyreWear = tyreWearValues.length > 0 ? Math.max(...tyreWearValues) : 0;
  const tyreWearRate =
    telemetry.tireAge > 0 && Number.isFinite(maxTyreWear) ? maxTyreWear / telemetry.tireAge : null;
  const tyreLapsTo70 =
    tyreWearRate !== null && tyreWearRate > 0
      ? Math.max(0, (70 - maxTyreWear) / tyreWearRate)
      : null;
  const displayTyreDegradation = isF124 ? tyreWearRate : tyreDegradation;
  const displayTyreLifeRemaining = isF124 ? tyreLapsTo70 : tyreLifeRemaining;
  const displayTyrePerformance = isF124 ? Math.max(0, 100 - maxTyreWear) : tyrePerformance;
  const displayTyreStintProgress = isF124
    ? displayTyreLifeRemaining !== null && telemetry.tireAge > 0
      ? telemetry.tireAge / (telemetry.tireAge + displayTyreLifeRemaining)
      : null
    : tyreStintProgress;
  const f1TyreStatus = (() => {
    if (!isF124) {
      return atlasAI?.tyre_strategy_status;
    }
    if (maxTyreWear >= 80 || (displayTyreLifeRemaining !== null && displayTyreLifeRemaining <= 2)) {
      return 2;
    }
    if (maxTyreWear >= 65 || (displayTyreLifeRemaining !== null && displayTyreLifeRemaining <= 5)) {
      return 1;
    }
    return 0;
  })();
  const tyreStatusStyle = pickStatusStyle(tyreStatusStyles, f1TyreStatus);
  const tyreCritical = isF124
    ? displayTyreLifeRemaining !== null && displayTyreLifeRemaining <= 2
    : atlasAI?.tyre_critical_warning === 1;

  const tyreDegClass =
    displayTyreDegradation === null
      ? 'text-gray-400'
      : isF124
        ? displayTyreDegradation > 6
          ? 'text-rose-300'
          : displayTyreDegradation > 4
            ? 'text-amber-300'
            : 'text-green-400'
        : displayTyreDegradation > 1.2
          ? 'text-rose-300'
          : displayTyreDegradation > 0.7
            ? 'text-amber-300'
            : 'text-green-400';

  const tyreLifeClass =
    displayTyreLifeRemaining === null
      ? 'text-gray-400'
      : displayTyreLifeRemaining < 3
        ? 'text-rose-300 font-semibold'
        : displayTyreLifeRemaining < 8
          ? 'text-amber-300'
          : 'text-green-400';

  const pitNetClass =
    pitNetDelta === null
      ? 'text-gray-400'
      : pitNetDelta < 0
        ? 'text-green-400'
        : 'text-amber-300';

  const stayOutClass = pitStayOutLoss === null ? 'text-gray-400' : 'text-amber-300';
  const tyrePerformanceText =
    displayTyrePerformance === null ? '-' : `${Math.round(displayTyrePerformance)}%`;
  const tyreStintPercent =
    displayTyreStintProgress === null
      ? null
      : Math.round(Math.max(0, Math.min(1, displayTyreStintProgress)) * 100);
  const tyreWearSummary = (() => {
    if (maxTyreWear >= 80) {
      return { label: `Critical (${maxTyreWear.toFixed(0)}%)`, className: 'text-rose-300 font-semibold' };
    }
    if (maxTyreWear >= 65) {
      return { label: `Window (${maxTyreWear.toFixed(0)}%)`, className: 'text-amber-300' };
    }
    return { label: `OK (${maxTyreWear.toFixed(0)}%)`, className: 'text-emerald-300' };
  })();

  const formatDuration = (value: number | null): string => {
    if (value === null || !Number.isFinite(value)) {
      return '—';
    }
    const ms = Math.max(0, value);
    if (ms < 1000) {
      return '<1s';
    }
    if (ms < 60000) {
      return `${(ms / 1000).toFixed(1)}s`;
    }
    if (ms < 3600000) {
      return `${(ms / 60000).toFixed(1)}m`;
    }
    return `${(ms / 3600000).toFixed(2)}h`;
  };

  const formatSeconds = (value: number | null | undefined): string => {
    if (value === null || value === undefined || !Number.isFinite(value)) {
      return '—';
    }
    const negative = value < 0;
    const abs = Math.abs(value);
    const minutes = Math.floor(abs / 60);
    const seconds = abs - minutes * 60;
    const secondsStr = seconds < 10 ? `0${seconds.toFixed(1)}` : seconds.toFixed(1);
    return `${negative ? '-' : ''}${minutes}:${secondsStr}`;
  };

  const sessionPhaseDebug = useMemo(() => {
    const now = Date.now();
    const toTimestamp = (event: RaceEvent | null): number | null => {
      if (!event) {
        return null;
      }
      const rawTs = event.timestamp;
      if (typeof rawTs === 'number' && Number.isFinite(rawTs)) {
        return rawTs;
      }
      if (typeof rawTs === 'string') {
        const parsed = Number(rawTs);
        return Number.isFinite(parsed) ? parsed : null;
      }
      return null;
    };

    const findEvent = (types: string[]): RaceEvent | null =>
      raceEvents.find((event) => types.includes(event.type)) ?? null;

    const formationEvent = findEvent(['SCFORM']);
    const finishEvent = findEvent(['RCWN', 'SEND', 'CHQF']);

    const formationTimestamp = toTimestamp(formationEvent);
    const finishTimestamp = toTimestamp(finishEvent);

    const formationAge = formationTimestamp !== null ? now - formationTimestamp : null;
    const finishAge = finishTimestamp !== null ? now - finishTimestamp : null;

    const rawSafetyCarStatus = (rawTelemetry as any)?.safety_car_status;
    const safetyCarStatus = telemetry.safetyCarStatus;
    const sessionTypeLower = (telemetry.sessionType || '').toLowerCase();
    const isRaceSession = sessionTypeLower === 'race';

    const lapsRemaining =
      telemetry.totalLaps > 0 ? telemetry.totalLaps - telemetry.currentLapNum : null;
    const sessionTimeLeft = telemetry.sessionTimeLeft;

    const rawSessionFinished =
      ((rawTelemetry as any)?.race_finished === 1) ||
      ((rawTelemetry as any)?.session_finished === 1) ||
      (((rawTelemetry as any)?.session_state || '').toString().toLowerCase() === 'finished');

    const formationCandidate =
      isRaceSession &&
      (
        safetyCarStatus === 'Formation Lap' ||
        rawSafetyCarStatus === 3 ||
        (formationAge !== null && formationAge < 180000)
      );

    const finishCandidate =
      isRaceSession &&
      (
        rawSessionFinished ||
        (finishAge !== null && finishAge < 600000) ||
        (lapsRemaining !== null && lapsRemaining <= 0 && sessionTimeLeft <= 0)
      );

    const phase = isRaceSession
      ? finishCandidate
        ? 'Finished'
        : formationCandidate
          ? 'Formation Lap'
          : 'Racing'
      : telemetry.sessionType || 'Unknown';

    const signals = [
      { label: 'Safety Car Status', value: safetyCarStatus || 'Unknown' },
      { label: 'Safety Car Raw', value: rawSafetyCarStatus ?? '—' },
      {
        label: 'Lap Progress',
        value: `${Number.isFinite(telemetry.currentLapNum) ? telemetry.currentLapNum : '?'} / ${
          Number.isFinite(telemetry.totalLaps) ? telemetry.totalLaps : '?'
        }`,
      },
      {
        label: 'Laps Remaining',
        value: lapsRemaining !== null ? lapsRemaining.toString() : 'Unknown',
      },
      { label: 'Session Time Left', value: formatSeconds(sessionTimeLeft) },
      { label: 'Formation Event Age', value: formatDuration(formationAge) },
      { label: 'Finish Event Age', value: formatDuration(finishAge) },
      {
        label: 'Last Formation Event',
        value: formationEvent ? (formationEvent.message || formationEvent.type) : 'None',
      },
      {
        label: 'Last Finish Event',
        value: finishEvent ? (finishEvent.message || finishEvent.type) : 'None',
      },
    ];

    return {
      phase,
      isRaceSession,
      formationCandidate,
      finishCandidate,
      signals,
    };
  }, [raceEvents, rawTelemetry, telemetry]);

  const sessionPhaseSignalColumns = useMemo(() => {
    const signals = sessionPhaseDebug.signals;
    if (signals.length <= 1) {
      return [signals];
    }
    const half = Math.ceil(signals.length / 2);
    return [signals.slice(0, half), signals.slice(half)];
  }, [sessionPhaseDebug]);
  const strategyPanelSessionPhase = useMemo<'formation' | 'race' | 'finished' | 'unknown'>(() => {
    const phase = (sessionPhaseDebug.phase || '').toLowerCase();
    if (phase.includes('formation')) {
      return 'formation';
    }
    if (phase.includes('finish')) {
      return 'finished';
    }
    if (phase.includes('race')) {
      return 'race';
    }
    return 'unknown';
  }, [sessionPhaseDebug]);
  const sessionPhaseHeader = useMemo(() => {
    const phase = sessionPhaseDebug.phase || 'Unknown';
    const lower = phase.toLowerCase();
    if (lower.includes('formation')) {
      return { label: 'Formation', className: 'bg-amber-500/20 text-amber-100 border border-amber-400/40' };
    }
    if (lower.includes('finish')) {
      return { label: 'Finished', className: 'bg-rose-500/20 text-rose-100 border border-rose-400/40' };
    }
    if (lower.includes('race')) {
      return { label: 'Race', className: 'bg-emerald-500/20 text-emerald-100 border border-emerald-400/40' };
    }
    return { label: phase, className: 'bg-slate-700/40 text-slate-200 border border-slate-600/40' };
  }, [sessionPhaseDebug]);
  const formationPromptBadge = useMemo(() => {
    const active = sessionPhaseDebug.formationCandidate;
    return {
      label: active ? 'Formation Prompts Queued' : 'Formation Prompts Idle',
      className: active
        ? 'bg-amber-500/15 text-amber-100 border border-amber-400/40'
        : 'bg-slate-700/40 text-slate-300 border border-slate-600/40',
    };
  }, [sessionPhaseDebug]);
  const postRaceBadge = useMemo(() => {
    const fired = sessionPhaseDebug.finishCandidate;
    return {
      label: fired ? 'Post-Race Fired' : 'Post-Race Pending',
      className: fired
        ? 'bg-rose-500/20 text-rose-100 border border-rose-400/40'
        : 'bg-slate-700/40 text-slate-300 border border-slate-600/40',
    };
  }, [sessionPhaseDebug]);
  if (connectionStatus === 'disconnected' || connectionStatus === 'error') {
    return (
      <div className="h-screen overflow-y-auto bg-[#050505] text-white p-6">
        <div className="grid grid-cols-4 gap-3">
          <Card className="col-span-4 p-8 bg-black border border-gray-700">
            <h1 className="text-2xl font-bold text-white mb-4">Dev Mode Dashboard</h1>
            <p className="text-gray-400">Waiting for telemetry connection...</p>
            <p className="text-gray-500 text-sm mt-2">Backend should be running on port 8080</p>
            <p className="text-gray-500 text-sm mt-1">Status: {connectionStatus}</p>
          </Card>
          <DevModeAtlasLinkPanel />
        </div>
      </div>
    );
  }

  if (!rawTelemetry) {
    return (
      <div className="h-screen overflow-y-auto bg-[#050505] text-white p-6">
        <div className="grid grid-cols-4 gap-3">
          <Card className="col-span-4 p-8 bg-black border border-gray-700">
            <h1 className="text-2xl font-bold text-white mb-4">Dev Mode Dashboard</h1>
            <p className="text-green-400">Backend connected ✅</p>
            <p className="text-gray-400 mt-2">Waiting for game data...</p>
            <p className="text-gray-500 text-sm mt-2">Start F1 24 or Assetto Corsa</p>
          </Card>
          <DevModeAtlasLinkPanel />
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-y-auto bg-[#050505] text-white p-6">
      {/* Header Bar */}
      <div className="bg-black border border-gray-700 rounded-2xl px-4 py-3 mb-6 flex justify-between items-center">
        <div className="flex gap-6 items-center">
          <span className="font-bold">Game: <span className={gameConnected !== 'Not Connected' ? 'text-green-400' : 'text-red-400'}>{gameConnected} {gameConnected !== 'Not Connected' ? '✅' : '❌'}</span></span>
          <span>Session: <span className="text-blue-400">{telemetry.sessionType}</span></span>
          <span>Lap: <span className="text-yellow-400">{telemetry.currentLapNum}/{telemetry.totalLaps}</span></span>
          <span>Position: <span className="text-orange-400">P{telemetry.position}</span></span>
          <span
            className={`text-xs font-mono uppercase tracking-wide px-3 py-1 rounded-full border ${sessionPhaseHeader.className}`}
          >
            Phase: {sessionPhaseHeader.label}
          </span>
          <span
            className={`text-xs font-mono uppercase tracking-wide px-3 py-1 rounded-full border ${formationPromptBadge.className}`}
          >
            {formationPromptBadge.label}
          </span>
          <span
            className={`text-xs font-mono uppercase tracking-wide px-3 py-1 rounded-full border ${postRaceBadge.className}`}
          >
            {postRaceBadge.label}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-sm text-gray-400">
            Dev Mode - {isAC ? 'Complete AC Telemetry (191 Fields)' : 'Complete F1 24 Telemetry'}
          </div>
          <button
            onClick={() => window.open(window.location.href, '_blank', 'width=1400,height=900')}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors px-2 py-1 rounded border border-gray-700 hover:border-gray-500"
            title="Open in new window"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            New Window
          </button>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-4 gap-3">

        <Card className="col-span-4 bg-indigo-950/60 border border-indigo-600/40 p-4">
          <h3 className="text-sm font-bold text-indigo-300 mb-3">SESSION PHASE DEBUG</h3>
          <div className="grid md:grid-cols-3 gap-3 text-xs text-indigo-100">
            <div className="space-y-2">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-indigo-400 mb-1">Derived Phase</div>
                <div className="text-sm font-semibold text-indigo-200">{sessionPhaseDebug.phase}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] uppercase tracking-wide text-indigo-400">Race Session</span>
                <span className={sessionPhaseDebug.isRaceSession ? 'text-emerald-300 font-semibold' : 'text-slate-400'}>
                  {sessionPhaseDebug.isRaceSession ? 'Yes' : 'No'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] uppercase tracking-wide text-indigo-400">Formation Candidate</span>
                <span className={sessionPhaseDebug.formationCandidate ? 'text-amber-300 font-semibold' : 'text-slate-400'}>
                  {sessionPhaseDebug.formationCandidate ? 'True' : 'False'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] uppercase tracking-wide text-indigo-400">Finish Candidate</span>
                <span className={sessionPhaseDebug.finishCandidate ? 'text-rose-300 font-semibold' : 'text-slate-400'}>
                  {sessionPhaseDebug.finishCandidate ? 'True' : 'False'}
                </span>
              </div>
            </div>
            {sessionPhaseSignalColumns.map((column, columnIndex) => (
              <div key={`phase-signals-${columnIndex}`} className="space-y-1">
                {column.map((signal) => (
                  <div key={signal.label} className="flex justify-between gap-2 border border-indigo-800/30 rounded-lg px-3 py-2 bg-indigo-900/30">
                    <span className="text-[10px] uppercase tracking-wide text-indigo-400">{signal.label}</span>
                    <span className="font-mono text-indigo-100 text-right">{signal.value}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Card>

        <DevModeAtlasLinkPanel />

        {/* Basic Telemetry */}
        <Card className="bg-black/60 border border-gray-700 p-4">
          <h3 className="text-sm font-bold text-gray-400 mb-2">BASIC</h3>
          <div className="space-y-1 text-sm">
            <div>Speed: <span className="text-green-400 font-mono">{telemetry.speed} km/h</span></div>
            <div>RPM: <span className="text-orange-400 font-mono">{telemetry.rpm}</span></div>
            <div>Gear: <span className="text-blue-400 font-mono">{telemetry.gear}</span></div>
            <div>Throttle: <span className="text-green-400 font-mono">{telemetry.throttle}%</span></div>
            <div>Brake: <span className="text-red-400 font-mono">{telemetry.brake}%</span></div>
          </div>
        </Card>

        {/* Tire Information - AC/F1 Adaptive */}
        <Card className="bg-black/60 border border-gray-700 p-4">
          <h3 className="text-sm font-bold text-gray-400 mb-2">
            {isAC
              ? `TIRES - ${tyreCompoundDisplay}`
              : `TIRES - ${tyreCompoundVisualOnly} (Act: ${tyreCompoundActualOnly} | Vis: ${tyreCompoundVisualOnly})`}
          </h3>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <div className="font-bold text-yellow-400">FL</div>
              <div>Core{tyreTempInnerFallback[0] ? '*' : ''}: {formatTempDisplay(tyreTempInner?.[0] ?? telemetry.tireTempFL)}</div>
              <div>Surface: {formatTempDisplay(tyreTempSurface?.[0] ?? null)}</div>
              <div className="text-orange-400">Wear: {telemetry.tireWearFL}% [raw: {((rawTelemetry as any)?.tire_wear?.[0])?.toFixed(1) || 'N/A'}%]</div>
              <div>Press: {telemetry.tirePressureFL.toFixed(1)} {isAC ? 'bar' : 'PSI'} [raw: {(rawTelemetry as any)?.tire_pressure?.[0]?.toFixed(1) || 'N/A'}]</div>
              <div className="text-red-300">Brake: {telemetry.brakeTempFL}°C [raw: {(rawTelemetry as any)?.brake_temperature?.[0]?.toFixed(1) || 'N/A'}]</div>
              {isAC && (
                <>
                  <div className="text-purple-400">Slip: {((rawTelemetry as any)?.ac_extended?.wheel_slip?.[0])?.toFixed(3) || 'N/A'}</div>
                  <div className="text-cyan-400">Load: {((rawTelemetry as any)?.ac_extended?.wheel_load?.[0])?.toFixed(0) || 'N/A'}N</div>
                </>
              )}
            </div>
            <div>
              <div className="font-bold text-yellow-400">FR</div>
              <div>Core{tyreTempInnerFallback[1] ? '*' : ''}: {formatTempDisplay(tyreTempInner?.[1] ?? telemetry.tireTempFR)}</div>
              <div>Surface: {formatTempDisplay(tyreTempSurface?.[1] ?? null)}</div>
              <div className="text-orange-400">Wear: {telemetry.tireWearFR}%</div>
              <div>Press: {telemetry.tirePressureFR.toFixed(1)} {isAC ? 'bar' : 'PSI'}</div>
              <div className="text-red-300">Brake: {telemetry.brakeTempFR}°C [raw: {(rawTelemetry as any)?.brake_temperature?.[1]?.toFixed(1) || 'N/A'}]</div>
              {isAC && (
                <>
                  <div className="text-purple-400">Slip: {((rawTelemetry as any)?.ac_extended?.wheel_slip?.[1])?.toFixed(3) || 'N/A'}</div>
                  <div className="text-cyan-400">Load: {((rawTelemetry as any)?.ac_extended?.wheel_load?.[1])?.toFixed(0) || 'N/A'}N</div>
                </>
              )}
            </div>
            <div>
              <div className="font-bold text-yellow-400">RL</div>
              <div>Core{tyreTempInnerFallback[2] ? '*' : ''}: {formatTempDisplay(tyreTempInner?.[2] ?? telemetry.tireTempRL)}</div>
              <div>Surface: {formatTempDisplay(tyreTempSurface?.[2] ?? null)}</div>
              <div className="text-orange-400">Wear: {telemetry.tireWearRL}%</div>
              <div>Press: {telemetry.tirePressureRL.toFixed(1)} {isAC ? 'bar' : 'PSI'}</div>
              <div className="text-red-300">Brake: {telemetry.brakeTempRL}°C [raw: {(rawTelemetry as any)?.brake_temperature?.[2]?.toFixed(1) || 'N/A'}]</div>
              {isAC && (
                <>
                  <div className="text-purple-400">Slip: {((rawTelemetry as any)?.ac_extended?.wheel_slip?.[2])?.toFixed(3) || 'N/A'}</div>
                  <div className="text-cyan-400">Load: {((rawTelemetry as any)?.ac_extended?.wheel_load?.[2])?.toFixed(0) || 'N/A'}N</div>
                </>
              )}
            </div>
            <div>
              <div className="font-bold text-yellow-400">RR</div>
              <div>Core{tyreTempInnerFallback[3] ? '*' : ''}: {formatTempDisplay(tyreTempInner?.[3] ?? telemetry.tireTempRR)}</div>
              <div>Surface: {formatTempDisplay(tyreTempSurface?.[3] ?? null)}</div>
              <div className="text-orange-400">Wear: {telemetry.tireWearRR}%</div>
              <div>Press: {telemetry.tirePressureRR.toFixed(1)} {isAC ? 'bar' : 'PSI'}</div>
              <div className="text-red-300">Brake: {telemetry.brakeTempRR}°C [raw: {(rawTelemetry as any)?.brake_temperature?.[3]?.toFixed(1) || 'N/A'}]</div>
              {isAC && (
                <>
                  <div className="text-purple-400">Slip: {((rawTelemetry as any)?.ac_extended?.wheel_slip?.[3])?.toFixed(3) || 'N/A'}</div>
                  <div className="text-cyan-400">Load: {((rawTelemetry as any)?.ac_extended?.wheel_load?.[3])?.toFixed(0) || 'N/A'}N</div>
                </>
              )}
            </div>
          </div>
          <div className="mt-2 space-y-2">
            <div className="text-[10px] leading-snug text-gray-500">
              <div>Core temps pull from UDP tire_temps.inner (F1) or AC tyre_core_temperature; an asterisk means we fell back to surface data because the carcass channel reported zero.</div>
              <div>Surface temps map directly to UDP tire_temps.surface for both games.</div>
            </div>
            <div className="text-xs text-gray-400">
              {isAC ? (
                <div>
                  <div>Tire Rates - Wear: {((rawTelemetry as any)?.ac_extended?.aid_tire_rate !== undefined) ? (rawTelemetry as any).ac_extended.aid_tire_rate.toFixed(1) + 'x' : 'N/A'} | Damage: {((rawTelemetry as any)?.ac_extended?.aid_mechanical_damage !== undefined) ? (rawTelemetry as any).ac_extended.aid_mechanical_damage.toFixed(1) + 'x' : 'N/A'}</div>
                  <div className="text-gray-500 text-xs">
                    <div>wheel_slip: {JSON.stringify((rawTelemetry as any)?.ac_extended?.wheel_slip?.slice(0, 2))}</div>
                    <div>tire_pressure: {JSON.stringify((rawTelemetry as any)?.tire_pressure?.slice(0, 2))}</div>
                    <div>tire_wear: {JSON.stringify((rawTelemetry as any)?.tire_wear?.slice(0, 2))}</div>
                    <div>Keys: {Object.keys(rawTelemetry || {}).filter(k => k.includes('tire') || k.includes('wheel')).slice(0, 5).join(', ')}</div>
                  </div>
                </div>
              ) : (
                `Age: ${telemetry.tireAge} laps`
              )}
            </div>
          </div>
        </Card>

        {/* Timing */}
        <Card className="bg-black/60 border border-gray-700 p-4">
          <h3 className="text-sm font-bold text-gray-400 mb-2">TIMING</h3>
          <div className="space-y-1 text-sm">
            <div>Current: <span className="text-yellow-400 font-mono">{telemetry.currentLapTime}</span></div>
            <div>Last: <span className="text-green-400 font-mono">{telemetry.lastLapTime}</span></div>
            <div>Best: <span className="text-purple-400 font-mono">{telemetry.bestLapTime}</span></div>
            <div>Est: <span className="text-blue-400 font-mono">
              {telemetry.estimatedLapTime && telemetry.estimatedLapTime !== '0:00.000'
                ? telemetry.estimatedLapTime
                : '0:00.000'
              }
            </span></div>

            {/* Delta Mode Selector */}
            <div className="flex items-center gap-2 text-xs mb-1">
              <span className="text-gray-400">Delta Mode:</span>
              <select
                value={deltaMode}
                onChange={(e) => setDeltaMode(e.target.value as DeltaMode)}
                className="bg-gray-700 text-white text-xs px-1 py-0.5 rounded border border-gray-600"
              >
                <option value="personal">Personal Best</option>
                <option value="session">Session Fastest</option>
                <option value="last">Last Lap</option>
              </select>
            </div>

            <div>Delta ({deltaMode}): <span className={`font-mono ${telemetry.deltaTime > 0 ? 'text-red-400' : 'text-green-400'}`}>
              {telemetry.deltaTime > 0 ? '+' : ''}{telemetry.deltaTime.toFixed(3)}s
            </span></div>
            <div className="text-xs text-gray-500">
              Note: Backend calculates all 3 modes. Switch above is for UI demo only.
            </div>
            <div>Sector: <span className="text-blue-400 font-mono">{telemetry.currentSector + 1}/3</span></div>
            <div>Distance: <span className="text-gray-400 font-mono">{telemetry.lapDistance}m</span></div>
          </div>
        </Card>

        {/* Fuel & Energy - AC/F1 Adaptive */}
        <Card className="bg-black/60 border border-gray-700 p-4">
          <h3 className="text-sm font-bold text-gray-400 mb-2">{isAC ? 'FUEL & SYSTEMS' : 'FUEL & ENERGY'}</h3>
          <div className="space-y-1 text-sm">
            <div>
              Fuel:{' '}
              <span className="text-green-400 font-mono">
                {isAC
                  ? acFuelInTank !== null
                    ? `${acFuelInTank.toFixed(1)}L${
                        acFuelPercent !== null ? ` (${acFuelPercent.toFixed(0)}%)` : ''
                      }`
                    : 'N/A'
                  : `${telemetry.fuelInTank.toFixed(1)}L`}
              </span>
            </div>
            {isAC && (
              <>
                <div>
                  Max Fuel:{' '}
                  <span className="text-blue-400 font-mono">
                    {acMaxFuel !== null ? `${acMaxFuel.toFixed(0)}L` : 'N/A'}
                  </span>
                </div>
                <div>
                  Burn / Lap:{' '}
                  <span className="text-yellow-400 font-mono">
                    {acFuelPerLapDisplay !== null ? `${acFuelPerLapDisplay.toFixed(2)} L` : 'N/A'}
                  </span>
                </div>
                {acFuelLastLapDisplay !== null && (
                  <div>
                    Last Lap:{' '}
                    <span className="text-amber-300 font-mono">{`${acFuelLastLapDisplay.toFixed(2)} L`}</span>
                  </div>
                )}
                <div>
                  Remain:{' '}
                  <span className="text-cyan-300 font-mono">
                    {acFuelRemainingDisplay !== null
                      ? `${acFuelRemainingDisplay.toFixed(1)} laps`
                      : 'N/A'}
                  </span>
                </div>
                <div>
                  Margin:{' '}
                  <span className={`${acFuelMarginClass} font-mono`}>
                    {acFuelMarginDisplay !== null
                      ? `${acFuelMarginDisplay >= 0 ? '+' : ''}${acFuelMarginDisplay.toFixed(2)} laps`
                      : 'N/A'}
                  </span>
                </div>
                {acFuelTargetSave !== null && acFuelTargetSave > 0 && (
                  <div>
                    Save Target:{' '}
                    <span className="text-orange-300 font-mono">
                      {(acFuelTargetSave * 100).toFixed(1)}% / lap
                    </span>
                  </div>
                )}
                <div>
                  Model:{' '}
                  <span className={`${acFuelStatusClass} font-mono`}>
                    {acFuelStatusLabel ?? 'N/A'}
                  </span>
                </div>
                {acFuelRatePerHour !== null && (
                  <div>
                    Fuel Rate:{' '}
                    <span className="text-gray-400 font-mono">{acFuelRatePerHour.toFixed(1)} L/h</span>
                  </div>
                )}
                {(rawTelemetry as any)?.has_kers && (
                  <>
                    <div>KERS: <span className="text-purple-400 font-mono">{((rawTelemetry as any)?.ers_store_energy * 100)?.toFixed(1) || '0'}%</span></div>
                    <div>KERS Max: <span className="text-purple-300 font-mono">{(rawTelemetry as any)?.kers_max_j || 'N/A'}J</span></div>
                    <div>KERS Used: <span className="text-orange-400 font-mono">{(rawTelemetry as any)?.kers_current_kj || '0'}kJ</span></div>
                  </>
                )}
                {(rawTelemetry as any)?.has_ers && (
                  <>
                    <div>ERS: <span className="text-blue-400 font-mono">{((rawTelemetry as any)?.ers_store_energy * 100)?.toFixed(1) || '0'}%</span></div>
                    <div>ERS Max: <span className="text-blue-300 font-mono">{(rawTelemetry as any)?.ers_max_j || 'N/A'}J</span></div>
                    <div>ERS Level: <span className="text-cyan-400 font-mono">{(rawTelemetry as any)?.ers_power_level || '0'}</span></div>
                  </>
                )}
                {(rawTelemetry as any)?.has_drs && (
                  <div>DRS: <span className={`font-mono ${(rawTelemetry as any)?.drs_enabled ? 'text-green-400 font-bold' : (rawTelemetry as any)?.drs_available ? 'text-blue-400' : 'text-gray-400'}`}>
                    {(rawTelemetry as any)?.drs_enabled ? 'ACTIVE ✅' : (rawTelemetry as any)?.drs_available ? 'Available' : 'Not Available'}
                  </span></div>
                )}
              </>
            )}
            {isF124 && (
              <>
                <div>Laps: <span className="text-yellow-400 font-mono">{telemetry.fuelRemainingLaps.toFixed(1)}</span></div>
                <div>Mix: <span className="text-blue-400 font-mono">{telemetry.fuelMix}</span></div>
                <div>ERS Store: <span className="text-blue-400 font-mono">{telemetry.ersStoreEnergy}%</span></div>
                <div>ERS Mode: <span className="text-orange-400 font-mono">{telemetry.ersDeployMode}</span></div>
                <div>ERS Deploy: <span className={`font-mono ${telemetry.ersDeploying ? 'text-green-400' : 'text-gray-400'}`}>
                  {telemetry.ersDeploying ? 'ACTIVE' : 'OFF'}
                </span></div>
                <div>Deployed: <span className="text-purple-400 font-mono">{telemetry.ersDeployedThisLap.toFixed(2)} MJ</span></div>
                <div>DRS: <span className={`font-mono ${telemetry.drsOpen ? 'text-green-400 font-bold' : telemetry.drsEnabled ? 'text-blue-400' : 'text-gray-400'}`}>
                  {telemetry.drsOpen ? 'ACTIVE ✅' : telemetry.drsEnabled ? 'Available' : 'Not Allowed'}
                </span></div>
              </>
            )}
          </div>
        </Card>

        {/* Sectors */}
        <Card className="bg-black/60 border border-gray-700 p-4">
          <h3 className="text-sm font-bold text-gray-400 mb-2">SECTORS</h3>
          <div className="space-y-1 text-sm">
            <div>S1: <span className={`font-mono ${
              telemetry.sector1Status === 'fastest' ? 'text-purple-400' :
              telemetry.sector1Status === 'personal' ? 'text-green-400' :
              'text-yellow-400'
            }`}>{telemetry.sector1Time}</span></div>
            <div>S2: <span className={`font-mono ${
              telemetry.sector2Status === 'fastest' ? 'text-purple-400' :
              telemetry.sector2Status === 'personal' ? 'text-green-400' :
              'text-yellow-400'
            }`}>{telemetry.sector2Time}</span></div>
            <div>S3: <span className={`font-mono ${
              telemetry.sector3Status === 'fastest' ? 'text-purple-400' :
              telemetry.sector3Status === 'personal' ? 'text-green-400' :
              'text-yellow-400'
            }`}>{telemetry.sector3Time}</span></div>
            <div className="text-xs text-gray-500 mt-2">
              Raw S3: {(rawTelemetry as any)?.sector3_time_ms || 0}ms<br/>
              Completed: S1:{(rawTelemetry as any)?.sector1_completed ? 'Y' : 'N'} S2:{(rawTelemetry as any)?.sector2_completed ? 'Y' : 'N'} S3:{(rawTelemetry as any)?.sector3_completed ? 'Y' : 'N'}
            </div>
          </div>
        </Card>

        <Card className="bg-black/60 border border-gray-700 p-4 col-span-2">
          <h3 className="text-sm font-bold text-cyan-400 mb-2">LIVE TRACK MAP</h3>
          {trackOutline.length > 12 || playerHistory.length > 12 ? (
            <DevModeTrackMap
              trackOutline={trackOutline}
              playerHistory={playerHistory}
              playerPosition={playerPosition}
              opponents={trackOpponents}
            />
          ) : (
            <div className="h-64 flex items-center justify-center text-sm text-gray-500">
              Waiting for motion data...
            </div>
          )}
          <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-gray-300">
            <div>
              <div className="text-[11px] uppercase text-gray-500 mb-1">Ahead</div>
              {aheadOpponents.length ? (
                aheadOpponents.slice(0, 4).map((opponent) => (
                  <div key={`ahead-${opponent.id}`} className="text-rose-300">
                    {opponent.position ? `P${opponent.position}` : 'Car'}: {opponent.driver}{' '}
                    {formatGap(opponent.gapToPlayer) ||
                      (opponent.distanceToPlayer
                        ? `~${Math.round(opponent.distanceToPlayer)}m`
                        : '')}
                  </div>
                ))
              ) : (
                <div className="text-gray-600">No opponents ahead tracked</div>
              )}
            </div>
            <div>
              <div className="text-[11px] uppercase text-gray-500 mb-1">Behind</div>
              {behindOpponents.length ? (
                behindOpponents.slice(0, 4).map((opponent) => (
                  <div key={`behind-${opponent.id}`} className="text-emerald-300">
                    {opponent.position ? `P${opponent.position}` : 'Car'}: {opponent.driver}{' '}
                    {formatGap(opponent.gapToPlayer) ||
                      (opponent.distanceToPlayer
                        ? `~${Math.round(opponent.distanceToPlayer)}m`
                        : '')}
                  </div>
                ))
              ) : (
                <div className="text-gray-600">No opponents behind tracked</div>
              )}
            </div>
          </div>
        </Card>

        {isF124 && atlasAI && (
          <>
            <Card className="bg-black/60 border border-gray-700 p-4 col-span-2">
              <h3 className="text-sm font-bold text-cyan-400 mb-2">ATLAS AI | Fuel & Tyre Strategy</h3>
              <div className="flex flex-wrap gap-2 mb-3 text-xs">
                <span className={`px-2 py-0.5 rounded-full border ${fuelStatusStyle.className}`}>
                  Fuel: {fuelStatusStyle.label}
                </span>
                <span className={`px-2 py-0.5 rounded-full border ${tyreStatusStyle.className}`}>
                  Tyres: {tyreStatusStyle.label}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div className="col-span-2 text-xs uppercase tracking-wide text-gray-500">Fuel Outlook</div>
                <div>
                  Avg Burn:{' '}
                  <span className={`font-mono ${fuelModelReady ? 'text-green-400' : 'text-gray-400'}`}>
                    {displayFuelPerLap !== null ? `${displayFuelPerLap.toFixed(2)} kg/lap` : '-'}
                  </span>
                </div>
                <div>
                  Laps Remaining:{' '}
                  <span className={`font-mono ${
                    displayFuelLapsRemaining === null
                      ? 'text-gray-400'
                      : displayFuelLapsRemaining < 5
                        ? 'text-rose-300 font-semibold'
                        : 'text-green-400'
                  }`}>
                    {displayFuelLapsRemaining !== null ? `${displayFuelLapsRemaining.toFixed(1)} laps` : '-'}
                  </span>
                </div>
                <div>
                  Fuel Margin:{' '}
                  <span className={`font-mono ${fuelMarginClass}`}>
                    {displayFuelMargin !== null
                      ? `${displayFuelMargin >= 0 ? '+' : ''}${displayFuelMargin.toFixed(2)} laps`
                      : '-'}
                  </span>
                </div>
                <div>
                  Target Save:{' '}
                  <span className={`font-mono ${
                    displayFuelTargetSave !== null && displayFuelTargetSave > 0
                      ? 'text-blue-300'
                      : 'text-gray-400'
                  }`}>
                    {displayFuelTargetSave !== null && displayFuelTargetSave > 0
                      ? `${displayFuelTargetSave.toFixed(3)} lap/lap (${(displayFuelTargetSave * 100).toFixed(1)}%)`
                      : '-'}
                  </span>
                </div>
                <div className="col-span-2 text-xs uppercase tracking-wide text-gray-500 pt-1">Tyre Outlook</div>
                <div>
                  Deg Rate:{' '}
                  <span className={`font-mono ${tyreDegClass}`}>
                    {displayTyreDegradation !== null
                      ? displayTyreDegradation > 0
                        ? `+${displayTyreDegradation.toFixed(2)}%/lap`
                        : 'Stable'
                      : '-'}
                  </span>
                </div>
                <div>
                  Remaining Life:{' '}
                  <span className={`font-mono ${tyreLifeClass}`}>
                    {displayTyreLifeRemaining === null || displayTyreLifeRemaining >= 900
                      ? '-'
                      : `${displayTyreLifeRemaining.toFixed(1)} laps`}
                  </span>
                </div>
                <div>
                  Performance:{' '}
                  <span className={`font-mono ${displayTyrePerformance === null ? 'text-gray-400' : 'text-blue-300'}`}>
                    {tyrePerformanceText}
                  </span>
                </div>
                <div>
                  Stint Progress:{' '}
                  <span className={`font-mono ${tyreStintPercent === null ? 'text-gray-400' : 'text-blue-300'}`}>
                    {tyreStintPercent === null ? '-' : `${tyreStintPercent}%`}
                  </span>
              </div>
            </div>
              {displayFuelMargin !== null && displayFuelMargin >= 0.3 && (
                <div className="text-xs text-teal-200 mt-3">
                  {`~${displayFuelMargin.toFixed(1)} laps in hand - free to push or stretch the stint.`}
                </div>
              )}
              {displayFuelMargin !== null && displayFuelMargin < 0 && (
                <div className="text-xs text-rose-300 mt-3">
                  {`Short by ${Math.abs(displayFuelMargin).toFixed(1)} laps - start saving now.`}
                </div>
              )}
              {!fuelModelReady && (
                <div className="text-xs text-gray-500 mt-3">
                  Fuel model warming up - start of lap 2 onward for accurate readings.
                </div>
              )}
              {tyreCritical && (
                <div className="text-rose-300 font-semibold mt-3">
                  Tyres are in the critical window - expect rapid drop-off.
                </div>
              )}
            </Card>

            <Card className="bg-black/60 border border-gray-700 p-4 col-span-2">
              <h3 className="text-sm font-bold text-cyan-400 mb-2">Pit Window & Metrics</h3>
              <div className="flex flex-wrap gap-2 mb-3 text-xs">
                <span className={`px-2 py-0.5 rounded-full border ${pitStatusStyle.className}`}>
                  Pit: {pitStatusStyle.label}
                </span>
                <span className={`px-2 py-0.5 rounded-full border ${tyreStatusStyle.className}`}>
                  Tyres: {tyreStatusStyle.label}
                </span>
                <span className={`px-2 py-0.5 rounded-full border ${fuelStatusStyle.className}`}>
                  Fuel: {fuelStatusStyle.label}
                </span>
                {pitWindowBadge.label !== 'Monitoring' && (
                  <span className={`px-2 py-0.5 rounded-full border font-mono text-[10px] ${pitWindowBadge.className}`}>
                    {pitWindowBadge.label}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div>
                  Pit Delta:{' '}
                  <span className="font-mono text-yellow-300">
                    {pitDelta !== null ? `${pitDelta.toFixed(1)}s` : '-'}
                  </span>
                </div>
                <div>
                  Delta (wing):{' '}
                  <span className="font-mono text-orange-300">
                    {pitDeltaWing !== null ? `${pitDeltaWing.toFixed(1)}s` : '-'}
                  </span>
                </div>
                <div>
                  Net Δ Now:{' '}
                  <span className={`font-mono ${pitNetClass}`}>
                    {pitNetDelta !== null ? `${pitNetDelta >= 0 ? '+' : ''}${pitNetDelta.toFixed(1)}s` : '-'}
                  </span>
                </div>
                <div>
                  Stay Out Cost:{' '}
                  <span className={`font-mono ${stayOutClass}`}>
                    {pitStayOutLoss !== null ? `${pitStayOutLoss >= 0 ? '+' : ''}${pitStayOutLoss.toFixed(1)}s` : '-'}
                  </span>
                </div>
                <div>
                  Tyre Wear:{' '}
                  <span className={`font-mono ${tyreWearSummary.className}`}>{tyreWearSummary.label}</span>
                </div>
                <div>
                  Tyre Life:{' '}
                  <span className={`font-mono ${tyreLifeClass}`}>
                    {displayTyreLifeRemaining !== null
                      ? `${displayTyreLifeRemaining.toFixed(1)} laps`
                      : '-'}
                  </span>
                </div>
                <div>
                  Deg Rate:{' '}
                  <span className={`font-mono ${tyreDegClass}`}>
                    {displayTyreDegradation !== null
                      ? `${displayTyreDegradation.toFixed(2)}%/lap`
                      : '-'}
                  </span>
                </div>
                <div>
                  Tyre Performance:{' '}
                  <span className="font-mono text-purple-300">{tyrePerformanceText}</span>
                </div>
                <div>
                  Tyre Stint:{' '}
                  <span className="font-mono text-blue-300">
                    {tyreStintPercent === null ? '-' : `${tyreStintPercent}%`}
                  </span>
                </div>
              </div>
            </Card>

            <StrategyPanel
              telemetry={telemetry}
              multiCarData={multiCarData}
              sessionPhase={strategyPanelSessionPhase}
            />

            <Card className="bg-black/60 border border-gray-700 p-4 col-span-2">
              <h3 className="text-sm font-bold text-cyan-400 mb-2">Pit Stop Tracker</h3>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="space-y-1">
                  <div>
                    Stops:{' '}
                    <span className="font-mono text-slate-200">
                      {pitStopTracker.stopsCompleted}
                    </span>
                  </div>
                  <div>
                    Mandatory Stop:{' '}
                    <span className={`font-mono ${pitStopMandatoryClass}`}>
                      {pitStopMandatoryLabel}
                    </span>
                  </div>
                  <div>
                    Last Stop Lap:{' '}
                    <span className="font-mono text-gray-300">
                      {pitStopTracker.lastStopLap ?? '-'}
                    </span>
                  </div>
                </div>
                <div className="space-y-1">
                  <div>
                    Current:{' '}
                    <span className="font-mono text-sky-200">
                      {pitStopCurrentCompound}
                    </span>
                  </div>
                  <div>
                    Last:{' '}
                    <span className="font-mono text-gray-300">
                      {pitStopTracker.lastCompound ?? '-'}
                    </span>
                  </div>
                  <div>
                    Stint Laps:{' '}
                    <span className="font-mono text-gray-300">
                      {Number.isFinite(pitStopTracker.stintLaps)
                        ? pitStopTracker.stintLaps
                        : '-'}
                    </span>
                  </div>
                </div>
              </div>
            </Card>

            <Card className="bg-black/60 border border-gray-700 p-4 col-span-2">
              <h3 className="text-sm font-bold text-cyan-400 mb-2">ATLAS AI | ERS Strategy</h3>
              <div className="flex flex-wrap items-center gap-2 mb-3 text-xs">
                <span className={`px-2 py-0.5 rounded-full border ${ersStatusStyle.className}`}>
                  Mode: {ersAdvisor.mode.toUpperCase()}
                </span>
                <span className="font-mono text-blue-300">SOC {Math.round(ersAdvisor.soc)}%</span>
                {ersAdvisor.hangarCallout && (
                  <span className="px-2 py-0.5 rounded-full border border-amber-400/40 bg-amber-500/10 text-amber-200 uppercase tracking-wide text-[10px]">
                    {ersAdvisor.hangarCallout}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div>
                  Attack Threshold:{' '}
                  <span className={`font-mono ${ersAttackGap === null ? 'text-gray-500' : 'text-orange-300'}`}>
                    {ersAttackGap !== null ? `${ersAttackGap.toFixed(1)}s` : '-'}
                  </span>
                </div>
                <div>
                  Gap Ahead:{' '}
                  <span className="font-mono text-gray-300">
                    {primaryAhead && typeof primaryAhead.gapToPlayer === 'number'
                      ? `${Math.abs(primaryAhead.gapToPlayer).toFixed(2)}s`
                      : '-'}
                  </span>
                </div>
                <div>
                  Defend Threshold:{' '}
                  <span className={`font-mono ${ersDefendGap === null ? 'text-gray-500' : 'text-emerald-300'}`}>
                    {ersDefendGap !== null ? `${ersDefendGap.toFixed(1)}s` : '-'}
                  </span>
                </div>
                <div>
                  Gap Behind:{' '}
                  <span className="font-mono text-gray-300">
                    {primaryBehind && typeof primaryBehind.gapToPlayer === 'number'
                      ? `${Math.abs(primaryBehind.gapToPlayer).toFixed(2)}s`
                      : '-'}
                  </span>
                </div>
                <div>
                  Harvest Window:{' '}
                  <span className={`font-mono ${ersHarvestGap === null ? 'text-gray-500' : 'text-gray-300'}`}>
                    {ersHarvestGap !== null ? `${ersHarvestGap.toFixed(1)}s` : '-'}
                  </span>
                </div>
                <div>
                  Next Target:{' '}
                  <span className="font-mono text-gray-300">
                    {ersAdvisor.budget.targetNext.toFixed(0)}%
                  </span>
                </div>
              </div>

              <div className="mt-3 text-xs text-gray-200 space-y-1">
                <div className="text-[11px] uppercase text-gray-500">Guidance</div>
                <div className="font-semibold">{ersAdvisor.message}</div>
                <div className="text-gray-400 leading-snug">{ersAdvisor.detail}</div>
              </div>

              <div className="mt-3">
                <div className="text-[11px] uppercase text-gray-500 mb-1">ERS Budget</div>
                <div className="relative h-2 rounded bg-gray-700 overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 bg-sky-500/70"
                    style={{ width: `${Math.max(0, Math.min(100, ersAdvisor.soc))}%` }}
                  />
                  <div
                    className="absolute inset-y-0 w-0.5 bg-amber-300"
                    style={{ left: `${Math.max(0, Math.min(100, ersAdvisor.budget.targetNow))}%` }}
                  />
                </div>
                <div className="mt-1 font-mono text-[11px] text-gray-400">
                  Now {ersAdvisor.soc.toFixed(0)}% · Target {ersAdvisor.budget.targetNow.toFixed(0)}% (Δ{' '}
                  {ersAdvisor.budget.delta >= 0 ? '+' : ''}
                  {ersAdvisor.budget.delta.toFixed(1)}%)
                </div>
                <div className="text-xs text-gray-300">{ersAdvisor.budget.summary}</div>
              </div>

              <div className="mt-3 text-xs text-gray-300 space-y-1">
                <div className="text-[11px] uppercase text-gray-500">Callouts</div>
                {ersAdvisor.callouts.length > 0 ? (
                  ersAdvisor.callouts.map((callout, index) => (
                    <div key={`${callout}-${index}`} className="text-gray-300 leading-snug">
                      • {callout}
                    </div>
                  ))
                ) : (
                  <div className="text-gray-500">No urgent ERS items.</div>
                )}
              </div>
            </Card>
          </>
        )}

        {/* Flags & Penalties - AC/F1 Adaptive */}
        <Card className="bg-black/60 border border-gray-700 p-4">
          <h3 className="text-sm font-bold text-gray-400 mb-2">{isAC ? 'FLAGS & TRACK LIMITS' : 'FLAGS & PENALTIES'}</h3>
          <div className="space-y-1 text-sm">
            {isAC && (
              <>
                <div>Flag: <span className={`font-mono ${
                  (rawTelemetry as any)?.flag_type === 0 ? 'text-gray-400' :
                  (rawTelemetry as any)?.flag_type === 1 ? 'text-blue-400 font-bold' :
                  (rawTelemetry as any)?.flag_type === 2 ? 'text-yellow-400 font-bold' :
                  (rawTelemetry as any)?.flag_type === 3 ? 'text-black font-bold bg-white px-1' :
                  (rawTelemetry as any)?.flag_type === 4 ? 'text-white font-bold' :
                  (rawTelemetry as any)?.flag_type === 5 ? 'text-white font-bold bg-black px-1' :
                  (rawTelemetry as any)?.flag_type === 6 ? 'text-red-400 font-bold' :
                  'text-gray-400'
                }`}>{
                  (rawTelemetry as any)?.flag_type === 0 ? 'NONE' :
                  (rawTelemetry as any)?.flag_type === 1 ? 'BLUE FLAG' :
                  (rawTelemetry as any)?.flag_type === 2 ? 'YELLOW FLAG' :
                  (rawTelemetry as any)?.flag_type === 3 ? 'BLACK FLAG' :
                  (rawTelemetry as any)?.flag_type === 4 ? 'WHITE FLAG' :
                  (rawTelemetry as any)?.flag_type === 5 ? 'CHECKERED' :
                  (rawTelemetry as any)?.flag_type === 6 ? 'PENALTY' :
                  'UNKNOWN'
                }</span></div>
                <div>Penalties: <span className={`font-mono ${(rawTelemetry as any)?.penalties_enabled ? 'text-green-400' : 'text-gray-400'}`}>{(rawTelemetry as any)?.penalties_enabled ? 'ENABLED' : 'DISABLED'}</span></div>
                <div>Penalty Time: <span className="text-red-400 font-mono">{((rawTelemetry as any)?.penalty_time)?.toFixed(1) || '0'}s</span></div>
                <div>Tires Out: <span className={`font-mono ${(rawTelemetry as any)?.numberOfTyresOut >= 4 ? 'text-red-400 font-bold' : (rawTelemetry as any)?.numberOfTyresOut >= 2 ? 'text-yellow-400' : 'text-green-400'}`}>{(rawTelemetry as any)?.numberOfTyresOut || 0}/4</span></div>
                {(rawTelemetry as any)?.numberOfTyresOut >= 4 && (
                  <div className="text-red-400 font-bold">🚨 ALL TIRES OFF TRACK</div>
                )}
                <div>In Pit: <span className={`font-mono ${(rawTelemetry as any)?.is_in_pit ? 'text-blue-400' : 'text-gray-400'}`}>{(rawTelemetry as any)?.is_in_pit ? 'YES' : 'NO'}</span></div>
                <div>In Pit Lane: <span className={`font-mono ${(rawTelemetry as any)?.is_in_pitlane ? 'text-yellow-400' : 'text-gray-400'}`}>{(rawTelemetry as any)?.is_in_pitlane ? 'YES' : 'NO'}</span></div>
                <div>Mandatory Pit: <span className={`font-mono ${(rawTelemetry as any)?.mandatory_pit_done ? 'text-green-400' : 'text-red-400'}`}>{(rawTelemetry as any)?.mandatory_pit_done ? 'DONE' : 'NOT DONE'}</span></div>
                <div>Lap Invalidated: <span className={`font-mono ${(rawTelemetry as any)?.lap_invalidated ? 'text-red-400 font-bold' : 'text-green-400'}`}>{(rawTelemetry as any)?.lap_invalidated ? 'YES' : 'NO'}</span></div>
                {(rawTelemetry as any)?.lap_invalidated && (
                  <div className="text-red-400 font-bold">⚠️ LAP TIME DELETED</div>
                )}
              </>
            )}
            {isF124 && (
              <>
                <div>Flag: <span className={`font-mono ${
                  telemetry.flagType === 'Yellow' ? 'text-yellow-400 font-bold' :
                  telemetry.flagType === 'Green' ? 'text-green-400' :
                  telemetry.flagType === 'Blue' ? 'text-blue-400' :
                  telemetry.flagType === 'Red' ? 'text-red-400 font-bold' :
                  'text-gray-400'
                }`}>{telemetry.flagType}</span></div>
                <div>Track Limits: <span className="text-orange-400 font-mono">{telemetry.cornerCuttingWarnings}</span></div>
                <div>Penalties: <span className="text-red-400 font-mono">{telemetry.penalties}s</span></div>
                <div>Pen Count: <span className="text-red-300 font-mono">{(rawTelemetry as any)?.num_penalties || 0}</span></div>
                {(rawTelemetry as any)?.penalties_time > 0 && (
                  <div className="text-red-400 font-bold">🚨 DRIVE-THROUGH: {(rawTelemetry as any).penalties_time}s</div>
                )}
                {(rawTelemetry as any)?.lap_invalid && (
                  <div className="text-orange-400 font-bold">❌ LAP INVALID</div>
                )}
                <div>Safety Car: <span className={`font-mono ${
                  telemetry.safetyCarStatus === 'Full SC' ? 'text-red-400 font-bold' :
                  telemetry.safetyCarStatus === 'VSC' ? 'text-yellow-400 font-bold' :
                  'text-gray-400'
                }`}>{telemetry.safetyCarStatus}</span></div>
                <div>Pit Status: <span className={`font-mono ${
                  telemetry.pitStatus === 'In Pit' ? 'text-blue-400' :
                  telemetry.pitStatus === 'Pitting' ? 'text-yellow-400' :
                  'text-gray-400'
                }`}>{telemetry.pitStatus}</span></div>
                {telemetry.pitWindowOpen && (
                  <div className="text-green-400 font-bold">PIT WINDOW: L{telemetry.pitWindowIdealLap}-{telemetry.pitWindowLatestLap}</div>
                )}
              </>
            )}
          </div>
        </Card>

        {/* Weather & Track - AC Enhanced */}
        <Card className="bg-black/60 border border-gray-700 p-4">
          <h3 className="text-sm font-bold text-gray-400 mb-2">{isAC ? 'ENVIRONMENT & TRACK' : 'WEATHER & TRACK'}</h3>
          <div className="space-y-1 text-sm">
            <div>Track: <span className="text-blue-400 font-mono">{telemetry.trackTemp}°C</span></div>
            <div>Air: <span className="text-green-400 font-mono">{telemetry.airTemp}°C</span></div>
            {isAC && (
              <>
                <div>Wind: <span className="text-cyan-400 font-mono">{((rawTelemetry as any)?.ac_extended?.wind_speed)?.toFixed(1) || '0'}km/h @ {((rawTelemetry as any)?.ac_extended?.wind_direction)?.toFixed(0) || '0'}°</span></div>
                <div>Grip: <span className="text-orange-400 font-mono">{((rawTelemetry as any)?.ac_extended?.surface_grip * 100)?.toFixed(1) || '100.0'}%</span></div>
                <div>Air Density: <span className="text-purple-400 font-mono">{((rawTelemetry as any)?.ac_extended?.air_density)?.toFixed(4) || '1.2250'}</span></div>
                <div>Track Length: <span className="text-pink-400 font-mono">{((rawTelemetry as any)?.ac_extended?.track_spline_length / 1000)?.toFixed(2) || '0'}km</span></div>
              </>
            )}
            {!isAC && (
              <div>Weather: <span className="text-gray-400 font-mono">{telemetry.weather}</span></div>
            )}
            <div>Session: <span className="text-yellow-400 font-mono">
              {(() => {
                // For AC, we can't calculate elapsed time accurately without proper session start time
                // So for now, just show remaining time
                const formatTime = (seconds: number) => {
                  if (isNaN(seconds) || seconds < 0) return '--:--';
                  if (seconds >= 3600) {
                    return `${Math.floor(seconds / 3600)}:${Math.floor((seconds % 3600) / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
                  }
                  return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
                };

                // For AC, we don't have reliable elapsed time, so just show remaining
                const remaining = telemetry.sessionTimeLeft > 0 && telemetry.sessionTimeLeft < 999999 ?
                  formatTime(telemetry.sessionTimeLeft) :
                  '∞';

                // For F1, we could calculate elapsed from session duration minus remaining
                // But for AC, we don't have session duration, so just show remaining
                return isAC ? `Remaining: ${remaining}` : formatTime(telemetry.sessionTimeLeft);
              })()}
            </span></div>
            <div>Track Name: <span className="text-purple-400 text-xs">{telemetry.trackName || `Track ID: ${telemetry.trackId}`}</span></div>
            {isAC && (
              <>
                <div>Car: <span className="text-green-300 text-xs">{(rawTelemetry as any)?.car_name || 'Unknown'}</span></div>
                <div>Layout: <span className="text-blue-300 text-xs">{(rawTelemetry as any)?.track_configuration || 'Default'}</span></div>
              </>
            )}
          </div>
        </Card>

        {/* Car Settings - AC Enhanced */}
        <Card className="bg-black/60 border border-gray-700 p-4">
          <h3 className="text-sm font-bold text-gray-400 mb-2">{isAC ? 'CAR SETTINGS & AIDS' : 'CAR SETTINGS'}</h3>
          <div className="space-y-1 text-sm">
            <div>
              Brake Bias:{' '}
              <span className="text-blue-400 font-mono">
                {isAC
                  ? `${acBrakeBias !== null ? acBrakeBias.toFixed(1) : fallbackBrakeBiasDisplay}%`
                  : `${fallbackBrakeBiasDisplay}%`}
              </span>
            </div>
            {isAC && (
              <>
                <div>
                  TC1:{' '}
                  <span className="text-yellow-400 font-mono">
                    {formatDiscreteSetting(acTcPrimary, AC_TC_MAX)}
                  </span>
                </div>
                <div>
                  TC2:{' '}
                  <span className="text-yellow-300 font-mono">
                    {formatDiscreteSetting(acTcSecondary, AC_TC_MAX)}
                  </span>
                </div>
                <div>
                  ABS:{' '}
                  <span className="text-red-400 font-mono">
                    {formatDiscreteSetting(acAbsSetting, AC_ABS_MAX)}
                  </span>
                </div>
                <div>
                  Fuel Map:{' '}
                  <span className="text-emerald-300 font-mono">
                    {acFuelMapSetting !== null && acFuelMapMax
                      ? `${Math.round(acFuelMapSetting)}/${Math.round(acFuelMapMax)}`
                      : 'N/A (needs AtlasLink)'}
                  </span>
                </div>
                <div>
                  Engine Brake:{' '}
                  <span className="text-orange-400 font-mono">
                    {acEngineBrakeSetting !== null
                      ? `${Math.round(acEngineBrakeSetting)}/13`
                      : 'N/A'}
                  </span>
                </div>
                <div>Auto Shift: <span className={`font-mono ${(rawTelemetry as any)?.ac_extended?.auto_shifter_enabled ? 'text-green-400' : 'text-gray-400'}`}>{(rawTelemetry as any)?.ac_extended?.auto_shifter_enabled ? 'ON' : 'OFF'}</span></div>
                <div>Auto Clutch: <span className={`font-mono ${(rawTelemetry as any)?.ac_extended?.aid_auto_clutch ? 'text-green-400' : 'text-gray-400'}`}>{(rawTelemetry as any)?.ac_extended?.aid_auto_clutch ? 'ON' : 'OFF'}</span></div>
                <div>Auto Blip: <span className={`font-mono ${(rawTelemetry as any)?.ac_extended?.aid_auto_blip ? 'text-green-400' : 'text-gray-400'}`}>{(rawTelemetry as any)?.ac_extended?.aid_auto_blip ? 'ON' : 'OFF'}</span> <span className="text-xs text-gray-500">(Rev-match)</span></div>
                <div>Stability: <span className="text-purple-400 font-mono">{((rawTelemetry as any)?.ac_extended?.aid_stability !== undefined) ? ((rawTelemetry as any).ac_extended.aid_stability * 100).toFixed(0) : '0'}%</span> <span className="text-xs text-gray-500">(ESC)</span></div>
                <div>Tire Blankets: <span className={`font-mono ${(rawTelemetry as any)?.ac_extended?.aid_allow_tyre_blankets ? 'text-green-400' : 'text-gray-400'}`}>{(rawTelemetry as any)?.ac_extended?.aid_allow_tyre_blankets ? 'ALLOWED' : 'NOT ALLOWED'}</span> <span className="text-xs text-gray-500">(Session setting)</span></div>
                <div>Pit Limiter: <span className={`font-mono ${(rawTelemetry as any)?.ac_extended?.pit_limiter_enabled ? 'text-blue-400 font-bold' : 'text-gray-400'}`}>{(rawTelemetry as any)?.ac_extended?.pit_limiter_enabled ? 'ACTIVE' : 'OFF'}</span></div>
                <div>Ideal Line: <span className={`font-mono ${(rawTelemetry as any)?.ac_extended?.ideal_line_enabled ? 'text-cyan-400' : 'text-gray-400'}`}>{(rawTelemetry as any)?.ac_extended?.ideal_line_enabled ? 'ON' : 'OFF'}</span></div>
              </>
            )}
            {isF124 && (
              <>
                <div>Differential: <span className="text-yellow-400 font-mono">{telemetry.differential}%</span></div>
                {telemetry.sessionType === 'Race' && telemetry.differential === 50 && (
                  <div className="text-xs text-orange-400">⚠️ Diff locked (Parc Fermé)</div>
                )}
                <div className="text-xs text-gray-500 mt-2">
                  Raw Diff Value: {(rawTelemetry as any).differential_on_throttle || 'N/A'}
                </div>
              </>
            )}
          </div>
        </Card>

        {/* Car Damage & Setup - UPDATED */}
        {isF124 && (
          <div className="grid grid-cols-2 gap-3">
            <Card className="bg-black/60 border border-gray-700 p-4">
              <h3 className="text-sm font-bold text-gray-400 mb-2">CAR DAMAGE</h3>
              <div className="space-y-1 text-sm">
                <div>Front L Wing: <span className={`font-mono ${telemetry.frontLeftWingDamage > 0 ? 'text-orange-400' : 'text-green-400'}`}>{telemetry.frontLeftWingDamage}%</span></div>
                <div>Front R Wing: <span className={`font-mono ${telemetry.frontRightWingDamage > 0 ? 'text-orange-400' : 'text-green-400'}`}>{telemetry.frontRightWingDamage}%</span></div>
                <div>Rear Wing: <span className={`font-mono ${telemetry.rearWingDamage > 0 ? 'text-orange-400' : 'text-green-400'}`}>{telemetry.rearWingDamage}%</span></div>
                <div>Engine: <span className={`font-mono ${telemetry.engineDamage > 0 ? 'text-red-400' : 'text-green-400'}`}>{telemetry.engineDamage}%</span></div>
                <div>Gearbox: <span className={`font-mono ${telemetry.gearboxDamage > 0 ? 'text-yellow-400' : 'text-green-400'}`}>{telemetry.gearboxDamage}%</span></div>
                <div>Floor: <span className={`font-mono ${telemetry.floorDamage > 0 ? 'text-orange-400' : 'text-green-400'}`}>{telemetry.floorDamage}%</span></div>
                <div>Diffuser: <span className={`font-mono ${telemetry.diffuserDamage > 0 ? 'text-orange-400' : 'text-green-400'}`}>{telemetry.diffuserDamage}%</span></div>
              </div>
              {/* Tyre Blisters (F1 25) */}
              {(rawTelemetry as any)?.tyre_blisters && (
                <>
                  <div className="border-t border-gray-700 my-2" />
                  <h4 className="text-xs font-bold text-pink-400 mb-1">TYRE BLISTERS</h4>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    <div>FL: <span className={`font-mono ${((rawTelemetry as any).tyre_blisters[0] || 0) > 20 ? 'text-red-400' : ((rawTelemetry as any).tyre_blisters[0] || 0) > 10 ? 'text-orange-400' : 'text-green-400'}`}>{((rawTelemetry as any).tyre_blisters[0] || 0).toFixed(1)}%</span></div>
                    <div>FR: <span className={`font-mono ${((rawTelemetry as any).tyre_blisters[1] || 0) > 20 ? 'text-red-400' : ((rawTelemetry as any).tyre_blisters[1] || 0) > 10 ? 'text-orange-400' : 'text-green-400'}`}>{((rawTelemetry as any).tyre_blisters[1] || 0).toFixed(1)}%</span></div>
                    <div>RL: <span className={`font-mono ${((rawTelemetry as any).tyre_blisters[2] || 0) > 20 ? 'text-red-400' : ((rawTelemetry as any).tyre_blisters[2] || 0) > 10 ? 'text-orange-400' : 'text-green-400'}`}>{((rawTelemetry as any).tyre_blisters[2] || 0).toFixed(1)}%</span></div>
                    <div>RR: <span className={`font-mono ${((rawTelemetry as any).tyre_blisters[3] || 0) > 20 ? 'text-red-400' : ((rawTelemetry as any).tyre_blisters[3] || 0) > 10 ? 'text-orange-400' : 'text-green-400'}`}>{((rawTelemetry as any).tyre_blisters[3] || 0).toFixed(1)}%</span></div>
                  </div>
                </>
              )}
            </Card>

            <Card className="bg-black/60 border border-gray-700 p-4">
              <h3 className="text-sm font-bold text-gray-400 mb-2">CAR SETUP</h3>
              <div className="space-y-1 text-sm">
                <div>Front Wing: <span className="text-blue-400 font-mono">{(rawTelemetry as any)?.front_wing_aero || 'N/A'}</span></div>
                <div>Rear Wing: <span className="text-blue-400 font-mono">{(rawTelemetry as any)?.rear_wing_aero || 'N/A'}</span></div>
                <div>Front Susp: <span className="text-green-400 font-mono">{(rawTelemetry as any)?.front_suspension || 'N/A'}</span></div>
                <div>Rear Susp: <span className="text-green-400 font-mono">{(rawTelemetry as any)?.rear_suspension || 'N/A'}</span></div>
                <div>Front ARB: <span className="text-orange-400 font-mono">{(rawTelemetry as any)?.front_anti_roll_bar || 'N/A'}</span></div>
                <div>Rear ARB: <span className="text-orange-400 font-mono">{(rawTelemetry as any)?.rear_anti_roll_bar || 'N/A'}</span></div>
                <div>Brake Bias: <span className="text-red-400 font-mono">{(rawTelemetry as any)?.f1_brake_bias || 'N/A'}%</span></div>
                <div>Brake Press: <span className="text-red-300 font-mono">{(rawTelemetry as any)?.brake_pressure || 'N/A'}%</span></div>
                <div>F Camber: <span className="text-yellow-400 font-mono">{(rawTelemetry as any)?.front_camber ? (rawTelemetry as any).front_camber.toFixed(2) : 'N/A'}°</span></div>
                <div>R Camber: <span className="text-yellow-400 font-mono">{(rawTelemetry as any)?.rear_camber ? (rawTelemetry as any).rear_camber.toFixed(2) : 'N/A'}°</span></div>
                <div>F Toe: <span className="text-cyan-400 font-mono">{(rawTelemetry as any)?.front_toe ? (rawTelemetry as any).front_toe.toFixed(3) : 'N/A'}°</span></div>
                <div>R Toe: <span className="text-cyan-400 font-mono">{(rawTelemetry as any)?.rear_toe ? (rawTelemetry as any).rear_toe.toFixed(3) : 'N/A'}°</span></div>
                <div>Diff On: <span className="text-purple-400 font-mono">{(rawTelemetry as any)?.differential_on_throttle || 'N/A'}%</span></div>
                <div>Diff Off: <span className="text-purple-300 font-mono">{(rawTelemetry as any)?.differential_off_throttle || 'N/A'}%</span></div>
                <div>F Ride H: <span className="text-pink-400 font-mono">{(rawTelemetry as any)?.front_ride_height || 'N/A'}</span></div>
                <div>R Ride H: <span className="text-pink-400 font-mono">{(rawTelemetry as any)?.rear_ride_height || 'N/A'}</span></div>
              </div>
            </Card>
          </div>
        )}

        {/* Marshal Zones (F1 24 only) */}
        {isF124 && telemetry.marshalZones.length > 0 && (
          <Card className="bg-black/60 border border-gray-700 p-4">
            <h3 className="text-sm font-bold text-gray-400 mb-2">MARSHAL ZONES</h3>
            <div className="grid grid-cols-3 gap-1 text-xs">
              {telemetry.marshalZones.slice(0, 15).map((flag, idx) => (
                <div key={idx} className={`font-mono ${
                  flag === 3 ? 'text-yellow-400 font-bold' :
                  flag === 2 ? 'text-blue-400' :
                  flag === 1 ? 'text-green-400' :
                  flag === 4 ? 'text-red-400 font-bold' :
                  'text-gray-600'
                }`}>
                  Z{idx + 1}: {flag === 0 ? '-' : flag === 1 ? 'G' : flag === 2 ? 'B' : flag === 3 ? 'Y' : flag === 4 ? 'R' : '?'}
                </div>
              ))}
            </div>
            {telemetry.marshalZones.some((f: number) => f === 3) && (
              <div className="text-yellow-400 font-bold mt-2">⚠️ YELLOW FLAG ZONE ACTIVE</div>
            )}
          </Card>
        )}

        {/* Drivers Grid (only if multiCarData exists) */}
        {multiCarData && multiCarData.cars && multiCarData.cars.length > 0 && (
          <Card className="bg-black/60 border border-gray-700 p-4 col-span-4">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-sm font-bold text-gray-400">DRIVERS ON TRACK ({multiCarData.cars.length})</h3>
              <button
                onClick={() => setGapDisplayMode(gapDisplayMode === 'leader' ? 'interval' : 'leader')}
                className="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-white text-xs transition-colors"
              >
                {gapDisplayMode === 'leader' ? 'Gap to Leader' : 'Interval'}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {multiCarData.cars.slice(0, 20).map((car: any, idx: number) => {
                // Find the fastest lap time among all cars
                const fastestLapTime = Math.min(
                  ...multiCarData.cars
                    .filter((c: any) => c.best_lap_time && c.best_lap_time > 0)
                    .map((c: any) => c.best_lap_time)
                );

                // Determine box styling - fastest lap takes priority over current driver
                const isCurrentDriver = car.position === telemetry.position;
                const hasFastestLap = car.best_lap_time > 0 && car.best_lap_time === fastestLapTime;

                let boxClassName = 'p-2 rounded border ';
                if (hasFastestLap) {
                  boxClassName += 'border-purple-400 bg-purple-900/20 text-purple-400 font-bold';
                } else if (isCurrentDriver) {
                  boxClassName += 'border-green-400 bg-green-900/20 text-green-400 font-bold';
                } else {
                  boxClassName += 'border-gray-600';
                }

                // Calculate gap display based on mode
                let gapDisplay = '';
                if (gapDisplayMode === 'leader') {
                  gapDisplay = car.gap_to_leader ? `+${car.gap_to_leader.toFixed(1)}s` : '';
                } else {
                  gapDisplay = car.gap_to_car_ahead ? `+${car.gap_to_car_ahead.toFixed(1)}s` : '';
                }

                return (
                  <div key={idx} className={boxClassName}>
                    <div className="flex justify-between items-center">
                      <span className="font-bold">
                        P{car.position}: {(car.driver_name || `Car ${car.race_number}`).replace(/\0+$/g, '').replace(/0+$/g, '')}
                        {hasFastestLap && isCurrentDriver && ' 👑🏆'}
                        {hasFastestLap && !isCurrentDriver && ' 🏆'}
                        {!hasFastestLap && isCurrentDriver && ' 👈'}
                      </span>
                      <span className="text-gray-400">
                        {gapDisplay}
                      </span>
                    </div>
                  <div className="flex justify-between items-center mt-1">
                    <span className={`text-xs ${
                      car.tire_compound ?
                        car.tire_compound.includes('SOFT') ? 'text-red-400' :
                        car.tire_compound.includes('MEDIUM') ? 'text-yellow-400' :
                        car.tire_compound.includes('HARD') ? 'text-white' :
                        car.tire_compound.includes('INTER') ? 'text-green-400' :
                        car.tire_compound.includes('WET') ? 'text-blue-400' :
                        'text-gray-400' : 'text-gray-400'
                    }`}>
                      🏎️ {car.tire_compound || 'UNKNOWN'} ({car.tyre_age || car.tire_age || 0}L)
                    </span>
                    <div className="flex gap-1">
                      {(car.pit_status === 2 || car.pit_status === 'In Pit') && (
                        <span className="text-blue-400 font-bold">🅿️</span>
                      )}
                      {(car.pit_status === 1 || car.pit_status === 'Pitting') && (
                        <span className="text-yellow-400 font-bold">🏁</span>
                      )}
                      {car.penalties_time > 0 && (
                        <span className="text-red-400 font-bold">🚨{car.penalties_time}s</span>
                      )}
                      {car.num_penalties > 0 && (
                        <span className="text-orange-400">⚠️{car.num_penalties}</span>
                      )}
                    </div>
                  </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* AC Professional Telemetry Data */}
        {isAC && (
          <>
            {/* AC 3-Zone Tire Temperature Analysis */}
            <Card className="bg-black/60 border border-gray-700 p-4 col-span-2">
              <h3 className="text-sm font-bold text-gray-400 mb-2">AC TIRE ZONES - 3-Zone Analysis (°C)</h3>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <div className="font-bold text-yellow-400">FL (Front Left)</div>
                  <div>Inner: <span className="text-red-400 font-mono">{((rawTelemetry as any)?.ac_extended?.tyre_temp_inner?.[0])?.toFixed(1) || '0'}</span></div>
                  <div>Middle: <span className="text-orange-400 font-mono">{((rawTelemetry as any)?.ac_extended?.tyre_temp_middle?.[0])?.toFixed(1) || '0'}</span></div>
                  <div>Outer: <span className="text-yellow-400 font-mono">{((rawTelemetry as any)?.ac_extended?.tyre_temp_outer?.[0])?.toFixed(1) || '0'}</span></div>
                  <div>Core: <span className="text-gray-400 font-mono">{((rawTelemetry as any)?.ac_extended?.tyre_core_temperature?.[0])?.toFixed(1) || '0'}</span></div>
                </div>
                <div>
                  <div className="font-bold text-yellow-400">FR (Front Right)</div>
                  <div>Inner: <span className="text-red-400 font-mono">{((rawTelemetry as any)?.ac_extended?.tyre_temp_inner?.[1])?.toFixed(1) || '0'}</span></div>
                  <div>Middle: <span className="text-orange-400 font-mono">{((rawTelemetry as any)?.ac_extended?.tyre_temp_middle?.[1])?.toFixed(1) || '0'}</span></div>
                  <div>Outer: <span className="text-yellow-400 font-mono">{((rawTelemetry as any)?.ac_extended?.tyre_temp_outer?.[1])?.toFixed(1) || '0'}</span></div>
                  <div>Core: <span className="text-gray-400 font-mono">{((rawTelemetry as any)?.ac_extended?.tyre_core_temperature?.[1])?.toFixed(1) || '0'}</span></div>
                </div>
                <div>
                  <div className="font-bold text-yellow-400">RL (Rear Left)</div>
                  <div>Inner: <span className="text-red-400 font-mono">{((rawTelemetry as any)?.ac_extended?.tyre_temp_inner?.[2])?.toFixed(1) || '0'}</span></div>
                  <div>Middle: <span className="text-orange-400 font-mono">{((rawTelemetry as any)?.ac_extended?.tyre_temp_middle?.[2])?.toFixed(1) || '0'}</span></div>
                  <div>Outer: <span className="text-yellow-400 font-mono">{((rawTelemetry as any)?.ac_extended?.tyre_temp_outer?.[2])?.toFixed(1) || '0'}</span></div>
                  <div>Core: <span className="text-gray-400 font-mono">{((rawTelemetry as any)?.ac_extended?.tyre_core_temperature?.[2])?.toFixed(1) || '0'}</span></div>
                </div>
                <div>
                  <div className="font-bold text-yellow-400">RR (Rear Right)</div>
                  <div>Inner: <span className="text-red-400 font-mono">{((rawTelemetry as any)?.ac_extended?.tyre_temp_inner?.[3])?.toFixed(1) || '0'}</span></div>
                  <div>Middle: <span className="text-orange-400 font-mono">{((rawTelemetry as any)?.ac_extended?.tyre_temp_middle?.[3])?.toFixed(1) || '0'}</span></div>
                  <div>Outer: <span className="text-yellow-400 font-mono">{((rawTelemetry as any)?.ac_extended?.tyre_temp_outer?.[3])?.toFixed(1) || '0'}</span></div>
                  <div>Core: <span className="text-gray-400 font-mono">{((rawTelemetry as any)?.ac_extended?.tyre_core_temperature?.[3])?.toFixed(1) || '0'}</span></div>
                </div>
              </div>
            </Card>


          </>
        )}

        {/* LLM Race Engineer */}
        <Card className="col-span-2 bg-black/60 border border-gray-700 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-emerald-400">AI RACE ENGINEER</h3>
            <div className="flex items-center gap-2">
              {dataLogging && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30">
                  DATA LOG
                </span>
              )}
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                GPT-4o-mini
              </span>
            </div>
          </div>

          {/* API Key Input */}
          <div className="mb-3">
            <label className="text-[10px] uppercase tracking-wide text-gray-400 mb-1 block">OpenAI API Key</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={openaiApiKey}
                  onChange={(e) => setOpenaiApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="w-full bg-gray-800/60 border border-gray-700 rounded pl-10 pr-10 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500/50"
                />
                <button
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                >
                  {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <p className="text-[10px] text-gray-500 mt-1">Stored locally in browser. Never sent to our servers.</p>
          </div>

          {/* Data Logging Controls (Research Mode Only) */}
          {isResearchEnabled() && (<div className="mb-3 p-3 bg-gray-800/40 rounded border border-gray-700">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <FlaskConical className="w-3.5 h-3.5 text-violet-400" />
                <span className="text-xs text-gray-300 font-bold">Data Logging</span>
              </div>
              {dataLogging ? (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-emerald-400 animate-pulse">REC</span>
                  <span className="text-[10px] font-mono text-gray-400">
                    {loggedLapCount} laps | {loggedInteractionCount} calls
                  </span>
                  <button
                    onClick={handleStopLogging}
                    className="px-2 py-1 bg-rose-600 hover:bg-rose-500 rounded text-[10px] font-bold text-white transition-colors"
                  >
                    Stop
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleStartLogging}
                  className="px-2 py-1 bg-violet-600 hover:bg-violet-500 rounded text-[10px] font-bold text-white transition-colors"
                >
                  Start Logging
                </button>
              )}
            </div>

            {!dataLogging && !showPostRaceReview && (
              <div className="space-y-2 mt-2">
                <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[9px] text-gray-500 block mb-0.5">Season Type</label>
                  <select
                    value={seasonType}
                    onChange={(e) => setSeasonType(e.target.value as 'control' | 'llm')}
                    className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-xs text-white"
                  >
                    <option value="control">Control (CTRL shows)</option>
                    <option value="llm">LLM (decisive prompts)</option>
                  </select>
                  {/* Research mode indicator */}
                  <div className={`text-[9px] mt-0.5 ${researchMode ? 'text-green-400' : 'text-gray-500'}`}>
                    {researchMode ? '✓ Research mode ON' : 'Research mode OFF'}
                  </div>
                </div>
                <div>
                  <label className="text-[9px] text-gray-500 block mb-0.5">Season #</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={seasonNumber}
                    onChange={(e) => setSeasonNumber(parseInt(e.target.value, 10) || 1)}
                    className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-[9px] text-gray-500 block mb-0.5">Race #</label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={raceNumber}
                    onChange={(e) => setRaceNumber(parseInt(e.target.value, 10) || 1)}
                    className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-[9px] text-gray-500 block mb-0.5">Participant</label>
                  <input
                    type="text"
                    value={participantId}
                    onChange={(e) => setParticipantId(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                    placeholder="P0"
                    maxLength={6}
                    className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-[9px] text-gray-500 block mb-0.5">AI Difficulty</label>
                  <input
                    type="number"
                    value={difficulty}
                    onChange={(e) => setDifficulty(Math.max(0, Math.min(110, Number(e.target.value) || 0)))}
                    min={0}
                    max={110}
                    className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-xs text-white"
                  />
                </div>
                </div>
              </div>
            )}
          </div>)}

          {/* Engineer Chat Component */}
          <EngineerChat
            predictions={null}
            telemetry={rawTelemetry as unknown as Record<string, unknown>}
            multiCarData={multiCarData}
            triggers={engineerTriggers}
            apiKey={openaiApiKey}
            className="h-[400px]"
            researchMode={isResearchEnabled() && researchMode}
          />
        </Card>

        {/* Post-Race Review Panel (shown after Stop is clicked) */}
        {isResearchEnabled() && showPostRaceReview && (
          <div className="col-span-2">
            <ResearchReviewPanel
              onClose={() => setShowPostRaceReview(false)}
              onExport={() => {
                setRaceNumber(prev => prev + 1);
                setShowPostRaceReview(false);
              }}
            />
          </div>
        )}

        {/* Debug Info - Enhanced for AC */}
        <Card className="bg-black/60 border border-gray-700 p-4 col-span-4">
          <h3 className="text-sm font-bold text-gray-400 mb-2">DEBUG INFO - {isAC ? 'AC SHARED MEMORY DATA' : 'F1 24 PACKET DATA'}</h3>
          <div className="grid grid-cols-4 gap-4 text-xs font-mono text-gray-500">
            <div>Connected: {connectionStatus === 'connected' ? '✅' : '❌'}</div>
            <div>Status: {connectionStatus}</div>
            <div>Game: {gameConnected}</div>
            <div>Session Type ID: {rawTelemetry?.session_type}</div>
            <div>Track ID: {telemetry.trackId}</div>
            <div>World Pos: X:{telemetry.worldPositionX.toFixed(1)} Y:{telemetry.worldPositionY.toFixed(1)}</div>
            <div>Total Distance: {telemetry.totalDistance}m</div>

            {isAC && (
              <>
                <div className="text-green-400">--- AC SHARED MEMORY STATUS ---</div>
                <div>AC Version: {(rawTelemetry as any)?.ac_version || 'N/A'}</div>
                <div>SM Version: {(rawTelemetry as any)?.sm_version || 'N/A'}</div>
                <div>Player: {(rawTelemetry as any)?.player_name || 'N/A'} {(rawTelemetry as any)?.player_surname || ''}</div>
                <div>Car Model: {(rawTelemetry as any)?.car_name || 'N/A'}</div>
                <div>Track Config: {(rawTelemetry as any)?.track_configuration || 'Default'}</div>
                <div>Car Skin: {(rawTelemetry as any)?.car_skin || 'N/A'}</div>
                <div>Max Cars: {(rawTelemetry as any)?.num_cars || 'N/A'}</div>
                <div>Sectors: {(rawTelemetry as any)?.sector_count || 'N/A'}</div>
                <div>Physics PacketID: {(rawTelemetry as any)?.packet_id || 'N/A'}</div>
                <div>Graphics PacketID: {(rawTelemetry as any)?.graphics_packet_id || 'N/A'}</div>
                <div>AC Status: {(rawTelemetry as any)?.status === 2 ? 'LIVE' : (rawTelemetry as any)?.status === 1 ? 'REPLAY' : (rawTelemetry as any)?.status === 3 ? 'PAUSE' : 'OFF'}</div>
                <div>Session: {(rawTelemetry as any)?.session_type === 0 ? 'PRACTICE' : (rawTelemetry as any)?.session_type === 1 ? 'QUALIFY' : (rawTelemetry as any)?.session_type === 2 ? 'RACE' : (rawTelemetry as any)?.session_type === 3 ? 'HOTLAP' : (rawTelemetry as any)?.session_type === 4 ? 'TIME ATTACK' : (rawTelemetry as any)?.session_type === 5 ? 'DRIFT' : (rawTelemetry as any)?.session_type === 6 ? 'DRAG' : 'UNKNOWN'}</div>
                <div>Position on Spline: {((rawTelemetry as any)?.normalized_car_position * 100)?.toFixed(1) || '0'}%</div>
                <div>Distance Traveled: {((rawTelemetry as any)?.distance_traveled / 1000)?.toFixed(2) || '0'}km</div>
                <div>Replay Multiplier: {(rawTelemetry as any)?.replay_time_multiplier || '1.0'}x</div>
                <div className="text-blue-400">--- AC CAR SPECIFICATIONS ---</div>
                <div>Max Power: {(rawTelemetry as any)?.max_power || 'N/A'}hp</div>
                <div>Max Torque: {(rawTelemetry as any)?.max_torque || 'N/A'}Nm</div>
                <div>Max RPM: {(rawTelemetry as any)?.max_rpm || 'N/A'}</div>
                <div>Max Turbo: {(rawTelemetry as any)?.max_turbo_boost || 'N/A'}</div>
                <div>Engine Brake Settings: {(rawTelemetry as any)?.engine_brake_settings_count || 'N/A'}</div>
                <div>ERS Controllers: {(rawTelemetry as any)?.ers_power_controller_count || 'N/A'}</div>
                <div>Has DRS: {(rawTelemetry as any)?.has_drs ? 'YES' : 'NO'}</div>
                <div>Has ERS: {(rawTelemetry as any)?.has_ers ? 'YES' : 'NO'}</div>
                <div>Has KERS: {(rawTelemetry as any)?.has_kers ? 'YES' : 'NO'}</div>
                <div>Pit Window: L{(rawTelemetry as any)?.pit_window_start || 'N/A'}-{(rawTelemetry as any)?.pit_window_end || 'N/A'}</div>
                <div>Timed Race: {(rawTelemetry as any)?.is_timed_race ? 'YES' : 'NO'}</div>
                <div>Extra Lap: {(rawTelemetry as any)?.has_extra_lap ? 'YES' : 'NO'}</div>
              </>
            )}

            {isF124 && rawTelemetry && (
              <>
                <div className="text-orange-400">--- F1 24 Packet Data ---</div>
                <div>Packet 1 (Session): {rawTelemetry.session_type !== undefined ? '✅' : '❌'}</div>
                <div>Packet 2 (Lap): {rawTelemetry.current_lap_time !== undefined ? '✅' : '❌'}</div>
                <div>Packet 3 (Event): {(rawTelemetry as any).last_event_code ? '✅' : '❌'}</div>
                <div>Packet 5 (Setup): {(rawTelemetry as any).differential_on_throttle !== undefined ? '✅' : '❌'}</div>
                <div>Packet 6 (Telemetry): {rawTelemetry.speed_kph !== undefined ? '✅' : '❌'}</div>
                <div>Packet 7 (Status): {rawTelemetry.fuel_in_tank !== undefined ? '✅' : '❌'}</div>
                <div>Packet 10 (Damage): {(rawTelemetry as any).front_left_wing_damage !== undefined ? '✅' : '❌'}</div>
                <div>Packet 12 (Tyre Sets): {(rawTelemetry as any).tyre_sets_available !== undefined ? '✅' : '❌'}</div>
              </>
            )}

            <div>Last Update: {new Date().toLocaleTimeString()}</div>
            <div className="text-purple-400">Total Fields: {isAC ? '191' : '80+'}</div>
          </div>
        </Card>
      </div>
    </div>
  );
}



