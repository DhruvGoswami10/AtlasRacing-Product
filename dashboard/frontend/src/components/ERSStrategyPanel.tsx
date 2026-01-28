/**
 * ERSStrategyPanel - Visual ERS strategy advisor component
 *
 * Displays battery state and provides deployment recommendations
 */

import React from 'react';
import { Battery, BatteryCharging, BatteryWarning, Zap, Shield, Target, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useERSStrategy } from '../hooks/useERSStrategy';
import { ERSStrategyAdvisor, type ERSAdvice, type ERSRecommendation } from '../services/ers_strategy';
import type { TelemetryData, MultiCarTelemetryData } from '../types/telemetry';
import { cn } from '../lib/utils';

interface ERSStrategyPanelProps {
  telemetry: TelemetryData | null;
  multiCarData: MultiCarTelemetryData | null;
  isInBattle?: boolean;
  compact?: boolean;
  className?: string;
}

export function ERSStrategyPanel({
  telemetry,
  multiCarData,
  isInBattle = false,
  compact = false,
  className,
}: ERSStrategyPanelProps) {
  const { advice, batteryPercent, batteryTrend, estimatedLapsRemaining } = useERSStrategy(
    telemetry,
    multiCarData,
    isInBattle
  );

  if (!telemetry) {
    return (
      <div className={cn('rounded-lg border border-slate-700/50 bg-slate-900/50 p-4', className)}>
        <div className="text-sm text-slate-500">Waiting for telemetry...</div>
      </div>
    );
  }

  const BatteryIcon = getBatteryIcon(batteryPercent, batteryTrend);
  const TrendIcon = getTrendIcon(batteryTrend);

  if (compact) {
    return (
      <div className={cn('rounded-lg border border-slate-700/50 bg-slate-900/50 p-3', className)}>
        <div className="flex items-center justify-between gap-4">
          {/* Battery state */}
          <div className="flex items-center gap-2">
            <BatteryIcon className={cn('w-5 h-5', getBatteryColor(batteryPercent))} />
            <span className={cn('font-mono text-lg font-bold', getBatteryColor(batteryPercent))}>
              {batteryPercent.toFixed(0)}%
            </span>
            <TrendIcon className={cn('w-4 h-4', getTrendColor(batteryTrend))} />
          </div>

          {/* Recommendation */}
          {advice && (
            <div className={cn(
              'flex items-center gap-2 px-3 py-1 rounded-full border text-sm font-medium',
              ERSStrategyAdvisor.getPriorityColor(advice.priority)
            )}>
              <RecommendationIcon recommendation={advice.recommendation} className="w-4 h-4" />
              <span>{advice.recommendation}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={cn('rounded-lg border border-slate-700/50 bg-slate-900/50', className)}>
      {/* Header */}
      <div className="border-b border-slate-700/50 px-4 py-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <Zap className="w-4 h-4 text-yellow-400" />
            ERS Strategy
          </h3>
          {advice && (
            <span className={cn(
              'px-2 py-0.5 rounded text-xs font-medium border',
              ERSStrategyAdvisor.getPriorityColor(advice.priority)
            )}>
              {advice.priority.toUpperCase()}
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Battery visualization */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BatteryIcon className={cn('w-5 h-5', getBatteryColor(batteryPercent))} />
              <span className="text-sm text-slate-400">Battery</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={cn('font-mono text-lg font-bold', getBatteryColor(batteryPercent))}>
                {batteryPercent.toFixed(0)}%
              </span>
              <TrendIcon className={cn('w-4 h-4', getTrendColor(batteryTrend))} />
            </div>
          </div>

          {/* Battery bar */}
          <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full transition-all duration-500 rounded-full',
                getBatteryBarColor(batteryPercent)
              )}
              style={{ width: `${batteryPercent}%` }}
            />
          </div>

          {/* Battery zones */}
          <div className="flex justify-between text-[10px] text-slate-500">
            <span>CRITICAL</span>
            <span>LOW</span>
            <span>OPTIMAL</span>
            <span>FULL</span>
          </div>
        </div>

        {/* Recommendation */}
        {advice && (
          <div className={cn(
            'rounded-lg border p-3',
            ERSStrategyAdvisor.getPriorityColor(advice.priority)
          )}>
            <div className="flex items-center gap-3">
              <RecommendationIcon
                recommendation={advice.recommendation}
                className="w-8 h-8"
              />
              <div className="flex-1">
                <div className="font-bold text-lg">{advice.recommendation}</div>
                <div className="text-sm opacity-80">{advice.reason}</div>
              </div>
            </div>

            {/* Additional info */}
            <div className="mt-3 pt-3 border-t border-current/20 flex items-center gap-4 text-xs">
              <div>
                <span className="opacity-60">Suggested: </span>
                <span className="font-mono font-medium">
                  {ERSStrategyAdvisor.getModeDisplayName(advice.suggestedMode)}
                </span>
              </div>
              {advice.batteryTarget && (
                <div>
                  <span className="opacity-60">Target: </span>
                  <span className="font-mono font-medium">{advice.batteryTarget}%</span>
                </div>
              )}
              {advice.lapsToOpportunity && advice.lapsToOpportunity < 10 && (
                <div>
                  <span className="opacity-60">Opportunity in: </span>
                  <span className="font-mono font-medium">{advice.lapsToOpportunity} laps</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="bg-slate-800/50 rounded-lg p-2">
            <div className="text-slate-500 text-xs">Trend</div>
            <div className={cn('font-medium flex items-center gap-1', getTrendColor(batteryTrend))}>
              <TrendIcon className="w-3 h-3" />
              {batteryTrend.charAt(0).toUpperCase() + batteryTrend.slice(1)}
            </div>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-2">
            <div className="text-slate-500 text-xs">Est. Laps Left</div>
            <div className={cn(
              'font-mono font-medium',
              estimatedLapsRemaining < 5 ? 'text-red-400' :
                estimatedLapsRemaining < 10 ? 'text-yellow-400' :
                  'text-green-400'
            )}>
              {estimatedLapsRemaining > 50 ? '50+' : estimatedLapsRemaining}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper components and functions

interface RecommendationIconProps {
  recommendation: ERSRecommendation;
  className?: string;
}

function RecommendationIcon({ recommendation, className }: RecommendationIconProps) {
  switch (recommendation) {
    case 'HARVEST':
      return <BatteryCharging className={cn(className, 'text-green-400')} />;
    case 'BALANCED':
      return <Battery className={cn(className, 'text-blue-400')} />;
    case 'DEPLOY':
      return <Zap className={cn(className, 'text-yellow-400')} />;
    case 'SAVE':
      return <Target className={cn(className, 'text-orange-400')} />;
    case 'ATTACK':
      return <Zap className={cn(className, 'text-red-400 animate-pulse')} />;
    case 'DEFEND':
      return <Shield className={cn(className, 'text-purple-400')} />;
    default:
      return <Battery className={cn(className, 'text-slate-400')} />;
  }
}

function getBatteryIcon(percent: number, trend: string) {
  if (percent < 10) return BatteryWarning;
  if (trend === 'charging') return BatteryCharging;
  return Battery;
}

function getTrendIcon(trend: string) {
  switch (trend) {
    case 'charging': return TrendingUp;
    case 'depleting': return TrendingDown;
    default: return Minus;
  }
}

function getBatteryColor(percent: number): string {
  if (percent < 10) return 'text-red-400';
  if (percent < 25) return 'text-orange-400';
  if (percent < 40) return 'text-yellow-400';
  if (percent > 80) return 'text-green-400';
  return 'text-blue-400';
}

function getBatteryBarColor(percent: number): string {
  if (percent < 10) return 'bg-red-500';
  if (percent < 25) return 'bg-orange-500';
  if (percent < 40) return 'bg-yellow-500';
  if (percent > 80) return 'bg-green-500';
  return 'bg-blue-500';
}

function getTrendColor(trend: string): string {
  switch (trend) {
    case 'charging': return 'text-green-400';
    case 'depleting': return 'text-red-400';
    default: return 'text-slate-400';
  }
}

export default ERSStrategyPanel;
