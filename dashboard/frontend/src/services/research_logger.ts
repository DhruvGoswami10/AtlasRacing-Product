/**
 * Research Logger Service
 *
 * Collects structured research data for the AI Race Engineer study.
 * Produces three output formats:
 * - lap_telemetry.csv: One row per completed lap
 * - llm_interactions.json: All LLM calls with context, response, latency
 * - race_summary.json: Race metadata, pit stops, weather, LLM stats
 */

// ============================================================================
// Constants
// ============================================================================

export const TRACK_NAMES: Record<number, string> = {
  0: 'Melbourne',
  1: 'Paul Ricard',
  2: 'Shanghai',
  3: 'Bahrain',
  4: 'Catalunya',
  5: 'Monaco',
  6: 'Montreal',
  7: 'Silverstone',
  8: 'Hockenheim',
  9: 'Hungaroring',
  10: 'Spa',
  11: 'Monza',
  12: 'Singapore',
  13: 'Suzuka',
  14: 'Abu Dhabi',
  15: 'Austin',
  16: 'Interlagos',
  17: 'Red Bull Ring',
  18: 'Sochi',
  19: 'Mexico City',
  20: 'Baku',
  21: 'Bahrain Short',
  22: 'Silverstone Short',
  23: 'Austin Short',
  24: 'Suzuka Short',
  25: 'Hanoi',
  26: 'Zandvoort',
  27: 'Imola',
  28: 'Portimao',
  29: 'Jeddah',
  30: 'Miami',
  31: 'Las Vegas',
  32: 'Losail',
};

export const WEATHER_NAMES: Record<number, string> = {
  0: 'Clear',
  1: 'Light Cloud',
  2: 'Overcast',
  3: 'Light Rain',
  4: 'Heavy Rain',
  5: 'Storm',
};

export const SESSION_NAMES: Record<number, string> = {
  0: 'Unknown',
  1: 'Practice 1',
  2: 'Practice 2',
  3: 'Practice 3',
  4: 'Short Practice',
  5: 'Qualifying 1',
  6: 'Qualifying 2',
  7: 'Qualifying 3',
  8: 'Short Qualifying',
  9: 'One-Shot Qualifying',
  10: 'Race',
  11: 'Race 2',
  12: 'Race 3',
  13: 'Time Trial',
};

// ============================================================================
// Types
// ============================================================================

export type ResponseType =
  | 'strategy_commit'   // Initial strategy call (race_start trigger)
  | 'strategy_amend'    // Amendment for SC/rain/critical events
  | 'ers_plan'          // ERS deployment plan
  | 'info_response';    // Response to driver question

export interface LapRow {
  lap: number;
  lap_time_ms: number | null;
  sector1_ms: number | null;
  sector2_ms: number | null;
  sector3_ms: number | null;
  position: number;
  gap_ahead_s: number | null;
  gap_behind_s: number | null;
  tire_compound: string;
  tire_age: number;
  tire_wear_max: number;
  tire_wear_fl: number;
  tire_wear_fr: number;
  tire_wear_rl: number;
  tire_wear_rr: number;
  fuel_remaining_laps: number;
  ers_percent: number;
  ers_mode: number;
  weather: string;
  track_temp_c: number;
  air_temp_c: number;
  safety_car_status: string;
  pit_this_lap: boolean;
  pit_compound_to: string | null;
  drs_used: boolean;
}

export interface CommittedPlan {
  planId: string;
  pitLap: number;
  compound: string;
  totalStops: number;
}

export interface LLMInteraction {
  id: string;
  timestamp: string;
  lap: number;
  triggerType: string;
  responseType: ResponseType;
  context: Record<string, unknown>;
  llmResponse: string;
  latencyMs: number;
  committedPlan: CommittedPlan | null;
  ersPlan: string | null;
  driverInput: string | null;
  // Post-race outcome (filled by addOutcomeData)
  driverAction: 'followed' | 'overridden' | null;
  overrideReason: string | null;
}

export interface PitStopRecord {
  lap: number;
  compoundFrom: string;
  compoundTo: string;
  positionBefore: number;
  positionAfter: number;
  triggeredBy: 'llm' | 'driver' | 'mandatory';
  llmRecommendedLap: number | null;
}

export interface RaceConfig {
  track: string;
  trackId: number;
  seasonType: 'control' | 'llm';
  seasonNumber: number;
  raceNumber: number;
  totalLaps: number;
  difficulty: number;
  startingPosition?: number;
  participantId?: string;
}

export interface RaceEndData {
  finishPosition: number;
  points: number;
  fastestLap: boolean;
  bestLapMs: number | null;
  avgLapMs: number | null;
  notes?: string;
}

export interface RaceSummary {
  // Race metadata
  raceId: string;
  participantId: string;
  date: string;
  track: string;
  trackId: number;
  seasonType: 'control' | 'llm';
  seasonNumber: number;
  raceNumber: number;
  totalLaps: number;
  difficulty: number;
  // Results
  startingPosition: number | null;
  finishPosition: number | null;
  points: number;
  fastestLap: boolean;
  bestLapMs: number | null;
  avgLapMs: number | null;
  // Pit stops
  pitStops: PitStopRecord[];
  totalPitStops: number;
  // Weather
  weatherChanges: Array<{ lap: number; from: string; to: string }>;
  safetyCars: number;
  virtualSafetyCars: number;
  // LLM stats
  llmTotalCalls: number;
  llmAvgLatencyMs: number;
  llmStrategyCommits: number;
  llmStrategyAmends: number;
  llmERSCalls: number;
  llmDriverQuestions: number;
  followedRate: number | null;  // % of strategy calls followed
  // Notes
  notes: string;
}

export interface ExportData {
  csv: string;
  interactions: LLMInteraction[];
  summary: RaceSummary;
}

// ============================================================================
// Research Logger Service
// ============================================================================

class ResearchLoggerService {
  private raceConfig: RaceConfig | null = null;
  private lapRows: LapRow[] = [];
  private interactions: LLMInteraction[] = [];
  private pitStops: PitStopRecord[] = [];
  private weatherChanges: Array<{ lap: number; from: string; to: string }> = [];
  private safetyCars = 0;
  private virtualSafetyCars = 0;
  private startingPosition: number | null = null;
  private raceEndData: RaceEndData | null = null;
  private interactionCounter = 0;
  private raceActive = false;

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  startRace(config: RaceConfig): void {
    this.reset();
    this.raceConfig = config;
    this.startingPosition = config.startingPosition ?? null;
    this.raceActive = true;
    console.log(`[ResearchLogger] Race started: ${config.track} (S${config.seasonNumber}R${config.raceNumber})`);
  }

  endRace(data: RaceEndData): void {
    if (!this.raceActive) return;
    this.raceEndData = data;
    this.raceActive = false;
    console.log(`[ResearchLogger] Race ended: P${data.finishPosition}`);
  }

  isActive(): boolean {
    return this.raceActive;
  }

  reset(): void {
    this.raceConfig = null;
    this.lapRows = [];
    this.interactions = [];
    this.pitStops = [];
    this.weatherChanges = [];
    this.safetyCars = 0;
    this.virtualSafetyCars = 0;
    this.startingPosition = null;
    this.raceEndData = null;
    this.interactionCounter = 0;
    this.raceActive = false;
  }

  // ── Data Logging ──────────────────────────────────────────────────────────

  logLap(row: LapRow): void {
    if (!this.raceActive) return;
    this.lapRows.push(row);
  }

  /**
   * Update a specific lap's pit_compound_to value
   * Used for deferred compound detection (compound changes after lap boundary)
   */
  updateLapPitCompound(lapNumber: number, compound: string): boolean {
    const lapRow = this.lapRows.find(r => r.lap === lapNumber);
    if (lapRow && lapRow.pit_this_lap && lapRow.pit_compound_to === null) {
      lapRow.pit_compound_to = compound;
      console.log(`[ResearchLogger] Updated lap ${lapNumber} pit_compound_to: ${compound}`);
      return true;
    }
    return false;
  }

  logInteraction(data: {
    triggerType: string;
    responseType: ResponseType;
    context: Record<string, unknown>;
    llmResponse: string;
    latencyMs: number;
    lap?: number;
    committedPlan?: CommittedPlan | null;
    ersPlan?: string | null;
    driverInput?: string | null;
  }): string {
    this.interactionCounter++;
    const id = `int_${this.interactionCounter}_${Date.now()}`;

    // Use explicit lap if provided, else try context.currentLap, then fall back to last logged lap
    const currentLap = data.lap
      ?? (data.context.currentLap as number)
      ?? (this.lapRows.length > 0 ? this.lapRows[this.lapRows.length - 1].lap : 0);

    const interaction: LLMInteraction = {
      id,
      timestamp: new Date().toISOString(),
      lap: currentLap,
      triggerType: data.triggerType,
      responseType: data.responseType,
      context: data.context,
      llmResponse: data.llmResponse,
      latencyMs: data.latencyMs,
      committedPlan: data.committedPlan ?? null,
      ersPlan: data.ersPlan ?? null,
      driverInput: data.driverInput ?? null,
      driverAction: null,
      overrideReason: null,
    };

    this.interactions.push(interaction);
    console.log(`[ResearchLogger] Interaction logged: ${id} (${data.responseType})`);
    return id;
  }

  logPitStop(data: {
    lap: number;
    compoundFrom: string;
    compoundTo: string;
    positionBefore: number;
    positionAfter: number;
    triggeredBy: 'llm' | 'driver' | 'mandatory';
    llmRecommendedLap?: number | null;
  }): void {
    if (!this.raceActive) return;

    this.pitStops.push({
      lap: data.lap,
      compoundFrom: data.compoundFrom,
      compoundTo: data.compoundTo,
      positionBefore: data.positionBefore,
      positionAfter: data.positionAfter,
      triggeredBy: data.triggeredBy,
      llmRecommendedLap: data.llmRecommendedLap ?? null,
    });

    console.log(`[ResearchLogger] Pit stop logged: Lap ${data.lap}`);
  }

  logWeatherChange(lap: number, from: string, to: string): void {
    if (!this.raceActive) return;
    this.weatherChanges.push({ lap, from, to });
  }

  logSafetyCar(type: 'full' | 'virtual'): void {
    if (!this.raceActive) return;
    if (type === 'full') this.safetyCars++;
    else this.virtualSafetyCars++;
  }

  // ── Post-Race Outcome ─────────────────────────────────────────────────────

  addOutcomeData(
    interactionId: string,
    driverAction: 'followed' | 'overridden',
    overrideReason?: string
  ): void {
    const interaction = this.interactions.find(i => i.id === interactionId);
    if (interaction) {
      interaction.driverAction = driverAction;
      interaction.overrideReason = overrideReason ?? null;
    }
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  getStrategyInteractions(): LLMInteraction[] {
    return this.interactions.filter(
      i => i.responseType === 'strategy_commit' || i.responseType === 'strategy_amend'
    );
  }

  getERSInteractions(): LLMInteraction[] {
    return this.interactions.filter(i => i.responseType === 'ers_plan');
  }

  getAllInteractions(): LLMInteraction[] {
    return [...this.interactions];
  }

  getLapCount(): number {
    return this.lapRows.length;
  }

  getPitStops(): PitStopRecord[] {
    return [...this.pitStops];
  }

  /**
   * Update pit stop triggeredBy after post-race review
   */
  updatePitStopTrigger(lap: number, triggeredBy: 'llm' | 'driver' | 'mandatory'): void {
    const pitStop = this.pitStops.find(p => p.lap === lap);
    if (pitStop) {
      pitStop.triggeredBy = triggeredBy;
    }
  }

  // ── Export ────────────────────────────────────────────────────────────────

  exportAll(): ExportData {
    return {
      csv: this.buildCSV(),
      interactions: [...this.interactions],
      summary: this.buildSummary(),
    };
  }

  private buildCSV(): string {
    const headers = [
      'lap', 'lap_time_ms', 'sector1_ms', 'sector2_ms', 'sector3_ms',
      'position', 'gap_ahead_s', 'gap_behind_s',
      'tire_compound', 'tire_age', 'tire_wear_max',
      'tire_wear_fl', 'tire_wear_fr', 'tire_wear_rl', 'tire_wear_rr',
      'fuel_remaining_laps', 'ers_percent', 'ers_mode',
      'weather', 'track_temp_c', 'air_temp_c',
      'safety_car_status', 'pit_this_lap', 'pit_compound_to', 'drs_used',
    ];

    const rows = this.lapRows.map(row => [
      row.lap,
      row.lap_time_ms ?? '',
      row.sector1_ms ?? '',
      row.sector2_ms ?? '',
      row.sector3_ms ?? '',
      row.position,
      row.gap_ahead_s !== null ? row.gap_ahead_s.toFixed(3) : '',
      row.gap_behind_s !== null ? row.gap_behind_s.toFixed(3) : '',
      csvEscape(row.tire_compound),
      row.tire_age,
      row.tire_wear_max.toFixed(1),
      row.tire_wear_fl.toFixed(1),
      row.tire_wear_fr.toFixed(1),
      row.tire_wear_rl.toFixed(1),
      row.tire_wear_rr.toFixed(1),
      row.fuel_remaining_laps.toFixed(2),
      row.ers_percent.toFixed(1),
      row.ers_mode,
      csvEscape(row.weather),
      row.track_temp_c,
      row.air_temp_c,
      csvEscape(row.safety_car_status),
      row.pit_this_lap ? 1 : 0,
      row.pit_compound_to ?? '',
      row.drs_used ? 1 : 0,
    ].join(','));

    return [headers.join(','), ...rows].join('\n');
  }

  private buildSummary(): RaceSummary {
    const config = this.raceConfig;
    const end = this.raceEndData;

    // Auto-compute lap time stats from logged data
    const validLapTimes = this.lapRows
      .map(r => r.lap_time_ms)
      .filter((t): t is number => t !== null && t > 0);
    const computedBestLapMs = validLapTimes.length > 0 ? Math.min(...validLapTimes) : null;
    const computedAvgLapMs = validLapTimes.length > 0
      ? Math.round(validLapTimes.reduce((sum, t) => sum + t, 0) / validLapTimes.length)
      : null;

    // LLM stats
    const strategyCalls = this.interactions.filter(
      i => i.responseType === 'strategy_commit' || i.responseType === 'strategy_amend'
    );
    const strategyCommits = this.interactions.filter(i => i.responseType === 'strategy_commit').length;
    const strategyAmends = this.interactions.filter(i => i.responseType === 'strategy_amend').length;
    const ersCalls = this.interactions.filter(i => i.responseType === 'ers_plan').length;
    const driverQuestions = this.interactions.filter(i => i.responseType === 'info_response').length;

    const totalLatency = this.interactions.reduce((sum, i) => sum + i.latencyMs, 0);
    const avgLatency = this.interactions.length > 0
      ? Math.round(totalLatency / this.interactions.length)
      : 0;

    // Followed rate (only strategy calls that have outcome data)
    const assessedStrategy = strategyCalls.filter(i => i.driverAction !== null);
    const followedCount = assessedStrategy.filter(i => i.driverAction === 'followed').length;
    const followedRate = assessedStrategy.length > 0
      ? Math.round((followedCount / assessedStrategy.length) * 100)
      : null;

    const pid = config?.participantId || 'P0';

    return {
      raceId: config
        ? `${pid}_S${config.seasonNumber}_${config.seasonType}_R${config.raceNumber}_${config.track.replace(/\s/g, '')}`
        : `race_${Date.now()}`,
      participantId: pid,
      date: new Date().toISOString(),
      track: config?.track ?? 'Unknown',
      trackId: config?.trackId ?? -1,
      seasonType: config?.seasonType ?? 'llm',
      seasonNumber: config?.seasonNumber ?? 0,
      raceNumber: config?.raceNumber ?? 0,
      totalLaps: config?.totalLaps ?? this.lapRows.length,
      difficulty: config?.difficulty ?? 0,
      startingPosition: this.startingPosition,
      finishPosition: end?.finishPosition ?? null,
      points: end?.points ?? 0,
      fastestLap: end?.fastestLap ?? false,
      bestLapMs: end?.bestLapMs ?? computedBestLapMs,
      avgLapMs: end?.avgLapMs ?? computedAvgLapMs,
      pitStops: [...this.pitStops],
      totalPitStops: this.pitStops.length,
      weatherChanges: [...this.weatherChanges],
      safetyCars: this.safetyCars,
      virtualSafetyCars: this.virtualSafetyCars,
      llmTotalCalls: this.interactions.length,
      llmAvgLatencyMs: avgLatency,
      llmStrategyCommits: strategyCommits,
      llmStrategyAmends: strategyAmends,
      llmERSCalls: ersCalls,
      llmDriverQuestions: driverQuestions,
      followedRate,
      notes: end?.notes ?? '',
    };
  }

  // ── Static Helpers ────────────────────────────────────────────────────────

  static getTrackName(trackId: number): string {
    return TRACK_NAMES[trackId] || `Track ${trackId}`;
  }

  static getWeatherName(weatherId: number): string {
    return WEATHER_NAMES[weatherId] || 'Unknown';
  }

  static getSessionTypeName(sessionType: number): string {
    return SESSION_NAMES[sessionType] || 'Unknown';
  }
}

// ============================================================================
// Helpers
// ============================================================================

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Download a string as a file in the browser
 */
export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Download all research data files
 */
export function downloadAllData(data: ExportData): void {
  const raceId = data.summary.raceId;

  // CSV
  if (data.csv) {
    downloadFile(data.csv, `${raceId}_lap_telemetry.csv`, 'text/csv');
  }

  // Interactions JSON
  downloadFile(
    JSON.stringify(data.interactions, null, 2),
    `${raceId}_llm_interactions.json`,
    'application/json'
  );

  // Summary JSON
  downloadFile(
    JSON.stringify(data.summary, null, 2),
    `${raceId}_race_summary.json`,
    'application/json'
  );
}

// ============================================================================
// Research Mode Toggle
// ============================================================================

// Research logging is disabled by default in the product build.
// Set REACT_APP_ENABLE_RESEARCH=true in .env to enable data collection.
const RESEARCH_ENABLED = process.env.REACT_APP_ENABLE_RESEARCH === 'true';

// ============================================================================
// Singleton
// ============================================================================

let instance: ResearchLoggerService | null = null;

export function getResearchLogger(): ResearchLoggerService {
  if (!instance) {
    instance = new ResearchLoggerService();
    if (!RESEARCH_ENABLED) {
      // In product mode, disable all logging by making the instance inert.
      // Methods still exist (no call-site changes needed) but do nothing.
      instance.startRace = () => {};
      instance.endRace = () => {};
      instance.logLap = () => {};
      instance.logInteraction = () => '';
      instance.logPitStop = () => {};
      instance.updateLapPitCompound = () => false;
      instance.logWeatherChange = () => {};
      instance.logSafetyCar = () => {};
      instance.isActive = () => false;
    }
  }
  return instance;
}

export function isResearchEnabled(): boolean {
  return RESEARCH_ENABLED;
}

export function resetResearchLogger(): void {
  if (instance) {
    instance.reset();
  }
  instance = null;
}

export { ResearchLoggerService };
