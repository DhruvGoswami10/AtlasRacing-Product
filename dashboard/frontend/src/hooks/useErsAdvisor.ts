import { useMemo, useRef } from 'react';
import type { StandardizedTelemetry } from '../utils/telemetryConverter';
import type { TrackOpponent } from '../components/DevModeTrackMap';
import type { TelemetryData } from '../types/telemetry';

type ErsMode = 'balanced' | 'harvest' | 'attack' | 'defend';
type BudgetAction = 'spend' | 'bank' | 'hold';

export interface ErsBudgetSnapshot {
  targetNow: number;
  targetNext: number;
  delta: number;
  action: BudgetAction;
  summary: string;
}

export interface ErsAdvisorResult {
  soc: number;
  mode: ErsMode;
  message: string;
  detail: string;
  callouts: string[];
  budget: ErsBudgetSnapshot;
  hangarCallout: string | null;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const computeBudgetTarget = (lap: number, totalLaps: number) => {
  if (!Number.isFinite(totalLaps) || totalLaps <= 0) {
    return 60;
  }
  const clampedLap = clamp(lap, 0, totalLaps);
  const progress = totalLaps === 0 ? 0 : clampedLap / totalLaps;
  const baseStart = 90;
  const baseEnd = 20;
  const target = baseStart + (baseEnd - baseStart) * progress;
  return clamp(Number(target.toFixed(1)), 15, 95);
};

const formatGap = (value: number | null | undefined) => {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return 'n/a';
  }
  if (value >= 10) return `${value.toFixed(1)}s`;
  return `${value.toFixed(2)}s`;
};

interface UseErsAdvisorParams {
  telemetry: StandardizedTelemetry | null;
  rawTelemetry: TelemetryData | null;
  attackThreshold: number | null;
  defendThreshold: number | null;
  harvestThreshold: number | null;
  aheadOpponent: TrackOpponent | undefined;
  behindOpponent: TrackOpponent | undefined;
}

const SOC_CRITICAL = 18;
const SOC_ATTACK_READY = 35;
const SOC_HARVEST_HIGH = 80;
const SOC_HARVEST_OK = 50;
const HYSTERESIS_BAND = 3;

export const useErsAdvisor = ({
  telemetry,
  rawTelemetry,
  attackThreshold,
  defendThreshold,
  harvestThreshold,
  aheadOpponent,
  behindOpponent,
}: UseErsAdvisorParams): ErsAdvisorResult => {
  const lastModeRef = useRef<ErsMode>('balanced');

  return useMemo(() => {
    const atlasAI = rawTelemetry?.atlas_ai;
    const soc =
      (atlasAI && typeof atlasAI.ers_store_percent === 'number'
        ? atlasAI.ers_store_percent
        : telemetry?.ersStoreEnergy) ?? 0;
    const clampedSoc = clamp(soc, 0, 100);

    const attackGap = attackThreshold ?? (atlasAI?.ers_attack_gap ?? 1.2);
    const defendGap = defendThreshold ?? (atlasAI?.ers_defend_gap ?? 1.0);
    const harvestGap = harvestThreshold ?? (atlasAI?.ers_harvest_gap ?? 2.8);

    const gapAhead =
      aheadOpponent && typeof aheadOpponent.gapToPlayer === 'number'
        ? Math.abs(aheadOpponent.gapToPlayer)
        : null;
    const gapBehind =
      behindOpponent && typeof behindOpponent.gapToPlayer === 'number'
        ? Math.abs(behindOpponent.gapToPlayer)
        : null;

    const safeAhead = gapAhead === null || gapAhead > harvestGap;
    const safeBehind = gapBehind === null || gapBehind > harvestGap;
    const defendRisk = gapBehind !== null && gapBehind <= defendGap;
    const attackOpportunity =
      gapAhead !== null && gapAhead <= Math.min(attackGap, 1.2) && clampedSoc > SOC_ATTACK_READY;
    const criticalLow = clampedSoc <= SOC_CRITICAL;
    const highStore = clampedSoc >= SOC_HARVEST_HIGH;
    const harvestWorthy =
      clampedSoc >= SOC_HARVEST_OK && safeAhead && safeBehind && !attackOpportunity && !defendRisk;

    let mode: ErsMode = 'balanced';
    if (criticalLow) {
      mode = 'harvest';
    } else if (defendRisk) {
      mode = 'defend';
    } else if (attackOpportunity) {
      mode = 'attack';
    } else if (harvestWorthy || highStore) {
      mode = 'harvest';
    } else if (clampedSoc >= SOC_ATTACK_READY && safeBehind) {
      mode = 'attack';
    } else {
      mode = 'balanced';
    }

    // Hysteresis: avoid rapid toggling around thresholds
    const previousMode = lastModeRef.current;
    if (previousMode !== mode) {
      if (
        (previousMode === 'harvest' && mode === 'attack' && clampedSoc < SOC_ATTACK_READY + HYSTERESIS_BAND) ||
        (previousMode === 'attack' && mode === 'harvest' && clampedSoc > SOC_HARVEST_HIGH - HYSTERESIS_BAND)
      ) {
        mode = previousMode;
      }
    }
    lastModeRef.current = mode;

    const currentLap = telemetry?.currentLapNum ?? 0;
    const totalLaps = telemetry?.totalLaps ?? 0;
    const budgetTarget = computeBudgetTarget(currentLap, totalLaps);
    const nextTarget = computeBudgetTarget(currentLap + 1, totalLaps);
    const delta = Number((clampedSoc - budgetTarget).toFixed(1));
    const action: BudgetAction =
      delta > 5 ? 'spend' : delta < -5 ? 'bank' : 'hold';

    const budgetSummary =
      action === 'spend'
        ? `Use ${Math.min(20, Math.max(8, delta)).toFixed(0)}% this lap to stay on plan`
        : action === 'bank'
          ? `Harvest ~${Math.min(15, Math.max(5, -delta)).toFixed(0)}% to recover budget`
          : 'Hold usage steady';

    const callouts: string[] = [];
    if (criticalLow) {
      callouts.push(`ERS ${clampedSoc.toFixed(0)}% remaining — harvest next lap`);
    }
    if (highStore) {
      callouts.push(`ERS ${clampedSoc.toFixed(0)}% stored — burn now while tyres are fresh`);
    }
    if (harvestWorthy && !criticalLow) {
      callouts.push(`Gaps clear (>${formatGap(harvestGap)}); lift and coast to recharge`);
    }
    if (attackOpportunity) {
      callouts.push(
        `Deploy to close — gap ahead ${formatGap(gapAhead)} (threshold ${formatGap(attackGap)})`,
      );
    }
    if (defendRisk) {
      callouts.push(
        `Defend next straight — gap behind ${formatGap(gapBehind)} (threshold ${formatGap(defendGap)})`,
      );
    }

    let message = '';
    let detail = '';

    switch (mode) {
      case 'harvest':
        message = 'Harvest now';
        if (criticalLow) {
          detail = 'State of charge under 20%; coast and short-shift until battery recovers.';
        } else if (highStore) {
          detail = 'Bank charge so you do not waste energy before the next push stint.';
        } else {
          detail = 'Both gaps are safe; lift early and recharge through slow corners.';
        }
        break;
      case 'attack':
        message = 'Deploy to attack';
        detail = `Gap ahead ${formatGap(gapAhead)}; spend ${formatGap(attackGap)} or less to line up the move.`;
        break;
      case 'defend':
        message = 'Defend the position';
        detail = `Gap behind ${formatGap(gapBehind)}; hold 10–15% for straights and cover the move.`;
        break;
      default:
        message = 'Balanced usage';
        detail = 'Keep SOC on budget and react if gaps change.';
    }

    const lapDistance = telemetry?.lapDistance ?? 0;
    const totalDistance = telemetry?.totalDistance ?? 0;
    const trackId = telemetry?.trackId ?? rawTelemetry?.track_id ?? 0;

    let hangarCallout: string | null = null;
    if (
      trackId === 11 &&
      totalDistance > 0 &&
      gapAhead !== null &&
      gapAhead <= Math.min(attackGap, 0.9)
    ) {
      const progress = lapDistance / totalDistance;
      if (progress >= 0.62 && progress <= 0.78) {
        hangarCallout = 'Deploy down Hangar straight';
        callouts.unshift('Deploy down Hangar straight');
      }
    }

    const budget: ErsBudgetSnapshot = {
      targetNow: budgetTarget,
      targetNext: nextTarget,
      delta,
      action,
      summary: budgetSummary,
    };

    return {
      soc: Number(clampedSoc.toFixed(1)),
      mode,
      message,
      detail,
      callouts,
      budget,
      hangarCallout,
    };
  }, [
    telemetry?.currentLapNum,
    telemetry?.totalLaps,
    telemetry?.lapDistance,
    telemetry?.totalDistance,
    telemetry?.trackId,
    telemetry?.ersStoreEnergy,
    attackThreshold,
    defendThreshold,
    harvestThreshold,
    aheadOpponent,
    behindOpponent,
    rawTelemetry?.atlas_ai,
    rawTelemetry?.track_id,
  ]);
};
