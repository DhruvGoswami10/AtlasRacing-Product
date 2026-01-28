import type { MultiCarTelemetryData, PitPlan, TelemetryData } from '../types/telemetry';
import { TYRE_COMPOUNDS } from '../types/telemetry';
import type { AnalysisResult } from './live_analysis_engine';
import { extractDriverNames, getDriverDisplayName, resolveDriverName } from './driver_aliases';

type Nullable<T> = T | null | undefined;

export interface OpponentSummary {
  name: string;
  position: number;
  gapSeconds: number | null;
  tyreCompound?: string;
  tyreAgeLaps?: number;
  lastLapTime?: number;
}

export interface PitPlanSummary {
  label: string;
  nextStopLap: number | null;
  windowOpen: number | null;
  windowClose: number | null;
  stintLength: number | null;
  tyreCompound?: string;
  riskRating?: number;
  deltaVsBest?: number;
  confidence?: number;
  selected: boolean;
}

export interface DriverFocusEntry {
  fullName: string;
  displayName: string;
  position: number;
  teamName?: string;
  gapToLeader?: number | null;
  gapToPlayer?: number | null;
  gapToAhead?: number | null;
  tyreCompound?: string;
  tyreAge?: number | null;
  fuelLapsRemaining?: number | null;
  fuelMarginLaps?: number | null;
  ersPercent?: number | null;
  pitStatus?: number | null;
  pitStrategyStatus?: number | null;
  tyreStrategyStatus?: number | null;
  isPlayer?: boolean;
}

export interface CarDamageSummary {
  frontLeftWing?: number;
  frontRightWing?: number;
  rearWing?: number;
  engine?: number;
  gearbox?: number;
  floor?: number;
  diffuser?: number;
}

export interface RaceSnapshot {
  lap: number;
  totalLaps: number;
  position: number;
  driverName: string;
  weather?: string | number;
  tyreCompound?: string;
  tyreAge?: number;
  tyreWear?: number[];
  tyreTemps?: {
    surface?: number[];
    inner?: number[];
  };
  tyreLifeRemaining?: number;
  tyreDegPerLap?: number;
  tyreStrategyStatus?: number;
  tyrePerformanceIndex?: number;
  tyreCriticalWarning?: boolean;
  fuelInTank?: number;
  fuelLapsRemaining?: number;
  fuelMarginLaps?: number;
  fuelTargetSavePerLap?: number;
  fuelAvgPerLap?: number;
  ersPercent?: number;
  ersMode?: string;
  ersStrategyMode?: number;
  ersBudgetTrend?: string;
  ersAttackGap?: number | null;
  ersDefendGap?: number | null;
  ersHarvestGap?: number | null;
  gapAhead?: number | null;
  gapBehind?: number | null;
  opponentAhead?: OpponentSummary | null;
  opponentBehind?: OpponentSummary | null;
  paceDeltaSeconds?: number | null;
  pitStatus?: number;
  pitDelta?: number | null;
  pitAdvantageAvailable?: boolean;
  pitRecommendation?: number | null;
  pitStrategyStatus?: number | null;
  pitPlans: PitPlanSummary[];
  safetyCarStatus?: number;
  penalties?: number;
  penaltyCount?: number;
  cornerWarnings?: number;
  penaltyTime?: number | null;
  warnings?: number;
  airTemperature?: number | null;
  trackTemperature?: number | null;
  weatherSummary?: string;
  rainLevel?: number | null;
  surfaceGrip?: number | null;
  windSpeed?: number | null;
  windDirection?: number | null;
  lastLapTime?: number;
  bestLapTime?: number;
  currentLapTime?: number;
  sectorTimes?: {
    s1?: number | null;
    s2?: number | null;
    s3?: number | null;
  };
  fieldSummary: string[];
  driverFocus: Record<string, DriverFocusEntry>;
  marshalZones?: number[];
  carDamage?: CarDamageSummary;
  analysisInsights: {
    priority: string;
    message: string;
    suggestedAction?: string;
  }[];
  analysisPerformance?: {
    paceDeltaSeconds?: number | null;
    tyrePerformanceScore?: number | null;
    fuelEfficiencyScore?: number | null;
    consistencyScore?: number | null;
    improvementPotentialSeconds?: number | null;
  };
  analysisRecommendation?: {
    nextLapPredictionSeconds?: number | null;
    degradationTrend?: string | null;
    recommendedStrategy?: string | null;
  };
  analysisTimestamp?: number;
}

export interface RaceContextInput {
  telemetry: Nullable<TelemetryData>;
  multiCarData?: Nullable<MultiCarTelemetryData>;
  analysis?: Nullable<AnalysisResult>;
}

const ERS_MODE_LABELS: Record<number, string> = {
  0: 'Balanced',
  1: 'Harvest',
  2: 'Attack',
  3: 'Defend',
};

const PLAN_LABELS = ['Plan A', 'Plan B', 'Plan C'];

function toTyreLabel(compound?: number | string | null): string | undefined {
  if (compound === null || compound === undefined) {
    return undefined;
  }

  if (typeof compound === 'string' && compound.trim().length > 0) {
    return compound;
  }

  if (typeof compound === 'number') {
    return TYRE_COMPOUNDS[compound] || `Compound ${compound}`;
  }

  return undefined;
}

function safeNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return null;
}

function sanitizeTelemetryNumber(value: unknown, maxAbs = 900): number | undefined {
  const numeric = safeNumber(value);
  if (numeric === null) {
    return undefined;
  }

  if (!Number.isFinite(numeric)) {
    return undefined;
  }

  if (Math.abs(numeric) >= maxAbs) {
    return undefined;
  }

  return numeric;
}

function parseLapTime(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const parts = trimmed.split(':');
    if (parts.length === 2) {
      const minutes = Number(parts[0]);
      const seconds = Number(parts[1]);
      if (Number.isFinite(minutes) && Number.isFinite(seconds)) {
        return minutes * 60 + seconds;
      }
    } else {
      const seconds = Number(trimmed);
      if (Number.isFinite(seconds)) {
        return seconds;
      }
    }
  }

  return null;
}

function summarisePlan(
  plan: PitPlan | undefined,
  fallbackLabel: string,
  selectedIndex: number,
  planIndex: number,
): PitPlanSummary | null {
  if (!plan) {
    return null;
  }

  const label = plan.label?.trim() || fallbackLabel;
  const stops = plan.stops ?? [];
  const nextStopIndex = Math.min(plan.stops_completed ?? 0, Math.max(stops.length - 1, 0));
  const nextStop = stops[nextStopIndex] ?? stops[0];
  const compound = toTyreLabel(nextStop?.compound);

  return {
    label,
    nextStopLap: safeNumber(nextStop?.target_lap),
    windowOpen: safeNumber(nextStop?.window_open),
    windowClose: safeNumber(nextStop?.window_close),
    stintLength: safeNumber(nextStop?.stint_length),
    tyreCompound: compound,
    riskRating: safeNumber(plan.risk_rating) ?? undefined,
    deltaVsBest: safeNumber(plan.delta_vs_best) ?? undefined,
    confidence: safeNumber(plan.confidence) ?? undefined,
    selected: selectedIndex === planIndex,
  };
}

function calculateRelativeGap(
  playerCar: Nullable<MultiCarTelemetryData['cars'][number]>,
  opponentCar: Nullable<MultiCarTelemetryData['cars'][number]>,
  direction: 'ahead' | 'behind',
): number | null {
  if (!playerCar || !opponentCar) {
    return null;
  }

  const playerGapAhead = safeNumber(playerCar.gap_to_car_ahead);
  const opponentGapAhead = safeNumber(opponentCar.gap_to_car_ahead);
  const playerGapToLeader = safeNumber(playerCar.gap_to_leader);
  const opponentGapToLeader = safeNumber(opponentCar.gap_to_leader);

  if (direction === 'ahead') {
    if (playerGapAhead !== null) {
      return playerGapAhead;
    }
  } else {
    if (opponentGapAhead !== null) {
      return opponentGapAhead;
    }
  }

  if (playerGapToLeader !== null && opponentGapToLeader !== null) {
    const diff = Math.abs(opponentGapToLeader - playerGapToLeader);
    return Number.isFinite(diff) ? diff : null;
  }

  return null;
}

function findOpponentFromMultiCar(
  multiCar: Nullable<MultiCarTelemetryData>,
  playerPosition: number,
  direction: 'ahead' | 'behind',
): OpponentSummary | null {
  if (!multiCar?.cars?.length) {
    return null;
  }

  const cars = [...multiCar.cars].sort((a, b) => a.position - b.position);
  const playerIndex = cars.findIndex(car => car.position === playerPosition && car.is_player === 1);
  const playerCar = cars[playerIndex];

  if (playerIndex === -1) {
    return null;
  }

  const targetIndex = direction === 'ahead' ? playerIndex - 1 : playerIndex + 1;
  const opponent = cars[targetIndex];
  if (!opponent) {
    return null;
  }

  return {
    name: opponent.driver_name ? opponent.driver_name.toUpperCase() : 'UNKNOWN',
    position: opponent.position,
    gapSeconds: calculateRelativeGap(playerCar, opponent, direction),
    tyreCompound: opponent.tyre_compound,
    tyreAgeLaps: safeNumber(opponent.tyre_age) ?? undefined,
    lastLapTime: safeNumber(opponent.last_lap_time) ?? undefined,
  };
}

function mergeOpponentSources(
  telemetry: TelemetryData,
  multiCarData: Nullable<MultiCarTelemetryData>,
): { ahead: OpponentSummary | null; behind: OpponentSummary | null } {
  const atlas = (telemetry as any)?.atlas_ai;

  let ahead: OpponentSummary | null = null;
  let behind: OpponentSummary | null = null;

  if (atlas?.num_opponents_ahead) {
    const opp = atlas.opponent_ahead_1;
    if (opp) {
      ahead = {
        name: opp.driver_name ? opp.driver_name.toUpperCase() : 'UNKNOWN',
        position: opp.position,
        gapSeconds: safeNumber(opp.gap_seconds),
        tyreCompound: toTyreLabel(opp.tyre_compound),
        tyreAgeLaps: safeNumber(opp.tyre_age) ?? undefined,
        lastLapTime: safeNumber(opp.last_lap_time) ?? undefined,
      };
    }
  }

  if (atlas?.num_opponents_behind) {
    const opp = atlas.opponent_behind_1;
    if (opp) {
      behind = {
        name: opp.driver_name ? opp.driver_name.toUpperCase() : 'UNKNOWN',
        position: opp.position,
        gapSeconds: safeNumber(opp.gap_seconds),
        tyreCompound: toTyreLabel(opp.tyre_compound),
        tyreAgeLaps: safeNumber(opp.tyre_age) ?? undefined,
        lastLapTime: safeNumber(opp.last_lap_time) ?? undefined,
      };
    }
  }

  if (!ahead) {
    ahead = findOpponentFromMultiCar(multiCarData, telemetry.position ?? 0, 'ahead');
  }
  if (!behind) {
    behind = findOpponentFromMultiCar(multiCarData, telemetry.position ?? 0, 'behind');
  }

  return { ahead, behind };
}

function formatOpponent(opponent: OpponentSummary | null): string {
  if (!opponent) {
    return 'N/A';
  }

  const parts = [
    `${opponent.name} (P${opponent.position})`,
    opponent.gapSeconds !== null && opponent.gapSeconds !== undefined
      ? `${opponent.gapSeconds.toFixed(1)}s`
      : null,
    opponent.tyreCompound
      ? `${opponent.tyreCompound}${opponent.tyreAgeLaps ? ` ${opponent.tyreAgeLaps}L` : ''}`
      : null,
  ].filter(Boolean);

  return parts.join(' | ');
}

function formatPitPlans(plans: PitPlanSummary[]): string {
  if (!plans.length) {
    return 'Plans unavailable';
  }

  return plans
    .map(plan => {
      const tyre = plan.tyreCompound ? ` ${plan.tyreCompound}` : '';
      const lap =
        plan.nextStopLap !== null && plan.nextStopLap !== undefined
          ? ` Lap ${plan.nextStopLap}`
          : '';
      const window =
        plan.windowOpen !== null &&
        plan.windowOpen !== undefined &&
        plan.windowClose !== null &&
        plan.windowClose !== undefined
          ? ` (${plan.windowOpen}-${plan.windowClose})`
          : '';
      const stint =
        plan.stintLength !== null && plan.stintLength !== undefined
          ? ` Stint ${plan.stintLength}L`
          : '';

      return `${plan.selected ? '>' : '-'} ${plan.label}:${tyre}${lap}${window}${stint}`;
    })
    .join(' | ');
}

function formatLapTimeValue(time?: number | null): string {
  if (typeof time === 'number' && Number.isFinite(time) && time >= 0) {
    const minutes = Math.floor(time / 60);
    const seconds = time - minutes * 60;
    const secondsString = seconds.toFixed(3).padStart(6, '0');
    return `${minutes}:${secondsString}`;
  }
  return 'N/A';
}

function formatTyreWear(wear?: number[] | null): string {
  if (!Array.isArray(wear) || wear.length === 0) {
    return 'N/A';
  }

  const parts = wear.map(value => {
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric)) {
      return 'N/A';
    }
    const percentage = numeric <= 1 ? numeric * 100 : numeric;
    return `${Math.round(percentage)}%`;
  });

  return parts.join('/');
}

function formatTyreTemps(temps?: { surface?: number[]; inner?: number[] } | null): string {
  if (!temps) {
    return 'N/A';
  }

  const surface =
    Array.isArray(temps.surface) && temps.surface.length
      ? `Surf ${temps.surface.map(temp => `${Math.round(temp)}deg`).join('/')}`
      : null;
  const inner =
    Array.isArray(temps.inner) && temps.inner.length
      ? `Inner ${temps.inner.map(temp => `${Math.round(temp)}deg`).join('/')}`
      : null;

  const segments = [surface, inner].filter(Boolean);
  return segments.length ? segments.join(' | ') : 'N/A';
}

function formatNumberWithUnit(
  value: number | null | undefined,
  unit: string,
  precision = 1,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return 'N/A';
  }
  return `${Number(value).toFixed(precision)}${unit}`;
}

function formatSignedGap(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return 'N/A';
  }
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}s`;
}

function formatErsGap(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return 'N/A';
  }
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}s`;
}

function formatPenaltyDetail(snapshot: RaceSnapshot): string {
  const time = snapshot.penalties !== undefined && snapshot.penalties !== null
    ? `${snapshot.penalties.toFixed(1)}s`
    : '0s';
  const count = snapshot.penaltyCount !== undefined && snapshot.penaltyCount !== null
    ? `${snapshot.penaltyCount}`
    : '0';
  const warnings = snapshot.cornerWarnings !== undefined && snapshot.cornerWarnings !== null
    ? `${snapshot.cornerWarnings}`
    : '0';

  return `time ${time} | count ${count} | warnings ${warnings}`;
}

function formatWeatherDetail(snapshot: RaceSnapshot): string {
  const summary = snapshot.weatherSummary ?? (typeof snapshot.weather === 'string' ? snapshot.weather : 'Unknown');
  const air = formatNumberWithUnit(snapshot.airTemperature, 'degC');
  const track = formatNumberWithUnit(snapshot.trackTemperature, 'degC');
  const rain =
    snapshot.rainLevel !== null && snapshot.rainLevel !== undefined && Number.isFinite(snapshot.rainLevel)
      ? `${snapshot.rainLevel.toFixed(2)}`
      : '0';
  const wind = snapshot.windSpeed !== null && snapshot.windSpeed !== undefined
    ? `${snapshot.windSpeed.toFixed(1)}m/s${
        snapshot.windDirection !== undefined && snapshot.windDirection !== null
          ? `@${snapshot.windDirection.toFixed(0)}deg`
          : ''
      }`
    : 'N/A';

  return `${summary} | Air ${air} | Track ${track} | Rain ${rain} | Wind ${wind}`;
}

function formatDamageDetail(damage?: CarDamageSummary): string {
  if (!damage) {
    return 'No damage';
  }

  const entries: string[] = [];
  if (damage.frontLeftWing !== undefined) {
    entries.push(`FL ${damage.frontLeftWing}%`);
  }
  if (damage.frontRightWing !== undefined) {
    entries.push(`FR ${damage.frontRightWing}%`);
  }
  if (damage.rearWing !== undefined) {
    entries.push(`RW ${damage.rearWing}%`);
  }
  if (damage.engine !== undefined) {
    entries.push(`ENG ${damage.engine}%`);
  }
  if (damage.gearbox !== undefined) {
    entries.push(`GBX ${damage.gearbox}%`);
  }
  if (damage.floor !== undefined) {
    entries.push(`FLR ${damage.floor}%`);
  }
  if (damage.diffuser !== undefined) {
    entries.push(`DIF ${damage.diffuser}%`);
  }

  return entries.length ? entries.join(' | ') : 'No damage';
}

function formatMarshalDetail(flags?: number[]): string {
  if (!Array.isArray(flags) || flags.length === 0) {
    return 'No marshal data';
  }

  const active = flags.filter(flag => flag !== 0);
  if (!active.length) {
    return 'All clear';
  }

  return `${active.length} zones flagged`;
}

function summariseAnalysis(analysis: Nullable<AnalysisResult>) {
  if (!analysis) {
    return {
      insights: [] as RaceSnapshot['analysisInsights'],
      performance: undefined as RaceSnapshot['analysisPerformance'] | undefined,
      recommendation: undefined as RaceSnapshot['analysisRecommendation'] | undefined,
      timestamp: undefined as number | undefined,
    };
  }

  const insights = (analysis.insights ?? [])
    .filter(insight => insight?.message)
    .slice(0, 3)
    .map(insight => ({
      priority: insight.priority ?? 'medium',
      message: insight.message.trim(),
      suggestedAction: insight.suggestedAction?.trim() || undefined,
    }))
    .filter(entry => entry.message.length > 0);

  const performance = analysis.performance
    ? {
        paceDeltaSeconds: sanitizeTelemetryNumber(analysis.performance.currentPaceVsOptimal, 600),
        tyrePerformanceScore: sanitizeTelemetryNumber(analysis.performance.tirePerformanceIndex, 200),
        fuelEfficiencyScore: sanitizeTelemetryNumber(analysis.performance.fuelEfficiencyRating, 200),
        consistencyScore: sanitizeTelemetryNumber(analysis.performance.racePaceConsistency, 200),
        improvementPotentialSeconds: sanitizeTelemetryNumber(analysis.performance.improvementPotential, 600),
      }
    : undefined;

  const recommendation = analysis.lapTrendPrediction
    ? {
        nextLapPredictionSeconds: sanitizeTelemetryNumber(
          analysis.lapTrendPrediction.nextLapPrediction,
          2000
        ),
        degradationTrend: analysis.lapTrendPrediction.degradationTrend ?? null,
        recommendedStrategy: analysis.lapTrendPrediction.recommendedStrategy ?? null,
      }
    : undefined;

  return {
    insights,
    performance,
    recommendation,
    timestamp: analysis.timestamp ?? undefined,
  };
}

function formatAnalysisInsights(insights: RaceSnapshot['analysisInsights']): string | null {
  if (!Array.isArray(insights) || insights.length === 0) {
    return null;
  }

  const summary = insights
    .map(insight => {
      if (!insight?.message) {
        return null;
      }
      const priority = insight.priority ? `[${insight.priority.toUpperCase()}]` : '';
      const action = insight.suggestedAction ? ` Action: ${insight.suggestedAction}` : '';
      return `${priority} ${insight.message}${action}`.trim();
    })
    .filter((entry): entry is string => Boolean(entry));

  if (!summary.length) {
    return null;
  }

  return `ANALYSIS: ${summary.join(' || ')}`;
}

function formatAnalysisPerformance(perf?: RaceSnapshot['analysisPerformance']): string | null {
  if (!perf) {
    return null;
  }

  const segments: string[] = [];

  if (perf.paceDeltaSeconds !== undefined && perf.paceDeltaSeconds !== null) {
    segments.push(`pace ${formatSignedGap(perf.paceDeltaSeconds)}`);
  }

  const tyreScore =
    perf.tyrePerformanceScore !== undefined && perf.tyrePerformanceScore !== null
      ? formatNumberWithUnit(perf.tyrePerformanceScore, '%', 0)
      : null;
  if (tyreScore && tyreScore !== 'N/A') {
    segments.push(`tyre ${tyreScore}`);
  }

  const fuelScore =
    perf.fuelEfficiencyScore !== undefined && perf.fuelEfficiencyScore !== null
      ? formatNumberWithUnit(perf.fuelEfficiencyScore, '%', 0)
      : null;
  if (fuelScore && fuelScore !== 'N/A') {
    segments.push(`fuel eff ${fuelScore}`);
  }

  const consistencyScore =
    perf.consistencyScore !== undefined && perf.consistencyScore !== null
      ? formatNumberWithUnit(perf.consistencyScore, '%', 0)
      : null;
  if (consistencyScore && consistencyScore !== 'N/A') {
    segments.push(`consistency ${consistencyScore}`);
  }

  const improvement =
    perf.improvementPotentialSeconds !== undefined && perf.improvementPotentialSeconds !== null
      ? formatNumberWithUnit(perf.improvementPotentialSeconds, 's', 2)
      : null;
  if (improvement && improvement !== 'N/A') {
    segments.push(`gain ${improvement}`);
  }

  if (!segments.length) {
    return null;
  }

  return `PERF: ${segments.join(' | ')}`;
}

function formatAnalysisPrediction(rec?: RaceSnapshot['analysisRecommendation']): string | null {
  if (!rec) {
    return null;
  }

  const segments: string[] = [];

  if (rec.nextLapPredictionSeconds !== undefined && rec.nextLapPredictionSeconds !== null) {
    segments.push(`next lap ${formatLapTimeValue(rec.nextLapPredictionSeconds)}`);
  }

  if (rec.degradationTrend) {
    segments.push(`trend ${rec.degradationTrend}`);
  }

  if (rec.recommendedStrategy) {
    segments.push(`strategy ${rec.recommendedStrategy}`);
  }

  if (!segments.length) {
    return null;
  }

  return `PREDICTION: ${segments.join(' | ')}`;
}

function formatDriverFocusEntry(entry: DriverFocusEntry): string {
  const gap = entry.isPlayer ? 'SELF' : formatSignedGap(entry.gapToPlayer);
  const tyres = entry.tyreCompound
    ? `${entry.tyreCompound}${entry.tyreAge !== null && entry.tyreAge !== undefined ? ` ${entry.tyreAge}L` : ''}`
    : 'Tyres N/A';
  const fuel =
    entry.fuelMarginLaps !== null && entry.fuelMarginLaps !== undefined
      ? `${entry.fuelMarginLaps.toFixed(1)}L`
      : 'N/A';
  const ers =
    entry.ersPercent !== null && entry.ersPercent !== undefined
      ? `${entry.ersPercent.toFixed(0)}%`
      : 'N/A';

  return `${entry.displayName.toUpperCase()} P${entry.position} (gap ${gap} | ${tyres} | fuel ${fuel} | ERS ${ers})`;
}

function buildFieldSummary(
  telemetry: TelemetryData,
  multiCarData: Nullable<MultiCarTelemetryData>,
): string[] {
  if (!multiCarData?.cars?.length) {
    return [];
  }

  const sorted = [...multiCarData.cars].sort((a, b) => a.position - b.position);
  return sorted.map(car => {
    const isPlayer = car.position === telemetry.position;
    const gap =
      isPlayer ? 'SELF' : car.gap_to_car_ahead !== undefined && car.gap_to_car_ahead !== null
        ? `+${car.gap_to_car_ahead.toFixed(1)}s`
        : car.gap_to_leader !== undefined && car.gap_to_leader !== null
        ? `+${car.gap_to_leader.toFixed(1)}s`
        : 'N/A';
    const tyre =
      car.tyre_compound && car.tyre_age !== undefined
        ? `${car.tyre_compound} ${car.tyre_age}L`
        : car.tyre_compound || 'Tyres N/A';
    const driverLabel = car.driver_name ? car.driver_name.toUpperCase() : 'UNKNOWN';
    return `${car.position}. ${driverLabel} | ${gap} | ${tyre}`;
  });
}

function buildDriverFocus(
  telemetry: TelemetryData,
  multiCarData: Nullable<MultiCarTelemetryData>,
): Record<string, DriverFocusEntry> {
  const focus: Record<string, DriverFocusEntry> = {};

  if (!multiCarData?.cars?.length) {
    return focus;
  }

  const playerPosition = telemetry.position ?? null;
  const playerCar =
    multiCarData.cars.find(car => car.is_player === 1) ||
    (playerPosition !== null
      ? multiCarData.cars.find(car => car.position === playerPosition)
      : undefined);
  const playerGap = safeNumber(playerCar?.gap_to_leader) ?? 0;

  multiCarData.cars.forEach(car => {
    const rawName = (car.driver_name || '').trim();
    const resolved = resolveDriverName(rawName);
    const key =
      resolved ??
      (rawName.toUpperCase() || `CAR_${car.car_index}`);
    const displayName = resolved
      ? getDriverDisplayName(resolved)
      : getDriverDisplayName(rawName || key);

    const gapToLeader = safeNumber(car.gap_to_leader);
    const relativeGap =
      gapToLeader !== null && playerGap !== null
        ? Number((gapToLeader - playerGap).toFixed(2))
        : null;

    focus[key] = {
      fullName: resolved ?? key,
      displayName,
      position: car.position,
      teamName: car.team_name,
      gapToLeader,
      gapToPlayer: relativeGap,
      gapToAhead: safeNumber(car.gap_to_car_ahead),
      tyreCompound: car.tyre_compound,
      tyreAge: safeNumber(car.tyre_age),
      fuelLapsRemaining: safeNumber(car.fuel_remaining_laps),
      fuelMarginLaps: safeNumber((car as any).fuel_margin_laps),
      ersPercent: safeNumber(car.ers_store_percent),
      pitStatus: car.pit_status ?? null,
      pitStrategyStatus: safeNumber(car.pit_strategy_status),
      tyreStrategyStatus: safeNumber(car.tyre_strategy_status),
      isPlayer:
        car.is_player === 1 || (playerPosition !== null && car.position === playerPosition),
    };
  });

  return focus;
}

function toDamageValue(value: unknown): number | undefined {
  const numeric = safeNumber(value);
  return numeric !== null ? numeric : undefined;
}

function buildCarDamageSummary(tele: any): CarDamageSummary | undefined {
  const damage: CarDamageSummary = {
    frontLeftWing: toDamageValue(
      tele.frontLeftWingDamage ?? tele.car_damage?.[0] ?? tele.carDamage?.[0],
    ),
    frontRightWing: toDamageValue(
      tele.frontRightWingDamage ?? tele.car_damage?.[1] ?? tele.carDamage?.[1],
    ),
    rearWing: toDamageValue(
      tele.rearWingDamage ?? tele.car_damage?.[2] ?? tele.carDamage?.[2],
    ),
    engine: toDamageValue(tele.engineDamage ?? tele.car_damage?.[3] ?? tele.carDamage?.[3]),
    gearbox: toDamageValue(
      tele.gearboxDamage ?? tele.car_damage?.[4] ?? tele.carDamage?.[4],
    ),
    floor: toDamageValue(tele.floorDamage ?? tele.car_damage?.[5] ?? tele.carDamage?.[5]),
    diffuser: toDamageValue(
      tele.diffuserDamage ?? tele.car_damage?.[6] ?? tele.carDamage?.[6],
    ),
  };

  const hasData = Object.values(damage).some(value => value !== undefined);
  return hasData ? damage : undefined;
}

export function buildRaceSnapshot({
  telemetry,
  multiCarData,
  analysis,
}: RaceContextInput): RaceSnapshot | null {
  if (!telemetry) {
    return null;
  }

  const tele = telemetry as any;
  const atlas = tele?.atlas_ai ?? null;
  const { ahead, behind } = mergeOpponentSources(telemetry, multiCarData);
  const analysisSummary = summariseAnalysis(analysis);

  const tyreCompound =
    typeof telemetry.tire_compound === 'string'
      ? telemetry.tire_compound
      : toTyreLabel(telemetry.tire_compound as any);

  const plans: PitPlanSummary[] = [];
  if (atlas) {
    const selectedIndex = Math.min(Math.max(atlas.pit_plan_selected ?? 0, 0), 2);
    const summaries = [
      summarisePlan(atlas.pit_plan_primary, PLAN_LABELS[0], selectedIndex, 0),
      summarisePlan(atlas.pit_plan_alternative, PLAN_LABELS[1], selectedIndex, 1),
      summarisePlan(atlas.pit_plan_third, PLAN_LABELS[2], selectedIndex, 2),
    ].filter(Boolean) as PitPlanSummary[];
    plans.push(...summaries);
  }

  const driverName =
    tele.driver_name ?? tele.player_name ?? tele.playerName ?? 'Driver';

  const driverFocus = buildDriverFocus(telemetry, multiCarData);
  const carDamage = buildCarDamageSummary(tele);
  const airTemperature = safeNumber(tele.airTemp ?? tele.air_temperature);
  const trackTemperature = safeNumber(tele.trackTemp ?? tele.track_temperature);
  const rainLevel = safeNumber((tele as any).rain_level ?? (tele as any).rainLevel);
  const surfaceGrip = safeNumber(tele.surfaceGrip);
  const windSpeed = safeNumber(tele.windSpeed);
  const windDirection = safeNumber(tele.windDirection);
  const penaltyTime = safeNumber(
    tele.m_penalties ?? tele.penalties ?? (tele as any).penalty_time ?? (tele as any).penalties_time,
  );
  const penaltyCount = safeNumber(
    tele.penaltiesCount ?? (tele as any).num_penalties ?? (tele as any).penalties_count,
  );
  const cornerWarnings = safeNumber(
    tele.cornerCuttingWarnings ?? tele.track_limit_warnings ?? (tele as any).corner_warnings,
  );
  const currentLapTime = parseLapTime(tele.current_lap_time ?? tele.currentLapTime);
  const lastLapTime = parseLapTime(tele.last_lap_time ?? tele.lastLapTime);
  const bestLapTime = parseLapTime(tele.best_lap_time ?? tele.bestLapTime);
  const sector1Time = parseLapTime(tele.sector1_time ?? tele.sector1Time);
  const sector2Time = parseLapTime(tele.sector2_time ?? tele.sector2Time);
  const sector3Time = parseLapTime(tele.sector3_time ?? tele.sector3Time);
  const weatherSummary = typeof telemetry.weather === 'string' ? telemetry.weather : undefined;
  const marshalZones = Array.isArray(tele.marshalZones ?? tele.marshal_zone_flags)
    ? (tele.marshalZones ?? tele.marshal_zone_flags)
    : undefined;
  const fuelAvgPerLapRaw =
    atlas?.fuel_per_lap_average ??
    tele.fuel_per_lap_average ??
    (tele as any).fuel_per_lap_average;
  const baselineFuelRate = sanitizeTelemetryNumber(analysis?.baseline?.fuelConsumptionRate, 50);
  const fuelAvgPerLap =
    sanitizeTelemetryNumber(fuelAvgPerLapRaw, 50) ??
    baselineFuelRate ??
    undefined;
  const tyrePerformanceIndex =
    sanitizeTelemetryNumber(
      atlas?.tyre_performance_index ?? tele.tyre_performance_index,
      200
    ) ??
    analysisSummary.performance?.tyrePerformanceScore ??
    undefined;
  const tyreCriticalWarning =
    atlas?.tyre_critical_warning === 1 || tele.tyre_critical_warning === 1;
  const tyreLifeRemaining = sanitizeTelemetryNumber(
    atlas?.tyre_life_remaining_laps ?? tele.tyre_life_remaining_laps,
    500
  );
  const tyreDegPerLap = sanitizeTelemetryNumber(
    atlas?.tyre_degradation_rate ?? tele.tyre_degradation_rate,
    60
  );
  const fuelLapsRemaining = sanitizeTelemetryNumber(
    atlas?.fuel_laps_remaining_calculated ?? tele.fuel_remaining_laps,
    200
  );
  const fuelMarginLaps = sanitizeTelemetryNumber(
    atlas?.fuel_margin_laps ?? tele.fuel_margin_laps,
    200
  );
  const fuelTargetSavePerLap = sanitizeTelemetryNumber(
    atlas?.fuel_target_save_per_lap ?? tele.fuel_target_save_per_lap,
    50
  );
  const ersAttackGap = safeNumber(atlas?.ers_attack_gap);
  const ersDefendGap = safeNumber(atlas?.ers_defend_gap);
  const ersHarvestGap = safeNumber(atlas?.ers_harvest_gap);
  const paceDeltaSeconds = sanitizeTelemetryNumber(
    tele.delta_time ?? atlas?.pace_delta_time,
    1200
  );
  const pitDelta = sanitizeTelemetryNumber(
    atlas?.pit_delta_time ?? tele.pit_delta_time,
    400
  );

  const snapshot: RaceSnapshot = {
    lap: telemetry.current_lap_num ?? 0,
    totalLaps: telemetry.total_laps ?? 0,
    position: telemetry.position ?? 0,
    driverName,
    weather: telemetry.weather,
    tyreCompound,
    tyreAge: tele.tire_age_laps ?? tele.tyre_stint_progress ?? undefined,
    tyreWear: tele.tire_wear ?? tele.tyreWear ?? undefined,
    tyreTemps: tele.tire_temps,
    tyreLifeRemaining,
    tyreDegPerLap,
    tyreStrategyStatus: atlas?.tyre_strategy_status ?? tele.tyre_strategy_status ?? undefined,
    tyrePerformanceIndex,
    tyreCriticalWarning,
    fuelInTank: tele.fuel_in_tank,
    fuelLapsRemaining,
    fuelMarginLaps,
    fuelTargetSavePerLap,
    fuelAvgPerLap,
    ersPercent:
      atlas?.ers_store_percent ??
      tele.ers_store_percent ??
      (tele.ers_store_energy ?? undefined),
    ersMode:
      (atlas?.ers_strategy_mode !== undefined
        ? ERS_MODE_LABELS[atlas.ers_strategy_mode]
        : undefined) || undefined,
    ersStrategyMode: atlas?.ers_strategy_mode ?? tele.ers_strategy_mode ?? undefined,
    ersBudgetTrend:
      atlas?.ers_strategy_mode !== undefined ? deriveErsBudgetTrend(atlas) : undefined,
    ersAttackGap: ersAttackGap ?? null,
    ersDefendGap: ersDefendGap ?? null,
    ersHarvestGap: ersHarvestGap ?? null,
    gapAhead: ahead?.gapSeconds ?? atlas?.opponent_ahead_1?.gap_seconds ?? null,
    gapBehind: behind?.gapSeconds ?? atlas?.opponent_behind_1?.gap_seconds ?? null,
    opponentAhead: ahead,
    opponentBehind: behind,
    paceDeltaSeconds: paceDeltaSeconds ?? null,
    pitStatus: tele.pit_status,
    pitDelta: pitDelta ?? null,
    pitAdvantageAvailable: atlas?.pit_advantage_available === 1,
    pitRecommendation: atlas?.pit_recommended_lap ?? tele.pit_recommended_lap ?? null,
    pitStrategyStatus: atlas?.pit_strategy_status ?? tele.pit_strategy_status ?? null,
    pitPlans: plans,
    safetyCarStatus: tele.safety_car_status,
    penalties: penaltyTime ?? undefined,
    penaltyTime: penaltyTime ?? undefined,
    penaltyCount: penaltyCount ?? undefined,
    cornerWarnings: cornerWarnings ?? undefined,
    warnings: tele.m_warnings ?? tele.track_limit_warnings ?? undefined,
    airTemperature: airTemperature ?? undefined,
    trackTemperature: trackTemperature ?? undefined,
    weatherSummary: weatherSummary ?? undefined,
    rainLevel: rainLevel ?? undefined,
    surfaceGrip: surfaceGrip ?? undefined,
    windSpeed: windSpeed ?? undefined,
    windDirection: windDirection ?? undefined,
    lastLapTime: lastLapTime ?? undefined,
    bestLapTime: bestLapTime ?? undefined,
    currentLapTime: currentLapTime ?? undefined,
    sectorTimes: {
      s1: sector1Time ?? undefined,
      s2: sector2Time ?? undefined,
      s3: sector3Time ?? undefined,
    },
    fieldSummary: buildFieldSummary(telemetry, multiCarData),
    driverFocus,
    marshalZones,
    carDamage,
    analysisInsights: analysisSummary.insights,
    analysisPerformance: analysisSummary.performance,
    analysisRecommendation: analysisSummary.recommendation,
    analysisTimestamp: analysisSummary.timestamp,
  };

  return snapshot;
}

function deriveErsBudgetTrend(atlas: any): string | undefined {
  if (!atlas || atlas.ers_strategy_mode === undefined) {
    return undefined;
  }

  const mode: number = atlas.ers_strategy_mode;
  const attackGap = safeNumber(atlas.ers_attack_gap);
  const defendGap = safeNumber(atlas.ers_defend_gap);
  const harvestGap = safeNumber(atlas.ers_harvest_gap);

  switch (mode) {
    case 2:
      return attackGap !== null ? `Attack when gap < ${attackGap.toFixed(1)}s` : 'Attack bias';
    case 3:
      return defendGap !== null ? `Defend when gap < ${defendGap.toFixed(1)}s` : 'Defend bias';
    case 1:
      return harvestGap !== null ? `Harvest unless gap < ${harvestGap.toFixed(1)}s` : 'Harvest focus';
    default:
      return 'Balanced deployment';
  }
}

export interface BroadcastPromptPayload {
  snapshot: RaceSnapshot | null;
  trigger: {
    type: string;
    priority: 'low' | 'medium' | 'high' | 'critical';
    detail: string;
  };
  recentBroadcasts: string[];
}

export function buildBroadcastPrompt(payload: BroadcastPromptPayload): string {
  const { snapshot, trigger, recentBroadcasts } = payload;

  const broadcastHistory =
    recentBroadcasts.length > 0
      ? `RECENT RADIO: ${recentBroadcasts.slice(-3).join(' || ')}`
      : 'RECENT RADIO: None';

  if (!snapshot) {
    return `${broadcastHistory}\nEVENT: ${trigger.type} (${trigger.priority}) - ${trigger.detail}\nDeliver a short F1 race engineer broadcast (max 18 words).`;
  }

  const tyreStatusParts = [
    snapshot.tyreCompound,
    snapshot.tyreAge !== undefined && snapshot.tyreAge !== null ? `${snapshot.tyreAge} laps` : null,
    snapshot.tyreLifeRemaining !== undefined && snapshot.tyreLifeRemaining !== null
      ? `life ~${snapshot.tyreLifeRemaining.toFixed(1)} laps`
      : null,
    snapshot.tyreDegPerLap !== undefined && snapshot.tyreDegPerLap !== null
      ? `deg +${snapshot.tyreDegPerLap.toFixed(3)}s`
      : null,
  ].filter(Boolean);

  const fuelStatusParts = [
    snapshot.fuelInTank !== undefined ? `${snapshot.fuelInTank.toFixed(1)}kg` : null,
    snapshot.fuelLapsRemaining !== undefined && snapshot.fuelLapsRemaining !== null
      ? `${snapshot.fuelLapsRemaining.toFixed(1)} laps`
      : null,
    snapshot.fuelMarginLaps !== undefined && snapshot.fuelMarginLaps !== null
      ? `margin ${snapshot.fuelMarginLaps.toFixed(1)} laps`
      : null,
    snapshot.fuelTargetSavePerLap !== undefined && snapshot.fuelTargetSavePerLap !== null
      ? `save ${snapshot.fuelTargetSavePerLap.toFixed(2)}`
      : null,
  ].filter(Boolean);

  const ersStatusParts = [
    snapshot.ersPercent !== undefined && snapshot.ersPercent !== null
      ? `${snapshot.ersPercent.toFixed(0)}%`
      : null,
    snapshot.ersMode,
    snapshot.ersBudgetTrend,
  ].filter(Boolean);

  const tyreStatus = tyreStatusParts.length ? tyreStatusParts.join(', ') : 'Unknown';
  const fuelStatus = fuelStatusParts.length ? fuelStatusParts.join(', ') : 'Unknown';
  const ersStatus = ersStatusParts.length ? ersStatusParts.join(', ') : 'Unknown';
  const plansText = formatPitPlans(snapshot.pitPlans);
  const ahead = formatOpponent(snapshot.opponentAhead ?? null);
  const behind = formatOpponent(snapshot.opponentBehind ?? null);
  const cleanedDetail = trigger.detail;
  const fieldSummary = snapshot.fieldSummary.length
    ? snapshot.fieldSummary.join(' || ')
    : 'unavailable';
  const pitStatusParts = [
    snapshot.pitStrategyStatus !== undefined && snapshot.pitStrategyStatus !== null
      ? `strategy flag ${snapshot.pitStrategyStatus}`
      : null,
    snapshot.pitDelta !== null && snapshot.pitDelta !== undefined
      ? `delta ${snapshot.pitDelta.toFixed(1)}s`
      : null,
    snapshot.pitRecommendation !== null && snapshot.pitRecommendation !== undefined
      ? `box lap ${snapshot.pitRecommendation}`
      : null,
    snapshot.pitAdvantageAvailable ? 'pit window favourable' : null,
  ].filter(Boolean);
  const pitStatus = pitStatusParts.length ? pitStatusParts.join(' | ') : 'unknown';
  const analysisLine = formatAnalysisInsights(snapshot.analysisInsights);
  const performanceLine = formatAnalysisPerformance(snapshot.analysisPerformance);
  const predictionLine = formatAnalysisPrediction(snapshot.analysisRecommendation);

  const focusDrivers = extractDriverNames(cleanedDetail);
  const focusEntries = focusDrivers
    .map(name => snapshot.driverFocus[name])
    .filter((entry): entry is DriverFocusEntry => Boolean(entry));
  const focusLine = focusEntries.length
    ? `FOCUS: ${focusEntries.map(entry => formatDriverFocusEntry(entry)).join(' || ')}`
    : null;

  return [
    `POSITION: P${snapshot.position} | Lap ${snapshot.lap}/${snapshot.totalLaps}`,
    `TYRES: ${tyreStatus}`,
    `FUEL: ${fuelStatus}`,
    `ERS: ${ersStatus}`,
    `GAPS: Ahead ${ahead} | Behind ${behind}`,
    `PIT STATUS: ${pitStatus}`,
    `PLANS: ${plansText}`,
    ...(focusLine ? [focusLine] : []),
    ...(analysisLine ? [analysisLine] : []),
    ...(performanceLine ? [performanceLine] : []),
    ...(predictionLine ? [predictionLine] : []),
    `ALL DRIVERS: ${fieldSummary}`,
    'REFERENCE: Driver names are uppercase; treat hyphen or spacing differences as the same driver.',
    broadcastHistory,
    `TRIGGER: ${trigger.type.toUpperCase()} (${trigger.priority}) | Detail: ${cleanedDetail}`,
    'GUIDELINE: One 18-word engineer call max. Prioritise trigger context, no corner names, avoid repeated catchphrases.',
  ].join('\n');
}

export interface ConversationPromptPayload {
  snapshot: RaceSnapshot | null;
  transcript: string;
  recentBroadcasts: string[];
}

export function buildConversationPrompt(payload: ConversationPromptPayload): string {
  const { snapshot, transcript, recentBroadcasts } = payload;

  const history =
    recentBroadcasts.length > 0
      ? `Recent radio: ${recentBroadcasts.slice(-3).join(' || ')}`
      : 'Recent radio: none';

  if (!snapshot) {
    return `${history}\nDriver question: "${transcript}"\nRespond as the race engineer with concise, factual guidance.`;
  }

  const ahead = formatOpponent(snapshot.opponentAhead ?? null);
  const behind = formatOpponent(snapshot.opponentBehind ?? null);
  const plans = formatPitPlans(snapshot.pitPlans);
  const field = snapshot.fieldSummary.length
    ? `ALL DRIVERS: ${snapshot.fieldSummary.join(' || ')}`
    : 'ALL DRIVERS: unavailable';

  const cleanedTranscript = transcript;
  const pitStatusParts = [
    snapshot.pitStrategyStatus !== undefined && snapshot.pitStrategyStatus !== null
      ? `strategy flag ${snapshot.pitStrategyStatus}`
      : null,
    snapshot.pitDelta !== null && snapshot.pitDelta !== undefined
      ? `delta ${snapshot.pitDelta.toFixed(1)}s`
      : null,
    snapshot.pitRecommendation !== null && snapshot.pitRecommendation !== undefined
      ? `recommend lap ${snapshot.pitRecommendation}`
      : null,
    snapshot.pitAdvantageAvailable ? 'pit window favourable' : null,
  ].filter(Boolean);
  const pitStatus = pitStatusParts.length ? pitStatusParts.join(' | ') : 'unknown';
  const timingLine = `TIMING: Current ${formatLapTimeValue(snapshot.currentLapTime)} | Last ${formatLapTimeValue(snapshot.lastLapTime)} | Best ${formatLapTimeValue(snapshot.bestLapTime)}`;
  const tyreDetailLine = `TYRE DETAIL: Wear ${formatTyreWear(snapshot.tyreWear)} | Temps ${formatTyreTemps(snapshot.tyreTemps)} | Perf ${
    snapshot.tyrePerformanceIndex !== undefined && snapshot.tyrePerformanceIndex !== null
      ? snapshot.tyrePerformanceIndex.toFixed(2)
      : 'N/A'
  } | Critical ${snapshot.tyreCriticalWarning ? 'YES' : 'NO'}`;
  const penaltyLine = `FLAGS: Safety Car ${snapshot.safetyCarStatus ?? 'Unknown'} | Penalties ${formatPenaltyDetail(snapshot)}`;
  const weatherLine = `WEATHER: ${formatWeatherDetail(snapshot)}`;
  const damageLine = `DAMAGE: ${formatDamageDetail(snapshot.carDamage)}`;
  const marshalLine = `MARSHAL: ${formatMarshalDetail(snapshot.marshalZones)}`;
  const analysisLine = formatAnalysisInsights(snapshot.analysisInsights);
  const performanceLine = formatAnalysisPerformance(snapshot.analysisPerformance);
  const predictionLine = formatAnalysisPrediction(snapshot.analysisRecommendation);
  const focusDrivers = extractDriverNames(cleanedTranscript);
  const focusEntries = focusDrivers
    .map(name => snapshot.driverFocus[name])
    .filter((entry): entry is DriverFocusEntry => Boolean(entry));
  const focusLine = focusEntries.length
    ? `FOCUS: ${focusEntries.map(entry => formatDriverFocusEntry(entry)).join(' || ')}`
    : null;

  return [
    `POSITION: P${snapshot.position} | Lap ${snapshot.lap}/${snapshot.totalLaps}`,
    `DRIVER: ${snapshot.driverName ? snapshot.driverName.toUpperCase() : 'DRIVER'}`,
    `TYRES: ${snapshot.tyreCompound || 'Unknown'} ${
      snapshot.tyreAge ? `${snapshot.tyreAge}L` : ''
    } | Life ${
      snapshot.tyreLifeRemaining !== undefined && snapshot.tyreLifeRemaining !== null
        ? `${snapshot.tyreLifeRemaining.toFixed(1)}L`
        : 'N/A'
    } | Deg ${
      snapshot.tyreDegPerLap !== undefined && snapshot.tyreDegPerLap !== null
        ? `${snapshot.tyreDegPerLap.toFixed(3)}s`
        : 'N/A'
    }`,
    `FUEL: ${
      snapshot.fuelInTank !== undefined ? `${snapshot.fuelInTank.toFixed(1)}kg` : 'Unknown'
    } | Laps ${
      snapshot.fuelLapsRemaining !== undefined && snapshot.fuelLapsRemaining !== null
        ? snapshot.fuelLapsRemaining.toFixed(1)
        : 'N/A'
    } | Margin ${
      snapshot.fuelMarginLaps !== undefined && snapshot.fuelMarginLaps !== null
        ? `${snapshot.fuelMarginLaps.toFixed(1)}L`
        : 'N/A'
    } | Avg ${formatNumberWithUnit(snapshot.fuelAvgPerLap, 'kg/lap')} | Target Save ${formatNumberWithUnit(snapshot.fuelTargetSavePerLap, 'L')}`,
    `ERS: ${
      snapshot.ersPercent !== undefined && snapshot.ersPercent !== null
        ? `${snapshot.ersPercent.toFixed(0)}%`
        : 'Unknown'
    } | Mode ${snapshot.ersMode || 'N/A'}${
      snapshot.ersBudgetTrend ? ` | ${snapshot.ersBudgetTrend}` : ''
    } | Attack ${formatErsGap(snapshot.ersAttackGap)} | Defend ${formatErsGap(snapshot.ersDefendGap)} | Harvest ${formatErsGap(snapshot.ersHarvestGap)}`,
    `PIT: ${pitStatus}`,
    `GAPS: Ahead ${ahead} | Behind ${behind}`,
    `PLANS: ${plans}`,
    timingLine,
    tyreDetailLine,
    penaltyLine,
    weatherLine,
    damageLine,
    marshalLine,
    ...(analysisLine ? [analysisLine] : []),
    ...(performanceLine ? [performanceLine] : []),
    ...(predictionLine ? [predictionLine] : []),
    ...(focusLine ? [focusLine] : []),
    field,
    'REFERENCE: Driver names are uppercase; treat hyphen or spacing differences as the same driver.',
    history,
    `Driver question: "${cleanedTranscript}"`,
    'GUIDELINE: Reply in 1-2 short sentences. Lead with the answer, cite plans only if relevant, and skip filler or repeated sign-offs.',
  ].join('\n');
}

