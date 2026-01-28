import { useState, useCallback, useEffect } from 'react';
import { TelemetrySSE } from '../services/sse';

// Backend analysis types (matching C++ structures)
export interface BackendPrediction {
  next_lap_time: number;
  confidence: number;
  base_pace: number;
  fuel_adjustment: number;
  tire_adjustment: number;
  track_evolution: number;
  reasoning: string;
}

export interface BackendSession {
  optimal_lap_time: number;
  consistency_score: number;
  tire_performance: number;
  pace_vs_optimal: number;
  session_phase: string;
}

export interface BackendAnalysis {
  analysis_valid: boolean;
  timestamp: number;
  prediction: BackendPrediction;
  session: BackendSession;
}

interface LapPredictionHook {
  analysis: BackendAnalysis | null;
  updateAnalysis: (analysisData: any) => void;
  resetAnalysis: () => void;
  hasValidPrediction: boolean;
}

/**
 * Simple hook to receive and manage backend lap prediction data
 * Replaces complex frontend analysis engines - backend does all the work
 */
export const useBackendLapPrediction = (): LapPredictionHook => {
  const [analysis, setAnalysis] = useState<BackendAnalysis | null>(null);

  const updateAnalysis = useCallback((analysisData: any) => {
    try {
      if (analysisData && analysisData.analysis_valid) {
        setAnalysis(analysisData);
        
        // Log prediction for debugging
        if (analysisData.prediction?.next_lap_time) {
          console.log(`🔮 Lap Prediction: ${analysisData.prediction.next_lap_time.toFixed(3)}s (${(analysisData.prediction.confidence * 100).toFixed(1)}% confidence)`);
        }
      }
    } catch (error) {
      console.error('Failed to update backend analysis:', error);
    }
  }, []);

  const resetAnalysis = useCallback(() => {
    setAnalysis(null);
    console.log('🔄 Backend lap prediction reset');
  }, []);

  // Connect to SSE stream
  useEffect(() => {
    const sse = new TelemetrySSE();
    
    // Listen for backend live analysis events
    sse.onLiveAnalysis((rawAnalysisData: any) => {
      updateAnalysis(rawAnalysisData);
    });
    
    // Connect to SSE
    sse.connect().catch(error => {
      console.error('Failed to connect SSE for lap prediction:', error);
    });
    
    return () => {
      sse.disconnect();
    };
  }, [updateAnalysis]);

  const hasValidPrediction = !!(analysis?.analysis_valid && analysis.prediction?.next_lap_time > 0);

  return {
    analysis,
    updateAnalysis,
    resetAnalysis,
    hasValidPrediction
  };
};