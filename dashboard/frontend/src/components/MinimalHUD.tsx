import { useRef, useEffect, useState } from 'react';
import { useTelemetry } from '../hooks/useTelemetry';

function compoundInfo(compound: string | undefined): { letter: string; color: string } {
  if (!compound) return { letter: '-', color: 'text-gray-500' };
  const c = compound.toLowerCase();
  if (c.includes('soft') || c === 's') return { letter: 'S', color: 'text-red-500' };
  if (c.includes('medium') || c === 'm') return { letter: 'M', color: 'text-yellow-500' };
  if (c.includes('hard') || c === 'h') return { letter: 'H', color: 'text-white' };
  if (c.includes('inter') || c === 'i') return { letter: 'I', color: 'text-green-500' };
  if (c.includes('wet') || c === 'w') return { letter: 'W', color: 'text-blue-500' };
  return { letter: compound.charAt(0).toUpperCase(), color: 'text-gray-400' };
}

function wearBarColor(wear: number): string {
  if (wear < 30) return '#10b981';
  if (wear < 60) return '#fbbf24';
  return '#ef4444';
}

function formatGear(gear: number | undefined | null): string {
  if (gear === undefined || gear === null) return '-';
  if (gear === 0) return 'N';
  if (gear === -1) return 'R';
  return String(gear);
}

function formatDelta(delta: number | undefined | null): string {
  if (delta === undefined || delta === null) return '+0.000';
  const sign = delta >= 0 ? '+' : '';
  return `${sign}${delta.toFixed(3)}`;
}

function Divider() {
  return <div className="w-px self-stretch my-16 bg-gray-800 flex-shrink-0" />;
}

const WEAR_BAR_HEIGHT = 160;
const WEAR_LABELS = ['FL', 'FR', 'RL', 'RR'] as const;

export function MinimalHUD() {
  const { telemetry } = useTelemetry();
  const prevPositionRef = useRef<number | null>(null);
  const [posChange, setPosChange] = useState<'gained' | 'lost' | 'same'>('same');

  const pos = telemetry?.position;

  useEffect(() => {
    if (pos === undefined || pos === null) return;
    const prev = prevPositionRef.current;
    if (prev !== null && pos !== prev) {
      setPosChange(pos < prev ? 'gained' : 'lost');
      const id = setTimeout(() => setPosChange('same'), 3000);
      return () => clearTimeout(id);
    }
    prevPositionRef.current = pos;
  }, [pos]);

  const t = telemetry;
  const lap = t?.current_lap_num;
  const totalLaps = t?.total_laps;
  const gear = t?.gear;
  const speed = t?.speed_kph;
  const delta = t?.delta_time;
  const tireWear = t?.tire_wear ?? t?.tyreWear;
  const compound = compoundInfo(t?.tire_compound);
  const tyreAge = t?.tire_age_laps;

  const posColor =
    posChange === 'gained' ? 'text-green-400' :
    posChange === 'lost' ? 'text-red-400' : 'text-white';

  const deltaColor =
    delta === undefined || delta === null || delta === 0
      ? 'text-white'
      : delta > 0 ? 'text-red-400' : 'text-green-400';

  return (
    <div
      className="flex items-center h-full w-full select-none"
      style={{ background: '#050505', width: 800, height: 360 }}
    >
      {/* Position */}
      <div className="flex-1 flex flex-col items-center justify-center">
        <span className={`font-oxanium text-4xl font-bold leading-none ${posColor}`}>
          P{pos ?? '-'}
        </span>
        <span className="text-xs uppercase tracking-wider text-gray-500 mt-2">POS</span>
      </div>

      <Divider />

      {/* Lap counter */}
      <div className="flex-1 flex flex-col items-center justify-center">
        <span className="font-oxanium text-3xl font-semibold text-white leading-none whitespace-nowrap">
          {lap != null ? lap : '-'}
          {totalLaps ? <span className="text-gray-500">/{totalLaps}</span> : null}
        </span>
        <span className="text-xs uppercase tracking-wider text-gray-500 mt-2">LAP</span>
      </div>

      <Divider />

      {/* Gear — hero element */}
      <div className="flex-1 flex flex-col items-center justify-center">
        <span className="font-oxanium text-7xl font-bold text-white leading-none">
          {formatGear(gear)}
        </span>
      </div>

      <Divider />

      {/* Speed */}
      <div className="flex-1 flex flex-col items-center justify-center">
        <span className="font-metrophobic text-5xl font-bold text-white leading-none tabular-nums">
          {speed != null ? Math.round(speed) : '-'}
        </span>
        <span className="text-xs uppercase tracking-wider text-gray-500 mt-2">KPH</span>
      </div>

      <Divider />

      {/* Delta */}
      <div className="flex-[1.2] flex flex-col items-center justify-center">
        <span className={`font-mono text-3xl font-bold leading-none tabular-nums ${deltaColor}`}>
          {formatDelta(delta)}
        </span>
        <span className="text-xs uppercase tracking-wider text-gray-500 mt-2">DELTA</span>
      </div>

      <Divider />

      {/* Tyre wear strip */}
      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="flex items-end gap-2" style={{ height: WEAR_BAR_HEIGHT }}>
          {WEAR_LABELS.map((label, i) => {
            const wear = tireWear?.[i] ?? 0;
            const remaining = Math.max(0, Math.min(100, 100 - wear));
            const barH = tireWear
              ? Math.max(4, (remaining / 100) * (WEAR_BAR_HEIGHT - 16))
              : WEAR_BAR_HEIGHT * 0.4;

            return (
              <div key={label} className="flex flex-col items-center">
                <div
                  className="w-3 rounded-sm"
                  style={{
                    height: barH,
                    backgroundColor: tireWear ? wearBarColor(wear) : '#374151',
                  }}
                />
                <span className="text-[9px] text-gray-600 mt-1">{label}</span>
              </div>
            );
          })}
        </div>
      </div>

      <Divider />

      {/* Compound + Age */}
      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="flex items-baseline gap-1">
          <span className={`font-oxanium text-4xl font-bold leading-none ${compound.color}`}>
            {compound.letter}
          </span>
          <span className="font-metrophobic text-2xl text-gray-300 leading-none">
            {tyreAge ?? '-'}
          </span>
        </div>
        <span className="text-xs uppercase tracking-wider text-gray-500 mt-2">COMP</span>
      </div>
    </div>
  );
}
