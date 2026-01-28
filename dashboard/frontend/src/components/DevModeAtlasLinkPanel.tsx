import { useMemo } from 'react';

import { useAtlasLinkDiagnostics } from '../hooks/useAtlasLinkDiagnostics';
import type { AtlasLinkOpponent } from '../types/atlasLink';
import { Card } from './ui/card';

const statusStyles: Record<string, string> = {
  idle: 'bg-slate-800/60 text-slate-300 border border-slate-700/60',
  connecting: 'bg-sky-500/20 text-sky-100 border border-sky-500/40',
  connected: 'bg-emerald-500/20 text-emerald-100 border border-emerald-500/40',
  disconnected: 'bg-slate-800/60 text-slate-400 border border-slate-700/60',
  error: 'bg-rose-600/20 text-rose-100 border border-rose-500/40',
};

const formatLap = (value: number | null | undefined): string => {
  if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) {
    return '-';
  }
  const minutes = Math.floor(value / 60);
  const seconds = value - minutes * 60;
  const secondsStr = seconds.toFixed(3).padStart(6, '0');
  return `${minutes}:${secondsStr}`;
};

const formatOpponents = (opponents: AtlasLinkOpponent[]): AtlasLinkOpponent[] => {
  const sorted = opponents.slice().sort((a, b) => a.position - b.position);
  const top = sorted.slice(0, 8);
  const playerEntry = sorted.find((entry) => entry.isPlayer);
  if (playerEntry && !top.some((entry) => entry.isPlayer)) {
    if (top.length === 8) {
      top.pop();
    }
    top.push(playerEntry);
    top.sort((a, b) => a.position - b.position);
  }
  return top;
};

const formatSecondsCompact = (value: number | null | undefined, decimals = 2) => {
  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
    return '-';
  }
  const abs = Math.abs(value);
  const sign = value > 0.005 ? '+' : value < -0.005 ? '-' : '';
  return `${sign}${abs.toFixed(decimals)}s`;
};

export function DevModeAtlasLinkPanel() {
  const diagnostics = useAtlasLinkDiagnostics({ enableMock: false });

  const opponents = useMemo(
    () => formatOpponents(diagnostics.snapshot?.opponents ?? []),
    [diagnostics.snapshot?.opponents],
  );

  const statusClass =
    statusStyles[diagnostics.status] ?? statusStyles.idle;

  return (
    <Card className="col-span-4 bg-emerald-950/40 border border-emerald-500/30 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-3">
        <div>
          <h3 className="text-sm font-bold text-emerald-300 uppercase tracking-wide">
            Atlas Link · AC Companion Feed
          </h3>
          <p className="text-xs text-emerald-100/70">
            {diagnostics.source === 'live'
              ? 'Live bridge telemetry from AtlasLink.'
              : 'Mock data stream. Waiting for live AtlasLink packets.'}
          </p>
        </div>
        <div
          className={`text-xs font-mono uppercase tracking-wide px-3 py-1 rounded-full ${statusClass}`}
        >
          Status: {diagnostics.status.toUpperCase()}
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-emerald-400/80">
            Opponent Grid (Top 8)
          </h4>
          <div className="text-[11px] text-emerald-200/70">
            Live gap & tyre summary
          </div>
        </div>
        <div className="overflow-x-auto rounded-lg border border-emerald-500/20">
          <table className="min-w-full divide-y divide-emerald-500/20 text-xs">
            <thead className="bg-emerald-950/50 text-emerald-200 uppercase tracking-wide">
              <tr>
                <th className="px-2 py-2 text-left">Pos</th>
                <th className="px-2 py-2 text-left">Driver</th>
                <th className="px-2 py-2 text-left">Gap</th>
                <th className="px-2 py-2 text-left">Interval</th>
                <th className="px-2 py-2 text-left">Tyre</th>
                <th className="px-2 py-2 text-left">Lap</th>
                <th className="px-2 py-2 text-left">Last / Best</th>
                <th className="px-2 py-2 text-left">Pit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-emerald-500/10">
              {opponents.map((opponent) => {
                const rowClasses = opponent.isPlayer
                  ? 'bg-emerald-900/40 border border-emerald-500/40'
                  : 'bg-black/20';
                const tyreAgeLabel = opponent.tyreAgeLaps != null ? `${opponent.tyreAgeLaps}L` : '—';
                return (
                  <tr key={`${opponent.position}-${opponent.driverName}`} className={rowClasses}>
                    <td className="px-2 py-1 font-semibold text-emerald-200">
                      P{opponent.position}
                      {opponent.isClassLeader && (
                        <span className="ml-1 text-[10px] uppercase text-emerald-300/80">CL</span>
                      )}
                      {opponent.isPlayer && (
                        <span className="ml-1 text-[10px] uppercase text-emerald-200/80">YOU</span>
                      )}
                    </td>
                    <td className="px-2 py-1 text-emerald-100">
                      <div>{opponent.isPlayer ? `${opponent.driverName} (You)` : opponent.driverName}</div>
                      <div className="text-[10px] text-emerald-300/70">
                        {opponent.carModel}
                      </div>
                    </td>
                    <td className="px-2 py-1 text-emerald-100">
                      {formatSecondsCompact(opponent.gapToLeaderSeconds)}
                    </td>
                    <td className="px-2 py-1 text-emerald-100/80">
                      {formatSecondsCompact(opponent.intervalAheadSeconds)}
                    </td>
                    <td className="px-2 py-1 text-emerald-100/80">
                      {opponent.tyreCompound} · {tyreAgeLabel}
                    </td>
                    <td className="px-2 py-1 text-emerald-100/80">
                      {opponent.lap ?? '—'}
                    </td>
                    <td className="px-2 py-1 text-emerald-100/70">
                      {formatLap(opponent.lastLapSeconds)} / {formatLap(opponent.bestLapSeconds)}
                    </td>
                    <td className="px-2 py-1">
                      <span
                        className={`px-2 py-1 rounded text-[11px] font-semibold ${
                          opponent.inPit
                            ? 'bg-rose-600/20 text-rose-200 border border-rose-500/30'
                            : 'bg-emerald-500/15 text-emerald-200 border border-emerald-500/20'
                        }`}
                      >
                        {opponent.inPit ? 'PIT' : 'TRACK'}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {opponents.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-2 text-center text-emerald-200/70">
                    Waiting for AtlasLink data…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  );
}

