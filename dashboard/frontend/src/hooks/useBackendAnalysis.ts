import { useState, useEffect, useRef } from 'react';
import { TelemetrySSE } from '../services/sse';
import { AnalysisResult } from '../services/live_analysis_engine';
import { useTelemetry } from './useTelemetry';
import type { TelemetryData } from '../types/telemetry';

interface BackendAnalysisHook {
  backendAnalysis: AnalysisResult | null;
  isBackendAnalysisValid: boolean;
  backendAnalysisTimestamp: number;
}

/**
 * Hook to receive and process backend analysis data
 * Transforms backend analysis structure to match frontend expectations
 */
export const useBackendAnalysis = (): BackendAnalysisHook => {
  const { telemetry } = useTelemetry();
  const [backendAnalysis, setBackendAnalysis] = useState<AnalysisResult | null>(null);
  const [isBackendAnalysisValid, setIsBackendAnalysisValid] = useState(false);
  const [backendAnalysisTimestamp, setBackendAnalysisTimestamp] = useState(0);
  const telemetryRef = useRef(telemetry);

  useEffect(() => {
    telemetryRef.current = telemetry;
  }, [telemetry]);

  // Helper function to calculate strategy based on race length and degradation
  const calculateStrategyRecommendation = (
    analysisData: any,
    raceTelemetry: TelemetryData | null,
  ): 'no-stop' | '1-stop' | '2-stop' | 'extend' | 'pit-now' => {
    const totalLaps = raceTelemetry?.total_laps || 50;
    const tyreAge = raceTelemetry?.tire_age_laps || 0;
    const degradationTrend = analysisData.degradation?.trend;
    
    if (totalLaps <= 5) {
      return 'no-stop'; // Short race/sprint
    } else if (totalLaps <= 15) {
      // Medium length race
      if (tyreAge > 10 && degradationTrend === 'degrading') {
        return 'pit-now';
      } else {
        return 'extend';
      }
    } else if (tyreAge > 20 && degradationTrend === 'degrading') {
      return 'pit-now';
    } else if (tyreAge > 15) {
      return '1-stop';
    } else if (degradationTrend === 'improving') {
      return 'extend';
    } else {
      return '1-stop';
    }
  };

  useEffect(() => {
    const sse = new TelemetrySSE();
    
    // Listen for backend live analysis events
    sse.onLiveAnalysis((rawAnalysisData: any) => {
      try {
        console.log('🧠 Received backend analysis:', rawAnalysisData);
        
        // Transform backend analysis to match frontend AnalysisResult structure
        const transformedAnalysis: AnalysisResult = {
          insights: [], // Backend doesn't provide insights yet, keep frontend ones
          performance: {
            // Map backend data to expected frontend structure
            currentPaceVsOptimal: rawAnalysisData.pace_vs_optimal?.delta_seconds || 0,
            tirePerformanceIndex: rawAnalysisData.tyre_performance?.index || 100,
            fuelEfficiencyRating: 100, // Backend doesn't provide this yet
            setupPerformanceRating: 100, // Backend doesn't provide this yet  
            racePaceConsistency: rawAnalysisData.consistency?.score || 100,
            improvementPotential: Math.max(0, rawAnalysisData.pace_vs_optimal?.delta_seconds || 0)
          },
          baseline: {
            bestSector1: 0, // Backend doesn't provide this in current format
            bestSector2: 0,
            bestSector3: 0,
            bestLapTime: 0,
            consistencyIndex: (rawAnalysisData.consistency?.score || 100) / 100,
            tirePerformanceWindow: {
              optimalStartLap: 2,
              optimalEndLap: 15,
              peakPerformanceLap: 5
            },
            optimalRacePace: rawAnalysisData.degradation?.next_pred || 90,
            fuelConsumptionRate: 2.5,
            lastUpdated: rawAnalysisData.timestamp || Date.now()
          },
          lapTrendPrediction: {
            nextLapPrediction: rawAnalysisData.lap_predictions?.next_lap || 0,
            degradationTrend: rawAnalysisData.degradation?.trend === 'improving' ? 'improving' :
                              rawAnalysisData.degradation?.trend === 'degrading' ? 'degrading' : 'stable',
            recommendedStrategy: calculateStrategyRecommendation(rawAnalysisData, telemetryRef.current || null)
          },
          timestamp: rawAnalysisData.timestamp || Date.now()
        };
        
        setBackendAnalysis(transformedAnalysis);
        setIsBackendAnalysisValid(rawAnalysisData.analysis_valid || false);
        setBackendAnalysisTimestamp(rawAnalysisData.timestamp || Date.now());
        
        console.log('✅ Backend analysis transformed and set:', {
          paceVsOptimal: transformedAnalysis.performance.currentPaceVsOptimal,
          tyrePerformance: transformedAnalysis.performance.tirePerformanceIndex,
          consistency: transformedAnalysis.performance.racePaceConsistency
        });
        
      } catch (error) {
        console.error('❌ Failed to process backend analysis data:', error);
        setIsBackendAnalysisValid(false);
      }
    });
    
    // Connect to SSE
    sse.connect().catch(error => {
      console.error('Failed to connect SSE for backend analysis:', error);
    });
    
    return () => {
      sse.disconnect();
    };
  }, []);

  return {
    backendAnalysis,
    isBackendAnalysisValid,
    backendAnalysisTimestamp
  };
};
