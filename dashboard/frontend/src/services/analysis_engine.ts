import { TelemetryData } from '../types/telemetry';

// Analysis data structures
export interface LapAnalysis {
  lapNumber: number;
  lapTime: number;
  sector1Time: number;
  sector2Time: number;
  sector3Time: number;
  isValid: boolean;
  timestamp: number;
  averageSpeed: number;
  maxSpeed: number;
  fuelUsed: number;
  tyreCompound: string;
  tyreAge: number;
  averageTyreTemp: number;
  maxTyreTemp: number;
}

export interface SectorComparison {
  sector1Delta: number;
  sector2Delta: number;
  sector3Delta: number;
  lapTimeDelta: number;
  comparison: 'personal_best' | 'session_best' | 'previous_lap';
}

export interface TyreAnalysis {
  currentTemps: {
    frontLeft: number;
    frontRight: number;
    rearLeft: number;
    rearRight: number;
  };
  averageTemp: number;
  maxTemp: number;
  optimalRange: { min: number; max: number };
  degradationRate: number; // temp increase per lap
  wearEstimate: number; // 0-100%
  compound: string;
  age: number;
  isOverheating: boolean;
  isUnderheating: boolean;
}

export interface InputPattern {
  timestamp: number;
  throttle: number;  // 0-100 percentage
  brake: number;     // 0-100 percentage
  gear: number;
  speed: number;     // km/h
  lapDistance: number;
}

export interface InputAnalysis {
  patterns: InputPattern[];
  smoothness: {
    throttle: number; // 0-1, higher = smoother
    brake: number;
    overall: number;
  };
  efficiency: {
    throttleApplication: number; // % of optimal throttle application
    brakeEfficiency: number; // brake pressure vs speed reduction
    gearChangeOptimality: number; // timing of gear changes
  };
  lockupEvents: LockupEvent[];
  spinEvents: SpinEvent[];
}

export interface LockupEvent {
  timestamp: number;
  lapDistance: number;
  severity: number; // 0-1
  corner: string; // estimated corner name
  speedLoss: number; // km/h lost due to lockup
}

export interface SpinEvent {
  timestamp: number;
  lapDistance: number;
  severity: number; // 0-1
  cause: 'throttle' | 'brake' | 'steering';
  speedLoss: number;
}

export interface F1Analysis {
  currentLap: LapAnalysis | null;
  previousLap: LapAnalysis | null;
  personalBest: LapAnalysis | null;
  sessionBest: LapAnalysis | null;
  sectorComparison: SectorComparison | null;
  tyreAnalysis: TyreAnalysis;
  inputAnalysis: InputAnalysis;
  lapHistory: LapAnalysis[];
  sessionStats: {
    totalLaps: number;
    averageLapTime: number;
    bestLapTime: number;
    consistencyRating: number; // 0-1
    improvementRate: number; // seconds per lap improvement trend
  };
}

export class F1AnalysisEngine {
  private telemetryHistory: TelemetryData[] = [];
  private lapHistory: LapAnalysis[] = [];
  private currentLapData: TelemetryData[] = [];
  private personalBest: LapAnalysis | null = null;
  private sessionBest: LapAnalysis | null = null;
  private lastLapNumber = 0;
  private inputPatterns: InputPattern[] = [];
  private lockupEvents: LockupEvent[] = [];
  private spinEvents: SpinEvent[] = [];

  // Batch processing interval (1 second for smoother updates)
  private lastBatchUpdate = 0;
  private readonly BATCH_INTERVAL = 1000; // 1 second
  
  // Continuous graph data buffer
  private continuousInputBuffer: InputPattern[] = [];
  private readonly MAX_CONTINUOUS_BUFFER = 2000; // Increased buffer size
  private readonly GRAPH_DISPLAY_POINTS = 200; // Points to show in graph

  // Tyre compound optimal temperatures
  private readonly TYRE_OPTIMAL_TEMPS = {
    'Soft': { min: 90, max: 110 },
    'Medium': { min: 85, max: 105 },
    'Hard': { min: 80, max: 100 },
    'Intermediate': { min: 70, max: 90 },
    'Wet': { min: 50, max: 80 }
  };

  constructor() {
    console.log('🏁 F1 Analysis Engine initialized');
  }

  /**
   * Main analysis update - processes telemetry data
   * Uses batch processing every 5 seconds to avoid interfering with live telemetry
   */
  updateAnalysis(telemetry: TelemetryData): F1Analysis {
    // Always add to history for live data
    this.telemetryHistory.push(telemetry);
    this.currentLapData.push(telemetry);
    
    // Keep history manageable
    if (this.telemetryHistory.length > 5000) {
      this.telemetryHistory = this.telemetryHistory.slice(-5000);
    }

    // Detect lap completion - fixed to include lap 1
    if (telemetry.current_lap_num > this.lastLapNumber && this.lastLapNumber >= 0) {
      // Only process if we actually have data for the completed lap
      if (this.currentLapData.length > 0) {
        this.processCompletedLap();
      }
    }
    this.lastLapNumber = telemetry.current_lap_num;

    // Batch processing every 5 seconds
    const now = Date.now();
    if (now - this.lastBatchUpdate >= this.BATCH_INTERVAL) {
      this.lastBatchUpdate = now;
      this.performBatchAnalysis();
    }

    return this.generateAnalysis(telemetry);
  }

  /**
   * Process completed lap when lap number increases
   */
  private processCompletedLap(): void {
    if (this.currentLapData.length === 0) return;

    console.log('🏁 Processing completed lap', this.lastLapNumber);

    const lapAnalysis = this.analyzeLap(this.currentLapData);
    if (lapAnalysis) {
      this.lapHistory.push(lapAnalysis);
      
      // Update personal best
      if (!this.personalBest || lapAnalysis.lapTime < this.personalBest.lapTime) {
        this.personalBest = { ...lapAnalysis };
        console.log('🚀 New personal best!', this.formatTime(lapAnalysis.lapTime));
      }

      // Update session best (simplified - in real implementation would compare with all drivers)
      if (!this.sessionBest || lapAnalysis.lapTime < this.sessionBest.lapTime) {
        this.sessionBest = { ...lapAnalysis };
      }
    }

    // Reset for next lap
    this.currentLapData = [];
  }

  /**
   * Batch analysis processing - runs every 5 seconds
   */
  private performBatchAnalysis(): void {
    if (this.telemetryHistory.length === 0) return;

    console.log('📊 Performing batch analysis...');

    // Update input patterns
    this.updateInputPatterns();
    
    // Detect lockups and spins
    this.detectEvents();
    
    // Update tyre degradation analysis
    this.updateTyreDegradation();
  }

  /**
   * Analyze a completed lap from telemetry data
   */
  private analyzeLap(lapData: TelemetryData[]): LapAnalysis | null {
    if (lapData.length === 0) return null;

    const lastPoint = lapData[lapData.length - 1];
    
    // Calculate averages
    const averageSpeed = lapData.reduce((sum, d) => sum + d.speed_kph, 0) / lapData.length;
    const maxSpeed = Math.max(...lapData.map(d => d.speed_kph));
    const maxTyreTemp = Math.max(...(lastPoint.tire_temps?.surface || [0]));
    const averageTyreTemp = (lastPoint.tire_temps?.surface || [0]).reduce((a, b) => a + b, 0) / 4;

    // Estimate fuel used (simplified calculation)
    const fuelUsed = lapData.length > 0 ? 
      (lapData[0].fuel_in_tank || 0) - (lastPoint.fuel_in_tank || 0) : 0;

    return {
      lapNumber: lastPoint.current_lap_num,
      lapTime: lastPoint.last_lap_time,
      sector1Time: lastPoint.sector1_time,
      sector2Time: lastPoint.sector2_time,
      sector3Time: (lastPoint.sector3_time || 0) * 1000, // Convert from seconds to milliseconds
      isValid: lastPoint.last_lap_time > 0,
      timestamp: Date.now(),
      averageSpeed,
      maxSpeed,
      fuelUsed,
      tyreCompound: lastPoint.tire_compound || 'Unknown',
      tyreAge: lastPoint.tire_age_laps || 0,
      averageTyreTemp,
      maxTyreTemp
    };
  }

  /**
   * Update input patterns for smoothness analysis - now with continuous buffering
   */
  private updateInputPatterns(): void {
    if (this.telemetryHistory.length === 0) return;
    
    // Get the latest data point to avoid duplicates
    const latestData = this.telemetryHistory[this.telemetryHistory.length - 1];
    
    // Check if this timestamp is already in our buffer
    const lastBufferTimestamp = this.continuousInputBuffer.length > 0 
      ? this.continuousInputBuffer[this.continuousInputBuffer.length - 1].timestamp 
      : 0;
    
    if (latestData.timestamp > lastBufferTimestamp) {
      const newPattern: InputPattern = {
        timestamp: latestData.timestamp,
        throttle: latestData.throttle_percent,  // Already in percentage
        brake: latestData.brake_percent,        // Already in percentage
        gear: latestData.gear,
        speed: latestData.speed_kph,           // km/h
        lapDistance: latestData.lap_distance || 0
      };
      
      // Add to continuous buffer
      this.continuousInputBuffer.push(newPattern);
      
      // Also add to legacy patterns for compatibility
      this.inputPatterns.push(newPattern);
    }

    // Manage buffer sizes with smooth transitions
    if (this.continuousInputBuffer.length > this.MAX_CONTINUOUS_BUFFER) {
      // Remove oldest 25% to maintain continuity while preventing memory issues
      const removeCount = Math.floor(this.MAX_CONTINUOUS_BUFFER * 0.25);
      this.continuousInputBuffer = this.continuousInputBuffer.slice(removeCount);
    }

    // Keep legacy patterns for other analysis (smaller buffer)
    if (this.inputPatterns.length > 1000) {
      const removeCount = Math.floor(1000 * 0.25);
      this.inputPatterns = this.inputPatterns.slice(removeCount);
    }
  }

  /**
   * Detect lockup and spin events
   */
  private detectEvents(): void {
    if (this.telemetryHistory.length < 10) return;

    const recent = this.telemetryHistory.slice(-10);
    
    // Simple lockup detection: heavy braking with speed loss
    for (let i = 1; i < recent.length; i++) {
      const current = recent[i];
      const previous = recent[i - 1];
      
      const speedDrop = previous.speed_kph - current.speed_kph;
      const brakeApplication = current.brake_percent;
      
      // Lockup: high brake pressure + sudden speed drop
      if (brakeApplication > 80 && speedDrop > 5) {
        const severity = Math.min(speedDrop / 20, 1); // Normalize to 0-1
        
        this.lockupEvents.push({
          timestamp: current.timestamp,
          lapDistance: current.lap_distance || 0,
          severity,
          corner: this.estimateCorner(current.lap_distance || 0),
          speedLoss: speedDrop
        });
      }

      // Spin detection: sudden speed drop with low throttle/high throttle
      if ((current.throttle_percent > 70 && speedDrop > 10) || (current.brake_percent < 20 && speedDrop > 15)) {
        const severity = Math.min(speedDrop / 30, 1);
        
        this.spinEvents.push({
          timestamp: current.timestamp,
          lapDistance: current.lap_distance || 0,
          severity,
          cause: current.throttle_percent > 70 ? 'throttle' : 'steering',
          speedLoss: speedDrop
        });
      }
    }

    // Keep only recent events (last 50 per type)
    this.lockupEvents = this.lockupEvents.slice(-50);
    this.spinEvents = this.spinEvents.slice(-50);
  }

  /**
   * Estimate corner name based on lap distance (simplified)
   */
  private estimateCorner(lapDistance: number): string {
    // This would be track-specific in a real implementation
    const progress = lapDistance % 1000; // Simplified
    if (progress < 200) return 'Turn 1';
    if (progress < 400) return 'Turn 2-3';
    if (progress < 600) return 'Turn 4-5';
    if (progress < 800) return 'Turn 6-7';
    return 'Final Sector';
  }

  /**
   * Update tyre degradation analysis
   */
  private updateTyreDegradation(): void {
    // Will be implemented with more sophisticated degradation tracking
  }

  /**
   * Generate complete analysis object
   */
  private generateAnalysis(currentTelemetry: TelemetryData): F1Analysis {
    const tyreAnalysis = this.analyzeTyres(currentTelemetry);
    const inputAnalysis = this.analyzeInputs();
    const sectorComparison = this.generateSectorComparison();

    return {
      currentLap: this.getCurrentLapAnalysis(currentTelemetry),
      previousLap: this.lapHistory.length > 0 ? this.lapHistory[this.lapHistory.length - 1] : null,
      personalBest: this.personalBest,
      sessionBest: this.sessionBest,
      sectorComparison,
      tyreAnalysis,
      inputAnalysis,
      lapHistory: [...this.lapHistory],
      sessionStats: this.calculateSessionStats()
    };
  }

  /**
   * Analyze current tyre condition
   */
  private analyzeTyres(telemetry: TelemetryData): TyreAnalysis {
    const temps = telemetry.tire_temps?.surface || [0, 0, 0, 0];
    const compound = telemetry.tire_compound || 'Medium';
    const age = telemetry.tire_age_laps || 0;
    
    const averageTemp = temps.reduce((a, b) => a + b, 0) / 4;
    const maxTemp = Math.max(...temps);
    
    const optimalRange = this.TYRE_OPTIMAL_TEMPS[compound as keyof typeof this.TYRE_OPTIMAL_TEMPS] 
      || this.TYRE_OPTIMAL_TEMPS.Medium;

    // Simple degradation rate based on temperature and age
    const degradationRate = Math.max(0, (averageTemp - optimalRange.max) * 0.1);
    
    // Wear estimate based on age and temperature history
    const wearEstimate = Math.min(100, age * 2 + (averageTemp > optimalRange.max ? age * 0.5 : 0));

    return {
      currentTemps: {
        frontLeft: temps[0] || 0,
        frontRight: temps[1] || 0,
        rearLeft: temps[2] || 0,
        rearRight: temps[3] || 0
      },
      averageTemp,
      maxTemp,
      optimalRange,
      degradationRate,
      wearEstimate,
      compound,
      age,
      isOverheating: maxTemp > optimalRange.max + 5,
      isUnderheating: averageTemp < optimalRange.min - 5
    };
  }

  /**
   * Analyze input patterns for smoothness and efficiency
   */
  private analyzeInputs(): InputAnalysis {
    if (this.inputPatterns.length < 10) {
      return {
        patterns: [],
        smoothness: { throttle: 0, brake: 0, overall: 0 },
        efficiency: { throttleApplication: 0, brakeEfficiency: 0, gearChangeOptimality: 0 },
        lockupEvents: [],
        spinEvents: []
      };
    }

    // Calculate smoothness (lower variation = smoother)
    const recent = this.inputPatterns.slice(-100);
    const throttleVariation = this.calculateVariation(recent.map(p => p.throttle));
    const brakeVariation = this.calculateVariation(recent.map(p => p.brake));
    
    const throttleSmoothness = Math.max(0, 1 - throttleVariation / 50);
    const brakeSmoothness = Math.max(0, 1 - brakeVariation / 50);

    return {
      patterns: this.getContinuousGraphData(), // Use continuous buffer for smooth graphs
      smoothness: {
        throttle: throttleSmoothness,
        brake: brakeSmoothness,
        overall: (throttleSmoothness + brakeSmoothness) / 2
      },
      efficiency: {
        throttleApplication: 0.8, // Placeholder
        brakeEfficiency: 0.7,     // Placeholder
        gearChangeOptimality: 0.9 // Placeholder
      },
      lockupEvents: [...this.lockupEvents],
      spinEvents: [...this.spinEvents]
    };
  }

  /**
   * Get continuous graph data with smooth transitions
   */
  private getContinuousGraphData(): InputPattern[] {
    if (this.continuousInputBuffer.length === 0) {
      return [];
    }

    // Get the most recent points for display, ensuring smooth transitions
    const displayPoints = Math.min(this.GRAPH_DISPLAY_POINTS, this.continuousInputBuffer.length);
    const startIndex = Math.max(0, this.continuousInputBuffer.length - displayPoints);
    
    return this.continuousInputBuffer.slice(startIndex);
  }

  /**
   * Calculate variation in a data series
   */
  private calculateVariation(data: number[]): number {
    if (data.length < 2) return 0;
    
    const mean = data.reduce((a, b) => a + b, 0) / data.length;
    const variance = data.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / data.length;
    return Math.sqrt(variance);
  }

  /**
   * Generate sector comparison
   */
  private generateSectorComparison(): SectorComparison {
    if (!this.personalBest) {
      return {
        sector1Delta: 0,
        sector2Delta: 0,
        sector3Delta: 0,
        lapTimeDelta: 0,
        comparison: 'personal_best'
      };
    }

    const currentLap = this.getCurrentLapFromTelemetry();
    if (!currentLap) {
      return {
        sector1Delta: 0,
        sector2Delta: 0,
        sector3Delta: 0,
        lapTimeDelta: 0,
        comparison: 'personal_best'
      };
    }

    return {
      sector1Delta: currentLap.sector1Time - this.personalBest.sector1Time,
      sector2Delta: currentLap.sector2Time - this.personalBest.sector2Time,
      sector3Delta: 0, // Placeholder
      lapTimeDelta: currentLap.lapTime - this.personalBest.lapTime,
      comparison: 'personal_best'
    };
  }

  /**
   * Get current lap analysis from live telemetry
   */
  private getCurrentLapAnalysis(telemetry: TelemetryData): LapAnalysis | null {
    if (this.currentLapData.length === 0) return null;

    const averageSpeed = this.currentLapData.reduce((sum, d) => sum + d.speed_kph, 0) / this.currentLapData.length;
    const maxSpeed = Math.max(...this.currentLapData.map(d => d.speed_kph));
    const temps = telemetry.tire_temps?.surface || [0, 0, 0, 0];
    const averageTyreTemp = temps.reduce((a, b) => a + b, 0) / 4;

    return {
      lapNumber: telemetry.current_lap_num,
      lapTime: telemetry.current_lap_time,
      sector1Time: telemetry.sector1_time,
      sector2Time: telemetry.sector2_time,
      sector3Time: (telemetry.sector3_time || 0) * 1000,
      isValid: true,
      timestamp: Date.now(),
      averageSpeed,
      maxSpeed,
      fuelUsed: 0,
      tyreCompound: telemetry.tire_compound || 'Unknown',
      tyreAge: telemetry.tire_age_laps || 0,
      averageTyreTemp,
      maxTyreTemp: Math.max(...temps)
    };
  }

  /**
   * Get current lap from telemetry for comparisons
   */
  private getCurrentLapFromTelemetry(): { sector1Time: number; sector2Time: number; lapTime: number } | null {
    if (this.telemetryHistory.length === 0) return null;
    
    const latest = this.telemetryHistory[this.telemetryHistory.length - 1];
    return {
      sector1Time: latest.sector1_time,
      sector2Time: latest.sector2_time,
      lapTime: latest.current_lap_time
    };
  }

  /**
   * Calculate session statistics
   */
  private calculateSessionStats() {
    if (this.lapHistory.length === 0) {
      return {
        totalLaps: 0,
        averageLapTime: 0,
        bestLapTime: 0,
        consistencyRating: 0,
        improvementRate: 0
      };
    }

    const validLaps = this.lapHistory.filter(lap => lap.isValid && lap.lapTime > 0);
    const lapTimes = validLaps.map(lap => lap.lapTime);
    
    const totalLaps = validLaps.length;
    const averageLapTime = lapTimes.reduce((a, b) => a + b, 0) / totalLaps;
    const bestLapTime = Math.min(...lapTimes);
    
    // Consistency: lower standard deviation = more consistent
    const variance = lapTimes.reduce((sum, time) => sum + Math.pow(time - averageLapTime, 2), 0) / totalLaps;
    const stdDev = Math.sqrt(variance);
    const consistencyRating = Math.max(0, 1 - (stdDev / averageLapTime));

    // Improvement rate: trend analysis (simplified)
    const improvementRate = totalLaps > 3 ? 
      (lapTimes[totalLaps - 1] - lapTimes[0]) / totalLaps : 0;

    return {
      totalLaps,
      averageLapTime,
      bestLapTime,
      consistencyRating,
      improvementRate
    };
  }

  /**
   * Format time in MM:SS.mmm format
   */
  private formatTime(timeInSeconds: number): string {
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = (timeInSeconds % 60).toFixed(3);
    return `${minutes}:${seconds.padStart(6, '0')}`;
  }

  /**
   * Reset analysis data (e.g., for new session)
   */
  resetAnalysis(): void {
    console.log('🔄 Resetting analysis engine');
    this.telemetryHistory = [];
    this.lapHistory = [];
    this.currentLapData = [];
    this.personalBest = null;
    this.sessionBest = null;
    this.lastLapNumber = 0;
    this.inputPatterns = [];
    this.continuousInputBuffer = []; // Reset continuous buffer
    this.lockupEvents = [];
    this.spinEvents = [];
  }

  /**
   * Get analysis summary for AI context
   */
  getAnalysisSummary(): string {
    const analysis = this.generateAnalysis(this.telemetryHistory[this.telemetryHistory.length - 1] || {} as TelemetryData);
    
    let summary = `ANALYSIS SUMMARY:\n`;
    summary += `Session: ${analysis.sessionStats.totalLaps} laps completed\n`;
    
    if (analysis.personalBest) {
      summary += `Personal Best: ${this.formatTime(analysis.personalBest.lapTime)}\n`;
    }
    
    if (analysis.sectorComparison) {
      summary += `Current Pace: S1${analysis.sectorComparison.sector1Delta > 0 ? '+' : ''}${analysis.sectorComparison.sector1Delta.toFixed(3)}s `;
      summary += `S2${analysis.sectorComparison.sector2Delta > 0 ? '+' : ''}${analysis.sectorComparison.sector2Delta.toFixed(3)}s\n`;
    }
    
    summary += `Tyre Condition: ${analysis.tyreAnalysis.compound} (${analysis.tyreAnalysis.age} laps) `;
    summary += `Avg Temp: ${analysis.tyreAnalysis.averageTemp.toFixed(1)}°C\n`;
    
    if (analysis.inputAnalysis.lockupEvents.length > 0) {
      summary += `Recent Events: ${analysis.inputAnalysis.lockupEvents.length} lockups, ${analysis.inputAnalysis.spinEvents.length} spins\n`;
    }
    
    return summary;
  }
}