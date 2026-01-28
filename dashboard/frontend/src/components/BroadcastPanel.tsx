/**
 * BroadcastPanel - Race control events and commentary
 * All messages are LLM-generated based on telemetry events
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card } from './ui/card';
import { Radio, Flag, AlertTriangle, Clock, Trophy, Fuel } from 'lucide-react';
import {
  getLLMEngineer,
  type EngineerMessage,
  type RaceContext,
} from '../services/llm_engineer';
import type { MultiCarTelemetryData } from '../types/telemetry';

interface BroadcastPanelProps {
  telemetry: Record<string, unknown> | null;
  multiCarData?: MultiCarTelemetryData | null;
  className?: string;
}

interface BroadcastEvent {
  id: string;
  type: 'flag' | 'pit' | 'position' | 'fastest' | 'gap' | 'info';
  content: string;
  timestamp: Date;
  priority: 'high' | 'medium' | 'low';
}

// Event detection state
interface EventState {
  lastFlagStatus: string | null;
  lastLeaderPosition: number | null;
  lastFastestLap: number | null;
  carPitStatus: Map<number, number>;  // carIndex -> pit status
  carPositions: Map<number, number>;  // carIndex -> position
}

export const BroadcastPanel: React.FC<BroadcastPanelProps> = ({
  telemetry,
  multiCarData,
  className = '',
}) => {
  const [broadcasts, setBroadcasts] = useState<BroadcastEvent[]>([]);
  const eventStateRef = useRef<EventState>({
    lastFlagStatus: null,
    lastLeaderPosition: null,
    lastFastestLap: null,
    carPitStatus: new Map(),
    carPositions: new Map(),
  });
  const lastEventTimeRef = useRef<Map<string, number>>(new Map());

  // Build race context
  const buildRaceContext = useCallback((): RaceContext => {
    const t = telemetry ?? {};

    return {
      currentLap: (t.current_lap_num as number) ?? (t.currentLapNum as number) ?? 1,
      totalLaps: (t.total_laps as number) ?? (t.totalLaps as number) ?? 50,
      position: (t.position as number) ?? 1,
      trackName: (t.track_name as string) ?? (t.trackName as string),
      gapAhead: (t.gap_to_car_ahead as number) ?? null,
      gapBehind: (t.gap_to_car_behind as number) ?? null,
      tireCompound: (t.tire_compound as string) ?? 'medium',
      tireAge: (t.tire_age as number) ?? 0,
      tireWearStatus: 'healthy',
      tireRemainingLaps: 20,
      weather: (t.weather as string) ?? 'dry',
      flagStatus: (t.flag_status as string) ?? 'green',
    };
  }, [telemetry]);

  // Check event cooldown
  const shouldEmitEvent = useCallback((eventKey: string, cooldownMs: number): boolean => {
    const now = Date.now();
    const lastTime = lastEventTimeRef.current.get(eventKey) ?? 0;

    if (now - lastTime < cooldownMs) {
      return false;
    }

    lastEventTimeRef.current.set(eventKey, now);
    return true;
  }, []);

  // Add a broadcast
  const addBroadcast = useCallback(async (
    type: BroadcastEvent['type'],
    eventContext: Record<string, unknown>,
    priority: BroadcastEvent['priority'] = 'medium'
  ) => {
    const llmService = getLLMEngineer();
    let content: string;

    if (llmService) {
      try {
        const raceContext = buildRaceContext();
        const message = await llmService.generateBroadcast(type, eventContext, raceContext);
        content = message.content;
      } catch (err) {
        console.error('[BroadcastPanel] LLM generation failed:', err);
        content = generateFallbackMessage(type, eventContext);
      }
    } else {
      content = generateFallbackMessage(type, eventContext);
    }

    const broadcast: BroadcastEvent = {
      id: `bcast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      content,
      timestamp: new Date(),
      priority,
    };

    setBroadcasts(prev => {
      const updated = [broadcast, ...prev];
      return updated.slice(0, 30);  // Keep last 30
    });
  }, [buildRaceContext]);

  // Detect events from telemetry changes
  useEffect(() => {
    if (!telemetry) return;

    const state = eventStateRef.current;
    const currentLap = (telemetry.current_lap_num as number) ?? 1;

    // Flag changes
    const flagStatus = (telemetry.flag_status as string) ?? (telemetry.flagType as number);
    const flagString = typeof flagStatus === 'number'
      ? flagStatus === 0 ? 'green' : flagStatus === 4 ? 'red' : flagStatus === 5 ? 'sc' : 'yellow'
      : flagStatus ?? 'green';

    if (flagString !== state.lastFlagStatus && state.lastFlagStatus !== null) {
      if (shouldEmitEvent(`flag-${flagString}`, 30000)) {
        addBroadcast('flag', {
          flag_type: flagString,
          previous_flag: state.lastFlagStatus,
          lap: currentLap,
        }, flagString === 'green' ? 'medium' : 'high');
      }
    }
    state.lastFlagStatus = flagString;

  }, [telemetry, shouldEmitEvent, addBroadcast]);

  // Detect events from multi-car data
  useEffect(() => {
    if (!multiCarData?.cars) return;

    const state = eventStateRef.current;
    const currentLap = (telemetry?.current_lap_num as number) ?? 1;

    for (const car of multiCarData.cars) {
      const carIndex = car.car_index ?? 0;
      const pitStatus = car.pit_status ?? 0;
      const position = car.position ?? 0;
      const driverName = (car.driver_name ?? '').replace(/\0/g, '').trim() || `Car ${carIndex}`;

      // Pit stop detection
      const prevPitStatus = state.carPitStatus.get(carIndex) ?? 0;
      if (pitStatus === 1 && prevPitStatus === 0) {
        // Car entered pits
        if (shouldEmitEvent(`pit-${carIndex}`, 60000)) {
          addBroadcast('pit', {
            driver: driverName,
            lap: currentLap,
            position: position,
            action: 'entered_pits',
          }, position <= 5 ? 'high' : 'medium');
        }
      } else if (pitStatus === 0 && prevPitStatus === 1) {
        // Car exited pits
        if (shouldEmitEvent(`pit-exit-${carIndex}`, 60000)) {
          addBroadcast('pit', {
            driver: driverName,
            lap: currentLap,
            position: position,
            action: 'exited_pits',
            compound: car.tyre_compound ?? (car as any).tire_compound ?? 'unknown',
          }, position <= 5 ? 'medium' : 'low');
        }
      }
      state.carPitStatus.set(carIndex, pitStatus);

      // Position change detection (top 5 only)
      const prevPosition = state.carPositions.get(carIndex);
      if (prevPosition !== undefined && position !== prevPosition && position <= 5) {
        const gained = position < prevPosition;
        if (shouldEmitEvent(`pos-${carIndex}-${position}`, 30000)) {
          addBroadcast('position', {
            driver: driverName,
            old_position: prevPosition,
            new_position: position,
            gained,
            lap: currentLap,
          }, position === 1 ? 'high' : 'medium');
        }
      }
      state.carPositions.set(carIndex, position);
    }

    // Fastest lap detection
    if (multiCarData.session_best_times?.lap) {
      const fastestLap = multiCarData.session_best_times.lap;
      if (state.lastFastestLap && fastestLap < state.lastFastestLap) {
        // New fastest lap
        if (shouldEmitEvent('fastest-lap', 30000)) {
          const fastestDriver = multiCarData.cars.find(c => c.has_fastest_lap === 1);
          addBroadcast('fastest', {
            time: fastestLap,
            previous_time: state.lastFastestLap,
            driver: fastestDriver?.driver_name?.replace(/\0/g, '').trim() ?? 'Unknown',
            lap: currentLap,
          }, 'medium');
        }
      }
      state.lastFastestLap = fastestLap;
    }

  }, [multiCarData, telemetry, shouldEmitEvent, addBroadcast]);

  // Get icon for broadcast type
  const getIcon = (type: BroadcastEvent['type']) => {
    switch (type) {
      case 'flag':
        return <Flag className="w-3.5 h-3.5" />;
      case 'pit':
        return <Fuel className="w-3.5 h-3.5" />;
      case 'position':
        return <Trophy className="w-3.5 h-3.5" />;
      case 'fastest':
        return <Clock className="w-3.5 h-3.5" />;
      default:
        return <Radio className="w-3.5 h-3.5" />;
    }
  };

  // Get style for broadcast type
  const getStyle = (type: BroadcastEvent['type'], priority: BroadcastEvent['priority']) => {
    if (priority === 'high') {
      return 'bg-amber-500/10 border-amber-500/40 text-amber-100';
    }

    switch (type) {
      case 'flag':
        return 'bg-yellow-500/10 border-yellow-500/30 text-yellow-100';
      case 'pit':
        return 'bg-sky-500/10 border-sky-500/30 text-sky-100';
      case 'position':
        return 'bg-emerald-500/10 border-emerald-500/30 text-emerald-100';
      case 'fastest':
        return 'bg-purple-500/10 border-purple-500/30 text-purple-100';
      default:
        return 'bg-slate-600/20 border-slate-500/30 text-slate-100';
    }
  };

  // Format timestamp
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  return (
    <Card className={`bg-black/60 border border-gray-700 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-bold text-white uppercase tracking-wide">Race Control</h3>
        </div>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
          BROADCAST
        </span>
      </div>

      {/* Broadcasts */}
      <div className="p-3 space-y-2 max-h-[300px] overflow-y-auto">
        {broadcasts.length === 0 ? (
          <div className="flex items-center justify-center h-20 text-gray-500 text-xs">
            Waiting for race events...
          </div>
        ) : (
          broadcasts.map((broadcast) => (
            <div
              key={broadcast.id}
              className={`rounded border px-3 py-2 ${getStyle(broadcast.type, broadcast.priority)}`}
            >
              <div className="flex items-start gap-2">
                <span className="mt-0.5 opacity-70">
                  {getIcon(broadcast.type)}
                </span>
                <div className="flex-1">
                  <span className="text-sm">{broadcast.content}</span>
                  <div className="mt-1 text-[10px] opacity-60 font-mono">
                    {formatTime(broadcast.timestamp)}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
};

// Fallback message generation when LLM is unavailable
function generateFallbackMessage(type: string, context: Record<string, unknown>): string {
  switch (type) {
    case 'flag':
      return `Flag change: ${(context.flag_type as string)?.toUpperCase() ?? 'UNKNOWN'} FLAG`;
    case 'pit':
      return `${context.driver ?? 'Driver'} ${context.action === 'entered_pits' ? 'enters pits' : 'exits pits'} (L${context.lap ?? '?'})`;
    case 'position':
      return `${context.driver ?? 'Driver'} ${context.gained ? 'gains' : 'loses'} position - now P${context.new_position ?? '?'}`;
    case 'fastest':
      return `NEW FASTEST LAP - ${context.driver ?? 'Driver'}`;
    default:
      return 'Race update';
  }
}

export default BroadcastPanel;
