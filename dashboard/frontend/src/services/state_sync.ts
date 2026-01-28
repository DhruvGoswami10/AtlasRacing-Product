// Import React hooks
import { useState, useEffect } from 'react';

/**
 * State synchronization service for mobile dashboard coordination
 * Broadcasts PC dashboard state changes to all connected mobile devices
 */

type SyncedDashboardId = 'f1-pro' | 'gt-endurance';

interface DashboardState {
  dashboard: SyncedDashboardId;
  mode?: number;
  data?: any;
  timestamp: number;
}

interface StateSubscriber {
  id: string;
  callback: (state: DashboardState) => void;
  dashboardId: SyncedDashboardId;
}

class StateSyncService {
  private subscribers: Map<string, StateSubscriber> = new Map();
  private eventSource: EventSource | null = null;
  private currentState: Map<SyncedDashboardId, DashboardState> = new Map();

  /**
   * Get the correct backend URL based on the environment
   * - localhost for PC development
   * - PC IP address for mobile devices on same network
   */
  private getBackendUrl(): string {
    // Check if we're on mobile by looking at user agent and screen size
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
                     || (window.innerWidth <= 768 && window.innerHeight <= 1024);

    // Check if we're accessing via IP (QR code) instead of localhost
    const isAccessedViaIP = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';

    if (isMobile || isAccessedViaIP) {
      // For mobile or IP access, try to detect PC's IP from current URL or use fallback
      const currentHost = window.location.hostname;

      // If already accessed via IP, use that IP
      if (currentHost !== 'localhost' && currentHost !== '127.0.0.1') {
        return `http://${currentHost}:8080`;
      }

      // Fallback to detected PC IP (you may need to update this)
      return 'http://192.168.70.110:8080';
    }

    // Default for PC development
    return 'http://localhost:8080';
  }

  /**
   * Broadcast state change to all connected devices
   */
  broadcast(state: DashboardState) {
    console.log('Broadcasting state:', state);

    // Update local state
    this.currentState.set(state.dashboard, state);

    // Send to backend SSE service for mobile distribution (C++ server on port 8080)
    const backendUrl = this.getBackendUrl();
    fetch(`${backendUrl}/api/state-sync/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(state),
    }).catch(error => {
      console.warn('Failed to broadcast state to backend:', error);
    });

    // Notify local subscribers (for testing)
    this.subscribers.forEach(subscriber => {
      if (subscriber.dashboardId === state.dashboard) {
        subscriber.callback(state);
      }
    });
  }

  /**
   * Subscribe to state changes for mobile dashboards
   */
  subscribe(dashboardId: SyncedDashboardId, callback: (state: DashboardState) => void): string {
    const id = `${dashboardId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    this.subscribers.set(id, {
      id,
      callback,
      dashboardId,
    });

    // Send current state if available
    const currentState = this.currentState.get(dashboardId);
    if (currentState) {
      setTimeout(() => callback(currentState), 100);
    }

    console.log(`Subscribed to ${dashboardId} state sync:`, id);
    return id;
  }

  /**
   * Unsubscribe from state changes
   */
  unsubscribe(subscriptionId: string) {
    this.subscribers.delete(subscriptionId);
    console.log('Unsubscribed from state sync:', subscriptionId);
  }

  /**
   * Connect to SSE stream for mobile devices to receive state updates
   */
  connectSSE(dashboardId: SyncedDashboardId): EventSource {
    if (this.eventSource) {
      this.eventSource.close();
    }

    // Connect to backend SSE endpoint for state sync (C++ server on port 8080)
    const backendUrl = this.getBackendUrl();
    this.eventSource = new EventSource(`${backendUrl}/api/state-sync/${dashboardId}`);

    this.eventSource.onmessage = (event) => {
      try {
        const state: DashboardState = JSON.parse(event.data);
        console.log('Received SSE state update:', state);

        // Update local state and notify subscribers
        this.currentState.set(state.dashboard, state);
        this.subscribers.forEach(subscriber => {
          if (subscriber.dashboardId === state.dashboard) {
            subscriber.callback(state);
          }
        });
      } catch (error) {
        console.error('Failed to parse SSE state data:', error);
      }
    };

    this.eventSource.onerror = (error) => {
      console.error('State sync SSE error:', error);
    };

    return this.eventSource;
  }

  /**
   * Disconnect SSE stream
   */
  disconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  /**
   * Get current state for a dashboard
   */
  getCurrentState(dashboardId: SyncedDashboardId): DashboardState | null {
    return this.currentState.get(dashboardId) || null;
  }

  /**
   * Clear all state
   */
  clear() {
    this.currentState.clear();
    this.subscribers.clear();
    this.disconnect();
  }
}

// Export singleton instance
export const stateSync = new StateSyncService();

/**
 * React hook for mobile dashboards to sync with PC state
 */
export function useSyncedState(dashboardId: SyncedDashboardId) {
  const [state, setState] = useState<DashboardState | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    console.log(`Setting up state sync for ${dashboardId}`);

    // Subscribe to state changes
    const subscriptionId = stateSync.subscribe(dashboardId, (newState) => {
      setState(newState);
      setIsConnected(true);
    });

    // Connect to SSE stream for real-time updates
    const eventSource = stateSync.connectSSE(dashboardId);

    eventSource.onopen = () => {
      setIsConnected(true);
      console.log(`Connected to ${dashboardId} state sync`);
    };

    eventSource.onerror = () => {
      setIsConnected(false);
    };

    // Cleanup
    return () => {
      stateSync.unsubscribe(subscriptionId);
      setIsConnected(false);
    };
  }, [dashboardId]);

  return { state, isConnected };
}
