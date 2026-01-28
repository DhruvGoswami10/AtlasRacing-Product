import { useMemo } from 'react';
import type { StandardizedTelemetry } from '../utils/telemetryConverter';
import type {
  MultiCarTelemetryData,
  TelemetryData,
  TyreSetData,
} from '../types/telemetry';
import { toCompoundName, type CompoundName, PIT_DELTA_BY_TRACK, DEFAULT_PIT_DELTA } from '../data/trackStrategyConfig';

type RiskLevel = 'low' | 'medium' | 'high';
type PlanStatus = 'hold' | 'prepare' | 'box';
type AdvisorySeverity = 'info' | 'warning' | 'critical';

export interface LiveStrategyStop {
  lap: number;
  windowStart: number;
  windowEnd: number;
  compound: CompoundName | 'Current' | 'Unknown';
  notes: string[];
  tyreRisk: AdvisorySeverity;
}

export interface LiveStrategyPlan {
  id: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'R';
  title: string;
  description: string;
  totalStops: number;
  nextStop: LiveStrategyStop | null;
  stops: LiveStrategyStop[];
  risk: RiskLevel;
  confidence: number;
  status: PlanStatus;
  deltaSeconds: number;
}

export interface StrategyAdvisory {
  type: 'tyre' | 'weather' | 'fuel' | 'gap' | 'general';
  message: string;
  severity: AdvisorySeverity;
}

export interface RejoinOpponent {
  driver: string;
  position: number | null;
  gapSeconds: number | null;
}

export interface RejoinForecast {
  lap: number | null;
  position: number | null;
  ahead: RejoinOpponent | null;
  behind: RejoinOpponent | null;
  confidence: 'low' | 'medium' | 'high';
  message: string;
}

export interface WeatherCrossover {
  type: 'wet-incoming' | 'drying';
  expectedLap: number;
  confidence: 'low' | 'medium' | 'high';
  description: string;
}

export interface WeatherOutlook {
  current: 'dry' | 'light-rain' | 'rain' | 'storm';
  trend: 'stable' | 'drying' | 'worsening';
  nextChangeLap: number | null;
  description: string;
  crossover: WeatherCrossover | null;
}

export interface LivePitStrategyResult {
  ready: boolean;
  plans: LiveStrategyPlan[];
  primaryPlanIndex: number;
  pitWindowStatus: 'none' | 'upcoming' | 'active' | 'passed';
  codemastersWindow: {
    ideal?: number;
    latest?: number;
  };
  rejoinForecast: RejoinForecast | null;
  rejoinForecasts: Array<RejoinForecast | null>;
  tyreHealth: {
    maxWear: number;
    status: 'healthy' | 'caution' | 'critical';
    lapsTo70: number;
  };
  weather: WeatherOutlook;
  advisories: StrategyAdvisory[];
}

const FALLBACK_RESULT: LivePitStrategyResult = {
  ready: false,
  plans: [],
  primaryPlanIndex: 0,
  pitWindowStatus: 'none',
  codemastersWindow: {},
  rejoinForecast: null,
  rejoinForecasts: [],
  tyreHealth: {
    maxWear: 0,
    status: 'healthy',
    lapsTo70: 999,
  },
  weather: {
    current: 'dry',
    trend: 'stable',
    nextChangeLap: null,
    description: 'Weather data unavailable',
    crossover: null,
  },
  advisories: [],
};

const weatherLabel = (code: number | undefined): WeatherOutlook['current'] => {
  switch (code) {
    case 3:
      return 'light-rain';
    case 4:
      return 'rain';
    case 5:
      return 'storm';
    default:
      return 'dry';
  }
};

const clampLap = (lap: number, totalLaps: number) =>
  Math.max(1, Math.min(totalLaps, Math.round(lap)));

const determinePitWindowStatus = (
  currentLap: number,
  idealLap?: number,
  latestLap?: number,
): LivePitStrategyResult['pitWindowStatus'] => {
  if (!idealLap || !latestLap) {
    return 'none';
  }

  if (currentLap < idealLap - 2) {
    return 'upcoming';
  }

  if (currentLap <= latestLap + 1) {
    return 'active';
  }

  return 'passed';
};

const compoundFromValue = (value: number | string | undefined): CompoundName | 'Unknown' => {
  const normalised = toCompoundName(value);
  return normalised ?? 'Unknown';
};

const countAvailableSets = (tyreSets: TyreSetData[] | undefined, compound: CompoundName) => {
  if (!tyreSets || tyreSets.length === 0) return 0;
  return tyreSets.reduce((count, set) => {
    if (!set.available) return count;
    const actual = compoundFromValue(set.actualTyreCompound);
    const visual = compoundFromValue(set.visualTyreCompound);
    return actual === compound || visual === compound ? count + 1 : count;
  }, 0);
};

interface BuildPlanArgs {
  id: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'R';
  title: string;
  description: string;
  targetLaps: number[];
  compounds: (CompoundName | 'Current' | 'Unknown')[];
  baseRisk: RiskLevel;
  baseConfidence: number;
  telemetry: StandardizedTelemetry;
  totalLaps: number;
  tyreHealth: LivePitStrategyResult['tyreHealth'];
  codemastersWindow: { ideal?: number; latest?: number };
  cheapStopActive: boolean;
}

const buildPlan = ({
  id,
  title,
  description,
  targetLaps,
  compounds,
  baseRisk,
  baseConfidence,
  telemetry,
  totalLaps,
  tyreHealth,
  codemastersWindow,
  cheapStopActive,
}: BuildPlanArgs): LiveStrategyPlan => {
  const currentLap = telemetry.currentLapNum || 0;
  const stops: LiveStrategyStop[] = [];
  let status: PlanStatus = 'hold';
  let confidence = baseConfidence;
  let risk = baseRisk;

  const nextCodemastersLap = codemastersWindow.ideal ?? codemastersWindow.latest ?? 0;

  targetLaps.forEach((rawTargetLap, index) => {
    const targetLap = clampLap(rawTargetLap, totalLaps);
    const windowRadius = index === 0 ? 2 : 3;
    const windowStart = clampLap(Math.max(currentLap + 1, targetLap - windowRadius), totalLaps);
    const windowEnd = clampLap(targetLap + windowRadius, totalLaps);
    const compound = compounds[index] ?? 'Unknown';

    const tyreRisk: AdvisorySeverity =
      tyreHealth.status === 'critical' || tyreHealth.lapsTo70 <= 1
        ? 'critical'
        : tyreHealth.status === 'caution' || tyreHealth.lapsTo70 <= 3
          ? 'warning'
          : 'info';

    const notes: string[] = [];
    if (cheapStopActive && index === 0) {
      notes.push('Safety car / VSC window - cheap stop opportunity');
    }
    if (targetLap <= currentLap) {
      notes.push('Stop overdue - pit asap');
    }
    if (targetLap > windowEnd) {
      notes.push('Tyre life margin limited - expect late stint fade');
    }

    stops.push({
      lap: targetLap,
      windowStart,
      windowEnd,
      compound,
      notes,
      tyreRisk,
    });
  });

  if (stops.length > 0) {
    const nextStop = stops[0];
    if (nextStop.lap <= currentLap + 1 || nextStop.tyreRisk === 'critical') {
      status = 'box';
    } else if (nextStop.windowStart <= currentLap + 1) {
      status = 'prepare';
    }

    if (codemastersWindow.ideal && Math.abs(nextStop.lap - nextCodemastersLap) <= 1) {
      confidence = Math.min(100, confidence + 5);
    }
    if (tyreHealth.status === 'critical') {
      risk = 'high';
    } else if (tyreHealth.status === 'caution' && risk === 'low') {
      risk = 'medium';
    }
  }

  return {
    id,
    title,
    description,
    totalStops: stops.length,
    nextStop: stops[0] ?? null,
    stops,
    risk,
    confidence,
    status,
    deltaSeconds: 0,
  };
};

const computeWearStatus = (
  telemetry: StandardizedTelemetry,
  rawTelemetry: TelemetryData | undefined,
): LivePitStrategyResult['tyreHealth'] => {
  const wearValues: number[] = [
    telemetry.tireWearFL ?? rawTelemetry?.tire_wear?.[0] ?? 0,
    telemetry.tireWearFR ?? rawTelemetry?.tire_wear?.[1] ?? 0,
    telemetry.tireWearRL ?? rawTelemetry?.tire_wear?.[2] ?? 0,
    telemetry.tireWearRR ?? rawTelemetry?.tire_wear?.[3] ?? 0,
  ];

  const maxWear = Math.max(...wearValues, 0);
  const tyreAge = telemetry.tireAge || 0;
  const wearRate = tyreAge > 0 ? maxWear / tyreAge : 0;

  let lapsTo70 = 999;
  if (maxWear >= 70) {
    lapsTo70 = 0;
  } else if (wearRate > 0) {
    lapsTo70 = Math.max(0, Math.round((70 - maxWear) / wearRate));
  }

  let status: 'healthy' | 'caution' | 'critical' = 'healthy';
  if (maxWear >= 80) {
    status = 'critical';
  } else if (maxWear >= 65) {
    status = 'caution';
  }

  return { maxWear, status, lapsTo70 };
};

const detectWeatherTrend = (
  telemetry: StandardizedTelemetry,
  rawTelemetry: TelemetryData | undefined,
  currentLap: number,
): WeatherOutlook => {
  const weatherCode =
    typeof rawTelemetry?.weather === 'number' && Number.isFinite(rawTelemetry.weather)
      ? rawTelemetry.weather
      : undefined;
  const currentWeather = weatherLabel(weatherCode);

  const totalRaceLaps = telemetry.totalLaps || rawTelemetry?.total_laps || 0;
  const bestLapSeconds = rawTelemetry?.best_lap_time ?? 0;
  const avgLapSeconds = bestLapSeconds > 0 ? bestLapSeconds : 90;
  const toLap = (timeOffsetSeconds: number | undefined) => {
    if (!Number.isFinite(timeOffsetSeconds) || avgLapSeconds <= 0) {
      return currentLap + 1;
    }
    const lapsAhead = (timeOffsetSeconds ?? 0) / avgLapSeconds;
    return Math.max(currentLap + 1, currentLap + Math.max(1, Math.round(lapsAhead)));
  };

  const rawForecast = (rawTelemetry as any)?.weather_forecast_samples as
    | Array<{
        m_sessionType?: number;
        m_timeOffset?: number;
        m_timeOffsetSeconds?: number;
        m_weather: number;
        m_trackTemperature?: number;
        m_trackTemperatureChange?: number;
        m_airTemperature?: number;
        m_airTemperatureChange?: number;
        m_rainPercentage?: number;
      }>
    | undefined;

  type ForecastSample = {
    label: WeatherOutlook['current'];
    weatherCode: number;
    rainPercent?: number;
    timeOffsetSeconds: number;
    lapEstimate: number;
  };

  const normalizeSample = (sample: any): ForecastSample | null => {
    if (!sample || typeof sample.m_weather !== 'number') {
      return null;
    }

    const timeOffsetSecondsRaw =
      typeof sample.m_timeOffsetSeconds === 'number' && Number.isFinite(sample.m_timeOffsetSeconds)
        ? sample.m_timeOffsetSeconds
        : undefined;

    const timeOffsetSecondsFallback =
      typeof sample.m_timeOffset === 'number' && Number.isFinite(sample.m_timeOffset)
        ? (sample.m_timeOffset as number) * 60
        : undefined;

    const timeOffsetSeconds = timeOffsetSecondsRaw ?? timeOffsetSecondsFallback;
    if (!Number.isFinite(timeOffsetSeconds)) {
      return null;
    }

    const rainPercent =
      typeof sample.m_rainPercentage === 'number' && Number.isFinite(sample.m_rainPercentage)
        ? sample.m_rainPercentage
        : undefined;

    const label = weatherLabel(sample.m_weather);
    return {
      label,
      weatherCode: sample.m_weather,
      rainPercent,
      timeOffsetSeconds: timeOffsetSeconds as number,
      lapEstimate: toLap(timeOffsetSeconds as number),
    };
  };

  const forecastSamples =
    rawForecast
      ?.map(normalizeSample)
      .filter((sample): sample is ForecastSample => sample !== null)
      .sort((a, b) => a.timeOffsetSeconds - b.timeOffsetSeconds) ?? [];

  const futureChange = forecastSamples.find(sample => sample.label !== currentWeather);

  const trend: WeatherOutlook['trend'] =
    futureChange && futureChange.label === 'dry' && currentWeather !== 'dry'
      ? 'drying'
      : futureChange && currentWeather === 'dry' && futureChange.label !== 'dry'
        ? 'worsening'
        : 'stable';

  const lapsUntilChange =
    futureChange && avgLapSeconds > 0
      ? Math.max(1, Math.round(futureChange.timeOffsetSeconds / avgLapSeconds))
      : 0;
  const nextChangeLap = futureChange ? Math.max(currentLap + 1, currentLap + Math.max(1, lapsUntilChange)) : null;

  const description = futureChange
    ? `Weather: ${currentWeather.replace('-', ' ')} -> ${futureChange.label.replace('-', ' ')} in ~${Math.max(1, lapsUntilChange)} laps`
    : `Weather: ${currentWeather.replace('-', ' ')}`;

  const processedForecast = forecastSamples.map((sample, index, list) => {
    const windowStart = Math.max(0, index - 1);
    const windowEnd = Math.min(list.length - 1, index + 1);
    let sum = 0;
    let count = 0;

    for (let i = windowStart; i <= windowEnd; i++) {
      const neighbor = list[i];
      const baseline =
        typeof neighbor.rainPercent === 'number'
          ? neighbor.rainPercent
          : neighbor.label !== 'dry'
            ? 60
            : 0;
      sum += baseline;
      count += 1;
    }

    const smoothedRain = count > 0 ? sum / count : 0;

    return {
      ...sample,
      smoothedRain,
    };
  });

  const lapCeiling = totalRaceLaps > 0 ? totalRaceLaps : currentLap + 10;

  const countSustain = (
    startIndex: number,
    direction: 'wet-incoming' | 'drying',
    sustainThreshold: number,
  ) => {
    let streak = 1;
    let previous = processedForecast[startIndex].smoothedRain;

    for (let i = startIndex + 1; i < processedForecast.length; i++) {
      const value = processedForecast[i].smoothedRain;
      const followsTrend =
        direction === 'wet-incoming'
          ? value >= sustainThreshold && value + 3 >= previous
          : value <= sustainThreshold && value - 3 <= previous;

      if (!followsTrend) {
        break;
      }

      streak += 1;
      previous = value;
    }

    return streak;
  };

  const confidenceFrom = (streak: number, delta: number): WeatherCrossover['confidence'] => {
    if (streak >= 3 && delta >= 10) return 'high';
    if (streak >= 2 && delta >= 6) return 'medium';
    return 'low';
  };

  const evaluateCrossover = (direction: 'wet-incoming' | 'drying'): WeatherCrossover | null => {
    if (processedForecast.length < 2) {
      return null;
    }

    const thresholds =
      direction === 'wet-incoming'
        ? { primed: 25, trigger: 40, sustain: 35 }
        : { primed: 35, trigger: 20, sustain: 25 };

    for (let i = 1; i < processedForecast.length; i++) {
      const previousSample = processedForecast[i - 1];
      const currentSample = processedForecast[i];
      const previousRain = previousSample.smoothedRain;
      const currentRain = currentSample.smoothedRain;

      if (direction === 'wet-incoming') {
        const delta = currentRain - previousRain;
        const labelSupportsRain = currentSample.label !== 'dry';
        if (
          previousRain < thresholds.primed &&
          currentRain >= thresholds.trigger &&
          delta >= 5 &&
          labelSupportsRain
        ) {
          const streak = countSustain(i, direction, thresholds.sustain);
          const confidence = confidenceFrom(streak, delta);
          const expectedLap = clampLap(currentSample.lapEstimate, lapCeiling);
          return {
            type: 'wet-incoming',
            expectedLap,
            confidence,
            description: `Rain intensity rising - expect inters around lap ${expectedLap}`,
          };
        }
      } else {
        const delta = previousRain - currentRain;
        const labelSupportsDry = currentSample.label === 'dry' || currentRain <= thresholds.trigger;
        if (
          previousRain > thresholds.primed &&
          currentRain <= thresholds.trigger &&
          delta >= 5 &&
          labelSupportsDry
        ) {
          const streak = countSustain(i, direction, thresholds.sustain);
          const confidence = confidenceFrom(streak, delta);
          const expectedLap = clampLap(currentSample.lapEstimate, lapCeiling);
          return {
            type: 'drying',
            expectedLap,
            confidence,
            description: `Track drying - slicks viable around lap ${expectedLap}`,
          };
        }
      }
    }

    return null;
  };

  let crossover: WeatherCrossover | null = null;
  if (processedForecast.length > 0) {
    crossover = currentWeather === 'dry' ? evaluateCrossover('wet-incoming') : evaluateCrossover('drying');

    if (crossover && crossover.confidence === 'low') {
      const crossoverIsImminent = Math.abs(crossover.expectedLap - currentLap) <= 4;
      if (!crossoverIsImminent) {
        crossover = null;
      }
    }
  }

  return {
    current: currentWeather,
    trend,
    nextChangeLap,
    description,
    crossover,
  };
};

const computeAdvisories = (
  telemetry: StandardizedTelemetry,
  rawTelemetry: TelemetryData | undefined,
  tyreHealth: LivePitStrategyResult['tyreHealth'],
  weather: WeatherOutlook,
  lapsRemaining: number,
): StrategyAdvisory[] => {
  const advisories: StrategyAdvisory[] = [];
  const fuelRemaining = rawTelemetry?.fuel_remaining_laps ?? telemetry.fuelRemainingLaps ?? 0;
  const isF1Game = typeof telemetry.gameName === 'string' && telemetry.gameName.startsWith('F1');
  const atlasAI = (rawTelemetry as any)?.atlas_ai;
  const rawFuelMargin = isF1Game
    ? rawTelemetry?.fuel_remaining_laps ?? telemetry.fuelRemainingLaps
    : null;
  const fuelMargin =
    isF1Game
      ? typeof rawFuelMargin === 'number' && Number.isFinite(rawFuelMargin)
        ? rawFuelMargin
        : null
      : typeof atlasAI?.fuel_margin_laps === 'number' && Number.isFinite(atlasAI.fuel_margin_laps)
        ? atlasAI.fuel_margin_laps
        : null;
  const fuelModelReady = isF1Game ? telemetry.currentLapNum >= 2 : Boolean(atlasAI?.fuel_calc_ready);

  if (weather.crossover) {
    advisories.push({
      type: 'weather',
      severity: weather.crossover.type === 'wet-incoming' ? 'warning' : 'info',
      message: `${weather.crossover.description} (confidence ${weather.crossover.confidence.toUpperCase()})`,
    });
  }

  if (tyreHealth.status === 'critical' || tyreHealth.lapsTo70 <= 1) {
    advisories.push({
      type: 'tyre',
      severity: 'critical',
      message: `Tyre wear ${tyreHealth.maxWear.toFixed(0)}% - puncture risk imminent`,
    });
  } else if (tyreHealth.status === 'caution' || tyreHealth.lapsTo70 <= 3) {
    advisories.push({
      type: 'tyre',
      severity: 'warning',
      message: `Tyre wear ${tyreHealth.maxWear.toFixed(0)}% - life remaining ~${Math.max(
        1,
        tyreHealth.lapsTo70,
      )} laps`,
    });
  }

  if (isF1Game) {
    if (fuelModelReady && fuelMargin !== null) {
      if (fuelMargin >= 0.2) {
        advisories.push({
          type: 'fuel',
          severity: 'info',
          message: `Extra fuel by ${fuelMargin.toFixed(1)} laps`,
        });
      } else if (fuelMargin < -0.1) {
        advisories.push({
          type: 'fuel',
          severity: 'warning',
          message: `Fuel short by ${Math.abs(fuelMargin).toFixed(1)} laps - save or pit`,
        });
      }
    }
  } else if (fuelRemaining > 0 && fuelRemaining < lapsRemaining) {
    advisories.push({
      type: 'fuel',
      severity: 'warning',
      message: `Fuel short by ${(lapsRemaining - fuelRemaining).toFixed(1)} laps - save or pit`,
    });
  }

  if (weather.trend === 'worsening' && weather.nextChangeLap) {
    advisories.push({
      type: 'weather',
      severity: 'warning',
      message: `Rain expected around lap ${weather.nextChangeLap}`,
    });
  } else if (weather.trend === 'drying' && weather.nextChangeLap) {
    advisories.push({
      type: 'weather',
      severity: 'info',
      message: `Track drying around lap ${weather.nextChangeLap}`,
    });
  }

  return advisories;
};

const computeRejoinForecast = (
  telemetry: StandardizedTelemetry,
  plan: LiveStrategyPlan | undefined,
  pitDelta: number,
  multiCarData: MultiCarTelemetryData | null,
  options?: {
    forceLowConfidence?: boolean;
    messageOverride?: string;
  },
): RejoinForecast | null => {
  if (!plan || !plan.nextStop) {
    return null;
  }
  if (!multiCarData || !Array.isArray(multiCarData.cars) || multiCarData.cars.length === 0) {
    return null;
  }
  if (!Number.isFinite(pitDelta) || pitDelta <= 0) {
    return null;
  }

  const currentLap = telemetry.currentLapNum || 0;
  const targetLap = plan.nextStop.lap;
  const lapsUntilStop = Math.max(0, targetLap - currentLap);

  const playerCar =
    multiCarData.cars.find(car => car.is_player === 1) ??
    multiCarData.cars.find(car => car.position === telemetry.position);

  if (!playerCar) {
    return null;
  }

  const leaderCar = multiCarData.cars.find(car => car.position === 1) ?? null;
  const safeLapTime = (value: number | undefined | null) =>
    Number.isFinite(value) && (value as number) > 0 ? (value as number) : null;
  const leaderLap =
    safeLapTime(leaderCar?.last_lap_time) ?? safeLapTime(leaderCar?.current_lap_time);
  const hasPaceData = leaderLap !== null && lapsUntilStop > 0;

  const projectGapToLeader = (car: MultiCarTelemetryData['cars'][number]): number => {
    const baseGap =
      Number.isFinite(car.gap_to_leader) && (car.gap_to_leader as number) >= 0
        ? (car.gap_to_leader as number)
        : 0;
    if (!hasPaceData || leaderLap === null) {
      return baseGap;
    }
    const lapTime = safeLapTime(car.last_lap_time) ?? safeLapTime(car.current_lap_time);
    if (lapTime === null) {
      return baseGap;
    }
    const deltaPerLap = lapTime - leaderLap;
    const projected = baseGap + deltaPerLap * lapsUntilStop;
    return Math.max(0, projected);
  };

  const projectedGapToLeader = projectGapToLeader(playerCar);
  const projectedRejoinGap = projectedGapToLeader + pitDelta;

  const entries = multiCarData.cars
    .filter(car => car.position && car.position !== playerCar.position)
    .map(car => ({
      car,
      projectedGap: projectGapToLeader(car),
    }))
    .filter(entry => Number.isFinite(entry.projectedGap))
    .sort((a, b) => a.projectedGap - b.projectedGap);

  if (entries.length === 0) {
    return null;
  }

  const buildOpponent = (source: typeof entries[number] | null, gapSeconds: number | null): RejoinOpponent | null => {
    if (!source) {
      return null;
    }
    const driverName =
      source.car.driver_name?.trim() ||
      (source.car.position ? `P${source.car.position}` : 'Unknown');

    return {
      driver: driverName,
      position: source.car.position ?? null,
      gapSeconds: gapSeconds !== null ? Math.max(0, gapSeconds) : null,
    };
  };

  let aheadEntry: typeof entries[number] | null = null;
  let behindEntry: typeof entries[number] | null = null;

  for (const entry of entries) {
    if (entry.projectedGap <= projectedRejoinGap) {
      aheadEntry = entry;
    } else {
      behindEntry = entry;
      break;
    }
  }

  if (!behindEntry) {
    behindEntry = entries.find(entry => entry.projectedGap >= projectedRejoinGap) ?? null;
  }

  const ahead = buildOpponent(
    aheadEntry,
    aheadEntry ? projectedRejoinGap - aheadEntry.projectedGap : null,
  );
  const behind = buildOpponent(
    behindEntry,
    behindEntry ? behindEntry.projectedGap - projectedRejoinGap : null,
  );

  const totalCars = multiCarData?.num_active_cars ?? multiCarData?.cars?.length ?? 20;
  const carsAhead = entries.filter(entry => entry.projectedGap < projectedRejoinGap).length;
  const predictedPosition = Math.min(totalCars, Math.max(1, carsAhead + 1));

  const forceLowConfidence = options?.forceLowConfidence === true;
  const confidence: RejoinForecast['confidence'] =
    forceLowConfidence
      ? 'low'
      : hasPaceData && entries.length >= 3
        ? 'medium'
        : 'low';

  return {
    lap: targetLap,
    position: forceLowConfidence ? null : predictedPosition,
    ahead: forceLowConfidence ? null : ahead,
    behind: forceLowConfidence ? null : behind,
    confidence,
    message: options?.messageOverride ?? 'Projection based on current gaps, pace trend, and pit delta',
  };
};

export interface UseLivePitStrategyParams {
  telemetry: StandardizedTelemetry | null;
  multiCarData: MultiCarTelemetryData | null;
  tyreSets: TyreSetData[];
}

export const useLivePitStrategy = ({
  telemetry,
  multiCarData: _multiCarData, // reserved for future spatial modelling
  tyreSets,
}: UseLivePitStrategyParams): LivePitStrategyResult => {
  return useMemo(() => {
    if (!telemetry) {
      return FALLBACK_RESULT;
    }

    const rawTelemetry = telemetry.raw as TelemetryData | undefined;
    const multiCarData = _multiCarData;
    const totalLaps = telemetry.totalLaps || rawTelemetry?.total_laps || 0;
    const currentLap = telemetry.currentLapNum || rawTelemetry?.current_lap_num || 0;
    const lapsRemaining = Math.max(0, totalLaps - currentLap);
    const isF1Game = typeof telemetry.gameName === 'string' && telemetry.gameName.startsWith('F1');
    const pitStopsCompleted = rawTelemetry?.atlas_ai?.pit_stops_completed ?? 0;
    const mustStop = isF1Game && pitStopsCompleted < 1;

    if (totalLaps <= 0) {
      return FALLBACK_RESULT;
    }

    const codemastersWindow = {
      ideal: telemetry.pitWindowIdealLap || rawTelemetry?.pit_window_ideal_lap,
      latest: telemetry.pitWindowLatestLap || rawTelemetry?.pit_window_latest_lap,
    };

    const tyreHealth = computeWearStatus(telemetry, rawTelemetry);
    const weather = detectWeatherTrend(telemetry, rawTelemetry, currentLap);
    const advisories = computeAdvisories(telemetry, rawTelemetry, tyreHealth, weather, lapsRemaining);

    const trackId = telemetry.trackId ?? rawTelemetry?.track_id ?? 0;
    const pitDelta =
      ((rawTelemetry as any)?.atlas_ai?.pit_delta_time ??
        PIT_DELTA_BY_TRACK[trackId] ??
        DEFAULT_PIT_DELTA);

    const cheapStopActive =
      (rawTelemetry?.atlas_ai as any)?.pit_cheap_stop_available === 1 ||
      (rawTelemetry?.safety_car_status ?? 0) > 0;

    const currentCompound = compoundFromValue((rawTelemetry as any)?.tire_compound);
    const availableSofts = countAvailableSets(tyreSets, 'Soft');
    const availableMediums = countAvailableSets(tyreSets, 'Medium');
    const availableHards = countAvailableSets(tyreSets, 'Hard');
    const wetIncoming = weather.crossover?.type === 'wet-incoming';
    const wetCompound: CompoundName | null =
      weather.current === 'light-rain'
        ? 'Intermediate'
        : weather.current === 'rain' || weather.current === 'storm'
          ? 'Wet'
          : wetIncoming
            ? 'Intermediate'
            : null;

    // Baseline template laps
    const oneStopLap = codemastersWindow.ideal
      ? codemastersWindow.ideal
      : Math.round(totalLaps * 0.45);
    const twoStopLap1 = Math.max(6, Math.round(totalLaps * 0.3));
    const twoStopLap2 = Math.max(twoStopLap1 + 5, Math.round(totalLaps * 0.65));

    const tyreCriticalLap = currentLap + tyreHealth.lapsTo70;
    const adjustedOneStopLap = tyreHealth.lapsTo70 < 999
      ? Math.min(oneStopLap, tyreCriticalLap)
      : oneStopLap;

    const isDryCompoundName = (compound: CompoundName | 'Current' | 'Unknown'): compound is CompoundName =>
      compound === 'Soft' || compound === 'Medium' || compound === 'Hard';

    const isDryCurrentCompound =
      currentCompound === 'Soft' || currentCompound === 'Medium' || currentCompound === 'Hard';

    const rainStopActive =
      weather.current !== 'dry' && wetCompound !== null && isDryCurrentCompound;

    const stintLengthAfterStop = (stopLap: number, nextStopLap?: number) => {
      if (nextStopLap && nextStopLap > stopLap) {
        return Math.max(1, nextStopLap - stopLap);
      }
      return Math.max(1, totalLaps - stopLap + 1);
    };

    const pickDryCompound = (stintLaps: number): CompoundName => {
      if (stintLaps <= 5 && availableSofts > 0) {
        return 'Soft';
      }
      if (stintLaps <= 10 && availableMediums > 0) {
        return 'Medium';
      }
      if (availableHards > 0) {
        return 'Hard';
      }
      if (availableMediums > 0) {
        return 'Medium';
      }
      if (availableSofts > 0) {
        return 'Soft';
      }
      return 'Medium';
    };

    const pickCompoundForStint = (stintLaps: number): CompoundName =>
      wetCompound ?? pickDryCompound(stintLaps);

    const chooseAlternateCompound = (compound: CompoundName): CompoundName => {
      const order: CompoundName[] =
        compound === 'Soft'
          ? ['Medium', 'Hard']
          : compound === 'Medium'
            ? ['Hard', 'Soft']
            : ['Medium', 'Soft'];

      const availability = (option: CompoundName) => {
        switch (option) {
          case 'Soft':
            return availableSofts;
          case 'Medium':
            return availableMediums;
          case 'Hard':
            return availableHards;
          default:
            return 0;
        }
      };

      const availableChoice = order.find(option => availability(option) > 0);
      return availableChoice ?? order[0];
    };

    const avoidCurrentCompound = (compound: CompoundName): CompoundName => {
      if (!isDryCurrentCompound || !isDryCompoundName(compound)) {
        return compound;
      }
      if (compound !== currentCompound) {
        return compound;
      }
      return chooseAlternateCompound(currentCompound as CompoundName);
    };

    const lastPitLap = Math.max(1, totalLaps - 1);
    const clampPitLap = (lap: number) => clampLap(Math.min(lap, lastPitLap), totalLaps);
    const weatherPlanNote =
      wetCompound !== null ? `Switch to ${wetCompound} to match conditions.` : null;
    const rainPlan =
      rainStopActive && wetCompound !== null
        ? buildPlan({
            id: 'R',
            title: 'Plan R - Rain Switch',
            description: `Rain detected - box now for ${wetCompound}. Expect a mass pit cycle.`,
            targetLaps: [clampPitLap(currentLap)],
            compounds: [wetCompound],
            baseRisk: 'medium',
            baseConfidence: 78,
            telemetry,
            totalLaps,
            tyreHealth,
            codemastersWindow,
            cheapStopActive: false,
          })
        : null;

    const planATargetLap = clampPitLap(adjustedOneStopLap);
    const planACompound = avoidCurrentCompound(pickCompoundForStint(stintLengthAfterStop(planATargetLap)));
    const planA = buildPlan({
      id: 'A',
      title: 'Plan A - Primary Stop',
      description: weatherPlanNote ?? 'Align with Codemasters window and tyre wear trend.',
      targetLaps: [planATargetLap],
      compounds: [planACompound],
      baseRisk: 'low',
      baseConfidence: 85,
      telemetry,
      totalLaps,
      tyreHealth,
      codemastersWindow,
      cheapStopActive,
    });

    const planBStops: number[] = [];
    if (lapsRemaining > 10) {
      planBStops.push(Math.min(twoStopLap1, Math.max(currentLap + 3, tyreCriticalLap - 3)));
      const secondStop = Math.max(
        planBStops[0] + 6,
        Math.min(twoStopLap2, totalLaps - 3),
      );
      planBStops.push(secondStop);
    }

    const planBCompounds =
      planBStops.length > 0
        ? planBStops.map((stop, index) => {
            const nextStop = planBStops[index + 1];
            return avoidCurrentCompound(pickCompoundForStint(stintLengthAfterStop(stop, nextStop)));
          })
        : [];

    const planB =
      planBStops.length > 0
        ? buildPlan({
            id: 'B',
            title: 'Plan B - Aggressive 2-Stop',
            description: weatherPlanNote ?? 'Shorter stints to protect tyre temps and chase pace.',
            targetLaps: planBStops,
            compounds: planBCompounds,
            baseRisk: 'medium',
            baseConfidence: 72,
            telemetry,
            totalLaps,
            tyreHealth,
            codemastersWindow,
            cheapStopActive,
          })
        : null;

    const planCTargetLap = clampPitLap(Math.min(tyreCriticalLap, Math.max(currentLap + 2, oneStopLap + 4)));
    const planCCompound = avoidCurrentCompound(pickCompoundForStint(stintLengthAfterStop(planCTargetLap)));
    const planC = buildPlan({
      id: 'C',
      title: 'Plan C - Reactive Stop',
      description:
        weatherPlanNote ??
        (weather.current !== 'dry'
          ? 'Prepare inter/wet crossover if conditions worsen.'
          : 'Fallback box for fresh tyres if wear spikes.'),
      targetLaps: [planCTargetLap],
      compounds: [planCCompound],
      baseRisk: weather.current !== 'dry' ? 'medium' : 'high',
      baseConfidence: weather.current !== 'dry' ? 70 : 60,
      telemetry,
      totalLaps,
      tyreHealth,
      codemastersWindow,
      cheapStopActive,
    });

    const planDTargetLap = clampPitLap(Math.max(currentLap + 1, planATargetLap - 2));
    const planDCompound = avoidCurrentCompound(pickCompoundForStint(stintLengthAfterStop(planDTargetLap)));
    const planD = buildPlan({
      id: 'D',
      title: 'Plan D - Undercut',
      description: weatherPlanNote ?? 'Early stop to gain clean air or protect position.',
      targetLaps: [planDTargetLap],
      compounds: [planDCompound],
      baseRisk: 'medium',
      baseConfidence: 68,
      telemetry,
      totalLaps,
      tyreHealth,
      codemastersWindow,
      cheapStopActive,
    });

    const planETargetLap = clampPitLap(
      Math.max(
        currentLap + 1,
        Math.max(planATargetLap + 2, codemastersWindow.latest ?? planATargetLap + 2),
      ),
    );
    const planECompound = avoidCurrentCompound(pickCompoundForStint(stintLengthAfterStop(planETargetLap)));
    const planE = buildPlan({
      id: 'E',
      title: 'Plan E - Overcut',
      description: weatherPlanNote ?? 'Late stop to defend track position if tyres allow.',
      targetLaps: [planETargetLap],
      compounds: [planECompound],
      baseRisk: 'low',
      baseConfidence: 66,
      telemetry,
      totalLaps,
      tyreHealth,
      codemastersWindow,
      cheapStopActive,
    });

    const planFTargetLap = clampPitLap(
      mustStop ? Math.max(currentLap + 1, tyreCriticalLap) : currentLap + 1,
    );
    const planFCompound = avoidCurrentCompound(pickCompoundForStint(stintLengthAfterStop(planFTargetLap)));
    const planF =
      mustStop || cheapStopActive
        ? buildPlan({
            id: 'F',
            title: mustStop ? 'Plan F - Mandatory Stop' : 'Plan F - Safety Car Stop',
            description: mustStop
              ? 'Mandatory stop window - box before tyres breach the 70% wear target.'
              : 'Take the cheap stop window to preserve track position.',
            targetLaps: [planFTargetLap],
            compounds: [planFCompound],
            baseRisk: mustStop ? 'high' : 'medium',
            baseConfidence: mustStop ? 70 : 62,
            telemetry,
            totalLaps,
            tyreHealth,
            codemastersWindow,
            cheapStopActive,
          })
        : null;

    const plans: LiveStrategyPlan[] = [];
    if (rainPlan) {
      plans.push(rainPlan);
    }
    plans.push(planA);
    if (planB) {
      plans.push(planB);
    }
    plans.push(planC, planD, planE);
    if (planF) {
      plans.push(planF);
    }

    const isPlanExpired = (plan: LiveStrategyPlan) =>
      plan.nextStop !== null && plan.nextStop.windowEnd < currentLap;
    let filteredPlans = plans.filter(plan => !isPlanExpired(plan));
    if (filteredPlans.length === 0 && mustStop && totalLaps > currentLap) {
      const forcedLap = clampPitLap(Math.max(currentLap + 1, totalLaps - 1));
      const forcedCompound = avoidCurrentCompound(pickCompoundForStint(stintLengthAfterStop(forcedLap)));
      filteredPlans = [
        buildPlan({
          id: 'F',
          title: 'Plan F - Mandatory Stop',
          description: 'Mandatory stop required to finish the race legally.',
          targetLaps: [forcedLap],
          compounds: [forcedCompound],
          baseRisk: 'high',
          baseConfidence: 65,
          telemetry,
          totalLaps,
          tyreHealth,
          codemastersWindow,
          cheapStopActive,
        }),
      ];
    }

    const primaryPlanIndex = Math.max(
      0,
      filteredPlans.findIndex(plan => plan.id === 'A'),
    );
    const rejoinForecasts = filteredPlans.map(plan =>
      computeRejoinForecast(telemetry, plan, pitDelta, multiCarData, {
        forceLowConfidence: plan.id === 'R',
        messageOverride: plan.id === 'R' ? 'Mass pit cycle - rejoin highly uncertain' : undefined,
      }),
    );
    const rejoinForecast = rejoinForecasts[primaryPlanIndex] ?? null;

    return {
      ready: true,
      plans: filteredPlans,
      primaryPlanIndex,
      pitWindowStatus: determinePitWindowStatus(currentLap, codemastersWindow.ideal, codemastersWindow.latest),
      codemastersWindow,
      rejoinForecast,
      rejoinForecasts,
      tyreHealth,
      weather,
      advisories,
    };
  }, [telemetry, tyreSets, _multiCarData]);
};
