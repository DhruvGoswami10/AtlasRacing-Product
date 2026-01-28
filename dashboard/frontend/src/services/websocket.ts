import { TelemetryData, SessionData } from '../types/telemetry';

export class TelemetryWebSocket {
  private ws: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  
  private onDataCallback?: (data: TelemetryData) => void;
  private onSessionCallback?: (session: SessionData) => void;
  private onStatusCallback?: (status: 'connected' | 'disconnected' | 'error') => void;
  
  constructor(
    private url: string = 'ws://localhost:8080',
    private reconnectDelay: number = 2000
  ) {}
  
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);
        
        this.ws.onopen = () => {
          console.log('WebSocket connected to F1 24 telemetry server');
          this.reconnectAttempts = 0;
          this.onStatusCallback?.('connected');
          resolve();
        };
        
        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };
        
        this.ws.onclose = (event) => {
          console.log('WebSocket disconnected:', event.code, event.reason);
          this.onStatusCallback?.('disconnected');
          this.scheduleReconnect();
        };
        
        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          this.onStatusCallback?.('error');
          reject(error);
        };
        
        // Connection timeout
        setTimeout(() => {
          if (this.ws?.readyState !== WebSocket.OPEN) {
            this.ws?.close();
            reject(new Error('Connection timeout'));
          }
        }, 5000);
        
      } catch (error) {
        reject(error);
      }
    });
  }
  
  private handleMessage(data: string) {
    try {
      const parsed = JSON.parse(data);
      
      if (parsed.type === 'telemetry') {
        this.onDataCallback?.(parsed.data as TelemetryData);
      } else if (parsed.type === 'session') {
        this.onSessionCallback?.(parsed.data as SessionData);
      } else {
        // Assume it's telemetry data if no type specified
        this.onDataCallback?.(parsed as TelemetryData);
      }
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
    }
  }
  
  private scheduleReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectTimer = setTimeout(() => {
        this.reconnectAttempts++;
        console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
        this.connect().catch(() => {
          // Connection failed, will retry on next cycle
        });
      }, this.reconnectDelay * Math.min(this.reconnectAttempts + 1, 5)); // Exponential backoff up to 5x
    } else {
      console.error('Max reconnection attempts reached');
    }
  }
  
  onData(callback: (data: TelemetryData) => void) {
    this.onDataCallback = callback;
  }
  
  onSession(callback: (session: SessionData) => void) {
    this.onSessionCallback = callback;
  }
  
  onStatus(callback: (status: 'connected' | 'disconnected' | 'error') => void) {
    this.onStatusCallback = callback;
  }
  
  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
  
  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
  
  get connectionState(): string {
    if (!this.ws) return 'disconnected';
    
    switch (this.ws.readyState) {
      case WebSocket.CONNECTING: return 'connecting';
      case WebSocket.OPEN: return 'connected';
      case WebSocket.CLOSING: return 'disconnecting';
      case WebSocket.CLOSED: return 'disconnected';
      default: return 'unknown';
    }
  }
}