import React, { useState } from 'react';
import { Card } from '../ui/card';
import type { StandardizedTelemetry } from '../../utils/telemetryConverter';

interface Props {
  multiCarData: any;
  telemetry: StandardizedTelemetry;
}

export function DevModeDriversGrid({ multiCarData, telemetry }: Props) {
  const [gapDisplayMode, setGapDisplayMode] = useState<'leader' | 'interval'>('leader');

  if (!multiCarData?.cars || multiCarData.cars.length === 0) return null;

  return (
    <Card className="bg-black/60 border border-gray-700 p-4 col-span-4">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-sm font-bold text-gray-400">DRIVERS ON TRACK ({multiCarData.cars.length})</h3>
        <button
          onClick={() => setGapDisplayMode(gapDisplayMode === 'leader' ? 'interval' : 'leader')}
          className="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-white text-xs transition-colors"
        >
          {gapDisplayMode === 'leader' ? 'Gap to Leader' : 'Interval'}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        {multiCarData.cars.slice(0, 20).map((car: any, idx: number) => {
          const fastestLapTime = Math.min(
            ...multiCarData.cars
              .filter((c: any) => c.best_lap_time && c.best_lap_time > 0)
              .map((c: any) => c.best_lap_time)
          );

          const isCurrentDriver = car.position === telemetry.position;
          const hasFastestLap = car.best_lap_time > 0 && car.best_lap_time === fastestLapTime;

          let boxClassName = 'p-2 rounded border ';
          if (hasFastestLap) {
            boxClassName += 'border-purple-400 bg-purple-900/20 text-purple-400 font-bold';
          } else if (isCurrentDriver) {
            boxClassName += 'border-green-400 bg-green-900/20 text-green-400 font-bold';
          } else {
            boxClassName += 'border-gray-600';
          }

          let gapDisplay = '';
          if (gapDisplayMode === 'leader') {
            gapDisplay = car.gap_to_leader ? `+${car.gap_to_leader.toFixed(1)}s` : '';
          } else {
            gapDisplay = car.gap_to_car_ahead ? `+${car.gap_to_car_ahead.toFixed(1)}s` : '';
          }

          return (
            <div key={idx} className={boxClassName}>
              <div className="flex justify-between items-center">
                <span className="font-bold">
                  P{car.position}: {(car.driver_name || `Car ${car.race_number}`).replace(/\0+$/g, '').replace(/0+$/g, '')}
                  {hasFastestLap && isCurrentDriver && ' \uD83D\uDC51\uD83C\uDFC6'}
                  {hasFastestLap && !isCurrentDriver && ' \uD83C\uDFC6'}
                  {!hasFastestLap && isCurrentDriver && ' \uD83D\uDC48'}
                </span>
                <span className="text-gray-400">{gapDisplay}</span>
              </div>
              <div className="flex justify-between items-center mt-1">
                <span className={`text-xs ${
                  car.tire_compound ?
                    car.tire_compound.includes('SOFT') ? 'text-red-400' :
                    car.tire_compound.includes('MEDIUM') ? 'text-yellow-400' :
                    car.tire_compound.includes('HARD') ? 'text-white' :
                    car.tire_compound.includes('INTER') ? 'text-green-400' :
                    car.tire_compound.includes('WET') ? 'text-blue-400' :
                    'text-gray-400' : 'text-gray-400'
                }`}>
                  \uD83C\uDFCE\uFE0F {car.tire_compound || 'UNKNOWN'} ({car.tyre_age || car.tire_age || 0}L)
                </span>
                <div className="flex gap-1">
                  {(car.pit_status === 2 || car.pit_status === 'In Pit') && (
                    <span className="text-blue-400 font-bold">\uD83C\uDD7F\uFE0F</span>
                  )}
                  {(car.pit_status === 1 || car.pit_status === 'Pitting') && (
                    <span className="text-yellow-400 font-bold">\uD83C\uDFC1</span>
                  )}
                  {car.penalties_time > 0 && (
                    <span className="text-red-400 font-bold">\uD83D\uDEA8{car.penalties_time}s</span>
                  )}
                  {car.num_penalties > 0 && (
                    <span className="text-orange-400">\u26A0\uFE0F{car.num_penalties}</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
