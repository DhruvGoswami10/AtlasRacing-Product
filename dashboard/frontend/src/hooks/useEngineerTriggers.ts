/**
 * useEngineerTriggers - Generate proactive race engineer triggers from telemetry
 *
 * Triggers based on well-defined decision points:
 * - Tire wear thresholds (caution/critical)
 * - Pit window events (opening/optimal/closing)
 * - Gap changes (overtake opportunity, undercut threat)
 * - Position changes
 * - Safety car / flag changes
 * - Weather changes
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { TriggerEvent } from './useMLPredictions';
import type { MultiCarTelemetryData } from '../types/telemetry';
import type { LivePitStrategyResult } from './useLivePitStrategy';

// ============================================================================
// Types
// ============================================================================

interface TriggerState {
  // Lap tracking for cooldowns
  lastTireWarnLap: number;
  lastTireCriticalLap: number;
  lastPitWindowOpenLap: number;
  lastPitWindowOptimalLap: number;
  lastGapChangeLap: number;
  lastOvertakeOpportunityLap: number;
  lastUndercutWarningLap: number;
  lastPositionChangeLap: number;
  lastSafetyCarLap: number;
  lastWeatherChangeLap: number;
  lastRaceStartLap: number;      // Track race_start trigger (fires once on lap 2)
  lastERSUpdateLap: number;      // Track ers_update trigger (fires every 2 laps)

  // State tracking for change detection
  lastPosition: number;
  lastGapAhead: number | null;
  lastGapBehind: number | null;
  lastSafetyCarStatus: string;
  lastWeather: string;
  lastPitWindowStatus: string;

  // Session state
  sessionStarted: boolean;
  lastLapProcessed: number;
}

export interface UseEngineerTriggersOptions {
  enabled?: boolean;
  minLapForTriggers?: number;           // Don't trigger before this lap (default: 2)
  tireCautionThreshold?: number;        // Tire wear % for caution (default: 45)
  tireCriticalThreshold?: number;       // Tire wear % for critical (default: 70)
  gapChangeThreshold?: number;          // Gap change for undercut warning (default: 0.5s)
  drsGapThreshold?: number;             // Gap for overtake opportunity (default: 1.0s)
  significantGapChange?: number;        // Gap change to trigger alert (default: 3.0s)
}

const DEFAULT_OPTIONS: Required<UseEngineerTriggersOptions> = {
  enabled: true,
  minLapForTriggers: 2,                 // No triggers on lap 1
  tireCautionThreshold: 45,
  tireCriticalThreshold: 70,
  gapChangeThreshold: 0.5,
  drsGapThreshold: 1.0,
  significantGapChange: 3.0,
};

// Cooldown periods (in laps) between same trigger type
const COOLDOWNS = {
  tire_warning: 5,
  tire_critical: 3,
  pit_window_open: 999,    // Only fire once per pit window
  pit_window_optimal: 999, // Only fire once
  overtake_opportunity: 3,
  undercut_threat: 4,
  position_change: 1,
  gap_change: 2,
  safety_car: 1,
  weather_change: 999,     // Only fire once per weather change
  race_start: 999,         // Only fire once per race (on lap 2)
  ers_update: 2,           // Fire every 2 laps (lap 3, 5, 7, ...)
};

// ============================================================================
// Helper Functions
// ============================================================================

function extractTireData(telemetry: Record<string, unknown>): {
  maxWear: number;
  avgWear: number;
  tireAge: number;
  compound: string;
  wearByWheel: { fl: number; fr: number; rl: number; rr: number };
} {
  const tireWear = telemetry.tire_wear as number[] | undefined;

  // Handle both array formats and individual fields
  let fl = 0, fr = 0, rl = 0, rr = 0;

  if (Array.isArray(tireWear) && tireWear.length >= 4) {
    // F1 24 format: [RL, RR, FL, FR] - already handled in telemetry normalization
    // After normalization should be [FL, FR, RL, RR]
    [fl, fr, rl, rr] = tireWear;
  } else {
    // Try individual fields
    fl = (telemetry.tire_wear_fl as number) ?? (telemetry.tireWearFL as number) ?? 0;
    fr = (telemetry.tire_wear_fr as number) ?? (telemetry.tireWearFR as number) ?? 0;
    rl = (telemetry.tire_wear_rl as number) ?? (telemetry.tireWearRL as number) ?? 0;
    rr = (telemetry.tire_wear_rr as number) ?? (telemetry.tireWearRR as number) ?? 0;
  }

  const maxWear = Math.max(fl, fr, rl, rr);
  const avgWear = (fl + fr + rl + rr) / 4;
  const tireAge = (telemetry.tire_age_laps as number) ?? (telemetry.tireAge as number) ?? 0;
  const compound = (telemetry.tire_compound as string) ?? (telemetry.tireCompound as string) ?? 'medium';

  return {
    maxWear,
    avgWear,
    tireAge,
    compound,
    wearByWheel: { fl, fr, rl, rr },
  };
}

function extractGapData(
  telemetry: Record<string, unknown>,
  multiCarData: MultiCarTelemetryData | null
): {
  gapAhead: number | null;
  gapBehind: number | null;
  opponentAhead: string | null;
  opponentBehind: string | null;
  opponentAheadTireAge: number | null;
  opponentBehindTireAge: number | null;
} {
  let gapAhead: number | null = null;
  let gapBehind: number | null = null;
  let opponentAhead: string | null = null;
  let opponentBehind: string | null = null;
  let opponentAheadTireAge: number | null = null;
  let opponentBehindTireAge: number | null = null;

  if (multiCarData?.cars) {
    const sortedCars = [...multiCarData.cars]
      .filter(c => c.position > 0)
      .sort((a, b) => a.position - b.position);

    const playerIdx = sortedCars.findIndex(c => c.is_player === 1);
    if (playerIdx !== -1) {
      if (playerIdx > 0) {
        const carAhead = sortedCars[playerIdx - 1];
        gapAhead = sortedCars[playerIdx].gap_to_car_ahead ?? null;
        opponentAhead = carAhead.driver_name ?? null;
        opponentAheadTireAge = carAhead.tyre_age ?? null;
      }
      if (playerIdx < sortedCars.length - 1) {
        const carBehind = sortedCars[playerIdx + 1];
        gapBehind = carBehind.gap_to_car_ahead ?? null;
        opponentBehind = carBehind.driver_name ?? null;
        opponentBehindTireAge = carBehind.tyre_age ?? null;
      }
    }
  }

  return {
    gapAhead,
    gapBehind,
    opponentAhead,
    opponentBehind,
    opponentAheadTireAge,
    opponentBehindTireAge,
  };
}

// ============================================================================
// Hook
// ============================================================================

export function useEngineerTriggers(
  telemetry: Record<string, unknown> | null,
  multiCarData: MultiCarTelemetryData | null,
  strategy: LivePitStrategyResult | null,
  options: UseEngineerTriggersOptions = {}
): TriggerEvent[] {
  const opts = useMemo(() => ({ ...DEFAULT_OPTIONS, ...options }), [options]);
  const [triggers, setTriggers] = useState<TriggerEvent[]>([]);

  const stateRef = useRef<TriggerState>({
    lastTireWarnLap: -100,
    lastTireCriticalLap: -100,
    lastPitWindowOpenLap: -100,
    lastPitWindowOptimalLap: -100,
    lastGapChangeLap: -100,
    lastOvertakeOpportunityLap: -100,
    lastUndercutWarningLap: -100,
    lastPositionChangeLap: -100,
    lastSafetyCarLap: -100,
    lastWeatherChangeLap: -100,
    lastRaceStartLap: -100,
    lastERSUpdateLap: -100,
    lastPosition: 0,
    lastGapAhead: null,
    lastGapBehind: null,
    lastSafetyCarStatus: 'none',
    lastWeather: 'dry',
    lastPitWindowStatus: 'none',
    sessionStarted: false,
    lastLapProcessed: 0,
  });

  const addTrigger = useCallback((trigger: Omit<TriggerEvent, 'cooldown_key'>) => {
    const fullTrigger: TriggerEvent = {
      ...trigger,
      cooldown_key: `${trigger.type}-${Date.now()}`,
    };
    setTriggers(prev => [fullTrigger, ...prev.slice(0, 29)]); // Keep last 30
    console.log(`[Trigger] ${trigger.type}: ${trigger.message_hint}`);
  }, []);

  // Reset state when session changes
  const resetState = useCallback(() => {
    stateRef.current = {
      lastTireWarnLap: -100,
      lastTireCriticalLap: -100,
      lastPitWindowOpenLap: -100,
      lastPitWindowOptimalLap: -100,
      lastGapChangeLap: -100,
      lastOvertakeOpportunityLap: -100,
      lastUndercutWarningLap: -100,
      lastPositionChangeLap: -100,
      lastSafetyCarLap: -100,
      lastWeatherChangeLap: -100,
      lastRaceStartLap: -100,
      lastERSUpdateLap: -100,
      lastPosition: 0,
      lastGapAhead: null,
      lastGapBehind: null,
      lastSafetyCarStatus: 'none',
      lastWeather: 'dry',
      lastPitWindowStatus: 'none',
      sessionStarted: false,
      lastLapProcessed: 0,
    };
    setTriggers([]);
  }, []);

  useEffect(() => {
    if (!opts.enabled || !telemetry) return;

    const state = stateRef.current;
    const currentLap = (telemetry.current_lap_num as number) ?? (telemetry.currentLapNum as number) ?? 1;
    const totalLaps = (telemetry.total_laps as number) ?? (telemetry.totalLaps as number) ?? 50;

    // Detect session reset (lap went backwards significantly)
    if (state.sessionStarted && currentLap < state.lastLapProcessed - 5) {
      resetState();
      return;
    }

    state.sessionStarted = true;
    state.lastLapProcessed = currentLap;

    // Don't fire triggers before minimum lap (avoids lap 1 spam)
    if (currentLap < opts.minLapForTriggers) {
      // Still track state for later
      const position = (telemetry.position as number) ?? 1;
      const gaps = extractGapData(telemetry, multiCarData);
      state.lastPosition = position;
      state.lastGapAhead = gaps.gapAhead;
      state.lastGapBehind = gaps.gapBehind;
      return;
    }

    // Extract data
    const tireData = extractTireData(telemetry);
    const position = (telemetry.position as number) ?? 1;
    const gaps = extractGapData(telemetry, multiCarData);
    const safetyCarStatus = (telemetry.safety_car_status as string) ??
      ((telemetry.safety_car_status as number) > 0 ? 'active' : 'none');
    const weather = strategy?.weather.current ?? 'dry';
    const pitWindowStatus = strategy?.pitWindowStatus ?? 'none';

    // ========================================================================
    // TRIGGER 1: Tire Caution Warning (45-70% wear)
    // Decision Point: Tires degrading, may need to plan pit soon
    // ========================================================================
    if (tireData.maxWear >= opts.tireCautionThreshold && tireData.maxWear < opts.tireCriticalThreshold) {
      if (currentLap - state.lastTireWarnLap >= COOLDOWNS.tire_warning) {
        addTrigger({
          type: 'tire_warning',
          priority: 'medium',
          context: {
            maxWear: tireData.maxWear.toFixed(1),
            avgWear: tireData.avgWear.toFixed(1),
            tireAge: tireData.tireAge,
            compound: tireData.compound,
            wearByWheel: tireData.wearByWheel,
            lapsRemaining: totalLaps - currentLap,
          },
          message_hint: `Tires at ${tireData.maxWear.toFixed(0)}% wear (${tireData.tireAge} laps old). Monitor degradation.`,
        });
        state.lastTireWarnLap = currentLap;
      }
    }

    // ========================================================================
    // TRIGGER 2: Tire Critical Warning (70%+ wear)
    // Decision Point: Tires critical, pit decision needed NOW
    // ========================================================================
    if (tireData.maxWear >= opts.tireCriticalThreshold) {
      if (currentLap - state.lastTireCriticalLap >= COOLDOWNS.tire_critical) {
        addTrigger({
          type: 'tire_critical',
          priority: 'high',
          context: {
            maxWear: tireData.maxWear.toFixed(1),
            avgWear: tireData.avgWear.toFixed(1),
            tireAge: tireData.tireAge,
            compound: tireData.compound,
            wearByWheel: tireData.wearByWheel,
            lapsRemaining: totalLaps - currentLap,
          },
          message_hint: `CRITICAL: Tires at ${tireData.maxWear.toFixed(0)}% wear. Box soon to avoid performance cliff.`,
        });
        state.lastTireCriticalLap = currentLap;
      }
    }

    // ========================================================================
    // TRIGGER 3: Pit Window Opening
    // Decision Point: Optimal pit window is approaching
    // ========================================================================
    if (strategy && pitWindowStatus === 'upcoming' && state.lastPitWindowStatus !== 'upcoming') {
      if (currentLap - state.lastPitWindowOpenLap >= COOLDOWNS.pit_window_open) {
        const primaryPlan = strategy.plans[strategy.primaryPlanIndex];
        addTrigger({
          type: 'pit_window',
          priority: 'medium',
          context: {
            pitWindowStatus,
            idealLap: strategy.codemastersWindow.ideal,
            latestLap: strategy.codemastersWindow.latest,
            recommendedLap: primaryPlan?.nextStop?.lap,
            recommendedCompound: primaryPlan?.nextStop?.compound,
            tyreHealth: strategy.tyreHealth,
          },
          message_hint: `Pit window opening. Optimal stop: Lap ${primaryPlan?.nextStop?.lap ?? 'N/A'} for ${primaryPlan?.nextStop?.compound ?? 'fresh tires'}.`,
        });
        state.lastPitWindowOpenLap = currentLap;
      }
    }

    // ========================================================================
    // TRIGGER 4: Pit Window Optimal (now in the window)
    // Decision Point: In optimal window, decision time
    // ========================================================================
    if (strategy && pitWindowStatus === 'active' && state.lastPitWindowStatus !== 'active') {
      if (currentLap - state.lastPitWindowOptimalLap >= COOLDOWNS.pit_window_optimal) {
        const primaryPlan = strategy.plans[strategy.primaryPlanIndex];
        const rejoin = strategy.rejoinForecast;
        addTrigger({
          type: 'pit_window_optimal',
          priority: 'high',
          context: {
            pitWindowStatus,
            idealLap: strategy.codemastersWindow.ideal,
            latestLap: strategy.codemastersWindow.latest,
            recommendedLap: primaryPlan?.nextStop?.lap,
            recommendedCompound: primaryPlan?.nextStop?.compound,
            rejoinPosition: rejoin?.position,
            rejoinAhead: rejoin?.ahead?.driver,
            rejoinBehind: rejoin?.behind?.driver,
          },
          message_hint: `In pit window now. Box for ${primaryPlan?.nextStop?.compound ?? 'fresh tires'}. ` +
            (rejoin ? `Rejoin ~P${rejoin.position}.` : ''),
        });
        state.lastPitWindowOptimalLap = currentLap;
      }
    }

    // ========================================================================
    // TRIGGER 5: Overtake Opportunity (within DRS range)
    // Decision Point: Close to car ahead, attack possible
    // ========================================================================
    if (gaps.gapAhead !== null && gaps.gapAhead <= opts.drsGapThreshold && gaps.gapAhead > 0) {
      if (currentLap - state.lastOvertakeOpportunityLap >= COOLDOWNS.overtake_opportunity) {
        const drsAvailable = (telemetry.drs_allowed as number) === 1 || (telemetry.drsAllowed as boolean);
        addTrigger({
          type: 'overtake_opportunity',
          priority: 'medium',
          context: {
            gap: gaps.gapAhead.toFixed(3),
            opponent: gaps.opponentAhead,
            opponentTireAge: gaps.opponentAheadTireAge,
            drsAvailable,
            playerTireAge: tireData.tireAge,
          },
          message_hint: `${gaps.opponentAhead ?? 'Car ahead'} is ${gaps.gapAhead.toFixed(2)}s ahead. ` +
            `${drsAvailable ? 'DRS available - attack!' : 'Close the gap for DRS.'}`,
        });
        state.lastOvertakeOpportunityLap = currentLap;
      }
    }

    // ========================================================================
    // TRIGGER 6: Undercut Threat (car behind closing rapidly)
    // Decision Point: May need to pit to cover undercut
    // ========================================================================
    if (gaps.gapBehind !== null && gaps.gapBehind <= 1.5 && gaps.gapBehind > 0) {
      const prevGapBehind = state.lastGapBehind;
      if (prevGapBehind !== null && gaps.gapBehind < prevGapBehind - opts.gapChangeThreshold) {
        if (currentLap - state.lastUndercutWarningLap >= COOLDOWNS.undercut_threat) {
          const closingRate = prevGapBehind - gaps.gapBehind;
          addTrigger({
            type: 'undercut_threat',
            priority: 'medium',
            context: {
              gap: gaps.gapBehind.toFixed(3),
              opponent: gaps.opponentBehind,
              opponentTireAge: gaps.opponentBehindTireAge,
              closingRate: closingRate.toFixed(2),
              playerTireAge: tireData.tireAge,
            },
            message_hint: `${gaps.opponentBehind ?? 'Car behind'} closing fast. ` +
              `Gap: ${gaps.gapBehind.toFixed(2)}s (-${closingRate.toFixed(2)}s). Watch for undercut.`,
          });
          state.lastUndercutWarningLap = currentLap;
        }
      }
    }

    // ========================================================================
    // TRIGGER 7: Position Change
    // Decision Point: Acknowledge position change, provide gap info
    // ========================================================================
    if (state.lastPosition !== 0 && position !== state.lastPosition) {
      if (currentLap - state.lastPositionChangeLap >= COOLDOWNS.position_change) {
        const gained = position < state.lastPosition;
        const positionDelta = Math.abs(position - state.lastPosition);
        addTrigger({
          type: 'position_change',
          priority: gained ? 'medium' : 'high',
          context: {
            oldPosition: state.lastPosition,
            newPosition: position,
            gained,
            positionDelta,
            gapAhead: gaps.gapAhead?.toFixed(2),
            gapBehind: gaps.gapBehind?.toFixed(2),
          },
          message_hint: gained
            ? `P${position}! Gained ${positionDelta} position${positionDelta > 1 ? 's' : ''}.`
            : `P${position}. Lost ${positionDelta} position${positionDelta > 1 ? 's' : ''}.`,
        });
        state.lastPositionChangeLap = currentLap;
      }
    }

    // ========================================================================
    // TRIGGER 8: Safety Car / VSC
    // Decision Point: Free pit stop opportunity, strategy change
    // ========================================================================
    const scActive = safetyCarStatus !== 'none' && safetyCarStatus !== state.lastSafetyCarStatus;
    if (scActive) {
      if (currentLap - state.lastSafetyCarLap >= COOLDOWNS.safety_car) {
        const isVSC = safetyCarStatus === 'vsc' || safetyCarStatus === '2';
        const primaryPlan = strategy?.plans[strategy.primaryPlanIndex];
        addTrigger({
          type: 'safety_car',
          priority: 'high',
          context: {
            status: safetyCarStatus,
            isVSC,
            currentPosition: position,
            tireAge: tireData.tireAge,
            tireWear: tireData.maxWear,
            recommendedAction: tireData.maxWear > 40 || tireData.tireAge > 15 ? 'pit' : 'stay_out',
            recommendedCompound: primaryPlan?.nextStop?.compound,
          },
          message_hint: isVSC
            ? `VIRTUAL SAFETY CAR. ${tireData.maxWear > 40 ? 'Consider pitting - reduced time loss.' : 'Stay out - tires still good.'}`
            : `SAFETY CAR DEPLOYED. ${tireData.maxWear > 40 ? 'Box for free stop!' : 'Evaluate pit strategy.'}`,
        });
        state.lastSafetyCarLap = currentLap;
      }
    }

    // ========================================================================
    // TRIGGER 9: Significant Gap Change (opponent pitted/incident)
    // Decision Point: Gap changed dramatically, reassess strategy
    // ========================================================================
    if (gaps.gapAhead !== null && state.lastGapAhead !== null) {
      const gapChange = gaps.gapAhead - state.lastGapAhead;
      if (Math.abs(gapChange) >= opts.significantGapChange) {
        if (currentLap - state.lastGapChangeLap >= COOLDOWNS.gap_change) {
          addTrigger({
            type: 'gap_change',
            priority: 'low',
            context: {
              opponent: gaps.opponentAhead,
              oldGap: state.lastGapAhead.toFixed(2),
              newGap: gaps.gapAhead.toFixed(2),
              change: gapChange.toFixed(2),
              likelyReason: gapChange > 0 ? 'pit_stop' : 'incident_or_closing',
            },
            message_hint: gapChange > 0
              ? `Gap to ${gaps.opponentAhead ?? 'ahead'} +${gapChange.toFixed(1)}s. They likely pitted.`
              : `Gap to ${gaps.opponentAhead ?? 'ahead'} -${Math.abs(gapChange).toFixed(1)}s. Closing rapidly!`,
          });
          state.lastGapChangeLap = currentLap;
        }
      }
    }

    // ========================================================================
    // TRIGGER 10: Weather Change
    // Decision Point: Conditions changing, tire compound decision
    // ========================================================================
    if (weather !== state.lastWeather) {
      if (currentLap - state.lastWeatherChangeLap >= COOLDOWNS.weather_change) {
        const wetIncoming = weather !== 'dry' && state.lastWeather === 'dry';
        const drying = weather === 'dry' && state.lastWeather !== 'dry';

        if (wetIncoming || drying) {
          addTrigger({
            type: 'weather_change',
            priority: 'high',
            context: {
              previousWeather: state.lastWeather,
              currentWeather: weather,
              wetIncoming,
              drying,
              crossover: strategy?.weather.crossover,
            },
            message_hint: wetIncoming
              ? `RAIN INCOMING. Prepare for intermediate/wet tires.`
              : `TRACK DRYING. Consider switch to slicks.`,
          });
          state.lastWeatherChangeLap = currentLap;
        }
      }
    }

    // ========================================================================
    // TRIGGER 11: Race Start Strategy (fires once on lap 2)
    // Decision Point: Initial strategy commitment at race start
    // ========================================================================
    if (currentLap === 2 && state.lastRaceStartLap < 2) {
      const primaryPlan = strategy?.plans[strategy.primaryPlanIndex];
      const ersPercent = ((telemetry.ers_store_energy as number) ?? 0) / 4000000 * 100;

      addTrigger({
        type: 'race_start',
        priority: 'high',
        context: {
          currentLap,
          totalLaps,
          position,
          tireCompound: tireData.compound,
          tireAge: tireData.tireAge,
          weather,
          recommendedPitLap: primaryPlan?.nextStop?.lap,
          recommendedCompound: primaryPlan?.nextStop?.compound,
          pitWindowIdeal: strategy?.codemastersWindow.ideal,
          pitWindowLatest: strategy?.codemastersWindow.latest,
          ersPercent: ersPercent.toFixed(0),
          gapAhead: gaps.gapAhead?.toFixed(2),
          gapBehind: gaps.gapBehind?.toFixed(2),
        },
        message_hint: `Race started. Request initial strategy plan. Lap 2/${totalLaps}, P${position}.`,
      });
      state.lastRaceStartLap = currentLap;
    }

    // ========================================================================
    // TRIGGER 12: ERS Update (fires every 2 laps starting lap 3)
    // Decision Point: Periodic ERS deployment strategy
    // ========================================================================
    // Fire on odd laps starting from 3 (lap 3, 5, 7, 9...)
    const shouldFireERS = currentLap >= 3 &&
                          currentLap % 2 === 1 &&
                          currentLap - state.lastERSUpdateLap >= COOLDOWNS.ers_update;

    if (shouldFireERS) {
      const ersPercent = ((telemetry.ers_store_energy as number) ?? 0) / 4000000 * 100;
      const ersMode = (telemetry.ers_deploy_mode as number) ?? 0;
      const ersModeNames = ['None', 'Medium', 'Hotlap', 'Overtake'];

      addTrigger({
        type: 'ers_update',
        priority: 'medium',
        context: {
          currentLap,
          ersPercent: ersPercent.toFixed(0),
          ersMode,
          ersModeName: ersModeNames[ersMode] ?? 'Unknown',
          position,
          gapAhead: gaps.gapAhead?.toFixed(2),
          gapBehind: gaps.gapBehind?.toFixed(2),
          opponentAhead: gaps.opponentAhead,
          opponentBehind: gaps.opponentBehind,
          lapsRemaining: totalLaps - currentLap,
        },
        message_hint: `ERS update requested. SOC: ${ersPercent.toFixed(0)}%, Mode: ${ersModeNames[ersMode] ?? 'Unknown'}.`,
      });
      state.lastERSUpdateLap = currentLap;
    }

    // Update state for next comparison
    state.lastPosition = position;
    state.lastGapAhead = gaps.gapAhead;
    state.lastGapBehind = gaps.gapBehind;
    state.lastSafetyCarStatus = safetyCarStatus;
    state.lastWeather = weather;
    state.lastPitWindowStatus = pitWindowStatus;

  }, [telemetry, multiCarData, strategy, opts, addTrigger, resetState]);

  return triggers;
}

// Export trigger types for research logger
export type EngineerTriggerType =
  | 'tire_warning'
  | 'tire_critical'
  | 'pit_window'
  | 'pit_window_optimal'
  | 'overtake_opportunity'
  | 'undercut_threat'
  | 'position_change'
  | 'safety_car'
  | 'gap_change'
  | 'weather_change'
  | 'race_start'      // Initial strategy commitment (fires once on lap 2)
  | 'ers_update';     // Periodic ERS deployment plan (every 2 laps)
