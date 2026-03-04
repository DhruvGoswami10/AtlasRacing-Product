import React, { useMemo } from 'react';
import { ExternalLink } from 'lucide-react';
import type { StandardizedTelemetry } from '../../utils/telemetryConverter';
import type { RaceEvent } from '../../types/telemetry';
import { Card } from '../ui/card';
import { formatDuration, formatSeconds } from './utils';

interface Props {
  telemetry: StandardizedTelemetry;
  rawTelemetry: any;
  raceEvents: RaceEvent[];
  gameConnected: string;
  isAC: boolean;
}

export function DevModeHeaderBar({ telemetry, rawTelemetry, raceEvents, gameConnected, isAC }: Props) {
  const sessionPhaseDebug = useMemo(() => {
    const now = Date.now();
    const toTimestamp = (event: RaceEvent | null): number | null => {
      if (!event) return null;
      const rawTs = event.timestamp;
      if (typeof rawTs === 'number' && Number.isFinite(rawTs)) return rawTs;
      if (typeof rawTs === 'string') {
        const parsed = Number(rawTs);
        return Number.isFinite(parsed) ? parsed : null;
      }
      return null;
    };

    const findEvent = (types: string[]): RaceEvent | null =>
      raceEvents.find((event) => types.includes(event.type)) ?? null;

    const formationEvent = findEvent(['SCFORM']);
    const finishEvent = findEvent(['RCWN', 'SEND', 'CHQF']);

    const formationTimestamp = toTimestamp(formationEvent);
    const finishTimestamp = toTimestamp(finishEvent);

    const formationAge = formationTimestamp !== null ? now - formationTimestamp : null;
    const finishAge = finishTimestamp !== null ? now - finishTimestamp : null;

    const rawSafetyCarStatus = rawTelemetry?.safety_car_status;
    const safetyCarStatus = telemetry.safetyCarStatus;
    const sessionTypeLower = (telemetry.sessionType || '').toLowerCase();
    const isRaceSession = sessionTypeLower === 'race';

    const lapsRemaining =
      telemetry.totalLaps > 0 ? telemetry.totalLaps - telemetry.currentLapNum : null;
    const sessionTimeLeft = telemetry.sessionTimeLeft;

    const rawSessionFinished =
      (rawTelemetry?.race_finished === 1) ||
      (rawTelemetry?.session_finished === 1) ||
      ((rawTelemetry?.session_state || '').toString().toLowerCase() === 'finished');

    const formationCandidate =
      isRaceSession &&
      (
        safetyCarStatus === 'Formation Lap' ||
        rawSafetyCarStatus === 3 ||
        (formationAge !== null && formationAge < 180000)
      );

    const finishCandidate =
      isRaceSession &&
      (
        rawSessionFinished ||
        (finishAge !== null && finishAge < 600000) ||
        (lapsRemaining !== null && lapsRemaining <= 0 && sessionTimeLeft <= 0)
      );

    const phase = isRaceSession
      ? finishCandidate
        ? 'Finished'
        : formationCandidate
          ? 'Formation Lap'
          : 'Racing'
      : telemetry.sessionType || 'Unknown';

    const signals = [
      { label: 'Safety Car Status', value: safetyCarStatus || 'Unknown' },
      { label: 'Safety Car Raw', value: rawSafetyCarStatus ?? '—' },
      {
        label: 'Lap Progress',
        value: `${Number.isFinite(telemetry.currentLapNum) ? telemetry.currentLapNum : '?'} / ${
          Number.isFinite(telemetry.totalLaps) ? telemetry.totalLaps : '?'
        }`,
      },
      { label: 'Laps Remaining', value: lapsRemaining !== null ? lapsRemaining.toString() : 'Unknown' },
      { label: 'Session Time Left', value: formatSeconds(sessionTimeLeft) },
      { label: 'Formation Event Age', value: formatDuration(formationAge) },
      { label: 'Finish Event Age', value: formatDuration(finishAge) },
      { label: 'Last Formation Event', value: formationEvent ? (formationEvent.message || formationEvent.type) : 'None' },
      { label: 'Last Finish Event', value: finishEvent ? (finishEvent.message || finishEvent.type) : 'None' },
    ];

    return { phase, isRaceSession, formationCandidate, finishCandidate, signals };
  }, [raceEvents, rawTelemetry, telemetry]);

  const sessionPhaseSignalColumns = useMemo(() => {
    const signals = sessionPhaseDebug.signals;
    if (signals.length <= 1) return [signals];
    const half = Math.ceil(signals.length / 2);
    return [signals.slice(0, half), signals.slice(half)];
  }, [sessionPhaseDebug]);

  const sessionPhaseHeader = useMemo(() => {
    const phase = sessionPhaseDebug.phase || 'Unknown';
    const lower = phase.toLowerCase();
    if (lower.includes('formation')) return { label: 'Formation', className: 'bg-amber-500/20 text-amber-100 border border-amber-400/40' };
    if (lower.includes('finish')) return { label: 'Finished', className: 'bg-rose-500/20 text-rose-100 border border-rose-400/40' };
    if (lower.includes('race')) return { label: 'Race', className: 'bg-emerald-500/20 text-emerald-100 border border-emerald-400/40' };
    return { label: phase, className: 'bg-slate-700/40 text-slate-200 border border-slate-600/40' };
  }, [sessionPhaseDebug]);

  const formationPromptBadge = useMemo(() => {
    const active = sessionPhaseDebug.formationCandidate;
    return {
      label: active ? 'Formation Prompts Queued' : 'Formation Prompts Idle',
      className: active
        ? 'bg-amber-500/15 text-amber-100 border border-amber-400/40'
        : 'bg-slate-700/40 text-slate-300 border border-slate-600/40',
    };
  }, [sessionPhaseDebug]);

  const postRaceBadge = useMemo(() => {
    const fired = sessionPhaseDebug.finishCandidate;
    return {
      label: fired ? 'Post-Race Fired' : 'Post-Race Pending',
      className: fired
        ? 'bg-rose-500/20 text-rose-100 border border-rose-400/40'
        : 'bg-slate-700/40 text-slate-300 border border-slate-600/40',
    };
  }, [sessionPhaseDebug]);

  // Expose session phase for parent (strategy panel needs it)
  const strategySessionPhase = useMemo<'formation' | 'race' | 'finished' | 'unknown'>(() => {
    const phase = (sessionPhaseDebug.phase || '').toLowerCase();
    if (phase.includes('formation')) return 'formation';
    if (phase.includes('finish')) return 'finished';
    if (phase.includes('race')) return 'race';
    return 'unknown';
  }, [sessionPhaseDebug]);

  return (
    <>
      {/* Header Bar */}
      <div className="bg-black border border-gray-700 rounded-2xl px-4 py-3 mb-6 flex justify-between items-center">
        <div className="flex gap-6 items-center">
          <span className="font-bold">Game: <span className={gameConnected !== 'Not Connected' ? 'text-green-400' : 'text-red-400'}>{gameConnected} {gameConnected !== 'Not Connected' ? '✅' : '❌'}</span></span>
          <span>Session: <span className="text-blue-400">{telemetry.sessionType}</span></span>
          <span>Lap: <span className="text-yellow-400">{telemetry.currentLapNum}/{telemetry.totalLaps}</span></span>
          <span>Position: <span className="text-orange-400">P{telemetry.position}</span></span>
          <span className={`text-xs font-mono uppercase tracking-wide px-3 py-1 rounded-full border ${sessionPhaseHeader.className}`}>
            Phase: {sessionPhaseHeader.label}
          </span>
          <span className={`text-xs font-mono uppercase tracking-wide px-3 py-1 rounded-full border ${formationPromptBadge.className}`}>
            {formationPromptBadge.label}
          </span>
          <span className={`text-xs font-mono uppercase tracking-wide px-3 py-1 rounded-full border ${postRaceBadge.className}`}>
            {postRaceBadge.label}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-sm text-gray-400">
            Dev Mode - {isAC ? 'Complete AC Telemetry (191 Fields)' : 'Complete F1 24 Telemetry'}
          </div>
          <button
            onClick={() => window.open(window.location.href, '_blank', 'width=1400,height=900')}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors px-2 py-1 rounded border border-gray-700 hover:border-gray-500"
            title="Open in new window"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            New Window
          </button>
        </div>
      </div>

      {/* Session Phase Debug */}
      <Card className="col-span-4 bg-indigo-950/60 border border-indigo-600/40 p-4">
        <h3 className="text-sm font-bold text-indigo-300 mb-3">SESSION PHASE DEBUG</h3>
        <div className="grid md:grid-cols-3 gap-3 text-xs text-indigo-100">
          <div className="space-y-2">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-indigo-400 mb-1">Derived Phase</div>
              <div className="text-sm font-semibold text-indigo-200">{sessionPhaseDebug.phase}</div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] uppercase tracking-wide text-indigo-400">Race Session</span>
              <span className={sessionPhaseDebug.isRaceSession ? 'text-emerald-300 font-semibold' : 'text-slate-400'}>
                {sessionPhaseDebug.isRaceSession ? 'Yes' : 'No'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] uppercase tracking-wide text-indigo-400">Formation Candidate</span>
              <span className={sessionPhaseDebug.formationCandidate ? 'text-amber-300 font-semibold' : 'text-slate-400'}>
                {sessionPhaseDebug.formationCandidate ? 'True' : 'False'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] uppercase tracking-wide text-indigo-400">Finish Candidate</span>
              <span className={sessionPhaseDebug.finishCandidate ? 'text-rose-300 font-semibold' : 'text-slate-400'}>
                {sessionPhaseDebug.finishCandidate ? 'True' : 'False'}
              </span>
            </div>
          </div>
          {sessionPhaseSignalColumns.map((column, columnIndex) => (
            <div key={`phase-signals-${columnIndex}`} className="space-y-1">
              {column.map((signal) => (
                <div key={signal.label} className="flex justify-between gap-2 border border-indigo-800/30 rounded-lg px-3 py-2 bg-indigo-900/30">
                  <span className="text-[10px] uppercase tracking-wide text-indigo-400">{signal.label}</span>
                  <span className="font-mono text-indigo-100 text-right">{signal.value}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

