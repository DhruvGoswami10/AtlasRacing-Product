
import { useEffect, useMemo, useRef, useState } from 'react';

import type {
  AtlasLinkConnectionStatus,
  AtlasLinkDiagnostics,
  AtlasLinkSnapshot,
  AtlasLinkSeverity,
} from '../types/atlasLink';
import { generateMockAtlasLinkSnapshot } from '../utils/atlasLinkMock';

const LIVE_TELEMETRY_URL =
  process.env.REACT_APP_ATLAS_LINK_TELEMETRY ??
  'http://127.0.0.1:28556/atlas-link/telemetry';

interface Options {
  enableMock?: boolean;
  mockIntervalMs?: number;
}

const DEFAULT_OPTIONS: Required<Options> = {
  enableMock: true,
  mockIntervalMs: 200,
};

const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (!Number.isNaN(parsed) && Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
};

const toString = (value: unknown, fallback = ''): string => {
  if (typeof value === 'string') {
    return value;
  }
  return fallback;
};

const toSeverity = (value: unknown): AtlasLinkSeverity => {
  const normalised = toString(value ?? '').toLowerCase();
  if (normalised === 'notice' || normalised === 'warning' || normalised === 'critical') {
    return normalised as AtlasLinkSeverity;
  }
  return 'info';
};

const normaliseTyreSummary = (raw: any) => {
  if (!raw || typeof raw !== 'object') {
    return {
      compound: 'Unknown',
      wearPercent: 0,
      ageLaps: 0,
      tempsC: [],
      pressuresPsi: [],
    };
  }

  const temps = Array.isArray(raw.temps_c ?? raw.tempsC)
    ? (raw.temps_c ?? raw.tempsC).map((value: unknown) => toNumber(value) ?? 0)
    : [];
  const pressures = Array.isArray(raw.pressures_psi ?? raw.pressuresPsi)
    ? (raw.pressures_psi ?? raw.pressuresPsi).map((value: unknown) => toNumber(value) ?? 0)
    : [];

  return {
    compound: toString(raw.compound ?? raw.tyre_compound ?? 'Unknown'),
    wearPercent: toNumber(raw.wear_percent ?? raw.wearPercent) ?? 0,
    ageLaps: toNumber(raw.age_laps ?? raw.ageLaps) ?? 0,
    tempsC: temps,
    pressuresPsi: pressures,
  };
};

const normaliseSnapshot = (raw: any): AtlasLinkSnapshot => {
  const payload = raw?.payload ?? raw ?? {};

  const session = payload.session ?? {};
  const player = payload.player ?? {};
  const opponents = Array.isArray(payload.opponents) ? payload.opponents : [];
  const events = Array.isArray(payload.events) ? payload.events : [];
  const meta = payload.meta ?? {};

  return {
    session: {
      game: toString(session.game ?? session.game_name ?? 'Assetto Corsa'),
      trackName: toString(session.trackName ?? session.track_name ?? ''),
      layout: toString(session.layout ?? session.track_layout ?? ''),
      sessionType: toString(session.sessionType ?? session.session_type ?? 'Unknown'),
      weather: toString(session.weather ?? 'Unknown'),
      totalLaps: toNumber(session.totalLaps ?? session.total_laps),
      completedLaps: toNumber(session.completedLaps ?? session.completed_laps),
      timeLeftSeconds: toNumber(session.timeLeftSeconds ?? session.time_left_seconds),
      lapLengthMeters: toNumber(session.lapLengthMeters ?? session.lap_length_meters),
    },
    player: {
      driverName: toString(player.driverName ?? player.driver_name ?? 'Driver'),
      carModel: toString(player.carModel ?? player.car_model ?? 'Unknown'),
      carClass: toString(player.carClass ?? player.car_class ?? 'Unknown'),
      position: toNumber(player.position) ?? 0,
      lap: toNumber(player.lap) ?? 0,
      totalLaps: toNumber(player.totalLaps ?? player.total_laps),
      bestLapSeconds: toNumber(player.bestLapSeconds ?? player.best_lap_seconds),
      lastLapSeconds: toNumber(player.lastLapSeconds ?? player.last_lap_seconds),
      deltaToLeader: toNumber(player.deltaToLeader ?? player.delta_to_leader),
      speedKph: toNumber(player.speedKph ?? player.speed_kph) ?? 0,
      throttlePercent: toNumber(player.throttlePercent ?? player.throttle_percent) ?? 0,
      brakePercent: toNumber(player.brakePercent ?? player.brake_percent) ?? 0,
      gear: toString(player.gear ?? 'N'),
      rpm: toNumber(player.rpm) ?? 0,
      fuelLiters: toNumber(player.fuelLiters ?? player.fuel_liters) ?? 0,
      fuelLapsRemaining: toNumber(player.fuelLapsRemaining ?? player.fuel_laps_remaining),
      brakeBiasPercent: toNumber(player.brakeBiasPercent ?? player.brake_bias_percent),
      tractionControlSetting: toNumber(
        player.tractionControlSetting ?? player.traction_control_setting,
      ),
      absSetting: toNumber(player.absSetting ?? player.abs_setting),
      drsAvailable: Boolean(player.drsAvailable ?? player.drs_available),
      drsActive: Boolean(player.drsActive ?? player.drs_active),
      kersPercent: toNumber(player.kersPercent ?? player.kers_percent),
      tyreSummary: normaliseTyreSummary(player.tyreSummary ?? player.tyre_summary),
    },
    opponents: opponents.map((opponent: any) => ({
      driverName: toString(opponent.driverName ?? opponent.driver_name ?? 'Driver'),
      carModel: toString(opponent.carModel ?? opponent.car_model ?? 'Unknown'),
      carClass: toString(opponent.carClass ?? opponent.car_class ?? 'Unknown'),
      position: toNumber(opponent.position) ?? 0,
      gapToLeaderSeconds: toNumber(
        opponent.gapToLeaderSeconds ?? opponent.gap_to_leader_seconds,
      ),
      gapToPlayerSeconds: toNumber(
        opponent.gapToPlayerSeconds ?? opponent.gap_to_player_seconds,
      ),
      intervalAheadSeconds: toNumber(
        opponent.intervalAheadSeconds ?? opponent.interval_ahead_seconds,
      ),
      lap: toNumber(opponent.lap),
      tyreCompound: toString(opponent.tyreCompound ?? opponent.tyre_compound ?? 'Unknown'),
      tyreAgeLaps: toNumber(opponent.tyreAgeLaps ?? opponent.tyre_age_laps),
      inPit: Boolean(opponent.inPit ?? opponent.in_pit),
      lastLapSeconds: toNumber(opponent.lastLapSeconds ?? opponent.last_lap_seconds),
      bestLapSeconds: toNumber(opponent.bestLapSeconds ?? opponent.best_lap_seconds),
      speedKph: toNumber(opponent.speedKph ?? opponent.speed_kph),
      isClassLeader: Boolean(opponent.isClassLeader ?? opponent.is_class_leader),
    })),
    events: events.map((event: any) => ({
      type: toString(event.type ?? event.event_type ?? 'event'),
      description: toString(event.description ?? ''),
      timestampMs: toNumber(event.timestampMs ?? event.timestamp_ms) ?? Date.now(),
      severity: toSeverity(event.severity),
    })),
    meta: {
      appVersion: toString(meta.appVersion ?? meta.app_version ?? 'unknown'),
      bridgeVersion: toString(meta.bridgeVersion ?? meta.bridge_version ?? 'unknown'),
      source: toString(meta.source ?? 'python-app'),
      tick: toNumber(meta.tick) ?? 0,
      generatedAtMs: toNumber(meta.generatedAtMs ?? meta.generated_at_ms) ?? Date.now(),
    },
  };
};

export const useAtlasLinkDiagnostics = (
  options?: Options,
): AtlasLinkDiagnostics => {
  const { enableMock, mockIntervalMs } = { ...DEFAULT_OPTIONS, ...options };

  // --- Live bridge state ----------------------------------------------------
  const [liveStatus, setLiveStatus] = useState<AtlasLinkConnectionStatus>('idle');
  const [liveSnapshot, setLiveSnapshot] = useState<AtlasLinkSnapshot | null>(null);
  const [liveLastPacketAt, setLiveLastPacketAt] = useState<number | null>(null);
  const [livePacketsPerSecond, setLivePacketsPerSecond] = useState(0);
  const livePacketsRef = useRef(0);
  const liveRateRef = useRef<{ timestamp: number; count: number }>({
    timestamp: Date.now(),
    count: 0,
  });
  const liveRetryRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof EventSource === 'undefined') {
      setLiveStatus('error');
      return undefined;
    }

    let source: EventSource | null = null;
    let rateTimer: number | null = null;
    let cancelled = false;

    const connect = () => {
      if (cancelled) {
        return;
      }

      try {
        source = new EventSource(LIVE_TELEMETRY_URL);
      } catch (error) {
        setLiveStatus('error');
        scheduleReconnect();
        return;
      }

      setLiveStatus('connecting');

      if (rateTimer === null) {
        rateTimer = window.setInterval(() => {
          const now = Date.now();
          const elapsed = now - liveRateRef.current.timestamp;
          if (elapsed <= 0) {
            return;
          }
          const deltaCount = livePacketsRef.current - liveRateRef.current.count;
          const perSecond = (deltaCount / elapsed) * 1000;
          liveRateRef.current = { timestamp: now, count: livePacketsRef.current };
          setLivePacketsPerSecond(perSecond);
        }, 1000);
      }

      let hasOpened = false;

      source.onopen = () => {
        hasOpened = true;
      };

      source.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          const snapshot = normaliseSnapshot(parsed);
          console.debug('[AtlasLink] Live snapshot received', snapshot);
          livePacketsRef.current += 1;
          setLiveSnapshot(snapshot);
          setLiveLastPacketAt(Date.now());
          setLiveStatus('connected');
        } catch (error) {
          console.warn('[AtlasLink] Failed to parse telemetry event', error);
        }
      };

      source.onerror = () => {
        if (hasOpened) {
          setLiveStatus('disconnected');
        } else {
          setLiveStatus('error');
        }
        if (source) {
          source.close();
          source = null;
        }
        scheduleReconnect();
      };
    };

    const scheduleReconnect = () => {
      if (cancelled) {
        return;
      }
      if (liveRetryRef.current !== null) {
        return;
      }
      liveRetryRef.current = window.setTimeout(() => {
        liveRetryRef.current = null;
        connect();
      }, 2500);
    };

    connect();

    return () => {
      cancelled = true;
      if (source) {
        source.close();
      }
      if (rateTimer !== null) {
        window.clearInterval(rateTimer);
      }
      if (liveRetryRef.current !== null) {
        window.clearTimeout(liveRetryRef.current);
        liveRetryRef.current = null;
      }
    };
  }, []);

  // --- Mock generator -------------------------------------------------------
  const [mockStatus, setMockStatus] = useState<AtlasLinkConnectionStatus>('idle');
  const [mockSnapshot, setMockSnapshot] = useState<AtlasLinkSnapshot | null>(null);
  const [mockLastPacketAt, setMockLastPacketAt] = useState<number | null>(null);
  const [mockPacketsPerSecond, setMockPacketsPerSecond] = useState(0);
  const mockPacketsRef = useRef(0);
  const mockRateRef = useRef<{ timestamp: number; count: number }>({
    timestamp: Date.now(),
    count: 0,
  });

  useEffect(() => {
    if (!enableMock) {
      setMockStatus('disconnected');
      return undefined;
    }

    setMockStatus('connecting');

    const publishMock = () => {
      const nextSnapshot = generateMockAtlasLinkSnapshot();
      mockPacketsRef.current += 1;
      setMockSnapshot(nextSnapshot);
      setMockLastPacketAt(Date.now());
      setMockStatus('connected');
    };

    const mockTimer = window.setInterval(publishMock, mockIntervalMs);
    const rateTimer = window.setInterval(() => {
      const now = Date.now();
      const elapsed = now - mockRateRef.current.timestamp;
      if (elapsed <= 0) {
        return;
      }
      const deltaCount = mockPacketsRef.current - mockRateRef.current.count;
      const perSecond = (deltaCount / elapsed) * 1000;
      mockRateRef.current = { timestamp: now, count: mockPacketsRef.current };
      setMockPacketsPerSecond(perSecond);
    }, 1000);

    publishMock();

    return () => {
      window.clearInterval(mockTimer);
      window.clearInterval(rateTimer);
      setMockStatus('disconnected');
    };
  }, [enableMock, mockIntervalMs]);

  // --- Select live vs mock --------------------------------------------------
  const diagnostics = useMemo<AtlasLinkDiagnostics>(() => {
    const now = Date.now();
    const liveFresh =
      liveSnapshot && liveLastPacketAt !== null && now - liveLastPacketAt < 4000;

    if (liveFresh && liveSnapshot) {
      return {
        status: liveStatus,
        snapshot: liveSnapshot,
        lastPacketAt: liveLastPacketAt,
        packetsPerSecond: livePacketsPerSecond,
        totalPackets: livePacketsRef.current,
        source: 'live',
      };
    }

    if (enableMock && mockSnapshot) {
      return {
        status: mockStatus,
        snapshot: mockSnapshot,
        lastPacketAt: mockLastPacketAt,
        packetsPerSecond: mockPacketsPerSecond,
        totalPackets: mockPacketsRef.current,
        source: 'mock',
      };
    }

    return {
      status: liveStatus,
      snapshot: liveSnapshot,
      lastPacketAt: liveLastPacketAt,
      packetsPerSecond: livePacketsPerSecond,
      totalPackets: livePacketsRef.current,
      source: 'live',
    };
  }, [
    enableMock,
    liveLastPacketAt,
    livePacketsPerSecond,
    liveSnapshot,
    liveStatus,
    mockLastPacketAt,
    mockPacketsPerSecond,
    mockSnapshot,
    mockStatus,
  ]);

  return diagnostics;
};

