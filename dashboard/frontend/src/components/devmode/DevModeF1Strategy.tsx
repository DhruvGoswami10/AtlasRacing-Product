import React, { useMemo } from 'react';
import { Card } from '../ui/card';
import { StrategyPanel } from '../StrategyPanel';
import { StandardizedTelemetry } from '../../utils/telemetryConverter';
import {
  pickStatusStyle,
  fuelStatusStyles,
  tyreStatusStyles,
  pitStatusStyles,
  ersModeStyles,
  asNumber,
} from './utils';

export interface DevModeF1StrategyProps {
  telemetry: StandardizedTelemetry;
  rawTelemetry: any;
  multiCarData: any;
  atlasAI: any;
  sessionPhase: 'formation' | 'race' | 'finished' | 'unknown';
  pitStopTracker: any;
  ersAdvisor: any;
  aheadOpponent: any;
  behindOpponent: any;
}

export function DevModeF1Strategy({
  telemetry,
  rawTelemetry,
  multiCarData,
  atlasAI,
  sessionPhase,
  pitStopTracker,
  ersAdvisor,
  aheadOpponent: primaryAhead,
  behindOpponent: primaryBehind,
}: DevModeF1StrategyProps) {
  if (!atlasAI) return null;

  // --- Status badges ---
  const fuelStatusStyle = pickStatusStyle(fuelStatusStyles, atlasAI?.fuel_strategy_status);
  const pitStatusStyle = pickStatusStyle(pitStatusStyles, atlasAI?.pit_strategy_status);

  // --- Pit stop tracker display values ---
  const pitStopMandatoryLabel = pitStopTracker.mandatoryStopCompleted
    ? 'Done'
    : 'Pending';
  const pitStopMandatoryClass = pitStopTracker.mandatoryStopCompleted
    ? 'text-emerald-300'
    : 'text-amber-300';
  const pitStopCurrentCompound =
    pitStopTracker.currentCompound ||
    telemetry.tireCompoundVisual ||
    telemetry.tireCompoundActual ||
    'Unknown';

  // --- Fuel computations ---
  const fuelPerLap = asNumber(atlasAI?.fuel_per_lap_average);
  const fuelMargin = asNumber(atlasAI?.fuel_margin_laps);
  const fuelTargetSave = asNumber(atlasAI?.fuel_target_save_per_lap);
  const fuelCalcReady = Boolean(atlasAI?.fuel_calc_ready);
  const fuelModelReady = telemetry.currentLapNum >= 2;

  const f1FuelExtraLaps = asNumber(
    (rawTelemetry as any)?.fuel_remaining_laps ?? telemetry.fuelRemainingLaps,
  );
  const f1LapsRemaining =
    telemetry.totalLaps > 0
      ? Math.max(0, telemetry.totalLaps - telemetry.currentLapNum)
      : null;
  const f1FuelRangeLaps =
    f1FuelExtraLaps !== null && f1LapsRemaining !== null
      ? Math.max(0, f1LapsRemaining + f1FuelExtraLaps)
      : null;

  const displayFuelPerLap = fuelModelReady ? fuelPerLap : null;
  const displayFuelLapsRemaining = fuelModelReady ? f1FuelRangeLaps : null;
  const displayFuelMargin = fuelModelReady ? f1FuelExtraLaps : null;
  const displayFuelTargetSave = fuelModelReady ? fuelTargetSave : null;

  // --- Tyre computations ---
  const tyreDegradation = asNumber(atlasAI?.tyre_degradation_rate);
  const tyreLifeRemaining = asNumber(atlasAI?.tyre_life_remaining_laps);
  const tyrePerformance = asNumber(atlasAI?.tyre_performance_index);
  const tyreStintProgress = asNumber(atlasAI?.tyre_stint_progress);

  const tyreWearValues = [
    telemetry.tireWearFL,
    telemetry.tireWearFR,
    telemetry.tireWearRL,
    telemetry.tireWearRR,
  ].filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const maxTyreWear = tyreWearValues.length > 0 ? Math.max(...tyreWearValues) : 0;
  const tyreWearRate =
    telemetry.tireAge > 0 && Number.isFinite(maxTyreWear) ? maxTyreWear / telemetry.tireAge : null;
  const tyreLapsTo70 =
    tyreWearRate !== null && tyreWearRate > 0
      ? Math.max(0, (70 - maxTyreWear) / tyreWearRate)
      : null;

  const displayTyreDegradation = tyreWearRate;
  const displayTyreLifeRemaining = tyreLapsTo70;
  const displayTyrePerformance = Math.max(0, 100 - maxTyreWear);
  const displayTyreStintProgress =
    displayTyreLifeRemaining !== null && telemetry.tireAge > 0
      ? telemetry.tireAge / (telemetry.tireAge + displayTyreLifeRemaining)
      : null;

  const f1TyreStatus = (() => {
    if (maxTyreWear >= 80 || (displayTyreLifeRemaining !== null && displayTyreLifeRemaining <= 2)) {
      return 2;
    }
    if (maxTyreWear >= 65 || (displayTyreLifeRemaining !== null && displayTyreLifeRemaining <= 5)) {
      return 1;
    }
    return 0;
  })();
  const tyreStatusStyle = pickStatusStyle(tyreStatusStyles, f1TyreStatus);
  const tyreCritical =
    displayTyreLifeRemaining !== null && displayTyreLifeRemaining <= 2;

  // --- Pit computations ---
  const pitDelta = asNumber(atlasAI?.pit_delta_time);
  const pitDeltaWing = asNumber(atlasAI?.pit_delta_with_wing);
  const pitNetDelta = asNumber(atlasAI?.pit_net_time_delta);
  const pitStayOutLoss = asNumber(atlasAI?.pit_time_loss_no_pit);

  const pitWindowStatus = (() => {
    const ideal = telemetry.pitWindowIdealLap;
    const latest = telemetry.pitWindowLatestLap;
    const currentLap = telemetry.currentLapNum || 0;
    if (!ideal || !latest) {
      return 'none';
    }
    if (currentLap < ideal - 2) {
      return 'upcoming';
    }
    if (currentLap <= latest + 1) {
      return 'active';
    }
    return 'passed';
  })();
  const pitWindowBadge = (() => {
    switch (pitWindowStatus) {
      case 'active':
        return { label: 'Window Active', className: 'text-amber-300' };
      case 'upcoming':
        return { label: 'Window Upcoming', className: 'text-blue-300' };
      case 'passed':
        return { label: 'Window Passed', className: 'text-slate-400' };
      default:
        return { label: 'No Window', className: 'text-gray-500' };
    }
  })();

  // --- ERS computations ---
  const ersAttackGap = asNumber(atlasAI?.ers_attack_gap);
  const ersDefendGap = asNumber(atlasAI?.ers_defend_gap);
  const ersHarvestGap = asNumber(atlasAI?.ers_harvest_gap);
  const ersStatusStyle = (() => {
    switch (ersAdvisor.mode) {
      case 'harvest':
        return ersModeStyles[1];
      case 'attack':
        return ersModeStyles[2];
      case 'defend':
        return ersModeStyles[3];
      default:
        return ersModeStyles[0];
    }
  })();

  // --- CSS class computations ---
  const fuelMarginClass =
    displayFuelMargin === null
      ? 'text-gray-400'
      : displayFuelMargin < 0
        ? 'text-rose-300 font-semibold'
        : displayFuelMargin < 0.5
          ? 'text-amber-300'
          : 'text-green-400';

  const tyreDegClass =
    displayTyreDegradation === null
      ? 'text-gray-400'
      : displayTyreDegradation > 6
        ? 'text-rose-300'
        : displayTyreDegradation > 4
          ? 'text-amber-300'
          : 'text-green-400';

  const tyreLifeClass =
    displayTyreLifeRemaining === null
      ? 'text-gray-400'
      : displayTyreLifeRemaining < 3
        ? 'text-rose-300 font-semibold'
        : displayTyreLifeRemaining < 8
          ? 'text-amber-300'
          : 'text-green-400';

  const pitNetClass =
    pitNetDelta === null
      ? 'text-gray-400'
      : pitNetDelta < 0
        ? 'text-green-400'
        : 'text-amber-300';

  const stayOutClass = pitStayOutLoss === null ? 'text-gray-400' : 'text-amber-300';

  const tyrePerformanceText =
    displayTyrePerformance === null ? '-' : `${Math.round(displayTyrePerformance)}%`;

  const tyreStintPercent =
    displayTyreStintProgress === null
      ? null
      : Math.round(Math.max(0, Math.min(1, displayTyreStintProgress)) * 100);

  const tyreWearSummary = (() => {
    if (maxTyreWear >= 80) {
      return { label: `Critical (${maxTyreWear.toFixed(0)}%)`, className: 'text-rose-300 font-semibold' };
    }
    if (maxTyreWear >= 65) {
      return { label: `Window (${maxTyreWear.toFixed(0)}%)`, className: 'text-amber-300' };
    }
    return { label: `OK (${maxTyreWear.toFixed(0)}%)`, className: 'text-emerald-300' };
  })();

  return (
    <>
      <Card className="bg-black/60 border border-gray-700 p-4 col-span-2">
        <h3 className="text-sm font-bold text-cyan-400 mb-2">ATLAS AI | Fuel & Tyre Strategy</h3>
        <div className="flex flex-wrap gap-2 mb-3 text-xs">
          <span className={`px-2 py-0.5 rounded-full border ${fuelStatusStyle.className}`}>
            Fuel: {fuelStatusStyle.label}
          </span>
          <span className={`px-2 py-0.5 rounded-full border ${tyreStatusStyle.className}`}>
            Tyres: {tyreStatusStyle.label}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div className="col-span-2 text-xs uppercase tracking-wide text-gray-500">Fuel Outlook</div>
          <div>
            Avg Burn:{' '}
            <span className={`font-mono ${fuelModelReady ? 'text-green-400' : 'text-gray-400'}`}>
              {displayFuelPerLap !== null ? `${displayFuelPerLap.toFixed(2)} kg/lap` : '-'}
            </span>
          </div>
          <div>
            Laps Remaining:{' '}
            <span className={`font-mono ${
              displayFuelLapsRemaining === null
                ? 'text-gray-400'
                : displayFuelLapsRemaining < 5
                  ? 'text-rose-300 font-semibold'
                  : 'text-green-400'
            }`}>
              {displayFuelLapsRemaining !== null ? `${displayFuelLapsRemaining.toFixed(1)} laps` : '-'}
            </span>
          </div>
          <div>
            Fuel Margin:{' '}
            <span className={`font-mono ${fuelMarginClass}`}>
              {displayFuelMargin !== null
                ? `${displayFuelMargin >= 0 ? '+' : ''}${displayFuelMargin.toFixed(2)} laps`
                : '-'}
            </span>
          </div>
          <div>
            Target Save:{' '}
            <span className={`font-mono ${
              displayFuelTargetSave !== null && displayFuelTargetSave > 0
                ? 'text-blue-300'
                : 'text-gray-400'
            }`}>
              {displayFuelTargetSave !== null && displayFuelTargetSave > 0
                ? `${displayFuelTargetSave.toFixed(3)} lap/lap (${(displayFuelTargetSave * 100).toFixed(1)}%)`
                : '-'}
            </span>
          </div>
          <div className="col-span-2 text-xs uppercase tracking-wide text-gray-500 pt-1">Tyre Outlook</div>
          <div>
            Deg Rate:{' '}
            <span className={`font-mono ${tyreDegClass}`}>
              {displayTyreDegradation !== null
                ? displayTyreDegradation > 0
                  ? `+${displayTyreDegradation.toFixed(2)}%/lap`
                  : 'Stable'
                : '-'}
            </span>
          </div>
          <div>
            Remaining Life:{' '}
            <span className={`font-mono ${tyreLifeClass}`}>
              {displayTyreLifeRemaining === null || displayTyreLifeRemaining >= 900
                ? '-'
                : `${displayTyreLifeRemaining.toFixed(1)} laps`}
            </span>
          </div>
          <div>
            Performance:{' '}
            <span className={`font-mono ${displayTyrePerformance === null ? 'text-gray-400' : 'text-blue-300'}`}>
              {tyrePerformanceText}
            </span>
          </div>
          <div>
            Stint Progress:{' '}
            <span className={`font-mono ${tyreStintPercent === null ? 'text-gray-400' : 'text-blue-300'}`}>
              {tyreStintPercent === null ? '-' : `${tyreStintPercent}%`}
            </span>
        </div>
      </div>
        {displayFuelMargin !== null && displayFuelMargin >= 0.3 && (
          <div className="text-xs text-teal-200 mt-3">
            {`~${displayFuelMargin.toFixed(1)} laps in hand - free to push or stretch the stint.`}
          </div>
        )}
        {displayFuelMargin !== null && displayFuelMargin < 0 && (
          <div className="text-xs text-rose-300 mt-3">
            {`Short by ${Math.abs(displayFuelMargin).toFixed(1)} laps - start saving now.`}
          </div>
        )}
        {!fuelModelReady && (
          <div className="text-xs text-gray-500 mt-3">
            Fuel model warming up - start of lap 2 onward for accurate readings.
          </div>
        )}
        {tyreCritical && (
          <div className="text-rose-300 font-semibold mt-3">
            Tyres are in the critical window - expect rapid drop-off.
          </div>
        )}
      </Card>

      <Card className="bg-black/60 border border-gray-700 p-4 col-span-2">
        <h3 className="text-sm font-bold text-cyan-400 mb-2">Pit Window & Metrics</h3>
        <div className="flex flex-wrap gap-2 mb-3 text-xs">
          <span className={`px-2 py-0.5 rounded-full border ${pitStatusStyle.className}`}>
            Pit: {pitStatusStyle.label}
          </span>
          <span className={`px-2 py-0.5 rounded-full border ${tyreStatusStyle.className}`}>
            Tyres: {tyreStatusStyle.label}
          </span>
          <span className={`px-2 py-0.5 rounded-full border ${fuelStatusStyle.className}`}>
            Fuel: {fuelStatusStyle.label}
          </span>
          {pitWindowBadge.label !== 'Monitoring' && (
            <span className={`px-2 py-0.5 rounded-full border font-mono text-[10px] ${pitWindowBadge.className}`}>
              {pitWindowBadge.label}
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div>
            Pit Delta:{' '}
            <span className="font-mono text-yellow-300">
              {pitDelta !== null ? `${pitDelta.toFixed(1)}s` : '-'}
            </span>
          </div>
          <div>
            Delta (wing):{' '}
            <span className="font-mono text-orange-300">
              {pitDeltaWing !== null ? `${pitDeltaWing.toFixed(1)}s` : '-'}
            </span>
          </div>
          <div>
            Net {'\u0394'} Now:{' '}
            <span className={`font-mono ${pitNetClass}`}>
              {pitNetDelta !== null ? `${pitNetDelta >= 0 ? '+' : ''}${pitNetDelta.toFixed(1)}s` : '-'}
            </span>
          </div>
          <div>
            Stay Out Cost:{' '}
            <span className={`font-mono ${stayOutClass}`}>
              {pitStayOutLoss !== null ? `${pitStayOutLoss >= 0 ? '+' : ''}${pitStayOutLoss.toFixed(1)}s` : '-'}
            </span>
          </div>
          <div>
            Tyre Wear:{' '}
            <span className={`font-mono ${tyreWearSummary.className}`}>{tyreWearSummary.label}</span>
          </div>
          <div>
            Tyre Life:{' '}
            <span className={`font-mono ${tyreLifeClass}`}>
              {displayTyreLifeRemaining !== null
                ? `${displayTyreLifeRemaining.toFixed(1)} laps`
                : '-'}
            </span>
          </div>
          <div>
            Deg Rate:{' '}
            <span className={`font-mono ${tyreDegClass}`}>
              {displayTyreDegradation !== null
                ? `${displayTyreDegradation.toFixed(2)}%/lap`
                : '-'}
            </span>
          </div>
          <div>
            Tyre Performance:{' '}
            <span className="font-mono text-purple-300">{tyrePerformanceText}</span>
          </div>
          <div>
            Tyre Stint:{' '}
            <span className="font-mono text-blue-300">
              {tyreStintPercent === null ? '-' : `${tyreStintPercent}%`}
            </span>
          </div>
        </div>
      </Card>

      <StrategyPanel
        telemetry={telemetry}
        multiCarData={multiCarData}
        sessionPhase={sessionPhase}
      />

      <Card className="bg-black/60 border border-gray-700 p-4 col-span-2">
        <h3 className="text-sm font-bold text-cyan-400 mb-2">Pit Stop Tracker</h3>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="space-y-1">
            <div>
              Stops:{' '}
              <span className="font-mono text-slate-200">
                {pitStopTracker.stopsCompleted}
              </span>
            </div>
            <div>
              Mandatory Stop:{' '}
              <span className={`font-mono ${pitStopMandatoryClass}`}>
                {pitStopMandatoryLabel}
              </span>
            </div>
            <div>
              Last Stop Lap:{' '}
              <span className="font-mono text-gray-300">
                {pitStopTracker.lastStopLap ?? '-'}
              </span>
            </div>
          </div>
          <div className="space-y-1">
            <div>
              Current:{' '}
              <span className="font-mono text-sky-200">
                {pitStopCurrentCompound}
              </span>
            </div>
            <div>
              Last:{' '}
              <span className="font-mono text-gray-300">
                {pitStopTracker.lastCompound ?? '-'}
              </span>
            </div>
            <div>
              Stint Laps:{' '}
              <span className="font-mono text-gray-300">
                {Number.isFinite(pitStopTracker.stintLaps)
                  ? pitStopTracker.stintLaps
                  : '-'}
              </span>
            </div>
          </div>
        </div>
      </Card>

      <Card className="bg-black/60 border border-gray-700 p-4 col-span-2">
        <h3 className="text-sm font-bold text-cyan-400 mb-2">ATLAS AI | ERS Strategy</h3>
        <div className="flex flex-wrap items-center gap-2 mb-3 text-xs">
          <span className={`px-2 py-0.5 rounded-full border ${ersStatusStyle.className}`}>
            Mode: {ersAdvisor.mode.toUpperCase()}
          </span>
          <span className="font-mono text-blue-300">SOC {Math.round(ersAdvisor.soc)}%</span>
          {ersAdvisor.hangarCallout && (
            <span className="px-2 py-0.5 rounded-full border border-amber-400/40 bg-amber-500/10 text-amber-200 uppercase tracking-wide text-[10px]">
              {ersAdvisor.hangarCallout}
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div>
            Attack Threshold:{' '}
            <span className={`font-mono ${ersAttackGap === null ? 'text-gray-500' : 'text-orange-300'}`}>
              {ersAttackGap !== null ? `${ersAttackGap.toFixed(1)}s` : '-'}
            </span>
          </div>
          <div>
            Gap Ahead:{' '}
            <span className="font-mono text-gray-300">
              {primaryAhead && typeof primaryAhead.gapToPlayer === 'number'
                ? `${Math.abs(primaryAhead.gapToPlayer).toFixed(2)}s`
                : '-'}
            </span>
          </div>
          <div>
            Defend Threshold:{' '}
            <span className={`font-mono ${ersDefendGap === null ? 'text-gray-500' : 'text-emerald-300'}`}>
              {ersDefendGap !== null ? `${ersDefendGap.toFixed(1)}s` : '-'}
            </span>
          </div>
          <div>
            Gap Behind:{' '}
            <span className="font-mono text-gray-300">
              {primaryBehind && typeof primaryBehind.gapToPlayer === 'number'
                ? `${Math.abs(primaryBehind.gapToPlayer).toFixed(2)}s`
                : '-'}
            </span>
          </div>
          <div>
            Harvest Window:{' '}
            <span className={`font-mono ${ersHarvestGap === null ? 'text-gray-500' : 'text-gray-300'}`}>
              {ersHarvestGap !== null ? `${ersHarvestGap.toFixed(1)}s` : '-'}
            </span>
          </div>
          <div>
            Next Target:{' '}
            <span className="font-mono text-gray-300">
              {ersAdvisor.budget.targetNext.toFixed(0)}%
            </span>
          </div>
        </div>

        <div className="mt-3 text-xs text-gray-200 space-y-1">
          <div className="text-[11px] uppercase text-gray-500">Guidance</div>
          <div className="font-semibold">{ersAdvisor.message}</div>
          <div className="text-gray-400 leading-snug">{ersAdvisor.detail}</div>
        </div>

        <div className="mt-3">
          <div className="text-[11px] uppercase text-gray-500 mb-1">ERS Budget</div>
          <div className="relative h-2 rounded bg-gray-700 overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 bg-sky-500/70"
              style={{ width: `${Math.max(0, Math.min(100, ersAdvisor.soc))}%` }}
            />
            <div
              className="absolute inset-y-0 w-0.5 bg-amber-300"
              style={{ left: `${Math.max(0, Math.min(100, ersAdvisor.budget.targetNow))}%` }}
            />
          </div>
          <div className="mt-1 font-mono text-[11px] text-gray-400">
            Now {ersAdvisor.soc.toFixed(0)}% · Target {ersAdvisor.budget.targetNow.toFixed(0)}% ({'\u0394'}{' '}
            {ersAdvisor.budget.delta >= 0 ? '+' : ''}
            {ersAdvisor.budget.delta.toFixed(1)}%)
          </div>
          <div className="text-xs text-gray-300">{ersAdvisor.budget.summary}</div>
        </div>

        <div className="mt-3 text-xs text-gray-300 space-y-1">
          <div className="text-[11px] uppercase text-gray-500">Callouts</div>
          {ersAdvisor.callouts.length > 0 ? (
            ersAdvisor.callouts.map((callout: string, index: number) => (
              <div key={`${callout}-${index}`} className="text-gray-300 leading-snug">
                {'\u2022'} {callout}
              </div>
            ))
          ) : (
            <div className="text-gray-500">No urgent ERS items.</div>
          )}
        </div>
      </Card>
    </>
  );
}
