/**
 * useBroadcasting - Hook for broadcasting rules engine integration
 *
 * Processes telemetry and generates AI Race Engineer broadcasts
 * based on intelligent rules (battle detection, overtake batching, etc.)
 *
 * Research mode: Instead of showing broadcasts directly, converts them to
 * TriggerEvents that route to the LLM for context-aware responses.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  BroadcastingEngine,
  getBroadcastingEngine,
  type Broadcast,
  type BroadcastPriority,
} from '../services/broadcasting_engine';
import type { TelemetryData, MultiCarTelemetryData } from '../types/telemetry';
import type { TriggerEvent } from './useMLPredictions';

interface UseBroadcastingOptions {
  enabled?: boolean;
  onBroadcast?: (broadcast: Broadcast) => void;
  // Research mode: route broadcasts to LLM instead of showing directly
  researchMode?: boolean;
  // Callback for research mode - receives TriggerEvent to send to LLM
  onResearchTrigger?: (trigger: TriggerEvent) => void;
}

interface UseBroadcastingReturn {
  broadcasts: Broadcast[];
  latestBroadcast: Broadcast | null;
  isInBattle: boolean;
  battleOpponent: string | null;
  clearBroadcasts: () => void;
  reset: () => void;
}

/**
 * Map broadcast priority to trigger priority
 */
function mapPriority(broadcastPriority: BroadcastPriority): 'high' | 'medium' | 'low' {
  switch (broadcastPriority) {
    case 'critical':
    case 'high':
      return 'high';
    case 'medium':
      return 'medium';
    default:
      return 'low';
  }
}

/**
 * Convert a broadcast to a TriggerEvent for LLM processing
 */
function broadcastToTrigger(broadcast: Broadcast): TriggerEvent {
  return {
    type: broadcast.type,
    priority: mapPriority(broadcast.priority),
    context: broadcast.context as Record<string, unknown>,
    message_hint: broadcast.message,
    cooldown_key: `research_${broadcast.type}_${broadcast.lap}`,
  };
}

export function useBroadcasting(
  telemetry: TelemetryData | null,
  multiCarData: MultiCarTelemetryData | null,
  options: UseBroadcastingOptions = {}
): UseBroadcastingReturn {
  const { enabled = true, onBroadcast, researchMode = false, onResearchTrigger } = options;

  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [latestBroadcast, setLatestBroadcast] = useState<Broadcast | null>(null);
  const [isInBattle, setIsInBattle] = useState(false);
  const [battleOpponent, setBattleOpponent] = useState<string | null>(null);

  const engineRef = useRef<BroadcastingEngine>(getBroadcastingEngine());
  const lastSessionUIDRef = useRef<string | null>(null);
  const processingRef = useRef(false);
  const researchModeRef = useRef(researchMode);

  // Sync research mode to engine when it changes
  useEffect(() => {
    if (researchModeRef.current !== researchMode) {
      researchModeRef.current = researchMode;
      engineRef.current.setResearchMode(researchMode);
    }
  }, [researchMode]);

  // Set initial research mode
  useEffect(() => {
    engineRef.current.setResearchMode(researchMode);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Process telemetry and generate broadcasts
  useEffect(() => {
    if (!enabled || !telemetry || processingRef.current) return;

    // Check for session change
    const sessionUID = (telemetry as any).session_uid;
    if (sessionUID && sessionUID !== lastSessionUIDRef.current) {
      engineRef.current.reset();
      // Re-apply research mode after reset (reset doesn't clear it, but just to be safe)
      engineRef.current.setResearchMode(researchModeRef.current);
      setBroadcasts([]);
      setLatestBroadcast(null);
      lastSessionUIDRef.current = sessionUID;
    }

    processingRef.current = true;

    try {
      const newBroadcasts = engineRef.current.processTelemetry(telemetry, multiCarData);

      if (newBroadcasts.length > 0) {
        if (researchModeRef.current) {
          // Research mode: convert to triggers and emit via callback
          // Do NOT add to broadcasts state (nothing shows directly in chat)
          if (onResearchTrigger) {
            for (const broadcast of newBroadcasts) {
              const trigger = broadcastToTrigger(broadcast);
              onResearchTrigger(trigger);
            }
          }
        } else {
          // Normal mode: store broadcasts and emit via onBroadcast
          setBroadcasts(prev => [...prev, ...newBroadcasts]);
          setLatestBroadcast(newBroadcasts[newBroadcasts.length - 1]);

          if (onBroadcast) {
            for (const broadcast of newBroadcasts) {
              onBroadcast(broadcast);
            }
          }
        }
      }

      // Update battle state (needed for ERS context) - always do this
      const battleState = engineRef.current.getBattleState();
      setIsInBattle(battleState.active);
      setBattleOpponent(battleState.opponent);
    } finally {
      processingRef.current = false;
    }
  }, [telemetry, multiCarData, enabled, onBroadcast, onResearchTrigger]);

  const clearBroadcasts = useCallback(() => {
    setBroadcasts([]);
    setLatestBroadcast(null);
  }, []);

  const reset = useCallback(() => {
    engineRef.current.reset();
    setBroadcasts([]);
    setLatestBroadcast(null);
    setIsInBattle(false);
    setBattleOpponent(null);
  }, []);

  return {
    broadcasts,
    latestBroadcast,
    isInBattle,
    battleOpponent,
    clearBroadcasts,
    reset,
  };
}

/**
 * Convert broadcasts to EngineerChat message format
 */
export function broadcastToMessage(broadcast: Broadcast) {
  const priority: 'high' | 'medium' | 'low' =
    broadcast.priority === 'critical' || broadcast.priority === 'high' ? 'high' :
    broadcast.priority === 'medium' ? 'medium' : 'low';

  return {
    id: broadcast.id,
    type: 'broadcast' as const,
    content: broadcast.message,
    timestamp: new Date(broadcast.timestamp),
    trigger: {
      type: broadcast.type,
      priority,
      context: broadcast.context as Record<string, unknown>,
      message_hint: broadcast.message,
      cooldown_key: `broadcast_${broadcast.type}_${broadcast.lap}`,
    },
  };
}
