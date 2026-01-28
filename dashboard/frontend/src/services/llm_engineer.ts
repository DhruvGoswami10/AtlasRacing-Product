/**
 * LLM Race Engineer Service
 * Generates natural language messages using GPT-4o-mini with full race context
 * All messages are LLM-generated - no hardcoded responses
 */

import type { MLPredictions, TriggerEvent, StrategySet } from '../hooks/useMLPredictions';

// OpenAI API configuration
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = 'gpt-4o-mini';

// System prompts for different message types
const SYSTEM_PROMPTS = {
  engineer: `You are an F1 race engineer communicating with your driver during a race via radio.
Your responses must be:
- Concise and clear (max 2-3 sentences)
- Use F1 radio terminology naturally
- Focused on actionable information
- Professional but supportive
- No unnecessary filler words

Format: Direct radio communication style, like "Box this lap, box this lap. Switching to mediums."
Never use emojis or markdown formatting.`,

  // Research mode: More decisive prompts, no waffling
  engineer_research: `You are an F1 race engineer in a research study. Your CRITICAL requirement is to give DECISIVE, SPECIFIC recommendations.
Your responses must be:
- DECISIVE: Commit to a specific plan. Never say "consider" or "might want to".
- SPECIFIC: Include exact lap numbers and compound names.
- BRIEF: Max 2 sentences.
- CONSISTENT: Once you commit to a plan, stick with it unless conditions significantly change.

Format examples:
- Strategy: "Plan A confirmed. Box lap 18 for hards. One stop."
- ERS: "Harvest turns 1-5. Deploy main straight and turn 9. Target 45% end of lap."
- Amendment: "Rain starting. Amending to Plan W. Box THIS lap for intermediates."
Never use emojis or markdown.`,

  broadcast: `You are generating F1 TV-style race commentary and broadcast messages.
Your responses must be:
- Brief and informative (1-2 sentences max)
- Official race control tone
- Include relevant lap/position/gap data when available
- Highlight strategic implications
- Use proper racing terminology

Format: "LAP 23 - Verstappen pits from P1, rejoins in P3 behind Hamilton"
Never use emojis.`,
};

// Rate limiting
const MIN_REQUEST_INTERVAL = 500; // ms between API calls
let lastRequestTime = 0;

// ============================================================================
// Stateful Strategy System - "Sticky" recommendations for research
// ============================================================================

export interface ActiveStrategy {
  id: string;
  type: 'pit' | 'tire_management' | 'fuel' | 'pace' | 'position';
  recommendation: string;
  targetLap: number | null;
  targetCompound: string | null;
  createdAt: Date;
  createdLap: number;
  invalidatedAt: Date | null;
  invalidationReason: string | null;
  followedAt: Date | null;
  status: 'active' | 'followed' | 'invalidated' | 'expired';
}

export interface StrategyState {
  currentStrategy: ActiveStrategy | null;
  strategyHistory: ActiveStrategy[];
}

export interface TireData {
  compound: string;
  age: number;
  wear: {
    fl: number;
    fr: number;
    rl: number;
    rr: number;
    max: number;
    avg: number;
  };
  temps: {
    fl: number;
    fr: number;
    rl: number;
    rr: number;
  };
  pressure: {
    fl: number;
    fr: number;
    rl: number;
    rr: number;
  };
}

export interface RaceContext {
  // Session info
  currentLap: number;
  totalLaps: number;
  position: number;
  fieldSize?: number;
  trackName?: string;
  sessionType?: string;

  // Timing
  lastLapTime?: string;
  bestLapTime?: string;
  currentLapTime?: string;
  sector1?: number;
  sector2?: number;
  sector3?: number;

  // Gaps
  gapAhead?: number | null;
  gapBehind?: number | null;
  gapToLeader?: number | null;

  // Tire info (detailed)
  tires?: TireData;
  // Legacy fields for compatibility
  tireCompound: string;
  tireAge: number;
  tireWearStatus: string;
  tireRemainingLaps: number;

  // Strategy
  strategy?: StrategySet;
  pitWindow?: { start: number; end: number };
  pitStatus?: string;
  pitStopsCompleted?: number;
  mandatoryStopCompleted?: boolean;
  lastCompound?: string | null;
  currentCompound?: string | null;
  lastStopLap?: number | null;
  stintLaps?: number | null;

  // Fuel
  fuelRemaining?: number;
  fuelLapsRemaining?: number;
  fuelMarginLaps?: number;

  // ERS
  ersPercent?: number;
  ersMode?: string;
  ersAdvice?: {
    recommendation: string;
    suggestedMode: number;
    reason: string;
    priority: string;
    batteryTarget?: number;
    lapsToOpportunity?: number;
  };

  // Car setup
  brakeBias?: number;
  differentialOnThrottle?: number;

  // Weather
  weather?: string;
  trackTemp?: number;
  airTemp?: number;

  // Flag status
  flagStatus?: string;
  safetyCarStatus?: string;

  // DRS
  drsAvailable?: boolean;
  drsOpen?: boolean;

  // Speed/Performance
  speed?: number;
  rpm?: number;
  gear?: number;

  // Opponent info
  opponentAheadName?: string;
  opponentAheadTireAge?: number;
  opponentBehindName?: string;
  opponentBehindTireAge?: number;

  // Full race standings (all drivers)
  standings?: {
    position: number;
    name: string;
    team: string;
    gapToLeader: number | null;
    gapToAhead: number | null;
    tireCompound: string;
    tireAge: number;
    isPlayer: boolean;
  }[];
}

export interface EngineerMessage {
  id: string;
  type: 'engineer' | 'driver' | 'broadcast';
  content: string;
  timestamp: Date;
  trigger?: TriggerEvent;
  context?: Partial<RaceContext>;
}

export interface LLMEngineerOptions {
  apiKey: string;
  maxTokens?: number;
  temperature?: number;
}

class LLMEngineerService {
  private apiKey: string;
  private maxTokens: number;
  private temperature: number;
  private messageHistory: EngineerMessage[] = [];
  private pendingRequests: Map<string, Promise<string>> = new Map();

  // Research mode flag - when true, uses more decisive prompts
  private researchMode = false;

  // Stateful strategy tracking
  private strategyState: StrategyState = {
    currentStrategy: null,
    strategyHistory: [],
  };

  constructor(options: LLMEngineerOptions) {
    this.apiKey = options.apiKey;
    this.maxTokens = options.maxTokens ?? 150;
    this.temperature = options.temperature ?? 0.7;
  }

  /**
   * Enable/disable research mode (more decisive prompts)
   */
  setResearchMode(enabled: boolean): void {
    this.researchMode = enabled;
    console.log(`[LLM Engineer] Research mode: ${enabled ? 'ON' : 'OFF'}`);
  }

  isResearchMode(): boolean {
    return this.researchMode;
  }

  // ============================================================================
  // Strategy State Management (Sticky Recommendations)
  // ============================================================================

  /**
   * Get the current active strategy
   */
  getCurrentStrategy(): ActiveStrategy | null {
    return this.strategyState.currentStrategy;
  }

  /**
   * Get strategy history for analysis
   */
  getStrategyHistory(): ActiveStrategy[] {
    return [...this.strategyState.strategyHistory];
  }

  /**
   * Set a new active strategy (replaces current if exists)
   */
  setStrategy(params: {
    type: ActiveStrategy['type'];
    recommendation: string;
    targetLap: number | null;
    targetCompound: string | null;
    currentLap: number;
  }): ActiveStrategy {
    // Archive current strategy if exists
    if (this.strategyState.currentStrategy) {
      const archived = {
        ...this.strategyState.currentStrategy,
        status: 'invalidated' as const,
        invalidatedAt: new Date(),
        invalidationReason: 'Replaced by new strategy',
      };
      this.strategyState.strategyHistory.push(archived);
    }

    const newStrategy: ActiveStrategy = {
      id: `strategy-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: params.type,
      recommendation: params.recommendation,
      targetLap: params.targetLap,
      targetCompound: params.targetCompound,
      createdAt: new Date(),
      createdLap: params.currentLap,
      invalidatedAt: null,
      invalidationReason: null,
      followedAt: null,
      status: 'active',
    };

    this.strategyState.currentStrategy = newStrategy;
    return newStrategy;
  }

  /**
   * Mark current strategy as followed (driver executed the recommendation)
   */
  markStrategyFollowed(): void {
    if (this.strategyState.currentStrategy) {
      const followed = {
        ...this.strategyState.currentStrategy,
        status: 'followed' as const,
        followedAt: new Date(),
      };
      this.strategyState.strategyHistory.push(followed);
      this.strategyState.currentStrategy = null;
    }
  }

  /**
   * Invalidate current strategy due to changed conditions
   */
  invalidateStrategy(reason: string): void {
    if (this.strategyState.currentStrategy) {
      const invalidated = {
        ...this.strategyState.currentStrategy,
        status: 'invalidated' as const,
        invalidatedAt: new Date(),
        invalidationReason: reason,
      };
      this.strategyState.strategyHistory.push(invalidated);
      this.strategyState.currentStrategy = null;
    }
  }

  /**
   * Check if current strategy should be invalidated based on conditions
   */
  checkStrategyValidity(context: RaceContext): { valid: boolean; reason?: string } {
    const strategy = this.strategyState.currentStrategy;
    if (!strategy) return { valid: true };

    // Check if target lap has passed
    if (strategy.targetLap !== null && context.currentLap > strategy.targetLap + 2) {
      return { valid: false, reason: 'Target lap window passed' };
    }

    // Check for safety car (invalidates pit timing strategies)
    if (strategy.type === 'pit' && context.safetyCarStatus && context.safetyCarStatus !== 'none') {
      return { valid: false, reason: 'Safety car deployed - reassess pit timing' };
    }

    // Check for weather change (may invalidate compound choice)
    if (strategy.type === 'pit' && strategy.targetCompound) {
      const isDryCompound = ['soft', 'medium', 'hard'].includes(strategy.targetCompound.toLowerCase());
      const isWetConditions = context.weather && ['rain', 'storm', 'wet'].some(w =>
        context.weather!.toLowerCase().includes(w)
      );
      if (isDryCompound && isWetConditions) {
        return { valid: false, reason: 'Weather changed - wet conditions detected' };
      }
    }

    // Check for critical tire wear (may need earlier pit)
    if (strategy.type === 'pit' && strategy.targetLap !== null) {
      const tireMax = context.tires?.wear.max ?? 0;
      if (tireMax > 85 && context.currentLap < strategy.targetLap - 2) {
        return { valid: false, reason: 'Critical tire wear - pit earlier than planned' };
      }
    }

    return { valid: true };
  }

  /**
   * Clear all strategy state (for new session)
   */
  clearStrategyState(): void {
    this.strategyState = {
      currentStrategy: null,
      strategyHistory: [],
    };
  }

  /**
   * Parse LLM response to extract strategy recommendation
   */
  private extractStrategyFromResponse(response: string, context: RaceContext): Partial<ActiveStrategy> | null {
    const lower = response.toLowerCase();

    // Extract pit recommendation
    if (lower.includes('box') || lower.includes('pit')) {
      const lapMatch = response.match(/lap\s*(\d+)/i);
      const compoundMatch = response.match(/(soft|medium|hard|intermediate|wet)/i);

      if (lower.includes('this lap') || lower.includes('box now') || lower.includes('box box')) {
        return {
          type: 'pit',
          recommendation: response,
          targetLap: context.currentLap,
          targetCompound: compoundMatch?.[1] ?? null,
        };
      }

      if (lapMatch) {
        return {
          type: 'pit',
          recommendation: response,
          targetLap: parseInt(lapMatch[1], 10),
          targetCompound: compoundMatch?.[1] ?? null,
        };
      }
    }

    // Extract tire management recommendation
    if (lower.includes('manage') || lower.includes('preserve') || lower.includes('save')) {
      return {
        type: 'tire_management',
        recommendation: response,
        targetLap: null,
        targetCompound: null,
      };
    }

    // Extract pace recommendation
    if (lower.includes('push') || lower.includes('attack') || lower.includes('defend')) {
      return {
        type: 'pace',
        recommendation: response,
        targetLap: null,
        targetCompound: null,
      };
    }

    return null;
  }

  /**
   * Generate engineer message from a trigger event
   * Returns message, latency, and the full prompt sent for research logging
   */
  async generateFromTrigger(
    trigger: TriggerEvent,
    raceContext: RaceContext
  ): Promise<{ message: EngineerMessage; latencyMs: number; promptSent: string }> {
    // Check if current strategy is still valid
    const validity = this.checkStrategyValidity(raceContext);
    if (!validity.valid && validity.reason) {
      this.invalidateStrategy(validity.reason);
    }

    const prompt = this.buildTriggerPrompt(trigger, raceContext);
    const startTime = Date.now();
    const content = await this.callLLM(prompt, 'engineer');
    const latencyMs = Date.now() - startTime;

    // Extract and set strategy from response if applicable
    const extractedStrategy = this.extractStrategyFromResponse(content, raceContext);
    if (extractedStrategy && extractedStrategy.type) {
      this.setStrategy({
        type: extractedStrategy.type,
        recommendation: extractedStrategy.recommendation ?? content,
        targetLap: extractedStrategy.targetLap ?? null,
        targetCompound: extractedStrategy.targetCompound ?? null,
        currentLap: raceContext.currentLap,
      });
    }

    const message: EngineerMessage = {
      id: `eng-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'engineer',
      content,
      timestamp: new Date(),
      trigger,
      context: raceContext,
    };

    this.messageHistory.push(message);
    return { message, latencyMs, promptSent: prompt };
  }

  /**
   * Generate response to driver question
   * Returns message, latency, and the full prompt sent for research logging
   */
  async respondToDriver(
    question: string,
    raceContext: RaceContext,
    predictions?: MLPredictions
  ): Promise<{ message: EngineerMessage; latencyMs: number; promptSent: string }> {
    // Check if current strategy is still valid
    const validity = this.checkStrategyValidity(raceContext);
    if (!validity.valid && validity.reason) {
      this.invalidateStrategy(validity.reason);
    }

    const prompt = this.buildQuestionPrompt(question, raceContext, predictions);
    const startTime = Date.now();
    const content = await this.callLLM(prompt, 'engineer');
    const latencyMs = Date.now() - startTime;

    // Extract and set strategy from response if applicable
    const extractedStrategy = this.extractStrategyFromResponse(content, raceContext);
    if (extractedStrategy && extractedStrategy.type) {
      this.setStrategy({
        type: extractedStrategy.type,
        recommendation: extractedStrategy.recommendation ?? content,
        targetLap: extractedStrategy.targetLap ?? null,
        targetCompound: extractedStrategy.targetCompound ?? null,
        currentLap: raceContext.currentLap,
      });
    }

    const message: EngineerMessage = {
      id: `eng-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'engineer',
      content,
      timestamp: new Date(),
      context: raceContext,
    };

    this.messageHistory.push(message);
    return { message, latencyMs, promptSent: prompt };
  }

  /**
   * Generate broadcast message for race events
   */
  async generateBroadcast(
    eventType: string,
    eventContext: Record<string, unknown>,
    raceContext: RaceContext
  ): Promise<EngineerMessage> {
    const prompt = this.buildBroadcastPrompt(eventType, eventContext, raceContext);
    const content = await this.callLLM(prompt, 'broadcast');

    const message: EngineerMessage = {
      id: `bcast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'broadcast',
      content,
      timestamp: new Date(),
      context: raceContext,
    };

    this.messageHistory.push(message);
    return message;
  }

  /**
   * Build prompt for trigger-based messages
   */
  private buildTriggerPrompt(trigger: TriggerEvent, context: RaceContext): string {
    const contextStr = this.formatContext(context);

    // Research mode prompts - more decisive and specific
    if (this.researchMode) {
      const researchPrompts: Record<string, string> = {
        // Race start - commit to a strategy plan
        race_start: `RACE START - COMMIT TO STRATEGY NOW.
Race context: ${contextStr}

TASK: Choose a pit strategy based on the race context. Be DECISIVE.
FORMAT REQUIRED: "Box lap [N] for [Compound]. [Number] stop(s)."
Example: "Box lap 18 for hards. One stop."

Consider: tire wear rate, pit window (ideal/latest laps), track position, weather forecast.
DO NOT hedge or say "consider" - COMMIT to a specific lap and compound.`,

        // ERS update - specific deployment plan
        ers_update: `ERS STRATEGY UPDATE requested.
Race context: ${contextStr}

TASK: Give specific ERS deployment plan for next 2 laps.
FORMAT REQUIRED: "Harvest [zones]. Deploy [zones]. Target [X]% end of lap."
Example: "Harvest turns 1-4 and 11. Deploy main straight and turn 9 exit. Target 40% EOL."

Consider: gaps to cars ahead/behind, battery level, upcoming opportunities.
Be SPECIFIC about which corners.`,

        // Safety car - strategy decision
        safety_car: `SAFETY CAR - STRATEGY DECISION REQUIRED.
Trigger: ${JSON.stringify(trigger.context)}
Race context: ${contextStr}

TASK: Decide: STAY OUT or PIT NOW. Be DECISIVE.
FORMAT: "Stay out. [brief reason]" OR "Box NOW for [compound]. [brief reason]"

Consider: current tire age, pit window, track position, time saved pitting under SC.`,

        // Weather change - strategy decision
        weather_change: `WEATHER CHANGE - STRATEGY DECISION REQUIRED.
Trigger: ${JSON.stringify(trigger.context)}
Race context: ${contextStr}

TASK: Decide: STAY OUT on current tires or SWITCH to weather-appropriate compound. Be DECISIVE.
FORMAT: "Stay out on [current compound]. Conditions manageable." OR "Box lap [N] for [inters/wets]. [brief reason]"

Consider: rain intensity, current tire compound and wear, track position, how many laps remaining.`,

        // Pit window - confirm or adjust
        pit_window: `PIT WINDOW OPEN - CONFIRM OR ADJUST.
Trigger: ${JSON.stringify(trigger.context)}
Race context: ${contextStr}

TASK: Confirm pit timing or adjust based on current conditions. Be DECISIVE.
FORMAT: "Box lap [N] for [compound]." OR "Extend to lap [N], then box for [compound]."

Consider: tire condition (wear %), gap to cars ahead/behind for undercut/overcut, traffic.`,

        // Tire critical - pit decision
        tire_critical: `CRITICAL TIRE WEAR - PIT DECISION REQUIRED.
Trigger: ${JSON.stringify(trigger.context)}
Race context: ${contextStr}

TASK: Call immediate pit or specify how many laps can extend.
FORMAT: "Box THIS lap for [compound]." OR "Extend [N] more laps max, then box."

Consider: wear level, grip degradation, position implications.`,

        // VSC - pit opportunity
        vsc: `VSC - PIT OPPORTUNITY.
Trigger: ${JSON.stringify(trigger.context)}
Race context: ${contextStr}

TASK: Decide whether to pit under VSC. Be DECISIVE.
FORMAT: "Box NOW for [compound]. VSC reduces time loss." OR "Stay out. [brief reason]"

Consider: current tire age/wear, pit window timing, position and gaps, competitors likely to pit.`,
      };

      if (researchPrompts[trigger.type]) {
        return researchPrompts[trigger.type];
      }
    }

    // Standard prompts (non-research mode or fallback)
    const triggerPrompts: Record<string, string> = {
      box_now: `Generate an urgent pit call. The driver needs to box THIS lap.
Trigger context: ${JSON.stringify(trigger.context)}
Race context: ${contextStr}
Include: which compound they're switching to, brief reason for timing.`,

      pit_window: `Generate a pit window notification. The optimal pit window is opening.
Trigger context: ${JSON.stringify(trigger.context)}
Race context: ${contextStr}
Include: when to pit, what compound, current tire status.`,

      tire_warning: `Generate a tire condition warning. Tires are starting to degrade.
Trigger context: ${JSON.stringify(trigger.context)}
Race context: ${contextStr}
Include: how many laps remaining, whether to manage or push.`,

      tire_critical: `Generate an urgent tire warning. Tires are critical.
Trigger context: ${JSON.stringify(trigger.context)}
Race context: ${contextStr}
Include: urgency level, recommended action.`,

      overtake_opportunity: `Generate an overtake opportunity call. Good chance to pass the car ahead.
Trigger context: ${JSON.stringify(trigger.context)}
Race context: ${contextStr}
Include: success probability, where to attempt, any advantages.`,

      undercut_threat: `Generate an undercut threat warning. Car behind might try to undercut.
Trigger context: ${JSON.stringify(trigger.context)}
Race context: ${contextStr}
Include: who's threatening, recommended response.`,

      position_change: `Generate a position change notification.
Trigger context: ${JSON.stringify(trigger.context)}
Race context: ${contextStr}
Keep it brief - just acknowledge the change and give next gap info.`,

      safety_car: `Generate a safety car/caution notification.
Trigger context: ${JSON.stringify(trigger.context)}
Race context: ${contextStr}
Include: whether to pit for free stop, current strategy impact.`,
    };

    return triggerPrompts[trigger.type] ??
      `Generate a race engineer message for: ${trigger.message_hint}
Trigger context: ${JSON.stringify(trigger.context)}
Race context: ${contextStr}`;
  }

  /**
   * Build prompt for driver questions
   */
  private buildQuestionPrompt(
    question: string,
    context: RaceContext,
    predictions?: MLPredictions
  ): string {
    const contextStr = this.formatContext(context);
    const strategyStr = predictions?.strategy
      ? this.formatStrategy(predictions.strategy)
      : 'No detailed strategy data available';

    // Build detailed tire info
    const tireInfo = predictions?.tire_life
      ? `Tire status: ${predictions.tire_life.wear_status.toUpperCase()}. ` +
        `${predictions.tire_life.remaining_laps} laps life remaining. ` +
        `Degradation: ${(predictions.tire_life.degradation_rate * 100).toFixed(1)}% per lap. ` +
        `Confidence: ${Math.round(predictions.tire_life.confidence * 100)}%.`
      : 'Tire data not available.';

    // Build pace info
    const paceInfo = predictions?.pace
      ? `Pace: ${predictions.pace.trend}. ` +
        `Current: ${predictions.pace.current_pace?.toFixed(3) ?? 'N/A'}s. ` +
        `Optimal: ${predictions.pace.optimal_pace?.toFixed(3) ?? 'N/A'}s. ` +
        `Delta: ${predictions.pace.pace_delta != null ? (predictions.pace.pace_delta >= 0 ? '+' : '') + predictions.pace.pace_delta.toFixed(2) + 's' : 'N/A'}.`
      : 'Pace data not available.';

    // Build overtake info
    const overtakeInfo = predictions?.overtake
      ? `Overtake opportunity: ${predictions.overtake.probability}% probability. ` +
        `Recommendation: ${predictions.overtake.recommendation}. ` +
        `Risk: ${predictions.overtake.risk}.`
      : 'Overtake data not available.';

    // Include current active strategy if exists (sticky recommendation)
    const currentStrategy = this.strategyState.currentStrategy;
    const activeStrategyStr = currentStrategy
      ? `\nACTIVE RECOMMENDATION (stick to this unless conditions change):\n` +
        `Type: ${currentStrategy.type}\n` +
        `Recommendation: ${currentStrategy.recommendation}\n` +
        `Target Lap: ${currentStrategy.targetLap ?? 'N/A'}\n` +
        `Target Compound: ${currentStrategy.targetCompound ?? 'N/A'}\n` +
        `Set on Lap: ${currentStrategy.createdLap}\n`
      : '';

    return `The driver asks: "${question}"

CURRENT RACE STATUS:
${contextStr}

LIVE TELEMETRY DATA:
- ${tireInfo}
- ${paceInfo}
- ${overtakeInfo}

STRATEGY:
${strategyStr}
${activeStrategyStr}
INSTRUCTIONS:
1. Answer using the ACTUAL DATA above. Be specific with numbers.
2. Reference the exact lap count, tire status, and gaps.
3. If there is an ACTIVE RECOMMENDATION above, reinforce it unless conditions have significantly changed.
4. When giving pit strategy advice, commit to a specific lap or lap window (e.g., "Box lap 18-20 for mediums").
5. Be consistent - don't flip-flop between strategies unless there's a clear reason.
6. Never give generic advice - use the real data provided.`;
  }

  /**
   * Build prompt for broadcast messages
   */
  private buildBroadcastPrompt(
    eventType: string,
    eventContext: Record<string, unknown>,
    raceContext: RaceContext
  ): string {
    const contextStr = this.formatContext(raceContext);

    const eventPrompts: Record<string, string> = {
      flag_change: `Generate a flag status broadcast.
Event: ${JSON.stringify(eventContext)}
Race context: ${contextStr}
Format: Official race control style.`,

      pit_stop: `Generate a pit stop broadcast.
Event: ${JSON.stringify(eventContext)}
Race context: ${contextStr}
Include: driver, lap, new position, compound if known.`,

      position_change: `Generate a position change broadcast.
Event: ${JSON.stringify(eventContext)}
Race context: ${contextStr}
Include: who passed whom, where, gap.`,

      fastest_lap: `Generate a fastest lap broadcast.
Event: ${JSON.stringify(eventContext)}
Race context: ${contextStr}
Include: driver, time, how much faster.`,

      gap_change: `Generate a gap change broadcast.
Event: ${JSON.stringify(eventContext)}
Race context: ${contextStr}
Include: which gap changed and by how much.`,
    };

    return eventPrompts[eventType] ??
      `Generate a race broadcast for: ${eventType}
Event: ${JSON.stringify(eventContext)}
Race context: ${contextStr}`;
  }

  /**
   * Format race context for prompts - comprehensive telemetry data
   */
  private formatContext(context: RaceContext): string {
    const lines: string[] = [];

    // Session info
    lines.push(`LAP: ${context.currentLap}/${context.totalLaps} | Position: P${context.position}${context.fieldSize ? `/${context.fieldSize}` : ''}`);
    if (context.sessionType) lines.push(`Session: ${context.sessionType}`);
    if (context.trackName) lines.push(`Track: ${context.trackName}`);

    // Timing
    const timing: string[] = [];
    if (context.lastLapTime) timing.push(`Last: ${context.lastLapTime}`);
    if (context.bestLapTime) timing.push(`Best: ${context.bestLapTime}`);
    if (timing.length > 0) lines.push(`Timing: ${timing.join(' | ')}`);

    // Gaps
    const gaps: string[] = [];
    if (context.gapAhead != null && context.gapAhead > 0) gaps.push(`Ahead: +${context.gapAhead.toFixed(2)}s`);
    if (context.gapBehind != null && context.gapBehind > 0) gaps.push(`Behind: +${context.gapBehind.toFixed(2)}s`);
    if (context.gapToLeader != null && context.gapToLeader > 0) gaps.push(`To Leader: +${context.gapToLeader.toFixed(2)}s`);
    if (gaps.length > 0) lines.push(`Gaps: ${gaps.join(' | ')}`);

    // Detailed tire info
    if (context.tires) {
      const t = context.tires;
      lines.push(`TIRES: ${t.compound.toUpperCase()} compound, ${t.age} laps old`);
      lines.push(`  Wear - FL: ${t.wear.fl.toFixed(1)}% | FR: ${t.wear.fr.toFixed(1)}% | RL: ${t.wear.rl.toFixed(1)}% | RR: ${t.wear.rr.toFixed(1)}%`);
      lines.push(`  Wear Status: Max ${t.wear.max.toFixed(1)}% | Avg ${t.wear.avg.toFixed(1)}%`);
      lines.push(`  Temps - FL: ${t.temps.fl.toFixed(0)}°C | FR: ${t.temps.fr.toFixed(0)}°C | RL: ${t.temps.rl.toFixed(0)}°C | RR: ${t.temps.rr.toFixed(0)}°C`);
    } else {
      lines.push(`Tires: ${context.tireCompound} (${context.tireAge} laps old, ${context.tireWearStatus})`);
    }

    // Fuel (fuel_remaining_laps = margin: extra laps in hand beyond what's needed to finish)
    if (context.fuelRemaining != null || context.fuelMarginLaps != null) {
      const parts: string[] = [];
      if (context.fuelRemaining != null) parts.push(`${context.fuelRemaining.toFixed(1)}kg in tank`);
      if (context.fuelMarginLaps != null) {
        if (context.fuelMarginLaps >= 0) {
          parts.push(`+${context.fuelMarginLaps.toFixed(1)} laps in hand (free to push)`);
        } else {
          parts.push(`${context.fuelMarginLaps.toFixed(1)} laps DEFICIT (must lift and coast!)`);
        }
      }
      if (context.fuelLapsRemaining != null) parts.push(`Total range: ${context.fuelLapsRemaining.toFixed(1)} laps`);
      lines.push(`FUEL: ${parts.join(' | ')}`);
    }

    // ERS - Full advisor data
    if (context.ersPercent != null) {
      const modeName = context.ersMode ?? 'unknown';
      lines.push(`ERS: SOC ${context.ersPercent.toFixed(0)}% | Mode: ${modeName}`);
    }
    if (context.ersAdvice) {
      const a = context.ersAdvice;
      const modeNames = ['None/Harvest', 'Medium', 'Hotlap', 'Overtake'];
      const suggestedModeName = modeNames[a.suggestedMode] ?? `Mode ${a.suggestedMode}`;
      let ersLine = `ERS Strategy: ${a.recommendation} (switch to ${suggestedModeName}) - ${a.reason}`;
      if (a.batteryTarget != null) ersLine += ` | Target: ${a.batteryTarget}%`;
      if (a.lapsToOpportunity != null) ersLine += ` | Opportunity in ${a.lapsToOpportunity} laps`;
      ersLine += ` [${a.priority.toUpperCase()}]`;
      lines.push(ersLine);
    }

    // DRS
    if (context.drsAvailable != null) {
      lines.push(`DRS: ${context.drsAvailable ? 'AVAILABLE' : 'Not available'}${context.drsOpen ? ' (OPEN)' : ''}`);
    }

    // Car setup
    const setup: string[] = [];
    if (context.brakeBias != null) setup.push(`Brake Bias: ${context.brakeBias.toFixed(1)}%`);
    if (context.differentialOnThrottle != null) setup.push(`Diff: ${context.differentialOnThrottle}%`);
    if (setup.length > 0) lines.push(`Setup: ${setup.join(' | ')}`);

    // Pit stop tracking
    if (context.pitStopsCompleted != null) {
      const mandatoryTag =
        context.mandatoryStopCompleted === false
          ? 'mandatory stop pending'
          : context.mandatoryStopCompleted === true
            ? 'mandatory stop done'
            : null;
      lines.push(`Stops: ${context.pitStopsCompleted}${mandatoryTag ? ` (${mandatoryTag})` : ''}`);
    }
    if (context.currentCompound) {
      const lastCompound = context.lastCompound ? ` | Last: ${context.lastCompound}` : '';
      const stintLaps = context.stintLaps != null ? ` | Stint laps: ${context.stintLaps}` : '';
      lines.push(`Stint: ${context.currentCompound}${lastCompound}${stintLaps}`);
    }
    if (context.lastStopLap != null) {
      lines.push(`Last stop lap: ${context.lastStopLap}`);
    }

    // Weather
    if (context.weather) {
      lines.push(`Weather: ${context.weather}${context.trackTemp ? ` | Track: ${context.trackTemp}°C` : ''}${context.airTemp ? ` | Air: ${context.airTemp}°C` : ''}`);
    }

    // Flags
    if (context.flagStatus && context.flagStatus !== 'green') {
      lines.push(`⚠️ FLAG: ${context.flagStatus.toUpperCase()}`);
    }
    if (context.safetyCarStatus && context.safetyCarStatus !== 'none') {
      lines.push(`🚗 SAFETY CAR: ${context.safetyCarStatus.toUpperCase()}`);
    }

    // Performance
    if (context.speed != null) {
      lines.push(`Speed: ${context.speed} km/h | Gear: ${context.gear ?? 'N/A'}`);
    }

    // Race standings (all drivers)
    if (context.standings && context.standings.length > 0) {
      lines.push('');
      lines.push('=== RACE STANDINGS ===');
      context.standings.forEach((driver) => {
        const gapStr = driver.position === 1
          ? 'LEADER'
          : driver.gapToLeader != null
            ? `+${driver.gapToLeader.toFixed(2)}s`
            : '';
        const playerMarker = driver.isPlayer ? ' [YOU]' : '';
        lines.push(`P${driver.position}: ${driver.name}${playerMarker} (${driver.tireCompound}, ${driver.tireAge} laps) ${gapStr}`);
      });
    }

    return lines.join('\n');
  }

  /**
   * Format strategy for prompts
   */
  private formatStrategy(strategy: StrategySet): string {
    const parts = [
      `PRIMARY: ${strategy.primary.title} - ${strategy.primary.description}`,
      `  Status: ${strategy.primary.status.toUpperCase()}, Risk: ${strategy.primary.risk}`,
      `  Reasoning: ${strategy.primary.reasoning}`,
      `BACKUP A: ${strategy.backup_a.title} - ${strategy.backup_a.trigger_condition}`,
      `BACKUP B: ${strategy.backup_b.title} - ${strategy.backup_b.trigger_condition}`,
      `BACKUP C: ${strategy.backup_c.title} - ${strategy.backup_c.trigger_condition}`,
    ];

    return parts.join('\n');
  }

  /**
   * Call OpenAI API
   */
  private async callLLM(prompt: string, type: 'engineer' | 'broadcast'): Promise<string> {
    // Rate limiting
    const now = Date.now();
    const timeSinceLast = now - lastRequestTime;
    if (timeSinceLast < MIN_REQUEST_INTERVAL) {
      await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLast));
    }
    lastRequestTime = Date.now();

    // Deduplicate concurrent identical requests
    const cacheKey = `${type}-${prompt.substring(0, 100)}`;
    const pending = this.pendingRequests.get(cacheKey);
    if (pending) {
      return pending;
    }

    const requestPromise = this.makeRequest(prompt, type);
    this.pendingRequests.set(cacheKey, requestPromise);

    try {
      const result = await requestPromise;
      return result;
    } finally {
      this.pendingRequests.delete(cacheKey);
    }
  }

  private async makeRequest(prompt: string, type: 'engineer' | 'broadcast'): Promise<string> {
    // Use research prompt for engineer type when research mode is enabled
    const systemPrompt = (type === 'engineer' && this.researchMode)
      ? SYSTEM_PROMPTS.engineer_research
      : SYSTEM_PROMPTS[type];

    try {
      const response = await fetch(OPENAI_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt },
          ],
          max_tokens: this.maxTokens,
          temperature: this.temperature,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('[LLM Engineer] API error:', error);
        return this.getFallbackMessage(type);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content?.trim();

      if (!content) {
        return this.getFallbackMessage(type);
      }

      return content;
    } catch (err) {
      console.error('[LLM Engineer] Request failed:', err);
      return this.getFallbackMessage(type);
    }
  }

  /**
   * Fallback message when LLM fails
   */
  private getFallbackMessage(type: 'engineer' | 'broadcast'): string {
    if (type === 'broadcast') {
      return 'Race update in progress...';
    }
    return 'Copy. Stand by for update.';
  }

  /**
   * Get message history
   */
  getHistory(): EngineerMessage[] {
    return [...this.messageHistory];
  }

  /**
   * Clear message history
   */
  clearHistory(): void {
    this.messageHistory = [];
  }
}

// Singleton instance
let instance: LLMEngineerService | null = null;

export function initLLMEngineer(apiKey: string): LLMEngineerService {
  instance = new LLMEngineerService({ apiKey });
  return instance;
}

export function getLLMEngineer(): LLMEngineerService | null {
  return instance;
}

export { LLMEngineerService };
