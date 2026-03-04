import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTelemetry } from '../hooks/useTelemetry';
import { Card } from './ui/card';
import { convertTelemetry, StandardizedTelemetry, getTireCompound, getVisualCompound } from '../utils/telemetryConverter';
import { TYRE_COMPOUNDS } from '../types/telemetry';
import type { MultiCarTelemetryData, RaceEvent, TelemetryData } from '../types/telemetry';
import { Key, Eye, EyeOff, FlaskConical } from 'lucide-react';
import { DevModeTrackMap, TrackOpponent, MapPoint as TrackMapPoint } from './DevModeTrackMap';
import { useErsAdvisor } from '../hooks/useErsAdvisor';
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
import { DevModeHeaderBar, DevModeF1Strategy, DevModeCarInfoPanels, DevModeDriversGrid, DevModeDebugPanel } from './devmode';

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
  const rawLastLapSeconds = isAC ? asNumber((rawTelemetry as any)?.last_lap_time) : null;
  const rawCurrentLapSeconds = isAC ? asNumber((rawTelemetry as any)?.current_lap_time) : null;
  const rawBestLapSeconds = isAC ? asNumber((rawTelemetry as any)?.best_lap_time) : null;
  const lapSecondsForRate =
    (rawLastLapSeconds !== null && rawLastLapSeconds > 1 ? rawLastLapSeconds : null) ??
    (rawCurrentLapSeconds !== null && rawCurrentLapSeconds > 1 ? rawCurrentLapSeconds : null) ??
    (rawBestLapSeconds !== null && rawBestLapSeconds > 1 ? rawBestLapSeconds : null);
  const acAidFuelRate = isAC
    ? asNumber(acExtended?.aid_fuel_rate ?? (rawTelemetry as any)?.aid_fuel_rate)
    : null;
  const acFuelRatePerHour = isAC
    ? acFuelReady && acFuelPerLap !== null && lapSecondsForRate !== null
      ? (acFuelPerLap / lapSecondsForRate) * 3600.0
      : null
    : acAidFuelRate !== null && acAidFuelRate > 0
      ? acAidFuelRate * 3600.0
      : null;

  const rawVisualCompound = (rawTelemetry as any)?.tyre_compound_visual;
  const rawActualCompound = (rawTelemetry as any)?.tyre_compound_actual;
  const tyreCompoundDisplay = resolveCompoundLabel(rawVisualCompound, rawActualCompound);
  const tyreCompoundVisualOnly = resolveCompoundLabel(rawVisualCompound, undefined);
  const tyreCompoundActualOnly = resolveCompoundLabel(undefined, rawActualCompound);

  // Compute strategyPanelSessionPhase locally for DevModeF1Strategy
  const strategyPanelSessionPhase = useMemo<'formation' | 'race' | 'finished' | 'unknown'>(() => {
    const sessionTypeLower = (telemetry.sessionType || '').toLowerCase();
    const isRaceSession = sessionTypeLower === 'race';
    if (!isRaceSession) return 'unknown';

    // Check finish signals
    const rawSessionFinished =
      ((rawTelemetry as any)?.race_finished === 1) ||
      ((rawTelemetry as any)?.session_finished === 1) ||
      (((rawTelemetry as any)?.session_state || '').toString().toLowerCase() === 'finished');

    const findEvent = (types: string[]): RaceEvent | null =>
      raceEvents.find((event) => types.includes(event.type)) ?? null;
    const finishEvent = findEvent(['RCWN', 'SEND', 'CHQF']);
    const formationEvent = findEvent(['SCFORM']);

    const toTimestamp = (event: RaceEvent | null): number | null => {
      if (!event) return null;
      const rawTs = event.timestamp;
      if (typeof rawTs === 'number' && Number.isFinite(rawTs)) return rawTs;
      if (typeof rawTs === 'string') {
        const parsed = Number(rawTs);
        return Number.isFinite(parsed) ? parsed : null;
      }
      return null;
    };

    const now = Date.now();
    const finishTimestamp = toTimestamp(finishEvent);
    const finishAge = finishTimestamp !== null ? now - finishTimestamp : null;
    const lapsRemaining = telemetry.totalLaps > 0 ? telemetry.totalLaps - telemetry.currentLapNum : null;

    const finishCandidate =
      rawSessionFinished ||
      (finishAge !== null && finishAge < 600000) ||
      (lapsRemaining !== null && lapsRemaining <= 0 && telemetry.sessionTimeLeft <= 0);

    if (finishCandidate) return 'finished';

    // Check formation signals
    const formationTimestamp = toTimestamp(formationEvent);
    const formationAge = formationTimestamp !== null ? now - formationTimestamp : null;
    const safetyCarStatus = telemetry.safetyCarStatus;
    const rawSafetyCarStatus = (rawTelemetry as any)?.safety_car_status;

    const formationCandidate =
      safetyCarStatus === 'Formation Lap' ||
      rawSafetyCarStatus === 3 ||
      (formationAge !== null && formationAge < 180000);

    if (formationCandidate) return 'formation';

    return 'race';
  }, [raceEvents, rawTelemetry, telemetry]);

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
      {/* Header Bar + Session Phase Debug */}
      <DevModeHeaderBar telemetry={telemetry} rawTelemetry={rawTelemetry} raceEvents={raceEvents} gameConnected={gameConnected} isAC={isAC} />

      {/* Main Grid */}
      <div className="grid grid-cols-4 gap-3">

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

        {/* F1 Atlas AI Strategy */}
        {isF124 && atlasAI && (
          <DevModeF1Strategy
            telemetry={telemetry}
            rawTelemetry={rawTelemetry as any}
            multiCarData={multiCarData}
            atlasAI={atlasAI}
            sessionPhase={strategyPanelSessionPhase}
            pitStopTracker={pitStopTracker}
            ersAdvisor={ersAdvisor}
            aheadOpponent={primaryAhead}
            behindOpponent={primaryBehind}
          />
        )}

        {/* Flags, Weather, Car Settings, Damage, Marshals */}
        <DevModeCarInfoPanels telemetry={telemetry} rawTelemetry={rawTelemetry as any} isF124={isF124} isAC={isAC} acExtended={acExtended} />

        {/* Drivers Grid */}
        <DevModeDriversGrid multiCarData={multiCarData} telemetry={telemetry} />

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

        {/* Debug Info */}
        <DevModeDebugPanel telemetry={telemetry} rawTelemetry={rawTelemetry as any} connectionStatus={connectionStatus} gameConnected={gameConnected} isF124={isF124} isAC={isAC} />
      </div>
    </div>
  );
}
