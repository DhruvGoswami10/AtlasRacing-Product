import { useEffect, useMemo, useState } from 'react';
import type { TyreSetData, MultiCarTelemetryData, TelemetryData } from '../types/telemetry';
import type { TrackOpponent } from '../components/DevModeTrackMap';
import {
  DEFAULT_PIT_DELTA,
  DEFAULT_STRATEGY_TEMPLATES,
  PIT_DELTA_BY_TRACK,
  StrategyTemplateDefinition,
  StrategyTemplateSet,
  StrategyProfile,
  TRACK_STRATEGY_PROFILE,
  countAvailableSets,
  CompoundName,
} from '../data/trackStrategyConfig';
import type { StandardizedTelemetry } from '../utils/telemetryConverter';

type PlanStatus = 'standby' | 'window' | 'pit-now' | 'critical' | 'complete';

export interface HeuristicStint {
  index: number;
  compound: CompoundName;
  fromLap: number;
  toLap: number;
}

export interface HeuristicStop {
  index: number;
  targetLap: number;
  windowStart: number;
  windowEnd: number;
  compound: CompoundName;
  availableSets: number;
}

export interface HeuristicPlanOption {
  id: 'A' | 'B';
  label: string;
  description: string;
  totalStops: number;
  stints: HeuristicStint[];
  stops: HeuristicStop[];
  nextStop: HeuristicStop | null;
  status: PlanStatus;
  statusDetail: string;
  risk: 'low' | 'medium' | 'high';
  deltaSeconds: number;
}

export interface HeuristicRejoinOpponent {
  driver: string;
  position: number | null;
  gapSeconds: number | null;
}

export interface HeuristicRejoinForecast {
  lap: number;
  position: number | null;
  ahead: HeuristicRejoinOpponent | null;
  behind: HeuristicRejoinOpponent | null;
  confidence: 'low' | 'medium' | 'high';
  message: string;
}

export interface HeuristicStrategyResult {
  planPrimary: HeuristicPlanOption | null;
  planAlternate: HeuristicPlanOption | null;
  pitDelta: number;
  rejoinForecast: HeuristicRejoinForecast | null;
  tyreWearStatus: {
    maxWear: number;
    flag: 'ok' | 'window' | 'critical';
  };
}


interface UseHeuristicStrategyParams {
  telemetry: StandardizedTelemetry | null;
  tyreSets: TyreSetData[];
  multiCarData: MultiCarTelemetryData | null;
  opponents: TrackOpponent[];
}

const COMPOUND_PACE_SCORE: Record<CompoundName, number> = {
  Soft: -0.45,
  Medium: 0,
  Hard: 0.35,
  Intermediate: 0.55,
  Wet: 0.85,
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));


const fallbackResult: HeuristicStrategyResult = {
  planPrimary: null,
  planAlternate: null,
  pitDelta: DEFAULT_PIT_DELTA,
  rejoinForecast: null,
  tyreWearStatus: {
    maxWear: 0,
    flag: 'ok',
  },
};

const selectProfile = (trackId: number, totalLaps: number): StrategyProfile => {
  if (TRACK_STRATEGY_PROFILE[trackId]) {
    return TRACK_STRATEGY_PROFILE[trackId]!;
  }

  if (totalLaps >= 52) {
    return 'endurance';
  }
  if (totalLaps <= 40) {
    return 'sprint';
  }
  return 'standard';
};

const getTemplatesForProfile = (profile: StrategyProfile): StrategyTemplateSet =>
  DEFAULT_STRATEGY_TEMPLATES[profile];

const toLap = (ratio: number, totalLaps: number) =>
  clamp(Math.round(totalLaps * ratio), 2, Math.max(2, totalLaps - 2));

const buildPlan = (
  template: StrategyTemplateDefinition,
  telemetry: StandardizedTelemetry,
  tyreSets: TyreSetData[],
  pitDelta: number,
): HeuristicPlanOption => {
  const totalLaps = telemetry.totalLaps || 0;
  const currentLap = telemetry.currentLapNum || 1;
  const stopTargets = template.stopLapRatios.map((ratio, idx) => {
    const lap = toLap(ratio, totalLaps);
    return Math.max(lap, idx > 0 ? toLap(template.stopLapRatios[idx - 1], totalLaps) + 3 : lap);
  });

  const stints: HeuristicStint[] = [];
  let stintStart = 1;
  template.stintCompounds.forEach((compound, index) => {
    const stintEnd = index < stopTargets.length ? stopTargets[index] : totalLaps;
    stints.push({
      index,
      compound,
      fromLap: stintStart,
      toLap: Math.max(stintStart, stintEnd),
    });
    stintStart = stintEnd + 1;
  });

  const stops: HeuristicStop[] = stopTargets.map((lap, index) => {
    const compound = template.stintCompounds[index + 1] || template.stintCompounds[index];
    const windowStart = Math.max(2, lap - 2);
    const windowEnd = Math.min(totalLaps - 1, lap + 2);
    return {
      index,
      targetLap: lap,
      windowStart,
      windowEnd,
      compound,
      availableSets: countAvailableSets(compound, tyreSets),
    };
  });

  const currentStintIndex = stopTargets.findIndex((lap) => currentLap <= lap);
  const nextStop =
    currentStintIndex === -1
      ? null
      : stops[clamp(currentStintIndex, 0, stops.length - 1)] ?? null;

  const tyreWearMax = Math.max(
    telemetry.tireWearFL || 0,
    telemetry.tireWearFR || 0,
    telemetry.tireWearRL || 0,
    telemetry.tireWearRR || 0,
  );

  let status: PlanStatus = 'standby';
  let statusDetail = '';

  if (!nextStop) {
    status = 'complete';
    statusDetail = 'Planned stops completed';
  } else if (tyreWearMax >= 75) {
    status = 'critical';
    statusDetail = 'Tyres above 75% wear – box immediately';
  } else if (tyreWearMax >= 70) {
    status = 'pit-now';
    statusDetail = 'Tyres approaching puncture zone – pit this lap';
  } else if (currentLap >= nextStop.windowStart) {
    status = 'window';
    statusDetail = `Pit window open (${nextStop.windowStart}-${nextStop.windowEnd})`;
  } else {
    status = 'standby';
    statusDetail = `Next stop L${nextStop.targetLap}`;
  }

  const projectedTime =
    template.totalStops * pitDelta +
    stints.reduce((total, stint) => {
      const laps = Math.max(0, stint.toLap - stint.fromLap + 1);
      const pace = COMPOUND_PACE_SCORE[stint.compound] ?? 0;
      return total + laps * pace;
    }, 0);

  return {
    id: template.id,
    label: template.label,
    description: template.description,
    totalStops: template.totalStops,
    stints,
    stops,
    nextStop,
    status,
    statusDetail,
    risk: template.risk,
    deltaSeconds: projectedTime,
  };
};

const computeRejoinForecast = (
  telemetry: StandardizedTelemetry,
  plan: HeuristicPlanOption | null,
  pitDelta: number,
  multiCarData: MultiCarTelemetryData | null,
  lastPitLap: number | null,
): HeuristicRejoinForecast | null => {
  if (!plan || plan.status === 'complete') {
    return null;
  }

  const currentLap = telemetry.currentLapNum || 1;
  const pitStatus = telemetry.pitStatus || 'On Track';

  if (lastPitLap !== null && currentLap <= lastPitLap + 1) {
    return null;
  }

  if (!plan.nextStop || currentLap < plan.nextStop.windowStart - 1) {
    return null;
  }

  if (!multiCarData || !multiCarData.cars || multiCarData.cars.length === 0) {
    return null;
  }

  const playerCar =
    multiCarData.cars.find((car) => car.is_player === 1) ||
    multiCarData.cars.find(
      (car) => car.position === telemetry.position && telemetry.position > 0,
    );

  if (!playerCar) {
    return null;
  }

  const referenceGap = Number.isFinite(playerCar.gap_to_leader)
    ? playerCar.gap_to_leader || 0
    : 0;
  const predictedGap = referenceGap + pitDelta;

  const sortedByGap = multiCarData.cars
    .filter((car) => car.car_index !== playerCar.car_index)
    .filter((car) => Number.isFinite(car.gap_to_leader))
    .sort((left, right) => (left.gap_to_leader || 0) - (right.gap_to_leader || 0));

  if (sortedByGap.length === 0) {
    return null;
  }

  let ahead: HeuristicRejoinOpponent | null = null;
  let behind: HeuristicRejoinOpponent | null = null;

  for (const car of sortedByGap) {
    const gap = car.gap_to_leader || 0;
    if (gap < predictedGap) {
      ahead = {
        driver: car.driver_name?.trim() || `P${car.position}`,
        position: car.position || null,
        gapSeconds: predictedGap - gap,
      };
      continue;
    }

    behind = {
      driver: car.driver_name?.trim() || `P${car.position}`,
      position: car.position || null,
      gapSeconds: gap - predictedGap,
    };
    break;
  }

  const predictedPosition = behind?.position
    ? behind.position
    : ahead?.position
      ? Math.max(1, (ahead.position || 1) - 1)
      : telemetry.position;

  const confidence: HeuristicRejoinForecast['confidence'] =
    pitStatus === 'On Track' && plan.status !== 'standby' ? 'medium' : 'low';

  return {
    lap: plan.nextStop.targetLap,
    position: predictedPosition || null,
    ahead,
    behind,
    confidence,
    message:
      plan.status === 'critical'
        ? 'Tyres finished – expect heavy traffic on rejoin'
        : 'Forecast based on current gaps and pit delta',
  };
};

export const useHeuristicStrategy = ({
  telemetry,
  tyreSets,
  multiCarData,
  opponents: _opponents, // Reserved for future spatial adjustments
}: UseHeuristicStrategyParams): HeuristicStrategyResult => {
  const [lastPitLap, setLastPitLap] = useState<number | null>(null);
  const hasTelemetry = Boolean(telemetry);
  const pitStatus = telemetry?.pitStatus ?? null;
  const currentLapNum = telemetry?.currentLapNum ?? 0;

  useEffect(() => {
    if (!hasTelemetry) {
      return;
    }

    if (
      pitStatus === 'Pitting' ||
      pitStatus === 'In Pit' ||
      pitStatus === 'In Pit Lane'
    ) {
      setLastPitLap(currentLapNum);
    }
  }, [hasTelemetry, pitStatus, currentLapNum]);

  return useMemo(() => {
    if (!telemetry) {
      return fallbackResult;
    }

    const totalLaps = telemetry.totalLaps || 0;
    if (totalLaps <= 0) {
      return fallbackResult;
    }

    const trackId = telemetry.trackId ?? 0;
    const profile = selectProfile(trackId, totalLaps);
    const templates = getTemplatesForProfile(profile);

    const atlasAI = (telemetry.raw as TelemetryData | undefined)?.atlas_ai as
      | TelemetryData['atlas_ai']
      | undefined;

    const pitDelta =
      atlasAI?.pit_delta_time ??
      PIT_DELTA_BY_TRACK[trackId] ??
      DEFAULT_PIT_DELTA;

    const primaryPlan = buildPlan(templates.primary, telemetry, tyreSets, pitDelta);
    const alternatePlan = buildPlan(templates.alternate, telemetry, tyreSets, pitDelta);

    const baseline = Math.min(primaryPlan.deltaSeconds, alternatePlan.deltaSeconds);
    primaryPlan.deltaSeconds = primaryPlan.deltaSeconds - baseline;
    alternatePlan.deltaSeconds = alternatePlan.deltaSeconds - baseline;

    const tyreWearMax = Math.max(
      telemetry.tireWearFL || 0,
      telemetry.tireWearFR || 0,
      telemetry.tireWearRL || 0,
      telemetry.tireWearRR || 0,
    );

    const rejoinForecast = computeRejoinForecast(
      telemetry,
      primaryPlan,
      pitDelta,
      multiCarData,
      lastPitLap,
    );

    return {
      planPrimary: primaryPlan,
      planAlternate: alternatePlan,
      pitDelta,
      rejoinForecast,
      tyreWearStatus: {
        maxWear: tyreWearMax,
        flag: tyreWearMax >= 75 ? 'critical' : tyreWearMax >= 70 ? 'window' : 'ok',
      },
    };
  }, [telemetry, tyreSets, multiCarData, lastPitLap]);
};

