export type AtlasLinkSeverity = 'info' | 'notice' | 'warning' | 'critical';

export interface AtlasLinkSession {
  game: string;
  trackName: string;
  layout: string;
  sessionType: string;
  weather: string;
  totalLaps: number | null;
  completedLaps: number | null;
  timeLeftSeconds: number | null;
  lapLengthMeters: number | null;
}

export interface AtlasLinkTyreSummary {
  compound: string;
  wearPercent: number;
  ageLaps: number;
  tempsC: number[];
  pressuresPsi: number[];
}

export interface AtlasLinkPlayer {
  driverName: string;
  carModel: string;
  carClass: string;
  position: number;
  lap: number;
  totalLaps: number | null;
  bestLapSeconds: number | null;
  lastLapSeconds: number | null;
  deltaToLeader: number | null;
  speedKph: number;
  throttlePercent: number;
  brakePercent: number;
  gear: string;
  rpm: number;
  fuelLiters: number;
  fuelLapsRemaining: number | null;
  brakeBiasPercent: number | null;
  tractionControlSetting: number | null;
  absSetting: number | null;
  drsAvailable: boolean;
  drsActive: boolean;
  kersPercent: number | null;
  tyreSummary: AtlasLinkTyreSummary;
}

export interface AtlasLinkOpponent {
  driverName: string;
  carModel: string;
  carClass: string;
  position: number;
  gapToLeaderSeconds: number | null;
  gapToPlayerSeconds: number | null;
  intervalAheadSeconds: number | null;
  lap: number | null;
  tyreCompound: string;
  tyreAgeLaps: number | null;
  inPit: boolean;
  lastLapSeconds: number | null;
  bestLapSeconds: number | null;
  speedKph: number | null;
  isClassLeader: boolean;
  isPlayer?: boolean;
}

export interface AtlasLinkEvent {
  type: string;
  description: string;
  timestampMs: number;
  severity: AtlasLinkSeverity;
}

export interface AtlasLinkMeta {
  appVersion: string;
  bridgeVersion: string;
  source: string;
  tick: number;
  generatedAtMs: number;
}

export interface AtlasLinkSnapshot {
  session: AtlasLinkSession;
  player: AtlasLinkPlayer;
  opponents: AtlasLinkOpponent[];
  events: AtlasLinkEvent[];
  meta: AtlasLinkMeta;
}

export type AtlasLinkConnectionStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';

export interface AtlasLinkDiagnostics {
  status: AtlasLinkConnectionStatus;
  snapshot: AtlasLinkSnapshot | null;
  lastPacketAt: number | null;
  packetsPerSecond: number;
  totalPackets: number;
  source: 'mock' | 'live';
}
