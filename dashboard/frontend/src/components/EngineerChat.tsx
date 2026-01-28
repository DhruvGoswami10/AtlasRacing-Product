/**
 * EngineerChat - Text-based race engineer communication
 * Replicates radio communication with LLM-generated messages
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card } from './ui/card';
import { Send, Radio, Loader2, AlertCircle, Swords } from 'lucide-react';
import type { MLPredictions, TriggerEvent } from '../hooks/useMLPredictions';
import type { MultiCarTelemetryData, TelemetryData } from '../types/telemetry';
import {
  LLMEngineerService,
  initLLMEngineer,
  getLLMEngineer,
  type EngineerMessage,
  type RaceContext,
  type TireData,
} from '../services/llm_engineer';
import { useBroadcasting, broadcastToMessage } from '../hooks/useBroadcasting';
import { usePitStopTracker } from '../hooks/usePitStopTracker';
import { getResearchLogger, TRACK_NAMES, type ResponseType } from '../services/research_logger';
import { getERSAdvisor } from '../services/ers_strategy';

interface EngineerChatProps {
  predictions: MLPredictions | null;
  telemetry: Record<string, unknown> | null;
  multiCarData?: MultiCarTelemetryData | null;
  triggers: TriggerEvent[];
  apiKey?: string;
  className?: string;
  // Research mode: broadcasts route to LLM, no CTRL messages shown directly
  researchMode?: boolean;
}

/**
 * Map trigger type to a response category for research logging
 */
function categorizeResponse(triggerType: string): ResponseType {
  switch (triggerType) {
    // Initial strategy commitment
    case 'race_start':
      return 'strategy_commit';
    // Strategy amendments (critical events requiring decision)
    case 'safety_car':
    case 'vsc':
    case 'sc_restart':
    case 'weather_change':
    case 'pit_window':
    case 'pit_window_optimal':
    case 'tire_critical':
    case 'battle_start':
    case 'battle_end':
    case 'tyre_warning':
      return 'strategy_amend';
    // ERS deployment plans
    case 'ers_update':
      return 'ers_plan';
    // Everything else is informational
    default:
      return 'info_response';
  }
}

/**
 * Check if an LLM response contains pit/strategy advice
 * Used to re-classify driver questions that resulted in strategy advice
 */
function responseContainsStrategyAdvice(response: string): boolean {
  const lower = response.toLowerCase();
  // Check for pit/box calls with specific compounds or laps
  const pitPatterns = [
    /\bbox\b/,                           // "box", "box box"
    /\bpit\b.*\blap\b/,                  // "pit lap X"
    /\blap\s*\d+.*\b(soft|medium|hard|inter|wet)/i,  // "lap 18 for hards"
    /\b(soft|medium|hard|inter|wet)s?\b.*\blap\b/i,  // "switch to mediums lap X"
    /\bstay out\b/,                      // "stay out" is also strategy
    /\bplan [a-z]\b/i,                   // "Plan A", "Plan B"
    /\bamend/,                           // "amending strategy"
    /\bswitch.*compound/,                // "switch compound"
  ];

  return pitPatterns.some(pattern => pattern.test(lower));
}

export const EngineerChat: React.FC<EngineerChatProps> = ({
  predictions,
  telemetry,
  multiCarData,
  triggers,
  apiKey,
  className = '',
  researchMode = false,
}) => {
  const [messages, setMessages] = useState<EngineerMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  const processedTriggersRef = useRef<Set<string>>(new Set());
  const llmServiceRef = useRef<LLMEngineerService | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Track processed research triggers to avoid duplicates
  const processedResearchTriggersRef = useRef<Set<string>>(new Set());

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Handler for research mode triggers from broadcasts
  const handleResearchTrigger = useCallback(async (trigger: TriggerEvent) => {
    const llmService = llmServiceRef.current;
    if (!llmService) return;

    // Deduplicate
    if (processedResearchTriggersRef.current.has(trigger.cooldown_key)) return;
    processedResearchTriggersRef.current.add(trigger.cooldown_key);

    try {
      // Build context and call LLM
      const context = buildRaceContextRef.current();
      const { message, latencyMs } = await llmService.generateFromTrigger(trigger, context);

      // Log to research logger
      const logger = getResearchLogger();
      if (logger.isActive()) {
        logger.logInteraction({
          triggerType: trigger.type,
          responseType: categorizeResponse(trigger.type),
          context: context as unknown as Record<string, unknown>,
          llmResponse: message.content,
          latencyMs,
        });
      }

      // Show LLM response in chat (not the broadcast text)
      setMessages(prev => [...prev, message]);
    } catch (err) {
      console.error('[EngineerChat] Failed to process research trigger:', err);
    }
  }, []);

  // Ref to hold buildRaceContext for use in callback
  const buildRaceContextRef = useRef<() => RaceContext>(() => ({} as RaceContext));

  const { isInBattle } = useBroadcasting(
    telemetry as unknown as TelemetryData | null,
    multiCarData ?? null,
    {
      enabled: true,
      researchMode,
      // In research mode: route broadcasts to LLM via callback
      onResearchTrigger: researchMode ? handleResearchTrigger : undefined,
      // In normal mode: show broadcasts directly in chat
      onBroadcast: researchMode ? undefined : (broadcast) => {
        const message = broadcastToMessage(broadcast);
        setMessages(prev => [...prev, message]);
      },
    }
  );
  const pitStopTracker = usePitStopTracker(telemetry as unknown as TelemetryData | null);

  // Initialize LLM service
  useEffect(() => {
    if (apiKey && !isInitialized) {
      llmServiceRef.current = initLLMEngineer(apiKey);
      setIsInitialized(true);
    } else if (!apiKey) {
      llmServiceRef.current = getLLMEngineer();
      setIsInitialized(llmServiceRef.current !== null);
    }
  }, [apiKey, isInitialized]);

  // Sync research mode to LLM service
  useEffect(() => {
    if (llmServiceRef.current) {
      llmServiceRef.current.setResearchMode(researchMode);
    }
  }, [researchMode, isInitialized]);

  // Helper to format lap time from seconds to mm:ss.xxx
  const formatLapTime = (seconds: number | null | undefined): string | undefined => {
    if (seconds == null || seconds <= 0 || !Number.isFinite(seconds)) return undefined;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toFixed(3).padStart(6, '0')}`;
  };

  // Helper to get weather string from ID
  const getWeatherString = (weatherId: number | undefined): string => {
    if (weatherId == null) return 'dry';
    switch (weatherId) {
      case 0: return 'clear';
      case 1: return 'light cloud';
      case 2: return 'overcast';
      case 3: return 'light rain';
      case 4: return 'heavy rain';
      case 5: return 'storm';
      default: return 'dry';
    }
  };

  // Helper to get safety car status string
  const getSafetyCarString = (status: number | undefined): string => {
    if (status == null) return 'none';
    switch (status) {
      case 0: return 'none';
      case 1: return 'full safety car';
      case 2: return 'virtual safety car';
      case 3: return 'formation lap';
      default: return 'none';
    }
  };

  // Helper to get ERS mode string
  const getErsModeString = (mode: number | undefined): string => {
    if (mode == null) return 'unknown';
    switch (mode) {
      case 0: return 'none';
      case 1: return 'medium';
      case 2: return 'hotlap';
      case 3: return 'overtake';
      default: return 'unknown';
    }
  };

  // Extract standings from multiCarData
  const getStandings = useCallback(() => {
    if (!multiCarData?.cars || multiCarData.cars.length === 0) {
      return undefined;
    }

    // Sort by position and map to standings format
    const sortedCars = [...multiCarData.cars]
      .filter(car => car.position > 0) // Filter out cars not in race
      .sort((a, b) => a.position - b.position);

    return sortedCars.map(car => ({
      position: car.position,
      name: car.driver_name || `Driver ${car.car_index}`,
      team: car.team_name || 'Unknown',
      gapToLeader: car.gap_to_leader ?? null,
      gapToAhead: car.gap_to_car_ahead ?? null,
      tireCompound: (car as any).tire_compound || car.tyre_compound || 'unknown',
      tireAge: car.tyre_age || 0,
      isPlayer: car.is_player === 1,
    }));
  }, [multiCarData]);

  // Find player and adjacent drivers
  const getPlayerContext = useCallback(() => {
    const standings = getStandings();
    if (!standings) return { ahead: null, behind: null, player: null };

    const playerIndex = standings.findIndex(d => d.isPlayer);
    if (playerIndex === -1) return { ahead: null, behind: null, player: null };

    return {
      player: standings[playerIndex],
      ahead: playerIndex > 0 ? standings[playerIndex - 1] : null,
      behind: playerIndex < standings.length - 1 ? standings[playerIndex + 1] : null,
    };
  }, [getStandings]);

  // Build race context from telemetry - comprehensive extraction for F1 24/25
  const buildRaceContext = useCallback((): RaceContext => {
    const t = telemetry ?? {};
    const p = predictions;
    const standings = getStandings();
    const { ahead, behind, player } = getPlayerContext();

    // Basic session info
    const currentLap = (t.current_lap_num as number) ?? 1;
    const totalLaps = (t.total_laps as number) ?? 50;
    const lapsRemaining = Math.max(1, totalLaps - currentLap);
    const lapsRemainingForFuel = Math.max(0, totalLaps - currentLap);
    const isF1Game = typeof t.game_name === 'string' && t.game_name.startsWith('F1');
    const rawFuelLaps =
      typeof t.fuel_remaining_laps === 'number' && Number.isFinite(t.fuel_remaining_laps as number)
        ? (t.fuel_remaining_laps as number)
        : null;
    const fuelMarginLaps = isF1Game ? rawFuelLaps : null;
    const fuelRangeLaps =
      isF1Game && fuelMarginLaps !== null
        ? Math.max(0, lapsRemainingForFuel + fuelMarginLaps)
        : rawFuelLaps;

    // Extract tire wear data
    const tireWearArray = t.tire_wear as number[] | undefined;
    const tireWearFL = tireWearArray?.[0] ?? 0;
    const tireWearFR = tireWearArray?.[1] ?? 0;
    const tireWearRL = tireWearArray?.[2] ?? 0;
    const tireWearRR = tireWearArray?.[3] ?? 0;
    const maxWear = Math.max(tireWearFL, tireWearFR, tireWearRL, tireWearRR);
    const avgWear = (tireWearFL + tireWearFR + tireWearRL + tireWearRR) / 4;

    // Extract tire temps
    const tireTemps = t.tire_temps as { inner?: number[]; surface?: number[] } | undefined;
    const innerTemps = tireTemps?.inner ?? [90, 90, 90, 90];

    // Extract tire pressure
    const tirePressure = t.tire_pressure as number[] | undefined;

    // Build detailed tire data
    const tires: TireData = {
      compound: (t.tire_compound as string) ?? 'medium',
      age: (t.tire_age_laps as number) ?? 0,
      wear: {
        fl: tireWearFL,
        fr: tireWearFR,
        rl: tireWearRL,
        rr: tireWearRR,
        max: maxWear,
        avg: avgWear,
      },
      temps: {
        fl: innerTemps[0] ?? 90,
        fr: innerTemps[1] ?? 90,
        rl: innerTemps[2] ?? 90,
        rr: innerTemps[3] ?? 90,
      },
      pressure: {
        fl: tirePressure?.[0] ?? 23,
        fr: tirePressure?.[1] ?? 23,
        rl: tirePressure?.[2] ?? 21,
        rr: tirePressure?.[3] ?? 21,
      },
    };

    // Determine tire wear status
    let tireWearStatus = 'healthy';
    if (maxWear > 70) tireWearStatus = 'critical';
    else if (maxWear > 45) tireWearStatus = 'caution';

    // Estimate remaining laps based on wear rate
    const mlTireRemaining = p?.tire_life?.remaining_laps ?? Math.max(1, Math.floor((100 - maxWear) / 3));
    const tireRemainingLaps = Math.min(mlTireRemaining, lapsRemaining);

    // Get track name from track_id
    const trackId = t.track_id as number | undefined;
    const trackName = trackId !== undefined ? (TRACK_NAMES[trackId] ?? `Track ${trackId}`) : undefined;

    // Get ERS strategy advice
    const ersAdvisor = getERSAdvisor();
    const ersAdvice = ersAdvisor.generateAdvice(
      t as unknown as TelemetryData,
      multiCarData ?? null,
      isInBattle
    );

    return {
      // Session info
      currentLap,
      totalLaps,
      position: player?.position ?? (t.position as number) ?? 1,
      fieldSize: standings?.length ?? 20,
      trackName,
      sessionType: t.session_type != null ? `Session ${t.session_type}` : undefined,

      // Timing
      lastLapTime: formatLapTime(t.last_lap_time as number),
      bestLapTime: formatLapTime(t.best_lap_time as number),
      currentLapTime: formatLapTime(t.current_lap_time as number),
      sector1: t.sector1_time as number,
      sector2: t.sector2_time as number,
      sector3: t.sector3_time as number,

      // Gaps - prefer multiCarData, fall back to raw telemetry
      gapAhead: ahead?.gapToAhead ?? (t.gap_to_car_ahead as number) ?? null,
      gapBehind: behind?.gapToAhead ?? (t.gap_to_car_behind as number) ?? null,
      gapToLeader: player?.gapToLeader ?? (t.gap_to_leader as number) ?? null,

      // Opponent info from multiCarData
      opponentAheadName: ahead?.name,
      opponentAheadTireAge: ahead?.tireAge,
      opponentBehindName: behind?.name,
      opponentBehindTireAge: behind?.tireAge,

      // Race standings (all drivers)
      standings,

      // Detailed tire info
      tires,
      // Legacy fields for compatibility
      tireCompound: tires.compound,
      tireAge: tires.age,
      tireWearStatus,
      tireRemainingLaps,

      // Pit strategy
      pitWindow: t.pit_window_ideal_lap != null ? {
        start: (t.pit_window_ideal_lap as number) - 3,
        end: (t.pit_window_latest_lap as number) ?? (t.pit_window_ideal_lap as number) + 5,
      } : undefined,
      pitStatus: t.pit_status != null ? (t.pit_status === 0 ? 'none' : t.pit_status === 1 ? 'pitting' : 'in pit') : undefined,
      pitStopsCompleted: pitStopTracker.stopsCompleted,
      mandatoryStopCompleted: pitStopTracker.mandatoryStopCompleted,
      lastCompound: pitStopTracker.lastCompound ?? undefined,
      currentCompound: pitStopTracker.currentCompound ?? tires.compound,
      lastStopLap: pitStopTracker.lastStopLap ?? undefined,
      stintLaps: pitStopTracker.stintLaps,

      // Fuel
      fuelRemaining: t.fuel_in_tank as number,
      fuelLapsRemaining: fuelRangeLaps ?? undefined,
      fuelMarginLaps: fuelMarginLaps ?? undefined,

      // ERS - full advisor data
      ersPercent: t.ers_store_percent as number,
      ersMode: getErsModeString(t.ers_deploy_mode as number),
      ersAdvice: ersAdvice ? {
        recommendation: ersAdvice.recommendation,
        suggestedMode: ersAdvice.suggestedMode,
        reason: ersAdvice.reason,
        priority: ersAdvice.priority,
        batteryTarget: ersAdvice.batteryTarget,
        lapsToOpportunity: ersAdvice.lapsToOpportunity,
      } : undefined,

      // Car setup
      brakeBias: t.brake_bias as number,
      differentialOnThrottle: t.differential_on_throttle as number,

      // Weather
      weather: getWeatherString(t.weather as number),
      trackTemp: t.track_temperature as number,
      airTemp: t.air_temperature as number,

      // Flags
      flagStatus: 'green',
      safetyCarStatus: getSafetyCarString(t.safety_car_status as number),

      // DRS
      drsAvailable: (t.drs_allowed as number) === 1,
      drsOpen: (t.drs_open as number) === 1,

      // Performance
      speed: t.speed_kph as number,
      rpm: t.rpm as number,
      gear: t.gear as number,

      // Strategy from ML predictions
      strategy: p?.strategy,
    };
  }, [telemetry, predictions, multiCarData, isInBattle, getStandings, getPlayerContext, pitStopTracker]);

  // Keep ref updated so callbacks can access latest context builder
  buildRaceContextRef.current = buildRaceContext;

  // Process new triggers from useEngineerTriggers
  useEffect(() => {
    const llmService = llmServiceRef.current;
    if (!llmService || triggers.length === 0) return;

    const processNewTriggers = async () => {
      for (const trigger of triggers) {
        const triggerId = `${trigger.type}-${trigger.cooldown_key}-${JSON.stringify(trigger.context).substring(0, 50)}`;

        if (processedTriggersRef.current.has(triggerId)) continue;
        processedTriggersRef.current.add(triggerId);

        // Only process high/medium priority triggers
        if (trigger.priority === 'low') continue;

        try {
          const context = buildRaceContext();
          const { message, latencyMs } = await llmService.generateFromTrigger(trigger, context);

          // Passive logging: log to research logger if active
          const logger = getResearchLogger();
          if (logger.isActive()) {
            logger.logInteraction({
              triggerType: trigger.type,
              responseType: categorizeResponse(trigger.type),
              context: context as unknown as Record<string, unknown>,
              llmResponse: message.content,
              latencyMs,
            });
          }

          setMessages(prev => [...prev, message]);
        } catch (err) {
          console.error('[EngineerChat] Failed to generate trigger message:', err);
        }
      }
    };

    processNewTriggers();
  }, [triggers, buildRaceContext]);


  // Handle sending driver message
  const handleSendMessage = async () => {
    if (!inputValue.trim() || !llmServiceRef.current || isLoading) return;

    const userQuery = inputValue.trim();
    const driverMessage: EngineerMessage = {
      id: `driver-${Date.now()}`,
      type: 'driver',
      content: userQuery,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, driverMessage]);
    setInputValue('');
    setIsLoading(true);
    setError(null);

    try {
      const context = buildRaceContext();
      const { message: response, latencyMs } = await llmServiceRef.current.respondToDriver(
        userQuery,
        context,
        predictions ?? undefined
      );

      // Passive logging: log to research logger if active
      const logger = getResearchLogger();
      if (logger.isActive()) {
        // Re-classify driver question as strategy_amend if LLM gave pit/strategy advice
        const responseType = responseContainsStrategyAdvice(response.content)
          ? 'strategy_amend'
          : 'info_response';

        logger.logInteraction({
          triggerType: 'driver_question',
          responseType,
          context: context as unknown as Record<string, unknown>,
          llmResponse: response.content,
          latencyMs,
          driverInput: userQuery,
        });
      }

      setMessages(prev => [...prev, response]);
    } catch (err) {
      console.error('[EngineerChat] Failed to get response:', err);
      setError('Failed to get response. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle enter key
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Format timestamp
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  };

  // Get message style
  const getMessageStyle = (type: EngineerMessage['type']) => {
    switch (type) {
      case 'engineer':
        return 'bg-emerald-500/10 border-emerald-500/30 text-emerald-100';
      case 'driver':
        return 'bg-sky-500/10 border-sky-500/30 text-sky-100';
      case 'broadcast':
        return 'bg-amber-500/10 border-amber-500/30 text-amber-100';
      default:
        return 'bg-slate-600/20 border-slate-500/30 text-slate-100';
    }
  };

  const getMessageLabel = (type: EngineerMessage['type']) => {
    switch (type) {
      case 'engineer':
        return 'ENG';
      case 'driver':
        return 'YOU';
      case 'broadcast':
        return 'CTRL';
      default:
        return '???';
    }
  };

  if (!isInitialized) {
    return (
      <Card className={`bg-black/60 border border-gray-700 p-4 ${className}`}>
        <div className="flex items-center gap-2 mb-3">
          <Radio className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-bold text-white uppercase tracking-wide">Race Engineer</h3>
        </div>
        <div className="flex items-center justify-center h-32 text-gray-500 text-sm">
          <AlertCircle className="w-4 h-4 mr-2" />
          <span>API key required for race engineer</span>
        </div>
      </Card>
    );
  }

  return (
    <Card className={`bg-black/60 border border-gray-700 flex flex-col ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-bold text-white uppercase tracking-wide">Race Engineer</h3>
        </div>
        <div className="flex items-center gap-2">
          {isInBattle && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1 animate-pulse">
              <Swords className="w-3 h-3" />
              BATTLE
            </span>
          )}
          {predictions?.learning_status?.is_calibrated ? (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              ML READY
            </span>
          ) : predictions?.learning_status ? (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
              LEARNING {Math.round((predictions.learning_status.progress ?? 0) * 100)}%
            </span>
          ) : null}
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            LIVE
          </span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-[200px] max-h-[400px]">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500 text-xs">
            Radio ready. Type a message or wait for engineer updates.
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`rounded border px-3 py-2 ${getMessageStyle(msg.type)}`}
            >
              <div className="flex items-start gap-2">
                <span className="text-[10px] font-mono font-bold opacity-70 mt-0.5">
                  [{formatTime(msg.timestamp)}]
                </span>
                <span className="text-[10px] font-mono font-bold opacity-80 mt-0.5">
                  {getMessageLabel(msg.type)}:
                </span>
                <span className="text-sm flex-1">{msg.content}</span>
              </div>
              {msg.trigger && (
                <div className="mt-1 text-[10px] text-gray-500 font-mono">
                  Trigger: {msg.trigger.type.replace(/_/g, ' ')}
                </div>
              )}
            </div>
          ))
        )}
        {isLoading && (
          <div className="flex items-center gap-2 text-gray-400 text-sm px-3 py-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Engineer is typing...</span>
          </div>
        )}
        {/* Auto-scroll anchor */}
        <div ref={messagesEndRef} />
      </div>

      {/* Error display */}
      {error && (
        <div className="px-3 py-2 bg-rose-500/10 border-t border-rose-500/30 text-rose-300 text-xs">
          {error}
        </div>
      )}

      {/* Input */}
      <div className="p-3 border-t border-gray-700">
        <div className="flex gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask your engineer..."
            disabled={isLoading}
            className="flex-1 bg-gray-800/60 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500/50 disabled:opacity-50"
          />
          <button
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || isLoading}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:cursor-not-allowed rounded text-white text-sm font-medium transition-colors flex items-center gap-2"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <div className="mt-2 text-[10px] text-gray-500">
          Try: "What's my strategy?" &bull; "How are my tires?" &bull; "Can I overtake?"
        </div>
      </div>
    </Card>
  );
};

export default EngineerChat;
