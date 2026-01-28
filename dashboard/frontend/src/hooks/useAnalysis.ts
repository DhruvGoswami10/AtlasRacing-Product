import { useState, useEffect, useRef, useCallback } from 'react';
import { F1AnalysisEngine, F1Analysis } from '../services/analysis_engine';
import { useTelemetry } from './useTelemetry';

export interface AnalysisState {
  analysis: F1Analysis | null;
  isAnalyzing: boolean;
  lastUpdate: number;
  error: string | null;
}

export const useAnalysis = () => {
  const { telemetry, isConnected } = useTelemetry();
  const [state, setState] = useState<AnalysisState>({
    analysis: null,
    isAnalyzing: false,
    lastUpdate: 0,
    error: null
  });

  const analysisEngineRef = useRef<F1AnalysisEngine | null>(null);
  const isInitialized = useRef(false);

  // Initialize analysis engine
  useEffect(() => {
    if (!isInitialized.current) {
      console.log('🔬 Initializing F1 Analysis Engine...');
      analysisEngineRef.current = new F1AnalysisEngine();
      isInitialized.current = true;
      
      setState(prev => ({
        ...prev,
        isAnalyzing: true,
        error: null
      }));
    }
  }, []);

  // Process telemetry data through analysis engine
  useEffect(() => {
    if (!telemetry || !isConnected || !analysisEngineRef.current) {
      if (!isConnected) {
        setState(prev => ({
          ...prev,
          isAnalyzing: false,
          analysis: null
        }));
      }
      return;
    }

    try {
      const analysis = analysisEngineRef.current.updateAnalysis(telemetry);
      
      setState(prev => ({
        ...prev,
        analysis,
        isAnalyzing: true,
        lastUpdate: Date.now(),
        error: null
      }));

    } catch (error) {
      console.error('❌ Analysis engine error:', error);
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Analysis failed',
        isAnalyzing: false
      }));
    }
  }, [telemetry, isConnected]);

  // Reset analysis when connection is lost
  useEffect(() => {
    if (!isConnected && analysisEngineRef.current) {
      console.log('🔄 Connection lost, resetting analysis');
      analysisEngineRef.current.resetAnalysis();
    }
  }, [isConnected]);

  // Manual reset function
  const resetAnalysis = useCallback(() => {
    if (analysisEngineRef.current) {
      console.log('🔄 Manually resetting analysis');
      analysisEngineRef.current.resetAnalysis();
      setState(prev => ({
        ...prev,
        analysis: null,
        lastUpdate: 0,
        error: null
      }));
    }
  }, []);

  // Get analysis summary for AI
  const getAnalysisSummary = useCallback((): string => {
    if (!analysisEngineRef.current) {
      return 'Analysis engine not initialized';
    }
    return analysisEngineRef.current.getAnalysisSummary();
  }, []);

  // Check if lap was just completed
  const [lastLapNumber, setLastLapNumber] = useState(0);
  const [lapJustCompleted, setLapJustCompleted] = useState(false);
  const currentLapNumber = telemetry?.current_lap_num ?? 0;

  useEffect(() => {
    if (currentLapNumber > lastLapNumber && lastLapNumber > 0) {
      setLapJustCompleted(true);
      console.log('🏁 Lap completed!', currentLapNumber);
      
      // Reset flag after 3 seconds
      setTimeout(() => setLapJustCompleted(false), 3000);
    }
    setLastLapNumber(currentLapNumber);
  }, [currentLapNumber, lastLapNumber]);

  return {
    // Analysis data
    analysis: state.analysis,
    isAnalyzing: state.isAnalyzing,
    lastUpdate: state.lastUpdate,
    error: state.error,
    
    // Connection state
    isConnected,
    telemetryConnected: isConnected,
    
    // Lap events
    lapJustCompleted,
    
    // Actions
    resetAnalysis,
    getAnalysisSummary,
    
    // Current telemetry for context
    currentTelemetry: telemetry
  };
};

// Specialized hook for lap comparison data
export const useLapComparison = () => {
  const { analysis } = useAnalysis();
  
  return {
    currentLap: analysis?.currentLap,
    previousLap: analysis?.previousLap,
    personalBest: analysis?.personalBest,
    sessionBest: analysis?.sessionBest,
    sectorComparison: analysis?.sectorComparison,
    sessionStats: analysis?.sessionStats
  };
};

// Specialized hook for tyre analysis
export const useTyreAnalysis = () => {
  const { analysis, isConnected } = useAnalysis();
  
  return {
    tyreAnalysis: analysis?.tyreAnalysis,
    isConnected,
    hasData: !!analysis?.tyreAnalysis
  };
};

// Specialized hook for input analysis
export const useInputAnalysis = () => {
  const { analysis, isConnected } = useAnalysis();
  
  return {
    inputAnalysis: analysis?.inputAnalysis,
    lockupEvents: analysis?.inputAnalysis?.lockupEvents || [],
    spinEvents: analysis?.inputAnalysis?.spinEvents || [],
    smoothness: analysis?.inputAnalysis?.smoothness,
    isConnected,
    hasData: !!analysis?.inputAnalysis
  };
};

// Hook for performance trends over time
export const usePerformanceTrends = () => {
  const { analysis } = useAnalysis();
  const [trends, setTrends] = useState<{
    lapTimes: { lap: number; time: number }[];
    sectorTrends: { lap: number; s1: number; s2: number; s3: number }[];
    tyreTemps: { lap: number; avgTemp: number; maxTemp: number }[];
    fuelUsage: { lap: number; fuelUsed: number; remaining: number }[];
  }>({
    lapTimes: [],
    sectorTrends: [],
    tyreTemps: [],
    fuelUsage: []
  });

  useEffect(() => {
    if (!analysis?.lapHistory) return;

    const lapTimes = analysis.lapHistory
      .filter(lap => lap.isValid && lap.lapTime > 0)
      .map(lap => ({ lap: lap.lapNumber, time: lap.lapTime }));

    const sectorTrends = analysis.lapHistory
      .filter(lap => lap.isValid)
      .map(lap => ({
        lap: lap.lapNumber,
        s1: lap.sector1Time,
        s2: lap.sector2Time,
        s3: lap.sector3Time
      }));

    const tyreTemps = analysis.lapHistory
      .map(lap => ({
        lap: lap.lapNumber,
        avgTemp: lap.averageTyreTemp,
        maxTemp: lap.maxTyreTemp
      }));

    const fuelUsage = analysis.lapHistory
      .map(lap => ({
        lap: lap.lapNumber,
        fuelUsed: lap.fuelUsed,
        remaining: 100 - (lap.lapNumber * 2) // Simplified calculation
      }));

    setTrends({
      lapTimes,
      sectorTrends,
      tyreTemps,
      fuelUsage
    });
  }, [analysis?.lapHistory]);

  return trends;
};

// Hook for real-time analysis alerts
export const useAnalysisAlerts = () => {
  const { analysis } = useAnalysis();
  const [alerts, setAlerts] = useState<{
    type: 'tyre' | 'performance' | 'consistency' | 'event';
    severity: 'info' | 'warning' | 'critical';
    message: string;
    timestamp: number;
  }[]>([]);

  useEffect(() => {
    if (!analysis) return;

    const newAlerts: typeof alerts = [];
    const now = Date.now();

    // Tyre temperature alerts
    if (analysis.tyreAnalysis?.isOverheating) {
      newAlerts.push({
        type: 'tyre',
        severity: 'critical',
        message: `Tyre overheating! ${analysis.tyreAnalysis.maxTemp.toFixed(1)}°C (optimal: ${analysis.tyreAnalysis.optimalRange.max}°C)`,
        timestamp: now
      });
    }

    // Performance alerts
    if (analysis.sectorComparison && analysis.sectorComparison.lapTimeDelta > 2.0) {
      newAlerts.push({
        type: 'performance',
        severity: 'warning',
        message: `Pace dropping: +${analysis.sectorComparison.lapTimeDelta.toFixed(1)}s vs personal best`,
        timestamp: now
      });
    }

    // Event alerts (lockups/spins)
    const recentLockups = analysis.inputAnalysis?.lockupEvents?.filter(
      event => now - event.timestamp < 10000
    ) || [];
    
    if (recentLockups.length > 0) {
      const lockup = recentLockups[0];
      newAlerts.push({
        type: 'event',
        severity: 'warning',
        message: `Lockup detected at ${lockup.corner} (-${lockup.speedLoss.toFixed(1)} km/h)`,
        timestamp: now
      });
    }

    // Only update if there are new alerts
    if (newAlerts.length > 0) {
      setAlerts(prev => [...prev.slice(-10), ...newAlerts]); // Keep last 10 alerts
    }
  }, [analysis]);

  // Clear alerts
  const clearAlerts = useCallback(() => {
    setAlerts([]);
  }, []);

  return {
    alerts,
    hasAlerts: alerts.length > 0,
    criticalAlerts: alerts.filter(a => a.severity === 'critical'),
    clearAlerts
  };
};

