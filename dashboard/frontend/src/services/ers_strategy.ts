/**
 * ERS Strategy Advisor Service
 *
 * Provides intelligent ERS deployment recommendations based on:
 * - Current battery state
 * - Gap to cars ahead/behind
 * - Track position and upcoming sectors
 * - Remaining laps in the race
 * - Battle situations
 */

import type { TelemetryData, MultiCarTelemetryData } from '../types/telemetry';

// ERS deploy modes from F1 24/25
export const ERS_MODES = {
  NONE: 0,      // No deployment (harvesting)
  MEDIUM: 1,    // Balanced deployment
  HOTLAP: 2,    // High deployment (qualifying mode)
  OVERTAKE: 3,  // Maximum deployment (push to pass)
} as const;

export type ERSMode = typeof ERS_MODES[keyof typeof ERS_MODES];

export type ERSRecommendation =
  | 'HARVEST'   // Prioritize battery recovery
  | 'BALANCED'  // Standard deployment
  | 'DEPLOY'    // High deployment for attack/defense
  | 'SAVE'      // Preserve charge for upcoming opportunity
  | 'ATTACK'    // Full deployment - overtake opportunity
  | 'DEFEND';   // Full deployment - under attack

export interface ERSAdvice {
  recommendation: ERSRecommendation;
  suggestedMode: ERSMode;
  reason: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  batteryTarget?: number; // Target % to reach
  lapsToOpportunity?: number; // Laps until key moment
}

export interface ERSState {
  currentPercent: number;
  deployMode: ERSMode;
  harvestedThisLap: number;
  deployedThisLap: number;
  netEnergyThisLap: number;
}

export interface ERSContext {
  lap: number;
  totalLaps: number;
  position: number;
  gapAhead: number;
  gapBehind: number;
  drsAvailable: boolean;
  inDrsZone: boolean;
  sector: number;
  isInBattle: boolean;
  safetyCarActive: boolean;
}

// Configuration thresholds
const CONFIG = {
  // Battery thresholds
  CRITICAL_LOW: 10,      // Below this, must harvest
  LOW: 25,               // Should consider harvesting
  OPTIMAL_MIN: 40,       // Comfortable for battles
  OPTIMAL_MAX: 80,       // No need to harvest more
  FULL: 95,              // Fully charged

  // Gap thresholds (seconds)
  ATTACK_RANGE: 1.5,     // Within this gap, can attack
  DRS_RANGE: 1.0,        // DRS activation range
  BATTLE_RANGE: 2.0,     // Considered in battle
  SAFE_GAP: 3.0,         // Safe to harvest

  // Lap thresholds
  FINAL_LAPS: 5,         // End-race push window
  LAST_LAP: 1,           // All-out mode

  // Energy per lap estimates (% of battery)
  HARVEST_RATE: 15,      // Can harvest ~15% per lap
  DEPLOY_RATE: 25,       // Full deploy uses ~25% per lap
  BALANCED_RATE: 10,     // Balanced mode net usage
};

class ERSStrategyAdvisor {
  private lastAdvice: ERSAdvice | null = null;
  private adviceHistory: ERSAdvice[] = [];
  private lapBatteryHistory: Map<number, number> = new Map();

  /**
   * Generate ERS advice based on current telemetry and race context
   */
  generateAdvice(
    telemetry: TelemetryData,
    multiCarData: MultiCarTelemetryData | null,
    isInBattle: boolean = false
  ): ERSAdvice {
    const ersState = this.extractERSState(telemetry);
    const context = this.extractContext(telemetry, multiCarData, isInBattle);

    // Track battery history for trend analysis
    this.lapBatteryHistory.set(context.lap, ersState.currentPercent);

    // Generate advice based on situation priority
    const advice = this.analyzeAndRecommend(ersState, context);

    this.lastAdvice = advice;
    this.adviceHistory.push(advice);

    // Keep history manageable
    if (this.adviceHistory.length > 100) {
      this.adviceHistory = this.adviceHistory.slice(-50);
    }

    return advice;
  }

  private extractERSState(telemetry: TelemetryData): ERSState {
    // ers_store_energy is already normalized 0.0-1.0 (not raw joules)
    const ersPercent = telemetry.ers_store_percent ??
      (telemetry.ers_store_energy * 100);

    return {
      currentPercent: Math.min(100, Math.max(0, ersPercent)),
      deployMode: (telemetry.ers_deploy_mode || 0) as ERSMode,
      harvestedThisLap: (telemetry as any).ers_harvested_this_lap || 0,
      deployedThisLap: (telemetry as any).ers_deployed_this_lap || 0,
      netEnergyThisLap: 0, // Will calculate
    };
  }

  private extractContext(
    telemetry: TelemetryData,
    multiCarData: MultiCarTelemetryData | null,
    isInBattle: boolean
  ): ERSContext {
    const position = telemetry.position || 1;
    const totalLaps = telemetry.total_laps || 0;
    const currentLap = telemetry.current_lap_num || 1;

    // Extract gaps from multi-car data or telemetry
    let gapAhead = 99;
    let gapBehind = 99;

    if (multiCarData?.cars) {
      const playerCar = multiCarData.cars.find(c => c.is_player);
      if (playerCar) {
        gapAhead = playerCar.gap_to_leader ?? 99;
      }

      // Find car directly behind
      const carBehind = multiCarData.cars.find(c => c.position === position + 1);
      if (carBehind && playerCar) {
        gapBehind = Math.abs((carBehind.gap_to_leader ?? 0) - (playerCar.gap_to_leader ?? 0));
      }

      // Find car directly ahead
      const carAhead = multiCarData.cars.find(c => c.position === position - 1);
      if (carAhead && playerCar) {
        gapAhead = Math.abs((playerCar.gap_to_leader ?? 0) - (carAhead.gap_to_leader ?? 0));
      }
    }

    // Fallback to telemetry gaps if available (via atlas_ai or direct properties)
    const atlasAI = (telemetry as any).atlas_ai;
    if (atlasAI?.opponent_ahead_1?.gap_seconds !== undefined) {
      gapAhead = atlasAI.opponent_ahead_1.gap_seconds;
    }
    if (atlasAI?.opponent_behind_1?.gap_seconds !== undefined) {
      gapBehind = atlasAI.opponent_behind_1.gap_seconds;
    }

    return {
      lap: currentLap,
      totalLaps,
      position,
      gapAhead,
      gapBehind,
      drsAvailable: telemetry.drs_allowed === 1,
      inDrsZone: (telemetry.drs_open ?? 0) === 1,
      sector: telemetry.current_sector || 1,
      isInBattle,
      safetyCarActive: (telemetry.safety_car_status || 0) > 0,
    };
  }

  private analyzeAndRecommend(state: ERSState, context: ERSContext): ERSAdvice {
    // Priority 1: Safety car - always harvest
    if (context.safetyCarActive) {
      return {
        recommendation: 'HARVEST',
        suggestedMode: ERS_MODES.NONE,
        reason: 'Safety car active - maximize battery recovery',
        priority: 'high',
        batteryTarget: CONFIG.FULL,
      };
    }

    // Priority 2: Critical low battery
    if (state.currentPercent < CONFIG.CRITICAL_LOW) {
      return {
        recommendation: 'HARVEST',
        suggestedMode: ERS_MODES.NONE,
        reason: `Battery critical (${state.currentPercent.toFixed(0)}%) - must recover energy`,
        priority: 'critical',
        batteryTarget: CONFIG.LOW,
      };
    }

    // Priority 3: Last lap - deploy everything
    if (context.totalLaps > 0 && context.lap >= context.totalLaps) {
      return {
        recommendation: 'ATTACK',
        suggestedMode: ERS_MODES.OVERTAKE,
        reason: 'Final lap - use all remaining battery!',
        priority: 'critical',
      };
    }

    // Priority 4: Under immediate attack
    if (context.gapBehind < CONFIG.DRS_RANGE && context.isInBattle) {
      if (state.currentPercent >= CONFIG.LOW) {
        return {
          recommendation: 'DEFEND',
          suggestedMode: ERS_MODES.OVERTAKE,
          reason: `Under attack! Car behind at ${context.gapBehind.toFixed(1)}s`,
          priority: 'critical',
        };
      } else {
        return {
          recommendation: 'BALANCED',
          suggestedMode: ERS_MODES.MEDIUM,
          reason: `Under attack but battery low (${state.currentPercent.toFixed(0)}%) - defend wisely`,
          priority: 'high',
        };
      }
    }

    // Priority 5: Attack opportunity
    if (context.gapAhead < CONFIG.ATTACK_RANGE && context.position > 1) {
      if (state.currentPercent >= CONFIG.OPTIMAL_MIN) {
        const canUseDRS = context.drsAvailable || context.inDrsZone;
        return {
          recommendation: 'ATTACK',
          suggestedMode: ERS_MODES.OVERTAKE,
          reason: canUseDRS
            ? `Attack with DRS! Gap ${context.gapAhead.toFixed(1)}s`
            : `Close gap for attack - ${context.gapAhead.toFixed(1)}s ahead`,
          priority: 'high',
        };
      } else {
        // Save for the right moment
        return {
          recommendation: 'SAVE',
          suggestedMode: ERS_MODES.MEDIUM,
          reason: `Building charge for attack - target ${CONFIG.OPTIMAL_MIN}%`,
          priority: 'medium',
          batteryTarget: CONFIG.OPTIMAL_MIN,
          lapsToOpportunity: 1,
        };
      }
    }

    // Priority 6: Final laps strategy
    const lapsRemaining = context.totalLaps > 0 ? context.totalLaps - context.lap : 99;
    if (lapsRemaining <= CONFIG.FINAL_LAPS && lapsRemaining > 1) {
      const energyNeeded = lapsRemaining * CONFIG.DEPLOY_RATE;

      if (state.currentPercent >= energyNeeded) {
        return {
          recommendation: 'DEPLOY',
          suggestedMode: ERS_MODES.HOTLAP,
          reason: `${lapsRemaining} laps to go - push hard! (${state.currentPercent.toFixed(0)}% available)`,
          priority: 'medium',
        };
      } else {
        return {
          recommendation: 'BALANCED',
          suggestedMode: ERS_MODES.MEDIUM,
          reason: `Managing battery for ${lapsRemaining} laps - avoid running empty`,
          priority: 'medium',
          batteryTarget: Math.min(energyNeeded, CONFIG.OPTIMAL_MAX),
        };
      }
    }

    // Priority 7: In battle but not immediate threat
    if (context.isInBattle) {
      if (state.currentPercent >= CONFIG.OPTIMAL_MIN) {
        return {
          recommendation: 'DEPLOY',
          suggestedMode: ERS_MODES.HOTLAP,
          reason: 'Battle mode - maintain pressure',
          priority: 'medium',
        };
      } else {
        return {
          recommendation: 'BALANCED',
          suggestedMode: ERS_MODES.MEDIUM,
          reason: `Building charge during battle (${state.currentPercent.toFixed(0)}%)`,
          priority: 'medium',
          batteryTarget: CONFIG.OPTIMAL_MIN,
        };
      }
    }

    // Priority 8: Safe gap - opportunity to harvest
    if (context.gapAhead > CONFIG.SAFE_GAP && context.gapBehind > CONFIG.SAFE_GAP) {
      if (state.currentPercent < CONFIG.OPTIMAL_MAX) {
        return {
          recommendation: 'HARVEST',
          suggestedMode: ERS_MODES.NONE,
          reason: `Safe gaps - harvesting to ${CONFIG.OPTIMAL_MAX}%`,
          priority: 'low',
          batteryTarget: CONFIG.OPTIMAL_MAX,
        };
      }
    }

    // Priority 9: Check if upcoming battle opportunity
    if (context.gapAhead < CONFIG.BATTLE_RANGE && context.gapAhead > CONFIG.ATTACK_RANGE) {
      const lapsToClose = context.gapAhead / 0.3; // Assume ~0.3s gain per lap when pushing

      if (state.currentPercent < CONFIG.OPTIMAL_MIN) {
        return {
          recommendation: 'SAVE',
          suggestedMode: ERS_MODES.MEDIUM,
          reason: `Car ahead in ${context.gapAhead.toFixed(1)}s - saving for attack`,
          priority: 'medium',
          batteryTarget: CONFIG.OPTIMAL_MIN,
          lapsToOpportunity: Math.ceil(lapsToClose),
        };
      }
    }

    // Default: Balanced operation
    if (state.currentPercent < CONFIG.OPTIMAL_MIN) {
      return {
        recommendation: 'BALANCED',
        suggestedMode: ERS_MODES.MEDIUM,
        reason: 'Normal running - building optimal charge',
        priority: 'low',
        batteryTarget: CONFIG.OPTIMAL_MIN,
      };
    }

    if (state.currentPercent > CONFIG.OPTIMAL_MAX) {
      return {
        recommendation: 'DEPLOY',
        suggestedMode: ERS_MODES.HOTLAP,
        reason: 'Battery full - using excess energy',
        priority: 'low',
      };
    }

    return {
      recommendation: 'BALANCED',
      suggestedMode: ERS_MODES.MEDIUM,
      reason: 'Optimal battery level - balanced deployment',
      priority: 'low',
    };
  }

  /**
   * Get battery trend over recent laps
   */
  getBatteryTrend(): 'charging' | 'depleting' | 'stable' {
    const entries = Array.from(this.lapBatteryHistory.entries())
      .sort((a, b) => a[0] - b[0])
      .slice(-5);

    if (entries.length < 2) return 'stable';

    const firstPercent = entries[0][1];
    const lastPercent = entries[entries.length - 1][1];
    const delta = lastPercent - firstPercent;

    if (delta > 5) return 'charging';
    if (delta < -5) return 'depleting';
    return 'stable';
  }

  /**
   * Estimate laps until battery depleted at current rate
   */
  estimateLapsRemaining(currentPercent: number): number {
    const trend = this.getBatteryTrend();

    if (trend === 'charging' || trend === 'stable') {
      return 99; // Not depleting
    }

    const entries = Array.from(this.lapBatteryHistory.entries())
      .sort((a, b) => a[0] - b[0])
      .slice(-5);

    if (entries.length < 2) return 99;

    const firstPercent = entries[0][1];
    const lastPercent = entries[entries.length - 1][1];
    const laps = entries.length - 1;
    const ratePerLap = (firstPercent - lastPercent) / laps;

    if (ratePerLap <= 0) return 99;

    return Math.floor(currentPercent / ratePerLap);
  }

  /**
   * Get suggested mode name for display
   */
  static getModeDisplayName(mode: ERSMode): string {
    switch (mode) {
      case ERS_MODES.NONE: return 'HARVEST';
      case ERS_MODES.MEDIUM: return 'BALANCED';
      case ERS_MODES.HOTLAP: return 'HIGH';
      case ERS_MODES.OVERTAKE: return 'OVERTAKE';
      default: return 'UNKNOWN';
    }
  }

  /**
   * Get recommendation color for UI
   */
  static getRecommendationColor(rec: ERSRecommendation): string {
    switch (rec) {
      case 'HARVEST': return 'text-green-400';
      case 'BALANCED': return 'text-blue-400';
      case 'DEPLOY': return 'text-yellow-400';
      case 'SAVE': return 'text-orange-400';
      case 'ATTACK': return 'text-red-400';
      case 'DEFEND': return 'text-purple-400';
      default: return 'text-gray-400';
    }
  }

  /**
   * Get priority badge color
   */
  static getPriorityColor(priority: ERSAdvice['priority']): string {
    switch (priority) {
      case 'critical': return 'bg-red-500/20 text-red-400 border-red-500/50';
      case 'high': return 'bg-orange-500/20 text-orange-400 border-orange-500/50';
      case 'medium': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
      case 'low': return 'bg-slate-500/20 text-slate-400 border-slate-500/50';
      default: return 'bg-slate-500/20 text-slate-400 border-slate-500/50';
    }
  }

  /**
   * Reset advisor state (e.g., on session change)
   */
  reset(): void {
    this.lastAdvice = null;
    this.adviceHistory = [];
    this.lapBatteryHistory.clear();
  }

  /**
   * Get the last generated advice
   */
  getLastAdvice(): ERSAdvice | null {
    return this.lastAdvice;
  }
}

// Singleton instance
let ersAdvisorInstance: ERSStrategyAdvisor | null = null;

export function getERSAdvisor(): ERSStrategyAdvisor {
  if (!ersAdvisorInstance) {
    ersAdvisorInstance = new ERSStrategyAdvisor();
  }
  return ersAdvisorInstance;
}

export function resetERSAdvisor(): void {
  if (ersAdvisorInstance) {
    ersAdvisorInstance.reset();
  }
}

export { ERSStrategyAdvisor };
