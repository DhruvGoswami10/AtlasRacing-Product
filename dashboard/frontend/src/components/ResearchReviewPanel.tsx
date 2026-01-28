/**
 * ResearchReviewPanel - Post-race review for research data
 *
 * Two sections:
 * 1. Strategy Calls (pit/weather) - strategy_commit and strategy_amend
 * 2. ERS Plans - ers_plan interactions (collapsible)
 *
 * For each: Followed / Overridden buttons + override reason.
 * Overall quality ratings + notes + export.
 */

import React, { useState, useMemo } from 'react';
import { Card } from './ui/card';
import { Download, CheckCircle2, XCircle, ChevronDown, ChevronRight, Zap } from 'lucide-react';
import type { LLMInteraction, ExportData, RaceEndData, PitStopRecord } from '../services/research_logger';
import { getResearchLogger, downloadAllData } from '../services/research_logger';

interface ResearchReviewPanelProps {
  onExport?: (data: ExportData) => void;
  onClose?: () => void;
}

export function ResearchReviewPanel({ onExport, onClose }: ResearchReviewPanelProps) {
  const logger = getResearchLogger();
  const strategyInteractions = useMemo(() => logger.getStrategyInteractions(), []);
  const ersInteractions = useMemo(() => logger.getERSInteractions(), []);
  const pitStops = useMemo(() => logger.getPitStops(), []);

  const [outcomes, setOutcomes] = useState<Record<string, 'followed' | 'overridden'>>({});
  const [overrideReasons, setOverrideReasons] = useState<Record<string, string>>({});
  const [pitOutcomes, setPitOutcomes] = useState<Record<number, 'llm' | 'driver'>>({});
  const [strategyQuality, setStrategyQuality] = useState<'correct' | 'partial' | 'wrong' | ''>('');
  const [ersQuality, setErsQuality] = useState<'helpful' | 'neutral' | 'wrong' | ''>('');
  const [notes, setNotes] = useState('');
  const [finishPosition, setFinishPosition] = useState('');
  const [points, setPoints] = useState('');
  const [fastestLap, setFastestLap] = useState(false);
  const [exported, setExported] = useState(false);
  const [ersExpanded, setErsExpanded] = useState(false);

  const handleOutcome = (id: string, action: 'followed' | 'overridden') => {
    setOutcomes(prev => ({ ...prev, [id]: action }));
  };

  const handleReasonChange = (id: string, reason: string) => {
    setOverrideReasons(prev => ({ ...prev, [id]: reason }));
  };

  const handlePitOutcome = (lap: number, triggeredBy: 'llm' | 'driver') => {
    setPitOutcomes(prev => ({ ...prev, [lap]: triggeredBy }));
  };

  // Find LLM box recommendations near each pit stop
  const findLLMBoxRecommendation = (pitLap: number): { lap: number; response: string } | null => {
    // Look for strategy interactions that mention "box" within 3 laps of the pit
    const boxCalls = strategyInteractions.filter(i => {
      const response = i.llmResponse.toLowerCase();
      const mentionsBox = response.includes('box') || response.includes('pit');
      const withinRange = Math.abs(i.lap - pitLap) <= 3;
      return mentionsBox && withinRange;
    });
    if (boxCalls.length > 0) {
      // Return the closest one
      const closest = boxCalls.sort((a, b) => Math.abs(a.lap - pitLap) - Math.abs(b.lap - pitLap))[0];
      return { lap: closest.lap, response: closest.llmResponse };
    }
    return null;
  };

  const handleSaveAndExport = () => {
    // Apply outcomes to logger (both strategy and ERS)
    for (const [id, action] of Object.entries(outcomes)) {
      const reason = action === 'overridden' ? overrideReasons[id] : undefined;
      logger.addOutcomeData(id, action, reason);
    }

    // Apply pit stop outcomes
    for (const [lapStr, triggeredBy] of Object.entries(pitOutcomes)) {
      logger.updatePitStopTrigger(parseInt(lapStr, 10), triggeredBy);
    }

    // End race with provided data
    const endData: RaceEndData = {
      finishPosition: parseInt(finishPosition, 10) || 0,
      points: parseInt(points, 10) || 0,
      fastestLap,
      bestLapMs: null,
      avgLapMs: null,
      notes: [
        strategyQuality ? `Strategy Quality: ${strategyQuality}` : '',
        ersQuality ? `ERS Quality: ${ersQuality}` : '',
        notes,
      ].filter(Boolean).join('. '),
    };

    logger.endRace(endData);

    // Export
    const data = logger.exportAll();
    downloadAllData(data);

    if (onExport) {
      onExport(data);
    }

    setExported(true);
  };

  const hasAnyInteractions = strategyInteractions.length > 0 || ersInteractions.length > 0 || pitStops.length > 0;

  if (!hasAnyInteractions) {
    return (
      <Card className="bg-gray-900/90 border border-gray-700 p-4">
        <h3 className="text-sm font-bold text-white uppercase tracking-wide mb-3">Post-Race Review</h3>
        <p className="text-gray-500 text-xs text-center py-4">
          No LLM interactions recorded this race.
        </p>
        {onClose && (
          <button onClick={onClose} className="mt-2 w-full px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-xs text-white">
            Close
          </button>
        )}
      </Card>
    );
  }

  return (
    <Card className="bg-gray-900/90 border border-gray-700 p-4 max-h-[80vh] overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-700">
        <h3 className="text-sm font-bold text-white uppercase tracking-wide">Post-Race Review</h3>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-violet-500/20 text-violet-300 border border-violet-500/30">
            {strategyInteractions.length} strategy
          </span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-orange-500/20 text-orange-300 border border-orange-500/30">
            {pitStops.length} pits
          </span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30">
            {ersInteractions.length} ERS
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-4 mb-4">
        {/* ================================================================
            Section 1: Strategy Calls (Pit/Weather)
            ================================================================ */}
        {strategyInteractions.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold text-violet-300 uppercase tracking-wide">
                Strategy Calls (Pit/Weather)
              </h4>
              <span className="text-[10px] text-gray-500">
                {strategyInteractions.filter(i => outcomes[i.id]).length}/{strategyInteractions.length} assessed
              </span>
            </div>
            <div className="space-y-2">
              {strategyInteractions.map((interaction) => (
                <StrategyCard
                  key={interaction.id}
                  interaction={interaction}
                  outcome={outcomes[interaction.id] ?? null}
                  overrideReason={overrideReasons[interaction.id] ?? ''}
                  onOutcome={(action) => handleOutcome(interaction.id, action)}
                  onReasonChange={(reason) => handleReasonChange(interaction.id, reason)}
                />
              ))}
            </div>

            {/* Strategy Quality */}
            <div className="mt-3 pt-2 border-t border-gray-700/50">
              <label className="text-[10px] text-gray-400 block mb-1">Strategy Quality</label>
              <div className="flex gap-2">
                {(['correct', 'partial', 'wrong'] as const).map((q) => (
                  <button
                    key={q}
                    onClick={() => setStrategyQuality(q)}
                    className={`px-3 py-1.5 rounded text-xs font-bold transition-all ${
                      strategyQuality === q
                        ? q === 'correct' ? 'bg-emerald-600 text-white'
                          : q === 'partial' ? 'bg-amber-600 text-white'
                          : 'bg-rose-600 text-white'
                        : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                    }`}
                  >
                    {q.charAt(0).toUpperCase() + q.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ================================================================
            Section 2: Pit Stop Confirmation
            ================================================================ */}
        {pitStops.length > 0 && (
          <div className="border-t border-gray-700 pt-3">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold text-orange-300 uppercase tracking-wide">
                Pit Stop Decisions
              </h4>
              <span className="text-[10px] text-gray-500">
                {Object.keys(pitOutcomes).length}/{pitStops.length} assessed
              </span>
            </div>
            <div className="space-y-2">
              {pitStops.map((pit) => {
                const llmRec = findLLMBoxRecommendation(pit.lap);
                return (
                  <div key={pit.lap} className="bg-gray-800/60 rounded border border-gray-700 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border text-orange-300 bg-orange-500/20 border-orange-500/30">
                          PIT
                        </span>
                        <span className="text-[10px] text-gray-300 font-mono">
                          Lap {pit.lap}: {pit.compoundFrom} → {pit.compoundTo}
                        </span>
                      </div>
                    </div>

                    {llmRec ? (
                      <div className="text-xs text-emerald-200 bg-emerald-500/5 border-l-2 border-emerald-500/40 px-3 py-2 mb-3 rounded-r">
                        <span className="text-[9px] text-gray-500 block mb-1">LLM said on lap {llmRec.lap}:</span>
                        {llmRec.response}
                      </div>
                    ) : (
                      <div className="text-xs text-gray-400 bg-gray-700/30 px-3 py-2 mb-3 rounded italic">
                        No LLM box recommendation found near this stop
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-400">Did you follow LLM advice?</span>
                      <button
                        onClick={() => handlePitOutcome(pit.lap, 'llm')}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded text-[11px] font-bold transition-all ${
                          pitOutcomes[pit.lap] === 'llm'
                            ? 'bg-emerald-600 text-white ring-1 ring-emerald-400'
                            : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                        }`}
                      >
                        <CheckCircle2 className="w-3 h-3" />
                        Yes, followed LLM
                      </button>
                      <button
                        onClick={() => handlePitOutcome(pit.lap, 'driver')}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded text-[11px] font-bold transition-all ${
                          pitOutcomes[pit.lap] === 'driver'
                            ? 'bg-rose-600 text-white ring-1 ring-rose-400'
                            : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                        }`}
                      >
                        <XCircle className="w-3 h-3" />
                        My own call
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ================================================================
            Section 3: ERS Plans (Collapsible)
            ================================================================ */}
        {ersInteractions.length > 0 && (
          <div className="border-t border-gray-700 pt-3">
            <button
              onClick={() => setErsExpanded(!ersExpanded)}
              className="w-full flex items-center justify-between text-left mb-2 hover:bg-gray-800/30 rounded p-1 -m-1 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-sky-400" />
                <h4 className="text-xs font-bold text-sky-300 uppercase tracking-wide">
                  ERS Plans
                </h4>
                <span className="text-[10px] text-gray-500">
                  ({ersInteractions.length} calls)
                </span>
              </div>
              {ersExpanded ? (
                <ChevronDown className="w-4 h-4 text-gray-500" />
              ) : (
                <ChevronRight className="w-4 h-4 text-gray-500" />
              )}
            </button>

            {ersExpanded && (
              <>
                <div className="space-y-2 mb-3">
                  {ersInteractions.map((interaction) => (
                    <ERSCard
                      key={interaction.id}
                      interaction={interaction}
                      outcome={outcomes[interaction.id] ?? null}
                      overrideReason={overrideReasons[interaction.id] ?? ''}
                      onOutcome={(action) => handleOutcome(interaction.id, action)}
                      onReasonChange={(reason) => handleReasonChange(interaction.id, reason)}
                    />
                  ))}
                </div>

                {/* ERS Quality */}
                <div className="pt-2 border-t border-gray-700/50">
                  <label className="text-[10px] text-gray-400 block mb-1">ERS Quality</label>
                  <div className="flex gap-2">
                    {(['helpful', 'neutral', 'wrong'] as const).map((q) => (
                      <button
                        key={q}
                        onClick={() => setErsQuality(q)}
                        className={`px-3 py-1.5 rounded text-xs font-bold transition-all ${
                          ersQuality === q
                            ? q === 'helpful' ? 'bg-emerald-600 text-white'
                              : q === 'neutral' ? 'bg-gray-500 text-white'
                              : 'bg-rose-600 text-white'
                            : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                        }`}
                      >
                        {q.charAt(0).toUpperCase() + q.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Race Results */}
      <div className="space-y-3 mb-4 pt-3 border-t border-gray-700">
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="text-[10px] text-gray-400 block mb-1">Finish Position</label>
            <input
              type="number"
              min="1"
              max="20"
              value={finishPosition}
              onChange={(e) => setFinishPosition(e.target.value)}
              placeholder="P?"
              className="w-full px-2 py-1.5 bg-gray-800 border border-gray-600 rounded text-xs text-white"
            />
          </div>
          <div>
            <label className="text-[10px] text-gray-400 block mb-1">Points</label>
            <input
              type="number"
              min="0"
              value={points}
              onChange={(e) => setPoints(e.target.value)}
              placeholder="0"
              className="w-full px-2 py-1.5 bg-gray-800 border border-gray-600 rounded text-xs text-white"
            />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={fastestLap}
                onChange={(e) => setFastestLap(e.target.checked)}
                className="rounded border-gray-600"
              />
              Fastest Lap
            </label>
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="text-[10px] text-gray-400 block mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any observations about this race..."
            rows={2}
            className="w-full px-2 py-1.5 bg-gray-800 border border-gray-600 rounded text-xs text-white resize-none"
          />
        </div>
      </div>

      {/* Export */}
      <div className="flex gap-2 pt-3 border-t border-gray-700">
        {onClose && (
          <button
            onClick={onClose}
            className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-xs text-white"
          >
            Close
          </button>
        )}
        <button
          onClick={handleSaveAndExport}
          disabled={exported}
          className={`flex-1 px-4 py-2 rounded text-xs font-bold flex items-center justify-center gap-2 transition-all ${
            exported
              ? 'bg-emerald-700 text-emerald-200 cursor-default'
              : 'bg-blue-600 hover:bg-blue-500 text-white'
          }`}
        >
          <Download className="w-3.5 h-3.5" />
          {exported ? 'Exported!' : 'Save & Export'}
        </button>
      </div>
    </Card>
  );
}

// ============================================================================
// Strategy Card Sub-Component
// ============================================================================

interface StrategyCardProps {
  interaction: LLMInteraction;
  outcome: 'followed' | 'overridden' | null;
  overrideReason: string;
  onOutcome: (action: 'followed' | 'overridden') => void;
  onReasonChange: (reason: string) => void;
}

function StrategyCard({ interaction, outcome, overrideReason, onOutcome, onReasonChange }: StrategyCardProps) {
  const isCommit = interaction.responseType === 'strategy_commit';
  const typeLabel = isCommit ? 'COMMIT' : 'AMEND';
  const typeColor = isCommit
    ? 'text-violet-300 bg-violet-500/20 border-violet-500/30'
    : 'text-amber-300 bg-amber-500/20 border-amber-500/30';

  return (
    <div className="bg-gray-800/60 rounded border border-gray-700 p-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${typeColor}`}>
            {typeLabel}
          </span>
          <span className="text-[10px] text-gray-500 font-mono">
            Lap {interaction.lap} | {interaction.triggerType.replace(/_/g, ' ')}
          </span>
        </div>
        <span className="text-[10px] text-gray-500 font-mono">
          {interaction.latencyMs}ms
        </span>
      </div>

      {/* LLM Response */}
      <div className="text-xs text-emerald-200 bg-emerald-500/5 border-l-2 border-emerald-500/40 px-3 py-2 mb-3 rounded-r">
        {interaction.llmResponse}
      </div>

      {/* Outcome buttons */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => onOutcome('followed')}
          className={`flex items-center gap-1 px-3 py-1.5 rounded text-[11px] font-bold transition-all ${
            outcome === 'followed'
              ? 'bg-emerald-600 text-white ring-1 ring-emerald-400'
              : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
          }`}
        >
          <CheckCircle2 className="w-3 h-3" />
          Followed
        </button>
        <button
          onClick={() => onOutcome('overridden')}
          className={`flex items-center gap-1 px-3 py-1.5 rounded text-[11px] font-bold transition-all ${
            outcome === 'overridden'
              ? 'bg-rose-600 text-white ring-1 ring-rose-400'
              : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
          }`}
        >
          <XCircle className="w-3 h-3" />
          Overridden
        </button>

        {outcome === 'overridden' && (
          <input
            type="text"
            value={overrideReason}
            onChange={(e) => onReasonChange(e.target.value)}
            placeholder="Why? (e.g., rain forecast wrong)"
            className="flex-1 px-2 py-1.5 bg-gray-800 border border-gray-600 rounded text-[11px] text-white placeholder-gray-500"
          />
        )}
      </div>
    </div>
  );
}

// ============================================================================
// ERS Card Sub-Component
// ============================================================================

interface ERSCardProps {
  interaction: LLMInteraction;
  outcome: 'followed' | 'overridden' | null;
  overrideReason: string;
  onOutcome: (action: 'followed' | 'overridden') => void;
  onReasonChange: (reason: string) => void;
}

function ERSCard({ interaction, outcome, overrideReason, onOutcome, onReasonChange }: ERSCardProps) {
  return (
    <div className="bg-gray-800/40 rounded border border-gray-700/50 p-2.5">
      {/* Header */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <Zap className="w-3 h-3 text-sky-400" />
          <span className="text-[10px] text-gray-400 font-mono">
            Lap {interaction.lap}
          </span>
        </div>
        <span className="text-[10px] text-gray-500 font-mono">
          {interaction.latencyMs}ms
        </span>
      </div>

      {/* LLM Response */}
      <div className="text-xs text-sky-200 bg-sky-500/5 border-l-2 border-sky-500/40 px-2 py-1.5 mb-2 rounded-r">
        {interaction.llmResponse}
      </div>

      {/* Outcome buttons (compact) */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onOutcome('followed')}
          className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold transition-all ${
            outcome === 'followed'
              ? 'bg-emerald-600 text-white'
              : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
          }`}
        >
          <CheckCircle2 className="w-2.5 h-2.5" />
          Followed
        </button>
        <button
          onClick={() => onOutcome('overridden')}
          className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold transition-all ${
            outcome === 'overridden'
              ? 'bg-rose-600 text-white'
              : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
          }`}
        >
          <XCircle className="w-2.5 h-2.5" />
          Overridden
        </button>

        {outcome === 'overridden' && (
          <input
            type="text"
            value={overrideReason}
            onChange={(e) => onReasonChange(e.target.value)}
            placeholder="Why?"
            className="flex-1 px-2 py-1 bg-gray-800 border border-gray-600 rounded text-[10px] text-white placeholder-gray-500"
          />
        )}
      </div>
    </div>
  );
}

export default ResearchReviewPanel;
