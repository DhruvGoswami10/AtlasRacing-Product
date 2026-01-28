import { useEffect, useState } from 'react';
import type { TyreSetData } from '../types/telemetry';
import { TelemetrySSE } from '../services/sse';

export interface UseTyreSetsResult {
  tyreSets: TyreSetData[];
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
}

const normaliseTyreSet = (input: any): TyreSetData => {
  const resolveCompound = (value: any) =>
    typeof value === 'number' && Number.isFinite(value) ? value : 255;

  const lapDeltaRaw =
    typeof input.lapDeltaTime === 'number'
      ? input.lapDeltaTime
      : typeof input.m_lapDeltaTime === 'number'
        ? input.m_lapDeltaTime
        : 0;

  return {
    id: input.id ?? 0,
    actualTyreCompound: resolveCompound(
      input.actualTyreCompound ?? input.actualCompound ?? input.m_actualTyreCompound,
    ),
    visualTyreCompound: resolveCompound(
      input.visualTyreCompound ?? input.visualCompound ?? input.m_visualTyreCompound,
    ),
    wear: typeof input.wear === 'number' ? input.wear : 0,
    available: Boolean(input.available),
    recommendedSession: typeof input.recommendedSession === 'number' ? input.recommendedSession : 0,
    lifeSpan: typeof input.lifeSpan === 'number' ? input.lifeSpan : 0,
    usableLife: typeof input.usableLife === 'number' ? input.usableLife : 0,
    lapDeltaTime: Number.isFinite(lapDeltaRaw) ? lapDeltaRaw / 1000 : 0,
    fitted: Boolean(input.fitted),
  } as TyreSetData;
};

export const useTyreSets = (): UseTyreSetsResult => {
  const [tyreSets, setTyreSets] = useState<TyreSetData[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>(
    'disconnected',
  );

  useEffect(() => {
    const sse = new TelemetrySSE();
    setConnectionStatus('connecting');

    sse.onTyreSets((data: any) => {
      const normalisedSets = Array.isArray(data?.sets)
        ? (data.sets as any[]).map(normaliseTyreSet)
        : [];
      setTyreSets(normalisedSets);
    });

    sse.onStatus(status => {
      setConnectionStatus(status);
    });

    sse.connect().catch(error => {
      console.error('Failed to connect to tyre sets stream:', error);
      setConnectionStatus('error');
    });

    return () => {
      sse.disconnect();
      setConnectionStatus('disconnected');
    };
  }, []);

  return { tyreSets, connectionStatus };
};

