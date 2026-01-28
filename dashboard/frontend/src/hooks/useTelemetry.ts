import { useCallback, useEffect, useState } from 'react';
import { useTelemetryContext } from '../context/TelemetryContext';
import type { TelemetryData } from '../types/telemetry';

export const useTelemetry = () => useTelemetryContext();

// Hook for specific telemetry values with history
export const useTelemetryHistory = (maxHistory: number = 100) => {
  const { telemetry, isConnected } = useTelemetry();
  const [history, setHistory] = useState<TelemetryData[]>([]);

  useEffect(() => {
    if (telemetry && isConnected) {
      setHistory(prev => {
        const next = [...prev, telemetry];
        return next.slice(-maxHistory);
      });
    } else if (!isConnected) {
      setHistory([]);
    }
  }, [telemetry, isConnected, maxHistory]);

  return {
    current: telemetry,
    history,
    isConnected
  };
};

// Hook for performance metrics
export const usePerformanceMetrics = () => {
  const { telemetry, isConnected } = useTelemetry();
  const [metrics, setMetrics] = useState({
    maxSpeed: 0,
    maxRPM: 0,
    totalThrottleTime: 0,
    totalBrakeTime: 0,
    dataRate: 0
  });

  const [lastUpdateTime, setLastUpdateTime] = useState(Date.now());
  const [frameCount, setFrameCount] = useState(0);

  useEffect(() => {
    if (!telemetry || !isConnected) {
      setMetrics({
        maxSpeed: 0,
        maxRPM: 0,
        totalThrottleTime: 0,
        totalBrakeTime: 0,
        dataRate: 0
      });
      setFrameCount(0);
      return;
    }

    const now = Date.now();
    const deltaTime = (now - lastUpdateTime) / 1000;

    setMetrics(prev => ({
      maxSpeed: Math.max(prev.maxSpeed, telemetry.speed_kph),
      maxRPM: Math.max(prev.maxRPM, telemetry.rpm),
      totalThrottleTime: prev.totalThrottleTime + (telemetry.throttle_percent > 50 ? deltaTime : 0),
      totalBrakeTime: prev.totalBrakeTime + (telemetry.brake_percent > 50 ? deltaTime : 0),
      dataRate: frameCount / ((now - lastUpdateTime) / 1000) || 0
    }));

    setFrameCount(prev => prev + 1);
    setLastUpdateTime(now);
  }, [telemetry, isConnected, lastUpdateTime, frameCount]);

  const resetMetrics = useCallback(() => {
    setMetrics({
      maxSpeed: 0,
      maxRPM: 0,
      totalThrottleTime: 0,
      totalBrakeTime: 0,
      dataRate: 0
    });
    setFrameCount(0);
    setLastUpdateTime(Date.now());
  }, []);

  return {
    metrics,
    resetMetrics
  };
};

// Hook for multi-car telemetry data (pit wall dashboard)
export const useMultiCarTelemetry = () => {
  const { multiCarData, isConnected, connectionStatus, connect, disconnect, retry } = useTelemetry();

  return {
    multiCarData,
    isConnected,
    connectionStatus,
    connect,
    disconnect,
    retry
  };
};
