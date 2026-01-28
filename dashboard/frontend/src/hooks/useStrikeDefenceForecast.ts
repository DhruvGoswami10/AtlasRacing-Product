import { useEffect, useMemo, useRef } from 'react';
import type { StandardizedTelemetry } from '../utils/telemetryConverter';
import type { TrackOpponent } from '../components/DevModeTrackMap';

type ForecastConfidence = 'low' | 'medium' | 'high';
type ForecastTrend = 'closing' | 'pulling away' | 'stable' | 'unknown';

interface StrikeHistoryEntry {
  lap: number;
  gapAhead: number | null;
  gapBehind: number | null;
}

export interface StrikeForecastDetail {
  gapSeconds: number | null;
  ratePerLap: number | null;
  projectedLaps: number | null;
  trend: ForecastTrend;
  confidence: ForecastConfidence;
  summary: string;
}

export interface StrikeDefenceForecast {
  ahead: StrikeForecastDetail;
  behind: StrikeForecastDetail;
  overlayCallout: string;
}

const MAX_HISTORY = 6;
const MIN_GAP_SAMPLE = 0.05;
const FORECAST_HORIZON_LAPS = 4;

const formatGap = (gap: number | null) => {
  if (gap === null || !Number.isFinite(gap)) {
    return 'n/a';
  }
  if (gap >= 10) {
    return `${gap.toFixed(1)}s`;
  }
  return `${gap.toFixed(2)}s`;
};

const buildSummary = (
  label: 'ahead' | 'behind',
  gap: number | null,
  rate: number | null,
  projected: number | null,
  trend: ForecastTrend,
) => {
  if (gap === null || trend === 'unknown') {
    return `No reliable ${label} data yet`;
  }
  if (trend === 'stable') {
    return `${formatGap(gap)} ${label}; pace delta negligible`;
  }
  if (projected !== null && projected <= FORECAST_HORIZON_LAPS) {
    const approx = Math.max(1, Math.round(projected));
    if (label === 'ahead') {
      return `Close in ~${approx} lap${approx > 1 ? 's' : ''} (${formatGap(gap)} gap)`;
    }
    return `Being caught in ~${approx} lap${approx > 1 ? 's' : ''} (${formatGap(gap)} gap)`;
  }
  const sign = rate && rate > 0 ? '+' : '';
  const rateLabel = rate !== null ? `${sign}${rate.toFixed(2)}s/lap` : '0.00s/lap';
  if (label === 'ahead') {
    return `${trend === 'closing' ? 'Gaining' : 'Losing'} ${rateLabel} on car ahead (${formatGap(gap)})`;
  }
  return `${trend === 'closing' ? 'Rival gaining' : 'Pulling away'} ${rateLabel} on car behind (${formatGap(gap)})`;
};

const computeConfidence = (rate: number | null, projected: number | null): ForecastConfidence => {
  if (rate === null) return 'low';
  const magnitude = Math.abs(rate);
  if (magnitude < 0.03) {
    return 'low';
  }
  if (projected !== null && projected <= FORECAST_HORIZON_LAPS) {
    return 'high';
  }
  if (magnitude > 0.08) {
    return 'medium';
  }
  return 'low';
};

const computeTrend = (
  history: StrikeHistoryEntry[],
  selector: (entry: StrikeHistoryEntry) => number | null,
): { rate: number | null; projected: number | null; trend: ForecastTrend; latest: number | null } => {
  if (history.length < 2) {
    return { rate: null, projected: null, trend: 'unknown', latest: selector(history[history.length - 1] ?? { lap: 0, gapAhead: null, gapBehind: null }) };
  }

  const latestEntry = history[history.length - 1];
  const latestGap = selector(latestEntry);

  let comparison: StrikeHistoryEntry | null = null;
  for (let i = history.length - 2; i >= 0; i -= 1) {
    const entry = history[i];
    if (latestEntry.lap - entry.lap >= 1) {
      comparison = entry;
      break;
    }
  }

  if (!comparison) {
    return { rate: null, projected: null, trend: 'unknown', latest: latestGap };
  }

  const previousGap = selector(comparison);
  if (
    previousGap === null ||
    latestGap === null ||
    !Number.isFinite(previousGap) ||
    !Number.isFinite(latestGap)
  ) {
    return { rate: null, projected: null, trend: 'unknown', latest: latestGap };
  }

  const lapDelta = latestEntry.lap - comparison.lap;
  if (lapDelta <= 0) {
    return { rate: null, projected: null, trend: 'unknown', latest: latestGap };
  }

  const diff = previousGap - latestGap;
  if (Math.abs(diff) < MIN_GAP_SAMPLE) {
    return { rate: 0, projected: null, trend: 'stable', latest: latestGap };
  }

  const ratePerLap = diff / lapDelta;
  const trend: ForecastTrend = ratePerLap > 0 ? 'closing' : 'pulling away';

  if (trend === 'pulling away') {
    return { rate: ratePerLap, projected: null, trend, latest: latestGap };
  }

  if (ratePerLap <= 0.0001) {
    return { rate: null, projected: null, trend: 'stable', latest: latestGap };
  }

  const projected = latestGap > 0 ? latestGap / ratePerLap : 0;
  return { rate: ratePerLap, projected, trend, latest: latestGap };
};

export const useStrikeDefenceForecast = (
  telemetry: StandardizedTelemetry | null,
  aheadOpponent: TrackOpponent | undefined,
  behindOpponent: TrackOpponent | undefined,
): StrikeDefenceForecast => {
  const historyRef = useRef<StrikeHistoryEntry[]>([]);
  const lastLapRef = useRef<number | null>(null);
  const historyLength = historyRef.current.length;
  const hasTelemetry = Boolean(telemetry);
  const currentLapNum = telemetry?.currentLapNum ?? 0;
  const aheadGap =
    aheadOpponent && typeof aheadOpponent.gapToPlayer === 'number'
      ? Math.abs(aheadOpponent.gapToPlayer)
      : null;
  const behindGap =
    behindOpponent && typeof behindOpponent.gapToPlayer === 'number'
      ? Math.abs(behindOpponent.gapToPlayer)
      : null;

  useEffect(() => {
    if (!hasTelemetry) {
      historyRef.current = [];
      lastLapRef.current = null;
      return;
    }

    if (currentLapNum <= 0 || currentLapNum === lastLapRef.current) {
      return;
    }

    historyRef.current = [
      ...historyRef.current.slice(-MAX_HISTORY + 1),
      {
        lap: currentLapNum,
        gapAhead: aheadGap,
        gapBehind: behindGap,
      },
    ];
    lastLapRef.current = currentLapNum;
  }, [hasTelemetry, currentLapNum, aheadGap, behindGap]);

  return useMemo(() => {
    if (!hasTelemetry || historyLength === 0) {
      return {
        ahead: {
          gapSeconds: null,
          ratePerLap: null,
          projectedLaps: null,
          trend: 'unknown',
          confidence: 'low',
          summary: 'Waiting for lap data...',
        },
        behind: {
          gapSeconds: null,
          ratePerLap: null,
          projectedLaps: null,
          trend: 'unknown',
          confidence: 'low',
          summary: 'Waiting for lap data...',
        },
        overlayCallout: 'Strategy data warming up',
      };
    }

    const aheadTrend = computeTrend(historyRef.current, (entry) => entry.gapAhead);
    const behindTrend = computeTrend(historyRef.current, (entry) => entry.gapBehind);

    const aheadDetail: StrikeForecastDetail = {
      gapSeconds: aheadTrend.latest,
      ratePerLap: aheadTrend.rate,
      projectedLaps:
        aheadTrend.projected !== null && aheadTrend.projected !== undefined
          ? aheadTrend.projected
          : null,
      trend: aheadTrend.trend,
      confidence: computeConfidence(aheadTrend.rate, aheadTrend.projected),
      summary: buildSummary('ahead', aheadTrend.latest, aheadTrend.rate, aheadTrend.projected, aheadTrend.trend),
    };

    const behindDetail: StrikeForecastDetail = {
      gapSeconds: behindTrend.latest,
      ratePerLap: behindTrend.rate,
      projectedLaps:
        behindTrend.projected !== null && behindTrend.projected !== undefined
          ? behindTrend.projected
          : null,
      trend: behindTrend.trend,
      confidence: computeConfidence(behindTrend.rate, behindTrend.projected),
      summary: buildSummary('behind', behindTrend.latest, behindTrend.rate, behindTrend.projected, behindTrend.trend),
    };

    let overlayCallout = 'Pace steady — manage tyres';
    if (
      aheadDetail.projectedLaps !== null &&
      aheadDetail.projectedLaps <= FORECAST_HORIZON_LAPS &&
      aheadDetail.gapSeconds !== null
    ) {
      const approx = Math.max(1, Math.round(aheadDetail.projectedLaps));
      overlayCallout = `Push now — catch car ahead in ~${approx} lap${approx > 1 ? 's' : ''}`;
    } else if (
      behindDetail.projectedLaps !== null &&
      behindDetail.projectedLaps <= FORECAST_HORIZON_LAPS &&
      behindDetail.gapSeconds !== null
    ) {
      const approx = Math.max(1, Math.round(behindDetail.projectedLaps));
      overlayCallout = `Defend — rival closing in ~${approx} lap${approx > 1 ? 's' : ''}`;
    } else if (aheadDetail.ratePerLap !== null && aheadDetail.ratePerLap > 0.05) {
      overlayCallout = `Gain ${aheadDetail.ratePerLap.toFixed(2)}s/lap on car ahead`;
    } else if (behindDetail.ratePerLap !== null && behindDetail.ratePerLap > 0.05) {
      overlayCallout = `Rival taking ${behindDetail.ratePerLap.toFixed(2)}s/lap — watch mirrors`;
    }

    return {
      ahead: aheadDetail,
      behind: behindDetail,
      overlayCallout,
    };
  }, [hasTelemetry, historyLength]);
};

