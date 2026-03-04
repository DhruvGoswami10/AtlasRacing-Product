// Shared constants, types, and helpers for DevMode panels

export const fuelStatusStyles = [
  { label: 'Optimal', className: 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/40' },
  { label: 'Monitor', className: 'bg-amber-500/20 text-amber-200 border border-amber-500/40' },
  { label: 'Critical', className: 'bg-rose-600/20 text-rose-200 border border-rose-500/40' },
] as const;

export const tyreStatusStyles = [
  { label: 'Healthy', className: 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/40' },
  { label: 'Caution', className: 'bg-amber-500/20 text-amber-200 border border-amber-500/40' },
  { label: 'Critical', className: 'bg-rose-600/20 text-rose-200 border border-rose-500/40' },
] as const;

export const pitStatusStyles = [
  { label: 'Hold', className: 'bg-slate-600/20 text-slate-200 border border-slate-600/40' },
  { label: 'Plan', className: 'bg-amber-500/20 text-amber-200 border border-amber-500/40' },
  { label: 'Box Now', className: 'bg-rose-600/20 text-rose-200 border border-rose-500/40' },
] as const;

export const ersModeStyles = [
  { label: 'Balanced', className: 'bg-sky-500/20 text-sky-200 border border-sky-500/40' },
  { label: 'Harvest', className: 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/40' },
  { label: 'Attack', className: 'bg-orange-500/20 text-orange-200 border border-orange-500/40' },
  { label: 'Defend', className: 'bg-rose-600/20 text-rose-200 border border-rose-500/40' },
] as const;

export type StatusStyle = { label: string; className: string };

export function pickStatusStyle<T>(map: readonly T[], index?: number): T {
  if (typeof index !== 'number' || Number.isNaN(index)) {
    return map[0];
  }
  const clamped = Math.max(0, Math.min(map.length - 1, Math.trunc(index)));
  return map[clamped];
}

export const asNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

export const formatGap = (gap?: number | null): string | null => {
  if (gap === null || gap === undefined || !Number.isFinite(gap)) {
    return null;
  }
  const absoluteValue = Math.abs(gap);
  const sign = gap >= 0 ? '+' : '-';
  const decimals = absoluteValue >= 10 ? 1 : 2;
  return `${sign}${absoluteValue.toFixed(decimals)}s`;
};

export const formatTempDisplay = (value: number | null | undefined): string => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'N/A';
  }
  return `${value.toFixed(1)}°C`;
};

export const formatSeconds = (value: number | null | undefined): string => {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  const negative = value < 0;
  const abs = Math.abs(value);
  const minutes = Math.floor(abs / 60);
  const seconds = abs - minutes * 60;
  const secondsStr = seconds < 10 ? `0${seconds.toFixed(1)}` : seconds.toFixed(1);
  return `${negative ? '-' : ''}${minutes}:${secondsStr}`;
};

export const formatDuration = (value: number | null): string => {
  if (value === null || !Number.isFinite(value)) {
    return '—';
  }
  const ms = Math.max(0, value);
  if (ms < 1000) return '<1s';
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
  return `${(ms / 3600000).toFixed(2)}h`;
};

export const sanitizeControlValue = (value: number | null | undefined): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value >= 250 || value < 0) return null;
  return value;
};

export const formatDiscreteSetting = (value: number | null, maxSteps: number): string => {
  if (value === null) return 'N/A';
  if (value <= 0) return 'OFF';
  const clamped = Math.max(1, Math.min(maxSteps + 1, Math.round(value)));
  return `${clamped}/${maxSteps + 1}`;
};
