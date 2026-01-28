import { useMemo } from 'react';
import type { StandardizedTelemetry } from '../utils/telemetryConverter';
import type { PitPlan, PitPlanStop, TelemetryData } from '../types/telemetry';

export interface AtlasPlanStop {
  targetLap: number;
  windowOpen: number;
  windowClose: number;
  compound: number;
  stintLength: number;
}

export interface AtlasPlan {
  id: number;
  label: string;
  totalStops: number;
  stopsCompleted: number;
  riskRating: number;
  projectedTotalTime: number;
  deltaVsBest: number;
  confidence: number;
  cheapPitOpportunity: boolean;
  stops: AtlasPlanStop[];
  visibleStops: AtlasPlanStop[];
  nextStop: AtlasPlanStop | null;
}

export interface AtlasPitStrategyResult {
  ready: boolean;
  planCount: number;
  selectedPlanIndex: number;
  cheapStopAvailable: boolean;
  stopsCompleted: number;
  lastPitLap: number | null;
  plans: AtlasPlan[];
  currentLap: number;
  lapsSinceLastStop: number;
  firstStopReady: boolean;
  secondaryStopsReady: boolean;
}

const DEFAULT_RESULT: AtlasPitStrategyResult = {
  ready: false,
  planCount: 0,
  selectedPlanIndex: 0,
  cheapStopAvailable: false,
  stopsCompleted: 0,
  lastPitLap: null,
  plans: [],
  currentLap: 0,
  lapsSinceLastStop: 0,
  firstStopReady: false,
  secondaryStopsReady: false,
};

const PLAN_LABELS = ['Plan A', 'Plan B', 'Plan C'];

const mapStop = (stop: PitPlanStop): AtlasPlanStop => ({
  targetLap: stop?.target_lap ?? 0,
  windowOpen: stop?.window_open ?? 0,
  windowClose: stop?.window_close ?? 0,
  compound: stop?.compound ?? 0,
  stintLength: stop?.stint_length ?? 0,
});

const mapPlan = (
  plan: PitPlan,
  index: number,
  allowFirstStop: boolean,
  allowSecondaryStops: boolean,
): AtlasPlan => {
  const stops = (plan?.stops ?? []).slice(0, 3).map(mapStop);
  const visibleStops = stops.filter((_, stopIndex) =>
    stopIndex === 0 ? allowFirstStop : allowSecondaryStops,
  );

  return {
    id: index,
    label: plan?.label?.trim() || PLAN_LABELS[index] || `Plan ${String.fromCharCode(65 + index)}`,
    totalStops: plan?.total_stops ?? 0,
    stopsCompleted: plan?.stops_completed ?? 0,
    riskRating: plan?.risk_rating ?? 0,
    projectedTotalTime: plan?.projected_total_time ?? 0,
    deltaVsBest: plan?.delta_vs_best ?? 0,
    confidence: plan?.confidence ?? 0,
    cheapPitOpportunity: (plan?.cheap_pit_opportunity ?? 0) > 0,
    stops,
    visibleStops,
    nextStop: visibleStops.length > 0 ? visibleStops[0] : null,
  };
};

export const useAtlasPitStrategy = (
  telemetry: StandardizedTelemetry | null,
): AtlasPitStrategyResult => {
  return useMemo(() => {
    if (!telemetry?.raw) {
      return DEFAULT_RESULT;
    }

    const atlasAI = (telemetry.raw as TelemetryData | undefined)?.atlas_ai;
    if (!atlasAI) {
      return DEFAULT_RESULT;
    }

    const currentLap = telemetry.currentLapNum ?? 0;
    const stopsCompleted = atlasAI.pit_stops_completed ?? 0;
    const lastPitLap = Number.isFinite(atlasAI.last_pit_stop_lap)
      ? atlasAI.last_pit_stop_lap
      : null;
    const lapsSinceLastStop =
      lastPitLap !== null ? Math.max(0, currentLap - lastPitLap) : currentLap;

    const allowFirstStop = currentLap >= 3;
    const allowSecondaryStops = lapsSinceLastStop >= 3;

    const rawPlans: PitPlan[] = [
      atlasAI.pit_plan_primary,
      atlasAI.pit_plan_alternative,
      atlasAI.pit_plan_third,
    ].filter(Boolean) as PitPlan[];

    const requestedPlanCount = atlasAI.pit_plan_count ?? rawPlans.length;
    const planCount = Math.min(requestedPlanCount, rawPlans.length);

    if (planCount === 0) {
      return {
        ...DEFAULT_RESULT,
        stopsCompleted,
        lastPitLap,
        currentLap,
        lapsSinceLastStop,
        firstStopReady: allowFirstStop,
        secondaryStopsReady: allowSecondaryStops,
      };
    }

    const plans = rawPlans
      .slice(0, planCount)
      .map((plan, index) => mapPlan(plan, index, allowFirstStop, allowSecondaryStops));

    const cheapStopAvailable =
      (atlasAI.pit_cheap_stop_available ?? 0) > 0 ||
      plans.some(plan => plan.cheapPitOpportunity);

    const selectedPlanIndex =
      planCount > 0
        ? Math.min(Math.max(atlasAI.pit_plan_selected ?? 0, 0), planCount - 1)
        : 0;

    const anyStopsVisible = plans.some(plan => plan.visibleStops.length > 0);
    const ready = allowFirstStop && (anyStopsVisible || plans.length > 0);

    return {
      ready,
      planCount,
      selectedPlanIndex,
      cheapStopAvailable,
      stopsCompleted,
      lastPitLap,
      plans,
      currentLap,
      lapsSinceLastStop,
      firstStopReady: allowFirstStop,
      secondaryStopsReady: allowSecondaryStops,
    };
  }, [telemetry]);
};
