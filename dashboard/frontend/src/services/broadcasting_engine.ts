/**
 * Broadcasting Rules Engine
 *
 * Manages AI Race Engineer broadcasts with intelligent rules:
 * - Lap 1 suppression (too chaotic)
 * - Battle detection with 1s exit threshold
 * - Overtake anti-spam batching
 * - Gap reporting (when not battling)
 * - Priority-based message queue
 * - Safety car handling
 * - Weather transition alerts
 * - Fuel/tyre critical warnings
 */

import type { TelemetryData, MultiCarTelemetryData } from '../types/telemetry';
import { getERSAdvisor, type ERSAdvice } from './ers_strategy';

// Broadcast message types
export type BroadcastType =
  | 'gap_report'
  | 'overtake'
  | 'position_loss'
  | 'drs_available'
  | 'battle_start'
  | 'battle_end'
  | 'pit_window'
  | 'pit_recommendation'
  | 'fuel_warning'
  | 'tyre_warning'
  | 'safety_car'
  | 'vsc'
  | 'sc_restart'
  | 'weather_change'
  | 'rain_incoming'
  | 'ers_advice'
  | 'fastest_lap'
  | 'final_laps';

export type BroadcastPriority = 'critical' | 'high' | 'medium' | 'low';

export interface Broadcast {
  id: string;
  type: BroadcastType;
  priority: BroadcastPriority;
  message: string;
  context: Record<string, any>;
  timestamp: number;
  lap: number;
}

interface BattleState {
  active: boolean;
  opponent: string | null;
  startLap: number;
  positionSwaps: number;
  lastSwapTime: number;
  gapAtStart: number;
}

interface OvertakeBuffer {
  positions: number[];
  drivers: string[];
  startTime: number;
  lastOvertakeTime: number;
}

interface CooldownTracker {
  [key: string]: number; // key -> timestamp of last broadcast
}

// Cooldown durations in milliseconds
const COOLDOWNS: Record<BroadcastType, number> = {
  gap_report: 60000,        // 1 minute between gap reports
  overtake: 5000,           // 5s between overtake reports (batched)
  position_loss: 5000,      // 5s between position loss reports
  drs_available: 30000,     // 30s between DRS alerts
  battle_start: 0,          // No cooldown - important event
  battle_end: 0,            // No cooldown - important event
  pit_window: 120000,       // 2 minutes between pit window updates
  pit_recommendation: 60000, // 1 minute between pit recommendations
  fuel_warning: 60000,      // 1 minute between fuel warnings
  tyre_warning: 60000,      // 1 minute between tyre warnings
  safety_car: 0,            // No cooldown - critical event
  vsc: 0,                   // No cooldown - critical event
  sc_restart: 0,            // No cooldown - critical event
  weather_change: 30000,    // 30s between weather updates
  rain_incoming: 120000,    // 2 minutes between rain warnings
  ers_advice: 90000,        // 90s between ERS advice (reduced spam)
  fastest_lap: 0,           // No cooldown - celebration event
  final_laps: 60000,        // 1 minute between final lap alerts
};

// Priority order for message queue
const PRIORITY_ORDER: Record<BroadcastPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

// Events that trigger LLM calls in research mode (strategic decisions)
// In research mode, only these events are emitted (everything else is suppressed)
const RESEARCH_TRIGGER_EVENTS: Set<BroadcastType> = new Set<BroadcastType>([
  'safety_car',
  'vsc',
  'sc_restart',
  'weather_change',
  'pit_window',
  'battle_start',
  'battle_end',
  'tyre_warning',
]);

export class BroadcastingEngine {
  private currentLap = 0;
  private lastPosition = 0;
  private battleState: BattleState = {
    active: false,
    opponent: null,
    startLap: 0,
    positionSwaps: 0,
    lastSwapTime: 0,
    gapAtStart: 0,
  };
  private overtakeBuffer: OvertakeBuffer = {
    positions: [],
    drivers: [],
    startTime: 0,
    lastOvertakeTime: 0,
  };
  private cooldowns: CooldownTracker = {};
  private messageQueue: Broadcast[] = [];
  private lastSafetyCarStatus = 0;
  private lastWeather = 0;
  private lastFuelWarningLap = 0;
  private lastTyreWarningLap = 0;
  private sessionStarted = false;

  // Research mode flag - when true, only emits strategic events
  private researchMode = false;

  // Configuration
  private readonly LAP1_SUPPRESSION = true;
  private readonly BATTLE_EXIT_GAP = 1.0; // seconds
  private readonly BATTLE_SWAP_WINDOW = 30000; // 30s for position swap detection
  private readonly OVERTAKE_BATCH_WINDOW = 3000; // 3s to batch overtakes
  private readonly FINAL_LAPS_THRESHOLD = 5;

  /**
   * Enable/disable research mode
   * When enabled, only strategic events (SC, rain, pit, battle, tyre) are emitted
   * Informational events (gap report, overtakes, ERS advice) are suppressed
   */
  setResearchMode(enabled: boolean): void {
    this.researchMode = enabled;
    console.log(`[BroadcastingEngine] Research mode: ${enabled ? 'ON' : 'OFF'}`);
  }

  isResearchMode(): boolean {
    return this.researchMode;
  }

  /**
   * Process telemetry and generate broadcasts
   */
  processTelemetry(
    telemetry: TelemetryData,
    multiCarData: MultiCarTelemetryData | null
  ): Broadcast[] {
    const now = Date.now();
    const broadcasts: Broadcast[] = [];

    // Track lap changes
    const newLap = telemetry.current_lap_num || 0;
    const lapChanged = newLap !== this.currentLap && newLap > 0;
    this.currentLap = newLap;

    // Session start detection
    if (!this.sessionStarted && this.currentLap >= 1) {
      this.sessionStarted = true;
    }

    // LAP 1 SUPPRESSION - Only allow critical broadcasts on lap 1
    const isLap1 = this.currentLap <= 1;

    // Get gap data
    const atlasAI = (telemetry as any).atlas_ai;
    const gapAhead = atlasAI?.opponent_ahead_1?.gap_seconds ?? null;
    const gapBehind = atlasAI?.opponent_behind_1?.gap_seconds ?? null;
    const opponentAhead = atlasAI?.opponent_ahead_1?.driver_name ?? null;
    const opponentBehind = atlasAI?.opponent_behind_1?.driver_name ?? null;
    const position = telemetry.position || 0;

    // === BATTLE DETECTION ===
    if (!isLap1 && gapAhead !== null) {
      this.updateBattleState(gapAhead, opponentAhead, position, now, broadcasts);
    }

    // === POSITION CHANGE DETECTION ===
    if (position !== this.lastPosition && this.lastPosition > 0) {
      const positionChange = this.lastPosition - position;
      if (positionChange > 0) {
        // Gained position(s)
        this.handleOvertake(positionChange, opponentAhead, now, isLap1, broadcasts);
      } else if (positionChange < 0 && !isLap1) {
        // Lost position(s)
        this.handlePositionLoss(Math.abs(positionChange), opponentBehind, now, broadcasts);
      }
    }
    this.lastPosition = position;

    // === LAP-START BROADCASTS (only on lap change, not lap 1) ===
    if (lapChanged && !isLap1 && !this.battleState.active) {
      // Gap report
      this.generateGapReport(gapAhead, gapBehind, opponentAhead, opponentBehind, position, broadcasts);
    }

    // === DRS DETECTION (not during battles) ===
    if (!isLap1 && !this.battleState.active && telemetry.drs_allowed === 1 && gapAhead !== null && gapAhead < 1.0) {
      this.generateDrsAlert(gapAhead, opponentAhead, now, broadcasts);
    }

    // === SAFETY CAR DETECTION ===
    const scStatus = telemetry.safety_car_status || 0;
    if (scStatus !== this.lastSafetyCarStatus) {
      this.handleSafetyCarChange(scStatus, this.lastSafetyCarStatus, broadcasts);
      this.lastSafetyCarStatus = scStatus;
    }

    // === WEATHER DETECTION ===
    const weather = telemetry.weather || 0;
    if (weather !== this.lastWeather && this.lastWeather !== undefined) {
      this.handleWeatherChange(weather, this.lastWeather, broadcasts);
      this.lastWeather = weather;
    } else {
      this.lastWeather = weather;
    }

    // === RAIN INCOMING DETECTION ===
    if (!isLap1) {
      this.checkRainForecast(telemetry, now, broadcasts);
    }

    // === FUEL WARNING ===
    if (!isLap1 && lapChanged) {
      this.checkFuelStatus(telemetry, broadcasts);
    }

    // === TYRE WARNING ===
    if (!isLap1 && lapChanged) {
      this.checkTyreStatus(telemetry, broadcasts);
    }

    // === PIT WINDOW ===
    if (!isLap1 && lapChanged) {
      this.checkPitWindow(telemetry, now, broadcasts);
    }

    // === ERS ADVICE ===
    if (!isLap1 && this.currentLap >= 2) {
      this.generateErsAdvice(telemetry, multiCarData, gapAhead, gapBehind, now, broadcasts);
    }

    // === FINAL LAPS ===
    if (!isLap1 && lapChanged) {
      this.checkFinalLaps(telemetry, now, broadcasts);
    }

    // Process overtake buffer (batch overtakes)
    this.processOvertakeBuffer(now, broadcasts);

    // Add broadcasts to queue and return sorted by priority
    for (const broadcast of broadcasts) {
      this.messageQueue.push(broadcast);
    }

    // Sort queue by priority and return all broadcasts
    this.messageQueue.sort((a, b) =>
      PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
    );

    let result = [...this.messageQueue];
    this.messageQueue = [];

    // In research mode, filter to only strategic events
    if (this.researchMode) {
      result = result.filter(b => RESEARCH_TRIGGER_EVENTS.has(b.type));
    }

    return result;
  }

  private updateBattleState(
    gapAhead: number,
    opponentAhead: string | null,
    position: number,
    now: number,
    broadcasts: Broadcast[]
  ) {
    const isInDrsRange = gapAhead < 1.0;
    const isInBattleRange = gapAhead < this.BATTLE_EXIT_GAP;

    if (this.battleState.active) {
      // Check for battle end
      if (gapAhead >= this.BATTLE_EXIT_GAP) {
        broadcasts.push({
          id: `battle_end_${now}`,
          type: 'battle_end',
          priority: 'medium',
          message: `Battle with ${this.battleState.opponent} ended. Gap now ${gapAhead.toFixed(1)}s.`,
          context: {
            opponent: this.battleState.opponent,
            gap: gapAhead,
            duration: this.currentLap - this.battleState.startLap,
            swaps: this.battleState.positionSwaps,
          },
          timestamp: now,
          lap: this.currentLap,
        });
        this.battleState = {
          active: false,
          opponent: null,
          startLap: 0,
          positionSwaps: 0,
          lastSwapTime: 0,
          gapAtStart: 0,
        };
      }
    } else {
      // Check for battle start - when in DRS range for sustained period
      if (isInDrsRange && opponentAhead) {
        // Start tracking potential battle
        if (!this.battleState.opponent || this.battleState.opponent !== opponentAhead) {
          this.battleState = {
            active: true,
            opponent: opponentAhead,
            startLap: this.currentLap,
            positionSwaps: 0,
            lastSwapTime: now,
            gapAtStart: gapAhead,
          };
          broadcasts.push({
            id: `battle_start_${now}`,
            type: 'battle_start',
            priority: 'high',
            message: `Battling ${opponentAhead}! Gap ${gapAhead.toFixed(2)}s. Focus on exits.`,
            context: {
              opponent: opponentAhead,
              gap: gapAhead,
            },
            timestamp: now,
            lap: this.currentLap,
          });
        }
      }
    }
  }

  private handleOvertake(
    positionsGained: number,
    driverOvertaken: string | null,
    now: number,
    isLap1: boolean,
    broadcasts: Broadcast[]
  ) {
    // During lap 1, only track but don't broadcast
    if (isLap1) return;

    // During battle, track swap but don't spam
    if (this.battleState.active) {
      this.battleState.positionSwaps++;
      this.battleState.lastSwapTime = now;
      return; // Don't broadcast individual overtakes during battle
    }

    // Add to overtake buffer for batching
    this.overtakeBuffer.positions.push(positionsGained);
    if (driverOvertaken) {
      this.overtakeBuffer.drivers.push(driverOvertaken);
    }

    if (this.overtakeBuffer.startTime === 0) {
      this.overtakeBuffer.startTime = now;
    }
    this.overtakeBuffer.lastOvertakeTime = now;
  }

  private processOvertakeBuffer(now: number, broadcasts: Broadcast[]) {
    // Check if we have buffered overtakes and enough time has passed
    if (this.overtakeBuffer.positions.length === 0) return;

    const timeSinceLastOvertake = now - this.overtakeBuffer.lastOvertakeTime;
    if (timeSinceLastOvertake < this.OVERTAKE_BATCH_WINDOW) return;

    // Batch the overtakes
    const totalPositions = this.overtakeBuffer.positions.reduce((a, b) => a + b, 0);
    const drivers = Array.from(new Set(this.overtakeBuffer.drivers)); // Unique drivers

    let message: string;
    if (totalPositions === 1) {
      message = drivers[0]
        ? `Overtook ${drivers[0]}. P${this.lastPosition}.`
        : `Gained one position. P${this.lastPosition}.`;
    } else {
      message = drivers.length > 0
        ? `Gained ${totalPositions} positions (${drivers.slice(0, 2).join(', ')}${drivers.length > 2 ? '...' : ''}). P${this.lastPosition}.`
        : `Gained ${totalPositions} positions. P${this.lastPosition}.`;
    }

    if (this.canBroadcast('overtake', now)) {
      broadcasts.push({
        id: `overtake_${now}`,
        type: 'overtake',
        priority: totalPositions >= 3 ? 'high' : 'medium',
        message,
        context: {
          positionsGained: totalPositions,
          drivers,
          newPosition: this.lastPosition,
        },
        timestamp: now,
        lap: this.currentLap,
      });
      this.cooldowns['overtake'] = now;
    }

    // Clear buffer
    this.overtakeBuffer = {
      positions: [],
      drivers: [],
      startTime: 0,
      lastOvertakeTime: 0,
    };
  }

  private handlePositionLoss(
    positionsLost: number,
    driverWhoOvertook: string | null,
    now: number,
    broadcasts: Broadcast[]
  ) {
    // During battle, just track
    if (this.battleState.active) {
      this.battleState.positionSwaps++;
      return;
    }

    if (this.canBroadcast('position_loss', now)) {
      const message = driverWhoOvertook
        ? `Lost ${positionsLost > 1 ? positionsLost + ' positions' : 'position'} to ${driverWhoOvertook}. P${this.lastPosition}.`
        : `Lost ${positionsLost > 1 ? positionsLost + ' positions' : 'position'}. P${this.lastPosition}.`;

      broadcasts.push({
        id: `position_loss_${now}`,
        type: 'position_loss',
        priority: 'medium',
        message,
        context: {
          positionsLost,
          driver: driverWhoOvertook,
          newPosition: this.lastPosition,
        },
        timestamp: now,
        lap: this.currentLap,
      });
      this.cooldowns['position_loss'] = now;
    }
  }

  private generateGapReport(
    gapAhead: number | null,
    gapBehind: number | null,
    opponentAhead: string | null,
    opponentBehind: string | null,
    position: number,
    broadcasts: Broadcast[]
  ) {
    const now = Date.now();
    if (!this.canBroadcast('gap_report', now)) return;

    let message = `Lap ${this.currentLap} start. P${position}.`;

    if (gapAhead !== null && opponentAhead) {
      message += ` ${opponentAhead} ahead by ${gapAhead.toFixed(2)}s.`;
    }
    if (gapBehind !== null && opponentBehind) {
      message += ` ${opponentBehind} behind by ${gapBehind.toFixed(2)}s.`;
    }

    broadcasts.push({
      id: `gap_report_${now}`,
      type: 'gap_report',
      priority: 'low',
      message,
      context: {
        position,
        gapAhead,
        gapBehind,
        opponentAhead,
        opponentBehind,
      },
      timestamp: now,
      lap: this.currentLap,
    });
    this.cooldowns['gap_report'] = now;
  }

  private generateDrsAlert(
    gapAhead: number,
    opponentAhead: string | null,
    now: number,
    broadcasts: Broadcast[]
  ) {
    if (!this.canBroadcast('drs_available', now)) return;

    broadcasts.push({
      id: `drs_${now}`,
      type: 'drs_available',
      priority: 'medium',
      message: `DRS available. ${opponentAhead || 'Car ahead'} ${gapAhead.toFixed(2)}s. Attack zones coming.`,
      context: {
        gap: gapAhead,
        opponent: opponentAhead,
      },
      timestamp: now,
      lap: this.currentLap,
    });
    this.cooldowns['drs_available'] = now;
  }

  private handleSafetyCarChange(newStatus: number, oldStatus: number, broadcasts: Broadcast[]) {
    const now = Date.now();

    if (newStatus === 1 && oldStatus !== 1) {
      // Full SC deployed
      broadcasts.push({
        id: `sc_${now}`,
        type: 'safety_car',
        priority: 'critical',
        message: 'SAFETY CAR deployed. Close up, save fuel. Pit window opportunity.',
        context: { status: 'full_sc' },
        timestamp: now,
        lap: this.currentLap,
      });
    } else if (newStatus === 2 && oldStatus !== 2) {
      // VSC deployed
      broadcasts.push({
        id: `vsc_${now}`,
        type: 'vsc',
        priority: 'critical',
        message: 'VIRTUAL SAFETY CAR. Maintain delta. Potential pit opportunity.',
        context: { status: 'vsc' },
        timestamp: now,
        lap: this.currentLap,
      });
    } else if (newStatus === 0 && (oldStatus === 1 || oldStatus === 2)) {
      // SC/VSC ending
      broadcasts.push({
        id: `sc_restart_${now}`,
        type: 'sc_restart',
        priority: 'critical',
        message: 'GOING GREEN! Safety car in. Prepare for restart. Full attack.',
        context: { previousStatus: oldStatus === 1 ? 'full_sc' : 'vsc' },
        timestamp: now,
        lap: this.currentLap,
      });
    }
  }

  private handleWeatherChange(newWeather: number, oldWeather: number, broadcasts: Broadcast[]) {
    const now = Date.now();
    const weatherNames = ['Clear', 'Light Cloud', 'Overcast', 'Light Rain', 'Heavy Rain', 'Storm'];

    // Only broadcast significant changes
    if (Math.abs(newWeather - oldWeather) < 2 && newWeather < 3) return;

    let priority: BroadcastPriority = 'medium';
    let message: string;

    if (newWeather >= 3 && oldWeather < 3) {
      // Rain starting
      priority = 'critical';
      message = `RAIN STARTING! ${weatherNames[newWeather]}. Consider inters/wets.`;
    } else if (newWeather < 3 && oldWeather >= 3) {
      // Rain stopping
      priority = 'high';
      message = `Track drying. ${weatherNames[newWeather]}. Monitor for dry switch.`;
    } else {
      message = `Weather change: ${weatherNames[newWeather]}.`;
    }

    broadcasts.push({
      id: `weather_${now}`,
      type: 'weather_change',
      priority,
      message,
      context: {
        newWeather,
        oldWeather,
        weatherName: weatherNames[newWeather],
      },
      timestamp: now,
      lap: this.currentLap,
    });
  }

  private checkRainForecast(telemetry: TelemetryData, now: number, broadcasts: Broadcast[]) {
    // This would check weather forecast samples for incoming rain
    // For now, we'll use a simplified approach based on session data
    if (!this.canBroadcast('rain_incoming', now)) return;

    // Would need weather_forecast_samples from backend
    // Placeholder for rain detection logic
  }

  private checkFuelStatus(telemetry: TelemetryData, broadcasts: Broadcast[]) {
    // fuel_remaining_laps in F1 games = fuel MARGIN (extra laps in hand)
    // +2.7 means 2.7 extra laps of fuel beyond what's needed to finish
    // 0 means exactly enough, negative means deficit
    const fuelMargin = telemetry.fuel_remaining_laps ?? 0;
    const now = Date.now();

    if (fuelMargin < 1.0 && this.lastFuelWarningLap !== this.currentLap) {
      const isCritical = fuelMargin < 0;
      const isUrgent = fuelMargin < 0.5;
      broadcasts.push({
        id: `fuel_${now}`,
        type: 'fuel_warning',
        priority: isCritical ? 'critical' : isUrgent ? 'high' : 'medium',
        message: isCritical
          ? `FUEL DEFICIT! ${Math.abs(fuelMargin).toFixed(1)} laps short. Lift and coast NOW.`
          : `Fuel margin low: +${fuelMargin.toFixed(1)} laps in hand. Manage consumption.`,
        context: {
          fuelMargin,
          lapsRemaining: (telemetry.total_laps || 0) - this.currentLap,
        },
        timestamp: now,
        lap: this.currentLap,
      });
      this.lastFuelWarningLap = this.currentLap;
    }
  }

  private checkTyreStatus(telemetry: TelemetryData, broadcasts: Broadcast[]) {
    const maxWear = Math.max(...(telemetry.tire_wear || [0, 0, 0, 0]));
    const now = Date.now();

    if (maxWear > 70 && this.lastTyreWarningLap !== this.currentLap) {
      broadcasts.push({
        id: `tyre_${now}`,
        type: 'tyre_warning',
        priority: maxWear > 85 ? 'critical' : 'high',
        message: `TYRE WEAR ${maxWear.toFixed(0)}%. ${maxWear > 85 ? 'Critical - pit soon!' : 'Monitor closely.'}`,
        context: {
          wear: maxWear,
          compound: telemetry.tire_compound,
        },
        timestamp: now,
        lap: this.currentLap,
      });
      this.lastTyreWarningLap = this.currentLap;
    }
  }

  private checkPitWindow(telemetry: TelemetryData, now: number, broadcasts: Broadcast[]) {
    if (!this.canBroadcast('pit_window', now)) return;

    const idealLap = telemetry.pit_window_ideal_lap || 0;
    const latestLap = telemetry.pit_window_latest_lap || 0;

    if (idealLap > 0) {
      const lapsToWindow = idealLap - this.currentLap;

      if (lapsToWindow === 2) {
        broadcasts.push({
          id: `pit_window_${now}`,
          type: 'pit_window',
          priority: 'high',
          message: `Pit window in 2 laps. Ideal lap ${idealLap}, latest ${latestLap}. Prepare strategy.`,
          context: {
            idealLap,
            latestLap,
            currentLap: this.currentLap,
          },
          timestamp: now,
          lap: this.currentLap,
        });
        this.cooldowns['pit_window'] = now;
      } else if (lapsToWindow <= 0 && this.currentLap <= latestLap) {
        broadcasts.push({
          id: `pit_window_${now}`,
          type: 'pit_window',
          priority: 'high',
          message: `IN PIT WINDOW. Lap ${idealLap}-${latestLap}. Ready to box.`,
          context: {
            idealLap,
            latestLap,
            currentLap: this.currentLap,
          },
          timestamp: now,
          lap: this.currentLap,
        });
        this.cooldowns['pit_window'] = now;
      }
    }
  }

  private generateErsAdvice(
    telemetry: TelemetryData,
    multiCarData: MultiCarTelemetryData | null,
    gapAhead: number | null,
    gapBehind: number | null,
    now: number,
    broadcasts: Broadcast[]
  ) {
    if (!this.canBroadcast('ers_advice', now)) return;

    // Use the ERS Strategy Advisor for intelligent recommendations
    const ersAdvisor = getERSAdvisor();
    const ersAdvice: ERSAdvice = ersAdvisor.generateAdvice(
      telemetry,
      multiCarData,
      this.battleState.active
    );

    // Only broadcast high priority or critical recommendations
    if (ersAdvice.priority === 'low') return;

    // Skip redundant ERS advice during active battles (battle_start already covers it)
    if (this.battleState.active && ersAdvice.priority !== 'critical') return;

    const ersPercent = (telemetry.ers_store_energy || 0) / 4000000 * 100;
    const ersMode = telemetry.ers_deploy_mode || 0;

    // Map ERS advice priority to broadcast priority
    const broadcastPriority: BroadcastPriority =
      ersAdvice.priority === 'critical' ? 'high' :
      ersAdvice.priority === 'high' ? 'medium' : 'low';

    // Format message based on recommendation type
    let message = ersAdvice.reason;

    // Add action suggestions for specific recommendations
    switch (ersAdvice.recommendation) {
      case 'ATTACK':
        message = `ERS ATTACK: ${ersAdvice.reason}`;
        break;
      case 'DEFEND':
        message = `ERS DEFEND: ${ersAdvice.reason}`;
        break;
      case 'HARVEST':
        message = `ERS HARVEST: ${ersAdvice.reason}`;
        break;
      case 'SAVE':
        message = `ERS SAVE: ${ersAdvice.reason}`;
        break;
      default:
        // Keep the reason as-is for BALANCED and DEPLOY
        break;
    }

    broadcasts.push({
      id: `ers_${now}`,
      type: 'ers_advice',
      priority: broadcastPriority,
      message,
      context: {
        ersPercent,
        ersMode,
        gapAhead,
        gapBehind,
        recommendation: ersAdvice.recommendation,
        suggestedMode: ersAdvice.suggestedMode,
        batteryTarget: ersAdvice.batteryTarget,
        lapsToOpportunity: ersAdvice.lapsToOpportunity,
      },
      timestamp: now,
      lap: this.currentLap,
    });
    this.cooldowns['ers_advice'] = now;
  }

  private checkFinalLaps(telemetry: TelemetryData, now: number, broadcasts: Broadcast[]) {
    if (!this.canBroadcast('final_laps', now)) return;

    const totalLaps = telemetry.total_laps || 0;
    const lapsRemaining = totalLaps - this.currentLap;

    if (lapsRemaining === this.FINAL_LAPS_THRESHOLD) {
      broadcasts.push({
        id: `final_laps_${now}`,
        type: 'final_laps',
        priority: 'high',
        message: `${lapsRemaining} LAPS TO GO. Push now. Everything you've got.`,
        context: {
          lapsRemaining,
          position: this.lastPosition,
        },
        timestamp: now,
        lap: this.currentLap,
      });
      this.cooldowns['final_laps'] = now;
    } else if (lapsRemaining === 1) {
      broadcasts.push({
        id: `final_lap_${now}`,
        type: 'final_laps',
        priority: 'critical',
        message: 'FINAL LAP! This is it. Full send.',
        context: {
          lapsRemaining: 1,
          position: this.lastPosition,
        },
        timestamp: now,
        lap: this.currentLap,
      });
      this.cooldowns['final_laps'] = now;
    }
  }

  private canBroadcast(type: BroadcastType, now: number): boolean {
    const lastBroadcast = this.cooldowns[type] || 0;
    const cooldown = COOLDOWNS[type];
    return now - lastBroadcast >= cooldown;
  }

  /**
   * Reset engine state (for new session)
   */
  reset() {
    this.currentLap = 0;
    this.lastPosition = 0;
    this.battleState = {
      active: false,
      opponent: null,
      startLap: 0,
      positionSwaps: 0,
      lastSwapTime: 0,
      gapAtStart: 0,
    };
    this.overtakeBuffer = {
      positions: [],
      drivers: [],
      startTime: 0,
      lastOvertakeTime: 0,
    };
    this.cooldowns = {};
    this.messageQueue = [];
    this.lastSafetyCarStatus = 0;
    this.lastWeather = 0;
    this.lastFuelWarningLap = 0;
    this.lastTyreWarningLap = 0;
    this.sessionStarted = false;
    // Note: researchMode is NOT reset here - it persists across sessions
  }

  /**
   * Get current battle state (for UI)
   */
  getBattleState(): BattleState {
    return { ...this.battleState };
  }

  /**
   * Check if currently in a battle
   */
  isInBattle(): boolean {
    return this.battleState.active;
  }
}

// Singleton instance
let engineInstance: BroadcastingEngine | null = null;

export function getBroadcastingEngine(): BroadcastingEngine {
  if (!engineInstance) {
    engineInstance = new BroadcastingEngine();
  }
  return engineInstance;
}

export function resetBroadcastingEngine(): void {
  if (engineInstance) {
    engineInstance.reset();
  }
}
