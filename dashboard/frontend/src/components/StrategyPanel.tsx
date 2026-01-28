import React from 'react';
import type { StandardizedTelemetry } from '../utils/telemetryConverter';
import type { MultiCarTelemetryData } from '../types/telemetry';
import { Card } from './ui/card';
import {
  type LiveStrategyPlan,
  type RejoinForecast,
  useLivePitStrategy,
} from '../hooks/useLivePitStrategy';
import { useTyreSets } from '../hooks/useTyreSets';
import { MapPin } from 'lucide-react';

type SessionPhase = 'formation' | 'race' | 'finished' | 'unknown';

interface StrategyPanelProps {
  telemetry: StandardizedTelemetry | null;
  multiCarData: MultiCarTelemetryData | null;
  sessionPhase?: SessionPhase;
}

const statusBadge = (status: LiveStrategyPlan['status']) => {
  switch (status) {
    case 'box':
      return { label: 'BOX NOW', className: 'bg-rose-500/20 text-rose-200 border border-rose-400/40' };
    case 'prepare':
      return { label: 'PREPARE', className: 'bg-amber-500/15 text-amber-200 border border-amber-400/40' };
    default:
      return { label: 'HOLD', className: 'bg-slate-600/20 text-slate-200 border border-slate-500/30' };
  }
};

const riskBadge = (risk: LiveStrategyPlan['risk']) => {
  switch (risk) {
    case 'high':
      return { label: 'High Risk', className: 'text-rose-300' };
    case 'medium':
      return { label: 'Medium Risk', className: 'text-amber-300' };
    default:
      return { label: 'Low Risk', className: 'text-emerald-300' };
  }
};

const sessionPhaseBadge = (phase: SessionPhase) => {
  switch (phase) {
    case 'formation':
      return { label: 'Formation', className: 'bg-amber-500/15 text-amber-100 border border-amber-500/40' };
    case 'race':
      return { label: 'Race', className: 'bg-emerald-500/15 text-emerald-100 border border-emerald-400/40' };
    case 'finished':
      return { label: 'Finished', className: 'bg-slate-600/20 text-slate-200 border border-slate-500/40' };
    default:
      return { label: 'Session Unknown', className: 'bg-slate-700/30 text-slate-300 border border-slate-600/40' };
  }
};

const formatPositionChange = (currentPos: number, rejoinPos: number | null) => {
  if (rejoinPos === null) return null;
  const diff = rejoinPos - currentPos;
  if (diff === 0) return { text: 'hold position', className: 'text-slate-300' };
  if (diff > 0) return { text: `lose ${diff} position${diff > 1 ? 's' : ''}`, className: 'text-rose-300' };
  return { text: `gain ${Math.abs(diff)} position${Math.abs(diff) > 1 ? 's' : ''}`, className: 'text-emerald-300' };
};

export const StrategyPanel: React.FC<StrategyPanelProps> = ({
  telemetry,
  multiCarData,
  sessionPhase = 'unknown',
}) => {
  const { tyreSets } = useTyreSets();
  const strategy = useLivePitStrategy({
    telemetry: telemetry ?? null,
    multiCarData,
    tyreSets,
  });

  if (!telemetry) {
    return null;
  }

  const currentPosition = telemetry.position || 0;

  const tyreHealthStatus = (() => {
    switch (strategy.tyreHealth.status) {
      case 'critical':
        return { label: `Critical - ${strategy.tyreHealth.maxWear.toFixed(0)}%`, className: 'text-rose-300' };
      case 'caution':
        return { label: `Caution - ${strategy.tyreHealth.maxWear.toFixed(0)}%`, className: 'text-amber-300' };
      default:
        return { label: `Healthy - ${strategy.tyreHealth.maxWear.toFixed(0)}%`, className: 'text-emerald-300' };
    }
  })();

  const pitWindowBadge = (() => {
    switch (strategy.pitWindowStatus) {
      case 'active':
        return { label: 'Window Active', className: 'bg-amber-500/20 text-amber-100 border border-amber-500/40' };
      case 'upcoming':
        return { label: 'Window Incoming', className: 'bg-slate-600/20 text-slate-200 border border-slate-500/25' };
      case 'passed':
        return { label: 'Window Passed', className: 'bg-slate-600/20 text-slate-300 border border-slate-500/30' };
      default:
        return { label: 'Monitoring', className: 'bg-slate-700/30 text-slate-200 border border-slate-600/40' };
    }
  })();
  const phaseBadge = sessionPhaseBadge(sessionPhase);

  return (
    <Card className="bg-black/60 border border-gray-700 p-5 col-span-4">
      <div className="flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wide">
              Strategy Check
            </h3>
            <p className="text-xs text-gray-400">
              Plans blend Codemasters pit window with live tyre, fuel, and weather data.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className={`text-[10px] font-mono uppercase tracking-wide px-3 py-1 rounded-full ${phaseBadge.className}`}>
              {phaseBadge.label}
            </div>
            <div className={`text-[10px] font-mono uppercase tracking-wide px-3 py-1 rounded-full ${pitWindowBadge.className}`}>
              {pitWindowBadge.label}
              {strategy.codemastersWindow.ideal && strategy.codemastersWindow.latest
                ? ` - L${strategy.codemastersWindow.ideal}-${strategy.codemastersWindow.latest}`
                : ''}
            </div>
          </div>
        </div>

        {/* Plan Cards Grid - 3 columns, 2 rows */}
        <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {strategy.plans.map((plan, index) => {
            const status = statusBadge(plan.status);
            const risk = riskBadge(plan.risk);
            const rejoinForecast = strategy.rejoinForecasts[index];
            const positionChange = formatPositionChange(currentPosition, rejoinForecast?.position ?? null);
            const is2Stop = plan.stops.length > 1;

            return (
              <div
                key={plan.id}
                className="rounded-xl border border-gray-700 bg-black/60 p-4 flex flex-col"
              >
                {/* Card Header */}
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-teal-300">
                    {plan.title}
                  </div>
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${status.className}`}>
                    {status.label}
                  </span>
                </div>

                {/* Description */}
                <p className="text-xs text-gray-400 mb-3">{plan.description}</p>

                {/* Stop Info */}
                <div className="space-y-1 mb-3">
                  {is2Stop ? (
                    // 2-stop plan: show both stops inline
                    <div className="flex items-center gap-3 text-sm">
                      <div className="font-mono text-slate-200">
                        <span className="text-gray-500 text-xs">Stop 1:</span> L{plan.stops[0].lap} - {plan.stops[0].compound}
                      </div>
                      <span className="text-gray-600">|</span>
                      <div className="font-mono text-slate-200">
                        <span className="text-gray-500 text-xs">Stop 2:</span> L{plan.stops[1].lap} - {plan.stops[1].compound}
                      </div>
                    </div>
                  ) : plan.nextStop ? (
                    // 1-stop plan
                    <div className="font-mono text-sm text-slate-200">
                      Next: L{plan.nextStop.lap} - {plan.nextStop.compound}
                    </div>
                  ) : (
                    <div className="font-mono text-sm text-green-300">No further scheduled stops</div>
                  )}
                </div>

                {/* Risk & Confidence */}
                <div className="flex items-center justify-between text-xs mb-3">
                  <span className={risk.className}>{risk.label}</span>
                  <span className="text-gray-400">Confidence {Math.round(plan.confidence)}%</span>
                </div>

                {/* Rejoin Forecast - Embedded */}
                {rejoinForecast && rejoinForecast.position !== null && (
                  <div className="mt-auto pt-3 border-t border-gray-700/50">
                    <div className="flex items-center gap-2 text-xs">
                      <MapPin className="w-3.5 h-3.5 text-sky-400" />
                      <span className="text-gray-400">Rejoin Forecast:</span>
                      <span className="font-mono text-slate-200">
                        P{currentPosition} → P{rejoinForecast.position}
                      </span>
                      {positionChange && (
                        <span className={`${positionChange.className}`}>
                          ({positionChange.text})
                        </span>
                      )}
                    </div>
                    {rejoinForecast.ahead && (
                      <div className="mt-1 text-[11px] text-gray-500">
                        Gap to P{rejoinForecast.ahead.position}: +{rejoinForecast.ahead.gapSeconds?.toFixed(1) ?? '-'}s
                      </div>
                    )}
                  </div>
                )}
                {rejoinForecast && rejoinForecast.position === null && rejoinForecast.message && (
                  <div className="mt-auto pt-3 border-t border-gray-700/50">
                    <div className="flex items-center gap-2 text-xs text-amber-300">
                      <MapPin className="w-3.5 h-3.5 text-amber-400" />
                      <span>{rejoinForecast.message}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Bottom Row: Tyre Health, Weather, Advisories */}
        <div className="grid gap-3 md:grid-cols-3">
          {/* Tyre Health */}
          <Card className="bg-black/60 border border-gray-700 p-3">
            <h4 className="text-xs font-bold uppercase tracking-wide text-gray-300 mb-2">Tyre Health</h4>
            <div className="text-sm font-mono">
              <span className={tyreHealthStatus.className}>{tyreHealthStatus.label}</span>
            </div>
            <div className="text-xs text-gray-400 mt-1">
              Est. laps to 70%: {strategy.tyreHealth.lapsTo70 === 999 ? '--' : strategy.tyreHealth.lapsTo70}
            </div>
          </Card>

          {/* Weather Outlook */}
          <Card className="bg-black/60 border border-gray-700 p-3">
            <h4 className="text-xs font-bold uppercase tracking-wide text-gray-300 mb-2">Weather Outlook</h4>
            <div className="text-sm text-slate-200">{strategy.weather.description}</div>
            <div className="text-xs text-gray-400 mt-1">
              Trend: {strategy.weather.trend === 'stable' ? 'Stable' : strategy.weather.trend === 'drying' ? 'Drying' : 'Worsening'}
            </div>
            {strategy.weather.crossover && (
              <div className={`text-xs mt-2 ${strategy.weather.crossover.type === 'wet-incoming' ? 'text-amber-200' : 'text-emerald-200'}`}>
                {strategy.weather.crossover.description} (confidence {strategy.weather.crossover.confidence.toUpperCase()})
              </div>
            )}
          </Card>

          {/* Live Advisories */}
          <Card className="bg-black/60 border border-gray-700 p-3">
            <h4 className="text-xs font-bold uppercase tracking-wide text-gray-300 mb-2">Live Advisories</h4>
            {strategy.advisories.length > 0 ? (
              <ul className="space-y-1 text-xs">
                {strategy.advisories.map((advisory, index) => {
                  const tone =
                    advisory.severity === 'critical'
                      ? 'text-rose-300'
                      : advisory.severity === 'warning'
                        ? 'text-amber-300'
                        : 'text-gray-300';
                  return (
                    <li key={`${advisory.type}-${index}`} className={tone}>
                      {advisory.message}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="text-xs text-gray-500">No active advisories</div>
            )}
          </Card>
        </div>
      </div>
    </Card>
  );
};

