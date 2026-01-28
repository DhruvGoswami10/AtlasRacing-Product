/**
 * useMLPredictions - WebSocket hook for ML Service predictions
 * Connects to the Python ML service and receives real-time predictions
 */

import { useState, useEffect, useCallback, useRef } from 'react';

// ML Service prediction types
export interface TireLifePrediction {
  remaining_laps: number;
  cliff_lap: number;
  confidence: number;
  degradation_curve: number[];
  degradation_rate: number;
  current_performance: number;
  wear_status: 'healthy' | 'caution' | 'critical';
}

export interface PacePrediction {
  predicted_lap_times: number[];
  trend: 'improving' | 'stable' | 'degrading';
  trend_delta: number;
  optimal_pace: number;
  current_pace: number;
  pace_delta: number;
  confidence: number;
}

export interface OvertakePrediction {
  probability: number;
  best_opportunity: string;
  risk: 'low' | 'medium' | 'high';
  recommendation: 'go' | 'wait' | 'defend';
  target_driver: string | null;
  factors: Record<string, number>;
  confidence: number;
}

export interface StrategyPlan {
  id: string;
  title: string;
  description: string;
  pit_lap: number | null;
  compound: string;
  status: 'hold' | 'prepare' | 'box';
  risk: 'low' | 'medium' | 'high';
  confidence: number;
  reasoning: string;
  trigger_condition: string;
}

export interface StrategySet {
  primary: StrategyPlan;
  backup_a: StrategyPlan;
  backup_b: StrategyPlan;
  backup_c: StrategyPlan;
}

export interface TriggerEvent {
  type: string;
  priority: 'high' | 'medium' | 'low';
  context: Record<string, unknown>;
  message_hint: string;
  cooldown_key: string;
}

export interface LearningStatus {
  progress: number;
  is_calibrated: boolean;
  samples: number;
  required_samples: number;
  learned_compounds: string[];
  message: string;
}

export interface MLPredictions {
  tire_life: TireLifePrediction;
  pace: PacePrediction;
  overtake: OvertakePrediction;
  strategy: StrategySet;
  triggers: TriggerEvent[];
  learning_status: LearningStatus;
}

export interface TelemetryForML {
  timestamp: number;
  current_lap: number;
  total_laps: number;
  position: number;
  tire_wear: number[];
  tire_temps: number[];
  tire_compound: string;
  tire_age: number;
  last_lap_time?: number | null;
  best_lap_time?: number | null;
  current_lap_time?: number | null;
  sector_times?: number[];
  fuel_remaining: number;
  fuel_per_lap?: number | null;
  gap_ahead?: number | null;
  gap_behind?: number | null;
  gap_to_leader?: number | null;
  opponent_ahead_tire_age?: number | null;
  opponent_behind_tire_age?: number | null;
  drs_available?: boolean;
  weather?: string;
  track_temp?: number | null;
  air_temp?: number | null;
  flag_status?: string;
  game?: string;
}

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface UseMLPredictionsOptions {
  url?: string;
  autoConnect?: boolean;
  reconnectInterval?: number;
}

interface UseMLPredictionsReturn {
  predictions: MLPredictions | null;
  connectionStatus: ConnectionStatus;
  isConnected: boolean;
  connect: () => void;
  disconnect: () => void;
  sendTelemetry: (telemetry: TelemetryForML) => void;
  lastError: string | null;
  triggers: TriggerEvent[];
}

const DEFAULT_URL = 'ws://localhost:8081/ws';
const DEFAULT_RECONNECT_INTERVAL = 5000;

export function useMLPredictions(options: UseMLPredictionsOptions = {}): UseMLPredictionsReturn {
  const {
    url = DEFAULT_URL,
    autoConnect = true,
    reconnectInterval = DEFAULT_RECONNECT_INTERVAL,
  } = options;

  const [predictions, setPredictions] = useState<MLPredictions | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [lastError, setLastError] = useState<string | null>(null);
  const [triggers, setTriggers] = useState<TriggerEvent[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const shouldReconnectRef = useRef(autoConnect);

  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    // Don't connect if already connected or connecting
    if (wsRef.current?.readyState === WebSocket.OPEN ||
        wsRef.current?.readyState === WebSocket.CONNECTING) {
      return;
    }

    clearReconnectTimeout();
    setConnectionStatus('connecting');
    setLastError(null);

    try {
      const ws = new WebSocket(url);

      ws.onopen = () => {
        setConnectionStatus('connected');
        setLastError(null);
        console.log('[ML Service] Connected');
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          if (message.type === 'prediction' && message.data) {
            const data = message.data as MLPredictions;
            setPredictions(data);

            // Extract and store triggers
            if (data.triggers && data.triggers.length > 0) {
              setTriggers(prev => {
                // Keep last 20 triggers for history
                const combined = [...data.triggers, ...prev];
                return combined.slice(0, 20);
              });
            }
          } else if (message.type === 'error') {
            console.error('[ML Service] Error:', message.message);
            setLastError(message.message);
          }
        } catch (err) {
          console.error('[ML Service] Failed to parse message:', err);
        }
      };

      ws.onerror = (event) => {
        console.error('[ML Service] WebSocket error:', event);
        setLastError('Connection error');
        setConnectionStatus('error');
      };

      ws.onclose = (event) => {
        setConnectionStatus('disconnected');
        wsRef.current = null;

        if (!event.wasClean) {
          setLastError(`Connection closed: ${event.reason || 'Unknown reason'}`);
        }

        // Auto-reconnect if enabled
        if (shouldReconnectRef.current) {
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log('[ML Service] Attempting to reconnect...');
            connect();
          }, reconnectInterval);
        }
      };

      wsRef.current = ws;
    } catch (err) {
      console.error('[ML Service] Failed to create WebSocket:', err);
      setConnectionStatus('error');
      setLastError(err instanceof Error ? err.message : 'Failed to connect');

      // Schedule reconnect
      if (shouldReconnectRef.current) {
        reconnectTimeoutRef.current = setTimeout(connect, reconnectInterval);
      }
    }
  }, [url, reconnectInterval, clearReconnectTimeout]);

  const disconnect = useCallback(() => {
    shouldReconnectRef.current = false;
    clearReconnectTimeout();

    if (wsRef.current) {
      wsRef.current.close(1000, 'Client disconnect');
      wsRef.current = null;
    }

    setConnectionStatus('disconnected');
  }, [clearReconnectTimeout]);

  const sendTelemetry = useCallback((telemetry: TelemetryForML) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify(telemetry));
      } catch (err) {
        console.error('[ML Service] Failed to send telemetry:', err);
      }
    }
  }, []);

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect) {
      shouldReconnectRef.current = true;
      connect();
    }

    return () => {
      shouldReconnectRef.current = false;
      clearReconnectTimeout();
      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmount');
      }
    };
  }, [autoConnect, connect, clearReconnectTimeout]);

  return {
    predictions,
    connectionStatus,
    isConnected: connectionStatus === 'connected',
    connect,
    disconnect,
    sendTelemetry,
    lastError,
    triggers,
  };
}

/**
 * Helper hook to automatically send telemetry to ML service
 */
export function useMLTelemetryBridge(
  telemetry: Record<string, unknown> | null,
  mlHook: UseMLPredictionsReturn,
  enabled = true
) {
  const lastSentRef = useRef<number>(0);
  const throttleMs = 100; // Send at most every 100ms

  useEffect(() => {
    if (!enabled || !telemetry || !mlHook.isConnected) return;

    const now = Date.now();
    if (now - lastSentRef.current < throttleMs) return;
    lastSentRef.current = now;

    // Convert telemetry to ML format
    const mlTelemetry: TelemetryForML = {
      timestamp: now,
      current_lap: (telemetry.current_lap_num as number) ?? (telemetry.currentLapNum as number) ?? 1,
      total_laps: (telemetry.total_laps as number) ?? (telemetry.totalLaps as number) ?? 50,
      position: (telemetry.position as number) ?? 1,
      tire_wear: extractTireWear(telemetry),
      tire_temps: extractTireTemps(telemetry),
      tire_compound: (telemetry.tire_compound as string) ?? (telemetry.tyreCompound as string) ?? 'medium',
      tire_age: (telemetry.tire_age as number) ?? (telemetry.tyreAge as number) ?? 0,
      last_lap_time: (telemetry.last_lap_time as number) ?? (telemetry.lastLapTime as number) ?? null,
      best_lap_time: (telemetry.best_lap_time as number) ?? (telemetry.bestLapTime as number) ?? null,
      current_lap_time: (telemetry.current_lap_time as number) ?? (telemetry.currentLapTime as number) ?? null,
      sector_times: extractSectorTimes(telemetry),
      fuel_remaining: (telemetry.fuel_in_tank as number) ?? (telemetry.fuelInTank as number) ?? 50,
      fuel_per_lap: (telemetry.fuel_per_lap as number) ?? (telemetry.fuelPerLap as number) ?? null,
      gap_ahead: (telemetry.gap_to_car_ahead as number) ?? (telemetry.gapAhead as number) ?? null,
      gap_behind: (telemetry.gap_to_car_behind as number) ?? (telemetry.gapBehind as number) ?? null,
      gap_to_leader: (telemetry.gap_to_leader as number) ?? (telemetry.gapToLeader as number) ?? null,
      drs_available: Boolean(telemetry.drs_allowed ?? telemetry.drsAllowed),
      weather: extractWeather(telemetry),
      track_temp: (telemetry.track_temperature as number) ?? (telemetry.trackTemp as number) ?? null,
      air_temp: (telemetry.air_temperature as number) ?? (telemetry.airTemp as number) ?? null,
      flag_status: extractFlagStatus(telemetry),
      game: (telemetry.game as string) ?? 'f1_24',
    };

    mlHook.sendTelemetry(mlTelemetry);
  }, [telemetry, mlHook, enabled]);
}

// Helper functions to extract data from various telemetry formats
function extractTireWear(telemetry: Record<string, unknown>): number[] {
  // Try array format first (various field names)
  if (Array.isArray(telemetry.tire_wear)) return telemetry.tire_wear as number[];
  if (Array.isArray(telemetry.tyreWear)) return telemetry.tyreWear as number[];
  if (Array.isArray(telemetry.tyre_wear_detailed)) return telemetry.tyre_wear_detailed as number[];
  if (Array.isArray(telemetry.tyreWearDetailed)) return telemetry.tyreWearDetailed as number[];

  // Try individual fields (from standardized telemetry)
  const fl = (telemetry.tireWearFL ?? telemetry.tire_wear_fl ?? telemetry.tyreWearFL ?? 0) as number;
  const fr = (telemetry.tireWearFR ?? telemetry.tire_wear_fr ?? telemetry.tyreWearFR ?? 0) as number;
  const rl = (telemetry.tireWearRL ?? telemetry.tire_wear_rl ?? telemetry.tyreWearRL ?? 0) as number;
  const rr = (telemetry.tireWearRR ?? telemetry.tire_wear_rr ?? telemetry.tyreWearRR ?? 0) as number;

  return [fl, fr, rl, rr];
}

function extractTireTemps(telemetry: Record<string, unknown>): number[] {
  // Try array format first
  if (Array.isArray(telemetry.tire_temps)) return telemetry.tire_temps as number[];
  if (Array.isArray(telemetry.tyreTemps)) return telemetry.tyreTemps as number[];
  if (Array.isArray(telemetry.tire_surface_temperature)) return telemetry.tire_surface_temperature as number[];

  // Try individual fields
  const fl = (telemetry.tire_temp_fl ?? telemetry.tyreTempFL ?? 90) as number;
  const fr = (telemetry.tire_temp_fr ?? telemetry.tyreTempFR ?? 90) as number;
  const rl = (telemetry.tire_temp_rl ?? telemetry.tyreTempRL ?? 90) as number;
  const rr = (telemetry.tire_temp_rr ?? telemetry.tyreTempRR ?? 90) as number;

  return [fl, fr, rl, rr];
}

function extractSectorTimes(telemetry: Record<string, unknown>): number[] {
  const s1 = (telemetry.sector1_time ?? telemetry.sector1Time ?? 0) as number;
  const s2 = (telemetry.sector2_time ?? telemetry.sector2Time ?? 0) as number;
  const s3 = (telemetry.sector3_time ?? telemetry.sector3Time ?? 0) as number;

  return [s1, s2, s3].filter(t => t > 0);
}

function extractWeather(telemetry: Record<string, unknown>): string {
  const weather = telemetry.weather ?? telemetry.weather_type ?? telemetry.weatherType;

  if (typeof weather === 'number') {
    // F1 24 weather IDs
    switch (weather) {
      case 0: return 'dry';
      case 1: return 'light_cloud';
      case 2: return 'overcast';
      case 3: return 'light_rain';
      case 4: return 'heavy_rain';
      case 5: return 'storm';
      default: return 'dry';
    }
  }

  if (typeof weather === 'string') {
    return weather;
  }

  return 'dry';
}

function extractFlagStatus(telemetry: Record<string, unknown>): string {
  const flagType = telemetry.flag_type ?? telemetry.flagType;

  if (typeof flagType === 'number') {
    switch (flagType) {
      case 0: return 'green';
      case 1:
      case 2:
      case 3:
      case 6: return 'yellow';
      case 4: return 'red';
      case 5: return 'sc';
      default: return 'green';
    }
  }

  return (flagType as string) ?? 'green';
}
