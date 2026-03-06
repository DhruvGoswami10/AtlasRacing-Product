import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { TelemetrySSE, discoverBackendHost } from '../services/sse';
import type {
  DashboardState,
  MultiCarTelemetryData,
  SessionData,
  TelemetryData
} from '../types/telemetry';
import type { AnalysisResult } from '../services/live_analysis_engine';

type ConnectionStatus = DashboardState['connectionStatus'];

interface TelemetryContextValue {
  telemetry: TelemetryData | null;
  session: SessionData | null;
  isConnected: boolean;
  connectionStatus: ConnectionStatus;
  lastError?: string;
  connect: () => Promise<void>;
  disconnect: () => void;
  retry: () => Promise<void>;
  multiCarData: MultiCarTelemetryData | null;
  liveAnalysis: AnalysisResult | null;
}

const TelemetryContext = createContext<TelemetryContextValue | null>(null);

const initialState: DashboardState = {
  telemetry: null,
  session: null,
  isConnected: false,
  connectionStatus: 'disconnected'
};

export function TelemetryProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DashboardState>(initialState);
  const [multiCarData, setMultiCarData] = useState<MultiCarTelemetryData | null>(null);
  const [liveAnalysis, setLiveAnalysis] = useState<AnalysisResult | null>(null);

  const sseRef = useRef<TelemetrySSE | null>(null);
  const connectingRef = useRef(false);

  const cleanupSSE = useCallback(() => {
    if (sseRef.current) {
      sseRef.current.disconnect();
      sseRef.current = null;
    }
    connectingRef.current = false;
  }, []);

  const disconnect = useCallback(() => {
    cleanupSSE();
    setState(prev => ({
      ...initialState,
      lastError: prev.lastError
    }));
    setMultiCarData(null);
    setLiveAnalysis(null);
  }, [cleanupSSE]);

  const connect = useCallback(async () => {
    if (sseRef.current?.isConnected) {
      return;
    }
    if (connectingRef.current) {
      return;
    }

    connectingRef.current = true;
    setState(prev => ({
      ...prev,
      connectionStatus: 'connecting',
      lastError: undefined
    }));

    const host = await discoverBackendHost();
    const sse = new TelemetrySSE(`http://${host}:8080/telemetry`);

    sse.onData((telemetry: TelemetryData) => {
      setState(prev => ({
        ...prev,
        telemetry,
        isConnected: true,
        connectionStatus: 'connected',
        lastError: undefined
      }));
    });

    sse.onSession((session: SessionData) => {
      setState(prev => ({
        ...prev,
        session: {
          ...session,
          connected: true,
          lastUpdateTime: Date.now()
        },
        isConnected: true,
        connectionStatus: 'connected'
      }));
    });

    sse.onMultiCar((data: MultiCarTelemetryData) => {
      setMultiCarData(data);
    });

    sse.onCarSetup((setup) => {
      setState(prev => {
        if (!prev.telemetry) {
          return prev;
        }
        return {
          ...prev,
          telemetry: {
            ...prev.telemetry,
            car_setup: setup
          }
        };
      });
    });

    sse.onStatus((status) => {
      setState(prev => ({
        ...prev,
        connectionStatus: status,
        isConnected: status === 'connected',
        lastError: status === 'error' ? 'Connection failed' : prev.lastError
      }));
    });

    sse.onLiveAnalysis((analysis: AnalysisResult) => {
      setLiveAnalysis(analysis);
    });

    try {
      await sse.connect();
      sseRef.current = sse;
      connectingRef.current = false;
    } catch (error: any) {
      console.error('Failed to connect to telemetry server:', error);
      cleanupSSE();
      setState(prev => ({
        ...prev,
        connectionStatus: 'error',
        isConnected: false,
        lastError: error?.message || 'Connection failed'
      }));
      throw error;
    }
  }, [cleanupSSE]);

  const retry = useCallback(async () => {
    disconnect();
    await connect();
  }, [connect, disconnect]);

  useEffect(() => {
    connect().catch(() => {
      // Error already handled in connect
    });

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  const contextValue = useMemo<TelemetryContextValue>(() => ({
    telemetry: state.telemetry,
    session: state.session,
    isConnected: state.isConnected,
    connectionStatus: state.connectionStatus,
    lastError: state.lastError,
    connect,
    disconnect,
    retry,
    multiCarData,
    liveAnalysis
  }), [state, connect, disconnect, retry, multiCarData, liveAnalysis]);

  return (
    <TelemetryContext.Provider value={contextValue}>
      {children}
    </TelemetryContext.Provider>
  );
}

export function useTelemetryContext(): TelemetryContextValue {
  const context = useContext(TelemetryContext);
  if (!context) {
    throw new Error('useTelemetry must be used within a TelemetryProvider');
  }
  return context;
}
