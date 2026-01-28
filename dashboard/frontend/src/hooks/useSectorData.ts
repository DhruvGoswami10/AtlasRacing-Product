import { useState, useEffect, useCallback } from 'react';
import { TelemetryData } from '../types/telemetry';

export interface SectorAnalysis {
  sector1: {
    current: number;
    best: number;
    delta: number;
    status: 'active' | 'completed' | 'pending';
  };
  sector2: {
    current: number;
    best: number;
    delta: number;
    status: 'active' | 'completed' | 'pending';
  };
  sector3: {
    current: number;
    best: number;
    delta: number;
    status: 'active' | 'completed' | 'pending';
  };
  currentSector: number;
  lapProgress: {
    lastLap: number;
    bestLap: number;
    currentLapTime: number;
  };
}

export const useSectorData = (telemetry?: TelemetryData) => {
  // State to persist sector times across laps (similar to SectorTimingWidget)
  const [persistedSectors, setPersistedSectors] = useState({
    sector1: 0,
    sector2: 0,
    sector3: 0,
    lapNumber: 0
  });

  // Track best sector times
  const [bestSectors, setBestSectors] = useState({
    sector1Best: 0,
    sector2Best: 0,
    sector3Best: 0
  });

  const hasTelemetry = Boolean(telemetry);
  const sector1Time = telemetry?.sector1_time ?? 0;
  const sector2Time = telemetry?.sector2_time ?? 0;
  const sector3Time = telemetry?.sector3_time ?? 0;
  const currentLapNumber = telemetry?.current_lap_num ?? 0;
  const lastLapTime = telemetry?.last_lap_time ?? 0;
  const currentSector = telemetry?.current_sector ?? 0;
  const bestLapTime = telemetry?.best_lap_time ?? 0;
  const currentLapTime = telemetry?.current_lap_time ?? 0;

  // Update persisted sectors when we get new data (from SectorTimingWidget logic)
  useEffect(() => {
    if (!hasTelemetry) return;

    const currentLap = currentLapNumber || 0;
    
    // If this is a new lap, calculate sector 3 from last lap time
    if (currentLap > persistedSectors.lapNumber && lastLapTime > 0) {
      const calculatedSector3 = lastLapTime - (persistedSectors.sector1 + persistedSectors.sector2);
      setPersistedSectors(prev => ({
        ...prev,
        sector3: calculatedSector3 > 0 ? calculatedSector3 : prev.sector3,
        lapNumber: currentLap
      }));
    }
    
    // Update sectors as they come in
    if (sector1Time > 0 && sector1Time !== persistedSectors.sector1) {
      setPersistedSectors(prev => ({ ...prev, sector1: sector1Time }));
    }
    if (sector2Time > 0 && sector2Time !== persistedSectors.sector2) {
      setPersistedSectors(prev => ({ ...prev, sector2: sector2Time }));
    }
    if (sector3Time > 0) {
      setPersistedSectors(prev => ({ ...prev, sector3: sector3Time }));
    }
  }, [hasTelemetry, sector1Time, sector2Time, sector3Time, lastLapTime, currentLapNumber, persistedSectors]);

  // Update best sector times
  useEffect(() => {
    if (!hasTelemetry) return;

    const displaySector1 = sector1Time > 0 ? sector1Time : persistedSectors.sector1;
    const displaySector2 = sector2Time > 0 ? sector2Time : persistedSectors.sector2;
    const displaySector3 = sector3Time > 0 ? sector3Time : persistedSectors.sector3;

    setBestSectors(prev => ({
      sector1Best: displaySector1 > 0 && (prev.sector1Best === 0 || displaySector1 < prev.sector1Best) 
        ? displaySector1 : prev.sector1Best,
      sector2Best: displaySector2 > 0 && (prev.sector2Best === 0 || displaySector2 < prev.sector2Best) 
        ? displaySector2 : prev.sector2Best,
      sector3Best: displaySector3 > 0 && (prev.sector3Best === 0 || displaySector3 < prev.sector3Best) 
        ? displaySector3 : prev.sector3Best
    }));
  }, [hasTelemetry, sector1Time, sector2Time, sector3Time, persistedSectors]);

  const getSectorStatus = useCallback((sectorIndex: number): 'active' | 'completed' | 'pending' => {
    if (!hasTelemetry) return 'pending';
    
    if (currentSector === sectorIndex) return 'active';
    if (currentSector > sectorIndex) return 'completed';
    return 'pending';
  }, [hasTelemetry, currentSector]);

  const getSectorAnalysis = useCallback((): SectorAnalysis | null => {
    if (!hasTelemetry) return null;

    const displaySector1 = sector1Time > 0 ? sector1Time : persistedSectors.sector1;
    const displaySector2 = sector2Time > 0 ? sector2Time : persistedSectors.sector2;
    const displaySector3 = sector3Time > 0 ? sector3Time : persistedSectors.sector3;

    return {
      sector1: {
        current: displaySector1,
        best: bestSectors.sector1Best,
        delta: bestSectors.sector1Best > 0 ? displaySector1 - bestSectors.sector1Best : 0,
        status: getSectorStatus(0)
      },
      sector2: {
        current: displaySector2,
        best: bestSectors.sector2Best,
        delta: bestSectors.sector2Best > 0 ? displaySector2 - bestSectors.sector2Best : 0,
        status: getSectorStatus(1)
      },
      sector3: {
        current: displaySector3,
        best: bestSectors.sector3Best,
        delta: bestSectors.sector3Best > 0 ? displaySector3 - bestSectors.sector3Best : 0,
        status: getSectorStatus(2)
      },
      currentSector,
      lapProgress: {
        lastLap: lastLapTime,
        bestLap: bestLapTime,
        currentLapTime
      }
    };
  }, [
    hasTelemetry,
    sector1Time,
    sector2Time,
    sector3Time,
    persistedSectors,
    bestSectors,
    getSectorStatus,
    currentSector,
    lastLapTime,
    bestLapTime,
    currentLapTime,
  ]);

  return {
    sectorAnalysis: getSectorAnalysis(),
    isConnected: hasTelemetry
  };
};
