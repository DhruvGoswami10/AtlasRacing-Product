import { useState, useEffect, useRef } from 'react';
import { LiveAnalysisEngine, AnalysisResult, StrategyInsight } from '../services/live_analysis_engine';
import { TelemetryData, TyreSetsData, CarSetupData } from '../types/telemetry';

interface LiveAnalysisHook {
  analysis: AnalysisResult | null;
  insights: StrategyInsight[];
  isAnalyzing: boolean;
  updateAnalysis: (telemetry: TelemetryData, tyreSets?: TyreSetsData, carSetup?: CarSetupData) => void;
  resetAnalysis: () => void;
}

/**
 * React hook for Live Analysis Engine integration
 * Provides real-time performance insights and strategy recommendations
 */
export const useLiveAnalysis = (): LiveAnalysisHook => {
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [insights, setInsights] = useState<StrategyInsight[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  const engineRef = useRef<LiveAnalysisEngine | null>(null);

  // Initialize analysis engine
  useEffect(() => {
    engineRef.current = new LiveAnalysisEngine();
    console.log('🧠 Live Analysis Hook initialized');

    return () => {
      console.log('🧠 Live Analysis Hook cleanup');
    };
  }, []);

  /**
   * Update analysis with new telemetry data
   */
  const updateAnalysis = (telemetry: TelemetryData, tyreSets?: TyreSetsData, carSetup?: CarSetupData) => {
    if (!engineRef.current) return;

    try {
      setIsAnalyzing(true);
      
      const result = engineRef.current.updateAnalysis(telemetry, tyreSets, carSetup);
      
      setAnalysis(result);
      setInsights(result.insights);
      
      // Log high-priority insights
      result.insights
        .filter(insight => insight.priority === 'high' || insight.priority === 'critical')
        .forEach(insight => {
          console.log(`🚨 Analysis Insight [${insight.priority.toUpperCase()}]: ${insight.message}`);
        });
        
    } catch (error) {
      console.error('Live analysis update failed:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  /**
   * Reset analysis for new session
   */
  const resetAnalysis = () => {
    if (engineRef.current) {
      engineRef.current.reset();
      setAnalysis(null);
      setInsights([]);
      console.log('🔄 Live Analysis reset');
    }
  };

  return {
    analysis,
    insights,
    isAnalyzing,
    updateAnalysis,
    resetAnalysis
  };
};