import { F1Analysis } from './analysis_engine';
import { TelemetryData } from '../types/telemetry';

export interface SessionRecording {
  id: string;
  name: string;
  sessionType: 'Practice 1' | 'Practice 2' | 'Practice 3' | 'Qualifying' | 'Sprint' | 'Race';
  track: string;
  game: string;
  startTime: Date;
  endTime?: Date;
  duration: number; // in seconds
  totalLaps: number;
  bestLapTime: number;
  telemetryData: TelemetryData[];
  analysis: F1Analysis;
  metadata: {
    weather: string;
    car: string;
    setup?: string;
    notes?: string;
  };
}

export interface SessionSummary {
  id: string;
  name: string;
  sessionType: string;
  track: string;
  game: string;
  date: Date;
  duration: number;
  totalLaps: number;
  bestLapTime: number;
  size: number; // in KB
}

class SessionStorageService {
  private isRecording = false;
  private currentRecording: Partial<SessionRecording> | null = null;
  private lastStoredData: TelemetryData | null = null;

  // No initialization needed for localStorage approach

  /**
   * Start recording a new session
   */
  startRecording(sessionInfo: {
    name: string;
    sessionType: SessionRecording['sessionType'];
    track: string;
    game: string;
    weather: string;
    car: string;
  }): string {
    if (this.isRecording) {
      throw new Error('Already recording a session');
    }

    const sessionId = this.generateSessionId(sessionInfo);
    
    this.currentRecording = {
      id: sessionId,
      name: sessionInfo.name,
      sessionType: sessionInfo.sessionType,
      track: sessionInfo.track,
      game: sessionInfo.game,
      startTime: new Date(),
      duration: 0,
      totalLaps: 0,
      bestLapTime: 0,
      telemetryData: [],
      metadata: {
        weather: sessionInfo.weather,
        car: sessionInfo.car,
        notes: ''
      }
    };

    this.isRecording = true;
    this.lastStoredData = null; // Reset for new session
    console.log('🎬 Started recording session:', sessionId);
    
    return sessionId;
  }

  /**
   * Add telemetry data point to current recording
   * Optimized storage - only store every 10th data point to reduce file size
   */
  addTelemetryData(data: TelemetryData): void {
    if (!this.isRecording || !this.currentRecording) {
      return;
    }

    try {
      // Update session stats in real-time
      if (data.last_lap_time > 0 && ((this.currentRecording.bestLapTime || 0) === 0 || data.last_lap_time < (this.currentRecording.bestLapTime || 0))) {
        this.currentRecording.bestLapTime = data.last_lap_time;
      }
      
      if (data.current_lap_num > (this.currentRecording.totalLaps || 0)) {
        this.currentRecording.totalLaps = data.current_lap_num;
      }

      // Update duration
      if (this.currentRecording.startTime) {
        this.currentRecording.duration = (Date.now() - this.currentRecording.startTime.getTime()) / 1000;
      }
      
      // Store telemetry data with throttling to reduce file size
      if (!this.currentRecording.telemetryData) {
        this.currentRecording.telemetryData = [];
      }
      
      // Only store every 10th data point (~6Hz instead of 60Hz) to reduce file size
      // Still store key moments: sector changes, lap changes, significant speed changes
      const shouldStore = (
        this.currentRecording.telemetryData.length % 10 === 0 || // Every 10th point
        data.current_sector !== this.lastStoredData?.current_sector || // Sector change
        data.current_lap_num !== this.lastStoredData?.current_lap_num || // Lap change
        Math.abs(data.speed_kph- (this.lastStoredData?.speed_kph|| 0)) > 20 || // Significant speed change
        data.pit_status !== this.lastStoredData?.pit_status // Pit status change
      );
      
      if (shouldStore) {
        this.currentRecording.telemetryData.push(data);
        this.lastStoredData = data;
      }
      
    } catch (error) {
      console.warn('Error processing telemetry data:', error);
    }
  }

  /**
   * Stop recording and save session as JSON file
   */
  async stopRecording(analysis: F1Analysis): Promise<SessionRecording> {
    if (!this.isRecording || !this.currentRecording) {
      throw new Error('No active recording');
    }

    this.currentRecording.endTime = new Date();
    this.currentRecording.analysis = analysis;
    
    const completedSession = this.currentRecording as SessionRecording;
    
    try {
      // Save session as JSON file
      await this.saveSessionToFile(completedSession);
      console.log('💾 Session saved to JSON file:', completedSession.id);
    } catch (error) {
      console.error('Failed to save session to file:', error);
      // Continue anyway - session is still in memory
    }
    
    // Reset recording state
    this.isRecording = false;
    this.currentRecording = null;
    
    console.log('🛑 Stopped recording session:', completedSession.id);
    return completedSession;
  }

  /**
   * Get all session summaries from JSON files
   */
  async getAllSessionSummaries(): Promise<SessionSummary[]> {
    try {
      // In a browser environment, we'll use localStorage to track session metadata
      // In Electron, this could be enhanced to read actual files from disk
      const savedSessions = localStorage.getItem('atlas_session_summaries');
      if (!savedSessions) {
        return [];
      }
      
      const summaries: SessionSummary[] = JSON.parse(savedSessions);
      
      // Sort by date, newest first
      return summaries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    } catch (error) {
      console.error('Failed to load session summaries:', error);
      return [];
    }
  }

  /**
   * Load full session data from JSON file
   * Note: Sessions are now saved as downloaded files, so this prompts user to upload
   */
  async loadSession(sessionId: string): Promise<SessionRecording | null> {
    try {
      console.warn('Sessions are now saved as downloaded JSON files.');
      console.warn('To load a session for analysis, use the import function instead.');
      
      // Return null to indicate session needs to be imported from file
      return null;
    } catch (error) {
      console.error('Failed to load session:', error);
      return null;
    }
  }

  /**
   * Delete a session from JSON storage
   */
  async deleteSession(sessionId: string): Promise<void> {
    try {
      // Remove session data
      const sessionKey = `atlas_session_${sessionId}`;
      localStorage.removeItem(sessionKey);
      
      // Update session summaries list
      const savedSessions = localStorage.getItem('atlas_session_summaries');
      if (savedSessions) {
        const summaries: SessionSummary[] = JSON.parse(savedSessions);
        const updatedSummaries = summaries.filter(summary => summary.id !== sessionId);
        localStorage.setItem('atlas_session_summaries', JSON.stringify(updatedSummaries));
      }
      
      console.log('🗑️ Session deleted:', sessionId);
    } catch (error) {
      console.error('Failed to delete session:', error);
      throw error;
    }
  }

  /**
   * Export session to file (for download)
   */
  async exportSession(sessionId: string): Promise<Blob> {
    const session = await this.loadSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const data = JSON.stringify(session, null, 2);
    return new Blob([data], { type: 'application/json' });
  }

  /**
   * Import session from file for permanent storage
   */
  async importSession(file: File): Promise<SessionRecording> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = e.target?.result as string;
          const session: SessionRecording = JSON.parse(data);
          
          // Validate session structure
          if (!session.name || !session.telemetryData) {
            throw new Error('Invalid session file format');
          }
          
          // Convert date strings back to Date objects
          session.startTime = new Date(session.startTime);
          if (session.endTime) {
            session.endTime = new Date(session.endTime);
          }
          
          // Generate new ID to avoid conflicts
          const newSessionId = this.generateSessionId({
            name: session.name,
            sessionType: session.sessionType,
            track: session.track,
            game: session.game,
            weather: session.metadata.weather,
            car: session.metadata.car
          });
          session.id = newSessionId;
          
          // Save imported session
          await this.saveSessionToFile(session);
          
          console.log('📥 Session imported:', newSessionId);
          resolve(session);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }

  /**
   * Load session from file for analysis (without saving)
   */
  async loadSessionFromFile(file: File): Promise<SessionRecording> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = e.target?.result as string;
          const session: SessionRecording = JSON.parse(data);
          
          // Validate session structure
          if (!session.name || !session.telemetryData) {
            throw new Error('Invalid session file format');
          }
          
          // Convert date strings back to Date objects
          session.startTime = new Date(session.startTime);
          if (session.endTime) {
            session.endTime = new Date(session.endTime);
          }
          
          console.log('📄 Session loaded for analysis:', session.name);
          resolve(session);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }

  /**
   * Get current recording status
   */
  getRecordingStatus(): { isRecording: boolean; sessionId?: string; duration?: number } {
    return {
      isRecording: this.isRecording,
      sessionId: this.currentRecording?.id,
      duration: this.currentRecording?.duration
    };
  }

  /**
   * Get storage usage info
   */
  async getStorageInfo(): Promise<{ totalSessions: number; totalSizeKB: number; availableSpaceKB: number }> {
    try {
      const sessions = await this.getAllSessionSummaries();
      
      // Calculate actual storage usage from localStorage
      let totalSizeKB = 0;
      for (const session of sessions) {
        try {
          const sessionData = localStorage.getItem(`atlas_session_${session.id}`);
          if (sessionData) {
            totalSizeKB += Math.ceil(sessionData.length / 1024); // Convert to KB
          }
        } catch (error) {
          console.warn('Failed to calculate size for session:', session.id);
        }
      }
      
      // localStorage typical limit is 5-10MB per origin
      const maxStorageKB = 5 * 1024; // 5MB conservative estimate
      const availableSpaceKB = Math.max(0, maxStorageKB - totalSizeKB);
      
      return {
        totalSessions: sessions.length,
        totalSizeKB,
        availableSpaceKB
      };
    } catch (error) {
      console.error('Failed to get storage info:', error);
      return {
        totalSessions: 0,
        totalSizeKB: 0,
        availableSpaceKB: 5 * 1024 // 5MB default
      };
    }
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(sessionInfo: {
    name: string;
    sessionType: string;
    track: string;
    game: string;
    weather: string;
    car: string;
  }): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `session_${timestamp}_${random}`;
  }

  /**
   * Save session to JSON file - triggers browser download to save as actual file
   */
  private async saveSessionToFile(session: SessionRecording): Promise<void> {
    try {
      // Create JSON data
      const jsonData = JSON.stringify(session, null, 2);
      const sessionSize = Math.ceil(jsonData.length / 1024); // Size in KB
      
      // Create downloadable file
      const blob = new Blob([jsonData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      // Create download link
      const downloadLink = document.createElement('a');
      downloadLink.href = url;
      downloadLink.download = `${session.name.replace(/[^a-z0-9]/gi, '_')}_${session.id}.json`;
      
      // Trigger download
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      
      // Clean up the URL
      URL.revokeObjectURL(url);
      
      // Store only session summary in localStorage (small data)
      const summary: SessionSummary = {
        id: session.id,
        name: session.name,
        sessionType: session.sessionType,
        track: session.track,
        game: session.game,
        date: session.startTime,
        duration: session.duration,
        totalLaps: session.totalLaps,
        bestLapTime: session.bestLapTime,
        size: sessionSize
      };
      
      // Update session summaries list (only metadata, not full data)
      const existingSummaries = await this.getAllSessionSummaries();
      const updatedSummaries = [...existingSummaries.filter(s => s.id !== session.id), summary];
      localStorage.setItem('atlas_session_summaries', JSON.stringify(updatedSummaries));
      
      console.log(`📁 Session file downloaded: ${downloadLink.download} (${sessionSize} KB)`);
      
    } catch (error) {
      console.error('Failed to save session to file:', error);
      throw error;
    }
  }
}

export const sessionStorage = new SessionStorageService();