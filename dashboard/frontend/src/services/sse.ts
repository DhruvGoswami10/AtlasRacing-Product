import { TelemetryData, SessionData, MultiCarTelemetryData, RaceEvent, CarSetupData, TyreSetsData } from '../types/telemetry';

const DEBUG_TELEMETRY = process.env.NODE_ENV !== 'production';

export class TelemetrySSE {
  private eventSource: EventSource | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private eventIdCounter = 0;
  
  private onDataCallback?: (data: TelemetryData) => void;
  private onSessionCallback?: (session: SessionData) => void;
  private onMultiCarCallback?: (data: MultiCarTelemetryData) => void;
  private onEventsCallback?: (event: RaceEvent) => void;
  private onSetupCallback?: (setup: CarSetupData) => void;
  private onTyreSetsCallback?: (tyreSets: TyreSetsData) => void;
  private onLiveAnalysisCallback?: (analysis: any) => void;
  private onStatusCallback?: (status: 'connected' | 'disconnected' | 'error') => void;
  
  constructor(
    private url: string = 'http://localhost:8080/telemetry',
    private reconnectDelay: number = 2000
  ) {}
  
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Clean up any existing connection first
        if (this.eventSource) {
          this.eventSource.close();
          this.eventSource = null;
        }
        
        this.eventSource = new EventSource(this.url);
        
        this.eventSource.onopen = () => {
          if (DEBUG_TELEMETRY) {
            console.log('✅ SSE connected to F1 25 telemetry server');
          }
          this.reconnectAttempts = 0;
          this.onStatusCallback?.('connected');
          resolve();
        };
        
        this.eventSource.onmessage = (event) => {
          this.handleMessage(event.data);
        };
        
        this.eventSource.onerror = (error) => {
          console.error('SSE error:', error);
          this.onStatusCallback?.('error');
          this.scheduleReconnect();
        };
        
        // Connection timeout
        setTimeout(() => {
          if (this.eventSource?.readyState !== EventSource.OPEN) {
            this.eventSource?.close();
            reject(new Error('SSE connection timeout'));
          }
        }, 5000);
        
      } catch (error) {
        reject(error);
      }
    });
  }
  
  private handleMessage(data: string) {
    try {
      // Clean the data string to remove any control characters that might cause JSON parsing issues
      // eslint-disable-next-line no-control-regex
      const cleanData = data.replace(/[\x00-\x1F\x7F]/g, '');
      
      if (!cleanData.trim()) {
        console.warn('Received empty SSE message');
        return;
      }
      
      const parsed = JSON.parse(cleanData);
      
      if (parsed.type === 'connected') {
        if (DEBUG_TELEMETRY) {
          console.log('SSE connection confirmed:', parsed.message);
        }
        return;
      }
      
      if (parsed.type === 'telemetry') {
        if (DEBUG_TELEMETRY) {
          console.log('📡 Telemetry data received:', parsed.data?.speed_kph || 'N/A', 'km/h');
        }
        this.onDataCallback?.(parsed.data as TelemetryData);
      } else if (parsed.type === 'session') {
        this.onSessionCallback?.(parsed.data as SessionData);
      } else if (parsed.type === 'multicar') {
        // Handle multi-car data for pit wall dashboard
        if (DEBUG_TELEMETRY) {
          console.log('Received multi-car data with', parsed.num_active_cars, 'cars');
        }
        this.onMultiCarCallback?.(parsed as MultiCarTelemetryData);
      } else if (parsed.type === 'race_event') {
        // Handle race events (Packet 3)
        const raceEvent: RaceEvent = {
          id: `${Date.now()}-${++this.eventIdCounter}`,
          type: parsed.eventCode,
          message: this.formatEventMessage(parsed.eventCode, parsed),
          timestamp: parsed.timestamp || Date.now(),
          severity: this.getEventSeverity(parsed.eventCode)
        };
        if (DEBUG_TELEMETRY) {
          console.log('Race event received:', raceEvent.type, raceEvent.message);
        }
        this.onEventsCallback?.(raceEvent);
      } else if (parsed.type === 'car_setup') {
        // Handle car setup data (Packet 5)
        if (DEBUG_TELEMETRY) {
          console.log('Car setup data received');
        }
        this.onSetupCallback?.(parsed as CarSetupData);
      } else if (parsed.type === 'tyre_sets') {
        // Handle tyre sets data (Packet 12)
        if (DEBUG_TELEMETRY) {
          console.log('Tyre sets data received:', parsed.sets?.length, 'sets');
        }
        this.onTyreSetsCallback?.(parsed as TyreSetsData);
      } else if (parsed.type === 'live_analysis') {
        // Handle live analysis data from backend
        if (DEBUG_TELEMETRY) {
          console.log('Live analysis data received:', parsed.data);
        }
        this.onLiveAnalysisCallback?.(parsed.data);
      } else {
        // Assume it's telemetry data if no type specified
        if (DEBUG_TELEMETRY) {
          console.log('📡 Raw telemetry data:', parsed.speed_kph || 'N/A', 'km/h');
        }
        this.onDataCallback?.(parsed as TelemetryData);
      }
    } catch (error) {
      console.error('Failed to parse SSE message:', error);
      console.error('Raw message length:', data.length);
      console.error('First 200 chars:', data.substring(0, 200));
      console.error('Characters around error position 483:', data.substring(475, 495));
      
      // Try to identify the problematic characters
      for (let i = 0; i < Math.min(data.length, 500); i++) {
        const char = data.charAt(i);
        if (char.charCodeAt(0) < 32 && char !== '\t' && char !== '\n' && char !== '\r') {
          console.error(`Found control character at position ${i}: code ${char.charCodeAt(0)}`);
        }
      }
    }
  }
  
  private scheduleReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectTimer = setTimeout(() => {
        this.reconnectAttempts++;
        console.log(`Attempting to reconnect SSE (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
        
        // Clean up existing connection before reconnecting
        if (this.eventSource) {
          this.eventSource.close();
          this.eventSource = null;
        }
        
        this.connect().catch(() => {
          // Connection failed, will retry on next cycle
        });
      }, this.reconnectDelay * Math.min(this.reconnectAttempts + 1, 5)); // Exponential backoff up to 5x
    } else {
      console.error('Max SSE reconnection attempts reached');
      this.onStatusCallback?.('disconnected');
    }
  }
  
  onData(callback: (data: TelemetryData) => void) {
    this.onDataCallback = callback;
  }
  
  onSession(callback: (session: SessionData) => void) {
    this.onSessionCallback = callback;
  }
  
  onMultiCar(callback: (data: MultiCarTelemetryData) => void) {
    this.onMultiCarCallback = callback;
  }
  
  onEvents(callback: (event: RaceEvent) => void) {
    this.onEventsCallback = callback;
  }
  
  onCarSetup(callback: (setup: CarSetupData) => void) {
    this.onSetupCallback = callback;
  }
  
  onTyreSets(callback: (tyreSets: TyreSetsData) => void) {
    this.onTyreSetsCallback = callback;
  }
  
  onLiveAnalysis(callback: (analysis: any) => void) {
    this.onLiveAnalysisCallback = callback;
  }
  
  onStatus(callback: (status: 'connected' | 'disconnected' | 'error') => void) {
    this.onStatusCallback = callback;
  }
  
  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    
    this.onStatusCallback?.('disconnected');
  }
  
  get isConnected(): boolean {
    return this.eventSource?.readyState === EventSource.OPEN;
  }
  
  get connectionState(): string {
    if (!this.eventSource) return 'disconnected';
    
    switch (this.eventSource.readyState) {
      case EventSource.CONNECTING: return 'connecting';
      case EventSource.OPEN: return 'connected';
      case EventSource.CLOSED: return 'disconnected';
      default: return 'unknown';
    }
  }
  
  private formatEventMessage(eventCode: string, eventData?: any): string {
    switch (eventCode) {
      case 'FTLP': {
        if (eventData?.driverName) {
          const timeStr = eventData.formattedTime || `${eventData.lapTime}s`;
          return `${eventData.driverName} set new fastest lap (${timeStr})`;
        }
        return 'New fastest lap set';
      }
      case 'RTMT': {
        if (eventData?.driverName) {
          return `${eventData.driverName} retired`;
        }
        return 'Car retirement';
      }
      case 'PENA': {
        if (eventData?.driverName) {
          return `${eventData.driverName} received penalty (${eventData.time}s)`;
        }
        return 'Penalty applied';
      }
      case 'OVTK': {
        if (eventData?.overtakingDriver && eventData?.beingOvertakenDriver) {
          return `${eventData.overtakingDriver} overtook ${eventData.beingOvertakenDriver}`;
        }
        return 'Overtake detected';
      }
      case 'SSTA': return 'Session started';
      case 'STLG': return 'Start lights sequence';
      case 'LGOT': return 'Lights out!';
      case 'DRSE': return 'DRS enabled by race control';
      case 'DRSD': return 'DRS disabled by race control';
      case 'CHQF': return 'Chequered flag';
      case 'RDFL': return 'Red flag shown';
      case 'DTSV': return 'Drive through penalty served';
      case 'SGSV': return 'Stop go penalty served';
      case 'FLBK': return 'Flashback activated';
      case 'SCAR': return 'Safety car event';
      case 'COLL': {
        if (eventData?.vehicle1Name && eventData?.vehicle2Name) {
          return `${eventData.vehicle1Name} collided with ${eventData.vehicle2Name}`;
        }
        return 'Collision detected';
      }
      case 'TMPT': return 'Team mate in pits';
      case 'RCWN': {
        if (eventData?.winner && eventData?.p2 && eventData?.p3) {
          let message = `🏆 Top 3: 1️⃣${eventData.winner} 2️⃣${eventData.p2} 3️⃣${eventData.p3}`;
          if (eventData.playerPosition && eventData.playerName && eventData.playerPosition > 3) {
            message += ` | You: P${eventData.playerPosition} ${eventData.playerName}`;
          }
          return message;
        } else if (eventData?.winner) {
          return `🏆 Race winner: ${eventData.winner}`;
        }
        return 'Race finished';
      }
      case 'YFLAG': return 'Yellow flags deployed';
      case 'YFEND': return 'Yellow flags cleared';
      case 'SCFULL': return 'Full safety car deployed';
      case 'SCVIR': return 'Virtual safety car deployed';
      case 'SCEND': return 'Safety car period ended';
      case 'SCFORM': return 'Formation lap safety car';
      case 'SEND': return 'Session ended';
      case 'DSQ': {
        if (eventData?.driverName) {
          return `${eventData.driverName} disqualified`;
        }
        return 'Driver disqualified';
      }
      case 'DNF': {
        if (eventData?.driverName) {
          return `${eventData.driverName} did not finish`;
        }
        return 'Driver did not finish';
      }
      default: return `Race event: ${eventCode}`;
    }
  }
  
  private getEventSeverity(eventCode: string): 'info' | 'warning' | 'critical' {
    switch (eventCode) {
      case 'RTMT':
      case 'PENA':
      case 'DSQ':
      case 'DNF':
      case 'RDFL':
      case 'COLL':
        return 'critical';
      case 'OVTK':
      case 'DRSE':
      case 'DRSD':
      case 'YFLAG':
      case 'SCFULL':
      case 'SCVIR':
      case 'SCAR':
        return 'warning';
      case 'YFEND':
      case 'SCEND':
      case 'SSTA':
      case 'SEND':
      case 'STLG':
      case 'LGOT':
      case 'CHQF':
      case 'RCWN':
      case 'DTSV':
      case 'SGSV':
      case 'FLBK':
      case 'TMPT':
        return 'info';
      default:
        return 'info';
    }
  }
}
