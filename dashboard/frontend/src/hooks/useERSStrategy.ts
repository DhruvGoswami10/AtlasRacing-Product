/**
 * useERSStrategy - Hook for ERS strategy recommendations
 *
 * Provides intelligent ERS deployment advice based on race context
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  getERSAdvisor,
  resetERSAdvisor,
  ERSStrategyAdvisor,
  type ERSAdvice,
  type ERSRecommendation,
} from '../services/ers_strategy';
import type { TelemetryData, MultiCarTelemetryData } from '../types/telemetry';

interface UseERSStrategyOptions {
  enabled?: boolean;
  updateInterval?: number; // ms between updates (default 1000)
}

interface UseERSStrategyReturn {
  advice: ERSAdvice | null;
  batteryPercent: number;
  batteryTrend: 'charging' | 'depleting' | 'stable';
  estimatedLapsRemaining: number;
  reset: () => void;
}

export function useERSStrategy(
  telemetry: TelemetryData | null,
  multiCarData: MultiCarTelemetryData | null,
  isInBattle: boolean = false,
  options: UseERSStrategyOptions = {}
): UseERSStrategyReturn {
  const { enabled = true, updateInterval = 1000 } = options;

  const [advice, setAdvice] = useState<ERSAdvice | null>(null);
  const [batteryPercent, setBatteryPercent] = useState(0);
  const [batteryTrend, setBatteryTrend] = useState<'charging' | 'depleting' | 'stable'>('stable');
  const [estimatedLapsRemaining, setEstimatedLapsRemaining] = useState(99);

  const advisorRef = useRef<ERSStrategyAdvisor>(getERSAdvisor());
  const lastUpdateRef = useRef<number>(0);
  const lastSessionUIDRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !telemetry) return;

    // Check for session change
    const sessionUID = (telemetry as any).session_uid;
    if (sessionUID && sessionUID !== lastSessionUIDRef.current) {
      advisorRef.current.reset();
      lastSessionUIDRef.current = sessionUID;
    }

    // Throttle updates
    const now = Date.now();
    if (now - lastUpdateRef.current < updateInterval) return;
    lastUpdateRef.current = now;

    // Calculate battery percent
    // ers_store_energy is already normalized 0.0-1.0 (not raw joules)
    const ersPercent = telemetry.ers_store_percent ??
      ((telemetry.ers_store_energy || 0) * 100);
    setBatteryPercent(Math.min(100, Math.max(0, ersPercent)));

    // Generate advice
    const newAdvice = advisorRef.current.generateAdvice(telemetry, multiCarData, isInBattle);
    setAdvice(newAdvice);

    // Update trend
    setBatteryTrend(advisorRef.current.getBatteryTrend());

    // Update laps remaining estimate
    setEstimatedLapsRemaining(advisorRef.current.estimateLapsRemaining(ersPercent));
  }, [telemetry, multiCarData, isInBattle, enabled, updateInterval]);

  const reset = useCallback(() => {
    advisorRef.current.reset();
    setAdvice(null);
    setBatteryPercent(0);
    setBatteryTrend('stable');
    setEstimatedLapsRemaining(99);
  }, []);

  return {
    advice,
    batteryPercent,
    batteryTrend,
    estimatedLapsRemaining,
    reset,
  };
}

/**
 * Get display properties for ERS recommendation
 */
export function getERSDisplayProps(recommendation: ERSRecommendation) {
  return {
    color: ERSStrategyAdvisor.getRecommendationColor(recommendation),
    icon: getRecommendationIcon(recommendation),
    label: recommendation,
  };
}

function getRecommendationIcon(rec: ERSRecommendation): string {
  switch (rec) {
    case 'HARVEST': return '🔋';
    case 'BALANCED': return '⚖️';
    case 'DEPLOY': return '⚡';
    case 'SAVE': return '💾';
    case 'ATTACK': return '🏎️';
    case 'DEFEND': return '🛡️';
    default: return '❓';
  }
}
