import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Card } from './ui/card';
import { Progress } from './ui/progress';
import { Flag, Sun } from 'lucide-react';
import { InputTelemetry } from './InputTelemetry';
import { useTelemetry } from '../hooks/useTelemetry';
import { DevModeTrackMap, MapPoint, TrackOpponent } from './DevModeTrackMap';
import { TrackMapWithDrivers } from './TrackMapWithDrivers';
import { useAtlasLinkDiagnostics } from '../hooks/useAtlasLinkDiagnostics';

interface Driver {
  position: number;
  name: string;
  team: string;
  gap: string;
  lastLap: string;
  bestLap: string;
  sector1: string;
  sector2: string;
  sector3: string;
  tyreCompound: string;
  pitstops: number;
  points: number;
  status: 'Running' | 'DNF' | 'DNS' | 'Retired';
  lapsCompleted: number;
  gapInterval?: number | null;
  gapSeconds?: number | null;
  isPlayer?: boolean;
}

interface SessionData {
  trackName: string;
  currentLap: number;
  totalLaps: number;
  sessionType: string;
  timeRemaining: string;
  weather: string;
  trackTemp: number;
  airTemp: number;
  humidity: number;
  windSpeed: number;
  trackCondition: string;
  sessionTime: string;
  overallBest: string;
  leaderName: string;
  leaderGap: string;
  lastLap: string;
  bestLap: string;
}

interface RaceEvent {
  type: string;
  sector: number;
  message: string;
  timestamp: string;
}

interface TelemetryData {
  speed: number;
  rpm: number;
  gear: string;
  throttle: number;
  brake: number;
  fuelRemaining: number;
  ersDeployment: number;
  drs: 'Available' | 'Open' | 'Closed';
  tc: number;
  abs: number;
  brakeBalance: number;
}

export function GPRaceBoard() {
  const { telemetry: rawTelemetry, multiCarData, connectionStatus } = useTelemetry();
  const isConnected = connectionStatus === 'connected';
  const { snapshot: atlasLinkSnapshot } = useAtlasLinkDiagnostics({ enableMock: false });
  const [playerHistory, setPlayerHistory] = useState<MapPoint[]>([]);
  const [trackOutline, setTrackOutline] = useState<MapPoint[]>([]);
  const sessionUidRef = useRef<number | string | undefined>(undefined);
  const playerRacePosition =
    typeof rawTelemetry?.position === 'number' && Number.isFinite(rawTelemetry.position)
      ? rawTelemetry.position
      : (atlasLinkSnapshot?.player?.position ?? null);

  // Find the player's car index for track map highlighting
  const playerCarIndex = useMemo(() => {
    if (!multiCarData?.cars || multiCarData.cars.length === 0) return undefined;

    // First try to find by is_player flag
    const playerCar = multiCarData.cars.find((car: any) => car.is_player === 1);
    if (playerCar && typeof playerCar.car_index === 'number') {
      return playerCar.car_index;
    }

    // Fallback: find by matching position
    if (playerRacePosition !== null) {
      const carByPosition = multiCarData.cars.find((car: any) => car.position === playerRacePosition);
      if (carByPosition && typeof carByPosition.car_index === 'number') {
        return carByPosition.car_index;
      }
    }

    return undefined;
  }, [multiCarData, playerRacePosition]);

  const formatLapTime = (time?: number | null, fallback = '—') => {
    if (typeof time !== 'number' || !Number.isFinite(time) || time <= 0) return fallback;
    const minutes = Math.floor(time / 60);
    const seconds = time % 60;
    return `${minutes}:${seconds.toFixed(3).padStart(6, '0')}`;
  };

  const formatSectorTime = useCallback((time?: number | null, fallback = '00.000') => {
    if (typeof time !== 'number' || !Number.isFinite(time) || time <= 0) return fallback;
    if (time < 60) return time.toFixed(3);
    return formatLapTime(time, fallback);
  }, []);

  const formatDuration = (seconds?: number | null, fallback = '--:--') => {
    if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) return fallback;
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatGap = (gapSeconds?: number | null, leader = false) => {
    if (leader) return 'LEADER';
    if (gapSeconds === null || gapSeconds === undefined || !Number.isFinite(gapSeconds)) return '—';
    const abs = Math.abs(gapSeconds);
    const decimals = abs >= 10 ? 1 : 2;
    const sign = gapSeconds >= 0 ? '+' : '-';
    return `${sign}${abs.toFixed(decimals)}`;
  };

  const sanitizeName = (name?: string | null) =>
    (name || '').replace(/\0/g, '').trim() || 'Unknown';

  const appendPoint = (points: MapPoint[], point: MapPoint, minDistanceSq: number, limit?: number) => {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return points;
    if (Math.abs(point.x) >= 20000 || Math.abs(point.y) >= 20000) return points;
    if (points.length > 0) {
      const last = points[points.length - 1];
      const dx = point.x - last.x;
      const dy = point.y - last.y;
      if (dx * dx + dy * dy < minDistanceSq) {
        return points;
      }
    }
    const next = [...points, point];
    if (limit && next.length > limit) {
      return next.slice(next.length - limit);
    }
    return next;
  };
  const worldPosX = (rawTelemetry as any)?.world_position_x as number | undefined;
  const worldPosY = (rawTelemetry as any)?.world_position_y as number | undefined;
  const sessionUid = (rawTelemetry as any)?.session_uid ?? (rawTelemetry as any)?.sessionUID;

  useEffect(() => {
    if (sessionUid === undefined || sessionUid === null) return;
    if (sessionUidRef.current !== undefined && sessionUidRef.current !== sessionUid) {
      setPlayerHistory([]);
      setTrackOutline([]);
    }
    sessionUidRef.current = sessionUid;
  }, [sessionUid]);

  useEffect(() => {
    if (typeof worldPosX !== 'number' || typeof worldPosY !== 'number') return;
    const pt: MapPoint = { x: worldPosX, y: worldPosY };
    setPlayerHistory((prev) => appendPoint(prev, pt, 0.04, 2000));
    setTrackOutline((prev) => appendPoint(prev, pt, 0.09, 6000));
  }, [worldPosX, worldPosY]);

  const playerPosition = useMemo(() => {
    if (typeof worldPosX !== 'number' || typeof worldPosY !== 'number') return null;
    return { x: worldPosX, y: worldPosY };
  }, [worldPosX, worldPosY]);

  const trackOpponents: TrackOpponent[] = useMemo(() => {
    if (!multiCarData?.cars || multiCarData.cars.length === 0) return [];
    const playerCar =
      multiCarData.cars.find((c: any) => c.is_player === 1) ??
      (rawTelemetry as any)?.position
        ? multiCarData.cars.find((c: any) => c.position === (rawTelemetry as any).position)
        : multiCarData.cars[0];

    const playerGap = typeof playerCar?.gap_to_leader === 'number' ? playerCar.gap_to_leader : 0;

    return multiCarData.cars
      .filter((car: any) => car !== playerCar)
      .map((car: any, idx: number) => {
        const gx = typeof car.world_position_x === 'number' ? car.world_position_x : NaN;
        const gy = typeof car.world_position_y === 'number' ? car.world_position_y : NaN;
        const gap = typeof car.gap_to_leader === 'number' ? car.gap_to_leader - playerGap : null;
        return {
          id: `${car.car_index ?? idx}`,
          driver: (car.driver_name || '').trim() || `Car ${car.car_index ?? idx}`,
          position: car.position,
          isAhead: gap !== null ? gap < 0 : false,
          gapToPlayer: gap,
          distanceToPlayer: null,
          point: { x: gx, y: gy },
        };
      });
  }, [multiCarData, rawTelemetry]);


  const leaderboardData = useMemo(() => {
    const finiteNumber = (value: unknown): number | null =>
      typeof value === 'number' && Number.isFinite(value) ? value : null;

    const buildFromMultiCar = () => {
      if (!multiCarData?.cars || multiCarData.cars.length === 0) return null;
      const fieldCap =
        typeof multiCarData.num_active_cars === 'number' && Number.isFinite(multiCarData.num_active_cars)
          ? multiCarData.num_active_cars
          : null;

      const cars = [...multiCarData.cars]
        .filter((car: any) => typeof car.position === 'number' && car.position > 0);

      // Remove duplicates by driver/race number (keep lowest position)
      const dedupedByDriver = new Map<string, any>();
      cars.forEach((car: any) => {
        const key = `${(car.driver_name || '').replace(/\0/g, '').trim().toLowerCase()}-${car.race_number ?? car.car_index ?? 'na'}`;
        const existing = dedupedByDriver.get(key);
        if (!existing || (existing.position ?? 999) > (car.position ?? 999)) {
          dedupedByDriver.set(key, car);
        }
      });
      const dedupedList = Array.from(dedupedByDriver.values());

      // Remove duplicate positions (keep first occurrence)
      const seenPositions = new Set<number>();
      const uniqueByPosition = dedupedList.filter((car: any) => {
        const pos = car.position;
        if (!pos || seenPositions.has(pos)) return false;
        seenPositions.add(pos);
        return true;
      });

      const maxAllowed = fieldCap ?? uniqueByPosition.length;
      const capped = uniqueByPosition.filter((car: any) => car.position <= maxAllowed);

      const carsToUse = capped.length > 0 ? capped : uniqueByPosition;
      carsToUse.sort((a: any, b: any) => (a.position ?? 99) - (b.position ?? 99));

      const gapToLeaderByPosition = new Map<number, number | null>();
      carsToUse.forEach((car: any) => {
        const position = car.position ?? 0;
        if (position === 1) {
          gapToLeaderByPosition.set(1, 0);
          return;
        }

        const directGap = finiteNumber(car.gap_to_leader);
        if (directGap !== null) {
          gapToLeaderByPosition.set(position, directGap);
          return;
        }

        const prevGap = gapToLeaderByPosition.get(position - 1);
        const gapAhead = finiteNumber(car.gap_to_car_ahead);
        if (prevGap !== undefined && prevGap !== null && gapAhead !== null) {
          gapToLeaderByPosition.set(position, prevGap + gapAhead);
          return;
        }

        gapToLeaderByPosition.set(position, prevGap ?? null);
      });

      const rows: Driver[] = carsToUse.map((car: any, idx: number) => {
        const position = car.position ?? idx + 1;
        const gapToLeader = gapToLeaderByPosition.get(position) ?? finiteNumber(car.gap_to_leader);
        const gapAhead =
          finiteNumber(car.gap_to_car_ahead) ??
          (gapToLeader !== null && gapToLeaderByPosition.get(position - 1) !== undefined
            ? gapToLeader - (gapToLeaderByPosition.get(position - 1) ?? 0)
            : null);

        const bestLap = formatLapTime(car.best_lap_time);
        const lastLap = formatLapTime(car.last_lap_time);

        return {
          position,
          name: sanitizeName(car.driver_name),
          team: car.team_name || '—',
          gap: formatGap(gapToLeader ?? undefined, position === 1),
          lastLap,
          bestLap,
          sector1: formatSectorTime(car.sector1_time, '00.000'),
          sector2: formatSectorTime(car.sector2_time, '00.000'),
          sector3: formatSectorTime(car.sector3_time, '00.000'),
          tyreCompound: (car.tyre_compound || car.tire_compound || '').toString() as Driver['tyreCompound'],
          pitstops: car.pit_stops ?? car.num_pit_stops ?? 0,
          points: car.race_number ?? car.car_index ?? position,
          status: 'Running',
          lapsCompleted: car.current_lap_num ?? car.lap ?? car.laps_completed ?? 0,
          gapInterval: gapAhead ?? null,
          gapSeconds: gapToLeader ?? null,
          isPlayer: car.is_player === 1 || (playerRacePosition !== null && car.position === playerRacePosition)
        };
      });

      const player = rows.find((row) => row.isPlayer) ?? null;
      return { rows, player };
    };

    const buildFromAtlasLink = () => {
      if (!atlasLinkSnapshot) return null;
      const rawOpponents = atlasLinkSnapshot.opponents || [];
      const player = atlasLinkSnapshot.player;
      if (!player && rawOpponents.length === 0) return null;

      const opponents = rawOpponents.filter((opp) => {
        const pos = opp.position || 0;
        if (pos <= 0) return false;
        return true;
      });

      const combined = [
        ...(player
          ? [{
              position: player.position || 0,
              driverName: player.driverName,
              gapToLeaderSeconds: 0,
              intervalAheadSeconds: null,
              lap: player.lap ?? 0,
              lastLapSeconds: player.lastLapSeconds,
              bestLapSeconds: player.bestLapSeconds,
              tyreCompound: player.tyreSummary?.compound,
              tyreAgeLaps: player.tyreSummary?.ageLaps,
              inPit: false,
              isPlayer: true
            }]
          : []),
        ...opponents.map((opp) => ({
          position: opp.position || 0,
          driverName: opp.driverName,
          gapToLeaderSeconds: opp.gapToLeaderSeconds ?? null,
          intervalAheadSeconds: opp.intervalAheadSeconds ?? null,
          lap: opp.lap ?? 0,
          lastLapSeconds: opp.lastLapSeconds,
          bestLapSeconds: opp.bestLapSeconds,
          tyreCompound: opp.tyreCompound,
          tyreAgeLaps: opp.tyreAgeLaps,
          inPit: opp.inPit,
          isPlayer: false
        }))
      ].filter((entry) => entry.position && entry.position > 0);

      combined.sort((a, b) => a.position - b.position);

      const deduped: typeof combined = [];
      const seenPos = new Map<number, any>();
      const seenName = new Map<string, any>();

      combined.forEach((entry) => {
        const pos = entry.position || 0;
        const nameKey = sanitizeName(entry.driverName).toLowerCase();
        const existingPos = seenPos.get(pos);
        const existingName = seenName.get(nameKey);

        const preferEntry = (current: any, candidate: any) => {
          if (!current) return candidate;
          if (candidate.isPlayer && !current.isPlayer) return candidate;
          return current;
        };

        const chosenPos = preferEntry(existingPos, entry);
        if (chosenPos !== existingPos) {
          seenPos.set(pos, chosenPos);
        }
        const chosenName = preferEntry(existingName, entry);
        if (chosenName !== existingName) {
          seenName.set(nameKey, chosenName);
        }
      });

      // Rebuild list preferring player when conflicts
      const addedNames = new Set<string>();
      combined.forEach((entry) => {
        const pos = entry.position || 0;
        const nameKey = sanitizeName(entry.driverName).toLowerCase();
        const posOwner = seenPos.get(pos);
        const nameOwner = seenName.get(nameKey);
        if (posOwner !== entry && nameOwner !== entry) {
          return;
        }
        // ensure only one per position
        if (deduped.some((e) => e.position === pos)) return;
        // ensure only one per driver name (prevents duplicate drivers at different positions)
        if (addedNames.has(nameKey)) return;
        addedNames.add(nameKey);
        deduped.push(entry);
      });

      deduped.sort((a, b) => a.position - b.position);

      const rows: Driver[] = deduped.map((entry, idx) => ({
        position: entry.position || idx + 1,
        name: sanitizeName(entry.driverName),
        team: '—',
        gap: formatGap(entry.gapToLeaderSeconds ?? undefined, entry.position === 1),
        lastLap: formatLapTime(entry.lastLapSeconds),
        bestLap: formatLapTime(entry.bestLapSeconds),
        sector1: '00.000',
        sector2: '00.000',
        sector3: '00.000',
        tyreCompound: (entry.tyreCompound || '').toString(),
        pitstops: entry.inPit ? 1 : 0,
        points: entry.position,
        status: 'Running',
        lapsCompleted: entry.lap ?? 0,
        gapInterval: entry.intervalAheadSeconds ?? null,
        gapSeconds: entry.gapToLeaderSeconds ?? null,
        isPlayer: entry.isPlayer
      }));

      const playerRow = player ? rows.find((row) => row.isPlayer) ?? null : null;
      return { rows, player: playerRow };
    };

    const fromAtlas = buildFromAtlasLink();
    if (fromAtlas && fromAtlas.rows.length > 0) return fromAtlas;
    const fromMulti = buildFromMultiCar();
    if (fromMulti && fromMulti.rows.length > 0) return fromMulti;
    return { rows: [] as Driver[], player: null };
  }, [multiCarData, playerRacePosition, formatSectorTime, atlasLinkSnapshot]);

  const telemetryData = useMemo<TelemetryData>(() => {
    const toPercent = (value: number | undefined | null) => {
      if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
      const scaled = value <= 1 ? value * 100 : value;
      return Math.min(100, Math.max(0, scaled));
    };

    const ersStorePercent =
      (rawTelemetry as any)?.ers_store_percent ??
      ((rawTelemetry as any)?.ers_store_energy
        ? Math.min(
            100,
            Math.max(
              0,
              (((rawTelemetry as any).ers_store_energy as number) / 4000000) * 100
            )
          )
        : null);

    return {
      speed: rawTelemetry?.speed_kph ?? 0,
      rpm: rawTelemetry?.rpm ?? 0,
      gear: typeof rawTelemetry?.gear === 'number' ? (rawTelemetry.gear === 0 ? 'N' : String(rawTelemetry.gear)) : '—',
      throttle: toPercent(rawTelemetry?.throttle_percent),
      brake: toPercent(rawTelemetry?.brake_percent),
      fuelRemaining: (rawTelemetry as any)?.fuel_in_tank ?? (rawTelemetry as any)?.fuelInTank ?? 0,
      ersDeployment: ersStorePercent ?? 0,
      drs: 'Available',
      tc: (rawTelemetry as any)?.tc ?? (rawTelemetry as any)?.tractionControl ?? 0,
      abs: (rawTelemetry as any)?.abs ?? 0,
      brakeBalance: (() => {
        const raw = (rawTelemetry as any)?.brake_bias ?? (rawTelemetry as any)?.brakeBias;
        if (typeof raw !== 'number' || !Number.isFinite(raw)) return 0;
        return raw > 1 && raw <= 150 ? raw : raw * 100;
      })()
    };
  }, [rawTelemetry]);

  const sessionData = useMemo<SessionData>(() => {
    const trackName =
      (rawTelemetry as any)?.trackName ??
      (rawTelemetry as any)?.track_name ??
      atlasLinkSnapshot?.session?.trackName ??
      'Track';
    const currentLap =
      rawTelemetry?.current_lap_num ??
      (rawTelemetry as any)?.currentLapNum ??
      atlasLinkSnapshot?.player?.lap ??
      0;
    const totalLaps =
      rawTelemetry?.total_laps ??
      (rawTelemetry as any)?.totalLaps ??
      atlasLinkSnapshot?.session?.totalLaps ??
      0;
    const timeRemaining = formatDuration(
      rawTelemetry?.session_time_left ??
        (rawTelemetry as any)?.sessionTimeLeft ??
        atlasLinkSnapshot?.session?.timeLeftSeconds
    );
    const lastLap = formatLapTime(
      rawTelemetry?.last_lap_time ?? (rawTelemetry as any)?.lastLapTime ?? atlasLinkSnapshot?.player?.lastLapSeconds
    );
    const bestLap = formatLapTime(
      rawTelemetry?.best_lap_time ?? (rawTelemetry as any)?.bestLapTime ?? atlasLinkSnapshot?.player?.bestLapSeconds
    );
    const overallBest = formatLapTime(
      multiCarData?.session_best_times?.lap ?? rawTelemetry?.best_lap_time ?? atlasLinkSnapshot?.player?.bestLapSeconds
    );
    const rawSessionTime =
      (rawTelemetry as any)?.session_time ??
      (rawTelemetry as any)?.sessionTime ??
      atlasLinkSnapshot?.session?.timeLeftSeconds;
    const leaderName =
      leaderboardData.rows.find((row) => row.position === 1)?.name ?? '—';
    const playerGap =
      leaderboardData.player?.gapSeconds ??
      (leaderboardData.player?.position === 1 ? 0 : null);

    return {
      trackName,
      currentLap,
      totalLaps,
      sessionType: ((rawTelemetry as any)?.sessionType || (rawTelemetry as any)?.session_type || 'Race').toString().toUpperCase(),
      timeRemaining,
      weather: ((rawTelemetry as any)?.weather || atlasLinkSnapshot?.session?.weather || '—') as SessionData['weather'],
      trackTemp:
        (rawTelemetry as any)?.track_temperature ??
        (rawTelemetry as any)?.trackTemp ??
        (rawTelemetry as any)?.ac_extended?.track_temperature ??
        0,
      airTemp:
        (rawTelemetry as any)?.air_temperature ??
        (rawTelemetry as any)?.airTemp ??
        (rawTelemetry as any)?.ac_extended?.air_temperature ??
        0,
      humidity: (rawTelemetry as any)?.humidity ?? (rawTelemetry as any)?.ac_extended?.humidity ?? 0,
      windSpeed:
        (rawTelemetry as any)?.windSpeed ??
        (rawTelemetry as any)?.wind_speed ??
        (rawTelemetry as any)?.ac_extended?.wind_speed ??
        0,
      trackCondition: 'Dry',
      sessionTime: formatLapTime(rawSessionTime, '0.000'),
      overallBest,
      leaderName,
      leaderGap: playerGap !== null && playerGap !== undefined ? formatGap(playerGap, playerGap === 0) : '—',
      lastLap,
      bestLap
    };
  }, [rawTelemetry, multiCarData, leaderboardData, atlasLinkSnapshot]);

  const raceEvents = useMemo<RaceEvent[]>(() => {
    const events = ((rawTelemetry as any)?.race_events ?? []) as any[];
    if (!Array.isArray(events)) return [];
    return events.slice(-12).map((event: any, idx: number) => ({
      type: (event.type || event.flag || 'Green Flag') as RaceEvent['type'],
      sector: event.sector || 0,
      message: event.message || event.description || event.type || 'Race Event',
      timestamp: event.timestamp
        ? new Date(event.timestamp).toLocaleTimeString()
        : event.time || `Event ${idx + 1}`
    }));
  }, [rawTelemetry]);

  const currentFlag = useMemo(() => {
    // F1 24/25 flag detection
    const safetyCarStatus = (rawTelemetry as any)?.safety_car_status;
    const marshalZoneFlags = (rawTelemetry as any)?.marshal_zone_flags || [];
    const flagType = (rawTelemetry as any)?.flag_type ?? (rawTelemetry as any)?.flagType;

    // Check for yellow flags in marshal zones (F1 24/25: 3 = yellow, 4 = red)
    const hasYellowZone = marshalZoneFlags.some((f: number) => f === 3);
    const hasRedZone = marshalZoneFlags.some((f: number) => f === 4);

    // F1 24/25 safety car status: 0 = no SC, 1 = full SC, 2 = VSC, 3 = formation lap
    const isFullSafetyCar = safetyCarStatus === 1;
    const isVSC = safetyCarStatus === 2;
    const isFormationLap = safetyCarStatus === 3;

    const latestFlagEvent = raceEvents.find((event) =>
      (event.type || '').toLowerCase().includes('flag')
    );

    const resolveFlag = (): { type: 'Green Flag' | 'Yellow Flag' | 'Red Flag', message: string } => {
      // Red flag takes highest priority
      if (hasRedZone) {
        return { type: 'Red Flag', message: 'RED FLAG - SESSION STOPPED' };
      }

      // Full safety car
      if (isFullSafetyCar) {
        return { type: 'Yellow Flag', message: 'SAFETY CAR DEPLOYED - REDUCE SPEED' };
      }

      // Virtual safety car
      if (isVSC) {
        return { type: 'Yellow Flag', message: 'VIRTUAL SAFETY CAR - SLOW DOWN' };
      }

      // Formation lap
      if (isFormationLap) {
        return { type: 'Yellow Flag', message: 'FORMATION LAP - NO OVERTAKING' };
      }

      // Yellow flag zones
      if (hasYellowZone) {
        const yellowZones = marshalZoneFlags
          .map((f: number, idx: number) => f === 3 ? idx + 1 : null)
          .filter((z: number | null) => z !== null);
        return {
          type: 'Yellow Flag',
          message: `YELLOW FLAG - SECTOR ${yellowZones.join(', ')}`
        };
      }

      // Check event-based flags
      if (latestFlagEvent) {
        const type = (latestFlagEvent.type || '').toLowerCase();
        if (type.includes('yellow')) return { type: 'Yellow Flag', message: latestFlagEvent.message };
        if (type.includes('red')) return { type: 'Red Flag', message: latestFlagEvent.message };
      }

      // Assetto Corsa style flag_type
      if (flagType === 1 || flagType === 2 || flagType === 3 || flagType === 6) {
        return { type: 'Yellow Flag', message: 'YELLOW FLAG - CAUTION' };
      }
      if (flagType === 4) {
        return { type: 'Red Flag', message: 'RED FLAG - SESSION STOPPED' };
      }

      return { type: 'Green Flag', message: 'GREEN FLAG - ALL CLEAR' };
    };

    const result = resolveFlag();
    return { type: result.type, message: result.message, sector: latestFlagEvent?.sector };
  }, [raceEvents, rawTelemetry]);

  const racePosition =
    leaderboardData.player?.position ??
    rawTelemetry?.position ??
    atlasLinkSnapshot?.player?.position ??
    null;
  const fieldSize =
    (leaderboardData.rows && leaderboardData.rows.length > 0
      ? leaderboardData.rows.length
      : null) ??
    multiCarData?.num_active_cars ??
    multiCarData?.cars?.length ??
    (atlasLinkSnapshot ? (atlasLinkSnapshot.opponents?.length ?? 0) + (atlasLinkSnapshot.player ? 1 : 0) : null);
  const currentSectorTime = (() => {
    const sector = (rawTelemetry as any)?.current_sector;
    if (sector === 1) return formatSectorTime((rawTelemetry as any)?.sector1_time);
    if (sector === 2) return formatSectorTime((rawTelemetry as any)?.sector2_time);
    if (sector === 3) return formatSectorTime((rawTelemetry as any)?.sector3_time);
    return formatSectorTime((rawTelemetry as any)?.current_lap_time);
  })();
  const fuelSummary = (() => {
    const fuelLaps = (rawTelemetry as any)?.fuel_remaining_laps ?? (rawTelemetry as any)?.fuelRemainingLaps;
    if (typeof fuelLaps === 'number' && Number.isFinite(fuelLaps)) {
      return `${fuelLaps.toFixed(1)} laps`;
    }
    if (typeof telemetryData.fuelRemaining === 'number' && telemetryData.fuelRemaining > 0) {
      return `${telemetryData.fuelRemaining.toFixed(1)} L`;
    }
    return '—';
  })();
  const tcOutValue = (() => {
    if (typeof telemetryData.tc === 'number' && Number.isFinite(telemetryData.tc) && telemetryData.tc >= 0) {
      return telemetryData.tc;
    }
    if (typeof (rawTelemetry as any)?.tc === 'number') return (rawTelemetry as any).tc;
    if (typeof telemetryData.brakeBalance === 'number' && Number.isFinite(telemetryData.brakeBalance)) {
      return telemetryData.brakeBalance;
    }
    return null;
  })();
  const tcOutDisplay =
    tcOutValue !== null && tcOutValue !== undefined
      ? (tcOutValue >= 10 ? tcOutValue.toFixed(1) : tcOutValue.toString())
      : '—';

  const getTyreCompoundColor = (compound: string) => {
    const value = (compound || '').toLowerCase();
    if (value.includes('soft')) return 'bg-red-500';
    if (value.includes('med')) return 'bg-yellow-500';
    if (value.includes('hard')) return 'bg-gray-300 text-black';
    if (value.includes('inter')) return 'bg-green-500';
    if (value.includes('wet')) return 'bg-blue-500';
    if (value.includes('slick')) return 'bg-gray-200 text-black';
    return 'bg-gray-500';
  };

  const getSectorTimeColor = (sector: string) => {
    const numeric = parseFloat(sector.replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(numeric) || numeric === 0) return 'text-gray-500';
    if (numeric <= 30.2) return 'text-green-400';
    if (numeric <= 31.5) return 'text-yellow-400';
    return 'text-gray-300';
  };

  const getLapTimeColor = (time: string, isBest = false) => {
    const numeric = parseFloat(time.replace(/[^0-9.]/g, ''));
    const hasValue = Number.isFinite(numeric) && numeric > 0;
    if (isBest && hasValue) return 'text-green-400';
    if (!hasValue) return 'text-gray-300';
    if (numeric <= 90) return 'text-green-400';
    return 'text-gray-300';
  };

  const getFlagStyles = (flagType: string) => {
    switch (flagType) {
      case 'Green Flag':
        return { background: 'bg-green-500', text: 'text-black' };
      case 'Yellow Flag':
        return { background: 'bg-yellow-500', text: 'text-black' };
      case 'Red Flag':
        return { background: 'bg-red-500', text: 'text-white' };
      default:
        return { background: 'bg-green-500', text: 'text-black' };
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-gray-100 p-6 pt-16 overflow-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-widest text-gray-200">RACE CONTROL</h1>
        <div className="h-0.5 w-24 bg-gray-700 mt-2"></div>
      </div>

      {/* Top Row - Session Header Cards */}
      <div className="grid grid-cols-6 gap-4 mb-4">
        {/* Lap / Position */}
        <Card className="bg-[#111] border-[#222] p-4">
          <div className="text-center">
            <div className="text-4xl font-mono font-bold">L{sessionData.currentLap}</div>
            <div className="text-sm text-gray-500 uppercase tracking-wider">Race</div>
          </div>
          <div className="text-center mt-3">
            <div className="text-2xl font-mono">
              {racePosition ?? '—'}/{fieldSize ?? '—'}
            </div>
            <div className="text-xs text-gray-500 uppercase tracking-wider">Position</div>
          </div>
        </Card>

        {/* Time Left / Last Lap */}
        <Card className="bg-[#111] border-[#222] p-4">
          <div className="text-center">
            <div className="text-2xl font-mono">{sessionData.timeRemaining}</div>
            <div className="text-xs text-gray-500 uppercase tracking-wider">Time Left</div>
          </div>
          <div className="text-center mt-3">
            <div className="text-xl font-mono text-green-400">{sessionData.lastLap}</div>
            <div className="text-xs text-gray-500 uppercase">Last Lap</div>
          </div>
        </Card>

        {/* Best Lap / Overall Best */}
        <Card className="bg-[#111] border-[#222] p-4">
          <div className="text-center">
            <div className="text-2xl font-mono text-green-400">{sessionData.bestLap}</div>
            <div className="text-xs text-gray-500 uppercase tracking-wider">Best Lap</div>
          </div>
          <div className="text-center mt-3">
            <div className="text-xl font-mono text-purple-400">{sessionData.overallBest}</div>
            <div className="text-xs text-gray-500 uppercase">Overall Best</div>
          </div>
        </Card>

        {/* Track / Start */}
        <Card className="bg-[#111] border-[#222] p-4">
          <div className="text-center">
            <div className="text-2xl font-semibold">{sessionData.trackName}</div>
            <div className="text-xs text-gray-500 uppercase tracking-wider">Track</div>
          </div>
          <div className="text-center mt-3">
            <div className="text-lg">START</div>
            <div className="text-lg font-mono">{sessionData.timeRemaining}</div>
          </div>
        </Card>

        {/* Weather */}
        <Card className="bg-[#111] border-[#222] p-4">
          <div className="text-center">
            <div className="text-xl font-mono">
              {typeof sessionData.windSpeed === 'number' && Number.isFinite(sessionData.windSpeed)
                ? `${sessionData.windSpeed.toFixed(1)} m/s`
                : '— m/s'}
            </div>
            <div className="text-xs text-gray-500">
              @ {typeof sessionData.airTemp === 'number' && Number.isFinite(sessionData.airTemp) ? Math.round(sessionData.airTemp) : '--'}° IN /{' '}
              {typeof sessionData.trackTemp === 'number' && Number.isFinite(sessionData.trackTemp) ? Math.round(sessionData.trackTemp) : '--'}° OUT
            </div>
          </div>
          <div className="text-center mt-3">
            <div className="flex items-center justify-center gap-2">
              <Sun className="w-5 h-5" />
              <span className="text-lg">
                {typeof sessionData.trackTemp === 'number' && Number.isFinite(sessionData.trackTemp)
                  ? `${Math.round(sessionData.trackTemp)}°C`
                  : '—'}
              </span>
            </div>
            <div className="text-xs text-gray-500 uppercase">Track Temp</div>
          </div>
        </Card>

        {/* System Status */}
        <Card className="bg-[#111] border-[#222] p-4">
          <div className="text-center">
            <div className="text-sm text-gray-500 uppercase">UT:</div>
            <div className="text-xl text-green-400">OK</div>
          </div>
          <div className="text-center mt-3">
            <div className="text-xs text-gray-500 uppercase">System</div>
            <div className="text-xl text-green-400">OK</div>
          </div>
        </Card>
      </div>

      {/* Main Content - Leaderboard and Right Panel */}
      <div className="grid grid-cols-12 gap-4 mb-4">
        {/* Leaderboard - Takes 7 columns */}
        <Card className="col-span-7 bg-[#111] border-[#222] p-4">
          {/* Leaderboard Header */}
          <div className="grid grid-cols-[50px_1fr_80px_80px_60px_90px_90px_70px_70px_70px] gap-2 text-xs text-gray-500 uppercase tracking-wider pb-3 border-b border-[#222]">
            <div className="text-center">POS</div>
            <div>DRIVER</div>
            <div className="text-center">GAP</div>
            <div className="text-center">INT</div>
            <div className="text-center">LAPS</div>
            <div className="text-center">LAST LAP</div>
            <div className="text-center">BEST LAP</div>
            <div className="text-center">S1</div>
            <div className="text-center">S2</div>
            <div className="text-center">S3</div>
          </div>

          {/* Leaderboard Rows */}
          <div className="space-y-1 mt-2">
            {leaderboardData.rows.map((driver) => (
              <div
                key={driver.position}
                className={`grid grid-cols-[50px_1fr_80px_80px_60px_90px_90px_70px_70px_70px] gap-2 items-center py-2 px-1 rounded ${
                  driver.position <= 3 ? 'bg-[#1a1a1a]' : 'bg-transparent'
                }`}
              >
                <div className="text-center flex items-center justify-center gap-1">
                  <span className="font-mono text-lg">{driver.position}</span>
                  {driver.position <= 3 && (
                    <div className={`w-2 h-2 rounded-full ${
                      driver.position === 1 ? 'bg-yellow-500' :
                      driver.position === 2 ? 'bg-gray-400' :
                      'bg-orange-600'
                    }`}></div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">#{driver.points}</span>
                  <span className="font-medium">{driver.name}</span>
                </div>
                <div className="text-center font-mono">{driver.gap}</div>
                <div className="text-center font-mono">
                  {typeof driver.gapInterval === 'number' && Number.isFinite(driver.gapInterval)
                    ? formatGap(driver.gapInterval, false)
                    : driver.gap !== "LEADER" ? driver.gap : "+0.00"}
                </div>
                <div className="text-center flex items-center justify-center gap-1">
                  <span className="font-mono">{driver.lapsCompleted}</span>
                  <div className={`w-2.5 h-2.5 rounded-full ${getTyreCompoundColor(driver.tyreCompound)}`}></div>
                </div>
                <div className="text-center">
                  <span className={`font-mono ${getLapTimeColor(driver.lastLap)}`}>
                    {driver.lastLap}
                  </span>
                </div>
                <div className="text-center">
                  <span className={`font-mono ${getLapTimeColor(driver.bestLap, true)}`}>
                    {driver.bestLap}
                  </span>
                </div>
                <div className="text-center">
                  <span className={`font-mono text-sm ${getSectorTimeColor(driver.sector1)}`}>
                    {driver.sector1}
                  </span>
                </div>
                <div className="text-center">
                  <span className={`font-mono text-sm ${getSectorTimeColor(driver.sector2)}`}>
                    {driver.sector2}
                  </span>
                </div>
                <div className="text-center">
                  <span className={`font-mono text-sm ${getSectorTimeColor(driver.sector3)}`}>
                    {driver.sector3}
                  </span>
                </div>
              </div>
            ))}
            {leaderboardData.rows.length === 0 && (
              <div className="text-center text-gray-500 text-xs py-6 border border-dashed border-[#222] rounded">
                {isConnected ? 'Waiting for opponent data…' : 'Awaiting telemetry connection…'}
              </div>
            )}
          </div>
        </Card>

        {/* Right Panel - Track Map & Telemetry */}
        <Card className="col-span-5 bg-[#111] border-[#222] p-4">
          {/* Track Map Section - SVG-based with all drivers */}
          <div className="mb-4">
            <TrackMapWithDrivers
              trackId={(rawTelemetry as any)?.track_id ?? 0}
              multiCarData={multiCarData}
              playerIndex={playerCarIndex}
              className="h-64 border border-[#222]"
            />
          </div>

          {/* Telemetry Row */}
          <div className="grid grid-cols-3 gap-4 mb-4">
            {/* Throttle */}
            <div className="text-center">
              <div className="text-xs text-gray-500 uppercase mb-2">Throttle</div>
              <div className="text-2xl font-mono">{Math.round(telemetryData.throttle)}%</div>
              <Progress value={telemetryData.throttle} className="h-2 mt-2 bg-gray-800 [&>div]:bg-green-500" />
            </div>

            {/* Gear / RPM */}
            <div className="text-center">
              <div className="text-xs text-gray-500 uppercase mb-2">Gear / RPM</div>
              <div className="text-5xl font-mono font-bold">{telemetryData.gear}</div>
              <div className="text-lg font-mono text-gray-400">{Math.round(telemetryData.rpm)}</div>
              <div className="text-sm text-gray-500">{Math.round(telemetryData.speed)} KM/H</div>
            </div>

            {/* Systems */}
            <div>
              <div className="text-xs text-gray-500 uppercase mb-2 text-center">Systems</div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="text-center p-1 bg-[#0a0a0a] rounded">
                  <span className="text-blue-400">TC {telemetryData.tc}</span>
                </div>
                <div className="text-center p-1 bg-[#0a0a0a] rounded">
                  <span className="text-yellow-400">ABS {telemetryData.abs}</span>
                </div>
                <div className="text-center p-1 bg-[#0a0a0a] rounded">
                  <span className="text-red-400">BB {telemetryData.brakeBalance}</span>
                </div>
                <div className="text-center p-1 bg-[#0a0a0a] rounded">
                  <span className="text-green-400">ERS {Math.round(telemetryData.ersDeployment)}%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Timing Cards */}
          <div className="grid grid-cols-4 gap-2">
            <div className="text-center p-3 bg-green-900/30 rounded border border-green-900/50">
              <div className="text-lg font-mono text-green-400">{sessionData.bestLap}</div>
              <div className="text-xs text-gray-500 uppercase">Best</div>
            </div>
            <div className="text-center p-3 bg-yellow-900/30 rounded border border-yellow-900/50">
              <div className="text-lg font-mono text-yellow-400">{currentSectorTime}</div>
              <div className="text-xs text-gray-500 uppercase">Current Sector</div>
            </div>
            <div className="text-center p-3 bg-red-900/30 rounded border border-red-900/50">
              <div className="text-lg font-mono text-red-400">{tcOutDisplay}</div>
              <div className="text-xs text-gray-500 uppercase">TC Out</div>
            </div>
            <div className="text-center p-3 bg-blue-900/30 rounded border border-blue-900/50">
              <div className="text-lg font-mono text-blue-400">{fuelSummary}</div>
              <div className="text-xs text-gray-500 uppercase">Fuel</div>
            </div>
          </div>
        </Card>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-12 gap-4">
        {/* Race Director */}
        <Card className="col-span-3 bg-[#111] border-[#222] p-4">
          <div className="text-sm text-gray-500 uppercase tracking-wider mb-3">Race Director</div>
          <div className="text-4xl font-mono font-bold">{sessionData.leaderGap}</div>
          <div className="text-xl font-mono text-green-400 mt-2">{sessionData.leaderName}</div>
          <div className="text-lg text-gray-400">B. Auberlen</div>
          <div className="mt-4">
            <div className="text-2xl font-mono">4:04.840</div>
            <div className="text-xl font-mono text-green-400">4:04.210</div>
          </div>
        </Card>

        {/* Input Telemetry */}
        <Card className="col-span-4 bg-[#111] border-[#222] p-4">
          <InputTelemetry />
        </Card>

        {/* Race Events & Flags */}
        <Card className="col-span-5 bg-[#111] border-[#222] p-4">
          <div className="text-sm text-gray-500 uppercase tracking-wider mb-3">Race Events & Flags</div>
          <div className="space-y-2">
            {raceEvents.map((event, index) => (
              <div key={index} className="flex items-center justify-between p-2 rounded bg-[#0a0a0a]">
                <div className="flex items-center gap-3">
                  <Flag className={`w-4 h-4 ${
                    event.type === 'Yellow Flag' ? 'text-yellow-500' :
                    event.type === 'Green Flag' ? 'text-green-500' :
                    'text-gray-400'
                  }`} />
                  <span className="text-sm font-mono">{event.message}</span>
                </div>
                <span className="text-xs text-gray-500 font-mono">{event.timestamp}</span>
              </div>
            ))}
            {raceEvents.length === 0 && (
              <div className="text-center text-xs text-gray-500 py-3 border border-dashed border-[#222] rounded">
                {isConnected ? 'No race events yet' : 'Waiting for telemetry connection'}
              </div>
            )}
          </div>

          {/* Live Flag Banner */}
          <div className={`mt-4 ${getFlagStyles(currentFlag.type).background} p-3 rounded overflow-hidden`}>
            <div className="relative overflow-hidden">
              <div
                className={`text-sm font-mono font-bold tracking-wider ${getFlagStyles(currentFlag.type).text} whitespace-nowrap inline-block`}
                style={{
                  animation: 'scrollLeft 15s linear infinite',
                }}
              >
                {currentFlag.message} - {currentFlag.message} - {currentFlag.message} - {currentFlag.message} - {currentFlag.message} - {currentFlag.message} -
              </div>
            </div>
            <div className={`text-xs mt-1 ${getFlagStyles(currentFlag.type).text} opacity-80 text-center`}>
              {currentFlag.type === 'Green Flag' && 'RACING CONDITIONS NORMAL'}
              {currentFlag.type === 'Yellow Flag' && 'CAUTION - SLOW DOWN'}
              {currentFlag.type === 'Red Flag' && 'SESSION STOPPED'}
            </div>
            <style>{`
              @keyframes scrollLeft {
                0% { transform: translateX(0); }
                100% { transform: translateX(-50%); }
              }
            `}</style>
          </div>
        </Card>
      </div>
    </div>
  );
}
