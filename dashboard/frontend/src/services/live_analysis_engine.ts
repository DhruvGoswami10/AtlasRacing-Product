import { TelemetryData, TyreSetsData, CarSetupData } from '../types/telemetry';
import { F1AnalysisEngine, F1Analysis } from './analysis_engine';

// Enhanced analysis data structures for Phase 7B
export interface PerformanceBaseline {
  bestSector1: number;
  bestSector2: number;
  bestSector3: number;
  bestLapTime: number;
  consistencyIndex: number; // 0-1, higher = more consistent
  tirePerformanceWindow: {
    optimalStartLap: number;
    optimalEndLap: number;
    peakPerformanceLap: number;
  };
  optimalRacePace: number;
  fuelConsumptionRate: number; // kg per lap
  lastUpdated: number;
}

export interface StrategyInsight {
  type: 'pit_window' | 'tire_degradation' | 'fuel_critical' | 'setup_issue' | 'pace_improvement';
  priority: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  confidence: number; // 0-100
  suggestedAction?: string;
  timeRelevant: boolean; // true if time-sensitive
  lapsRelevant?: number[]; // which laps this applies to
}

export interface RealTimePerformanceMetrics {
  currentPaceVsOptimal: number; // seconds delta
  tirePerformanceIndex: number; // 0-100, current tire performance
  fuelEfficiencyRating: number; // 0-100, fuel consumption efficiency
  setupPerformanceRating: number; // 0-100, how well setup suits current conditions
  racePaceConsistency: number; // 0-100, consistency over last 5 laps
  improvementPotential: number; // seconds potential improvement available
}

export interface AnalysisResult {
  insights: StrategyInsight[];
  performance: RealTimePerformanceMetrics;
  baseline: PerformanceBaseline;
  lapTrendPrediction: {
    nextLapPrediction: number;
    degradationTrend: 'improving' | 'stable' | 'degrading';
    recommendedStrategy: 'no-stop' | '1-stop' | '2-stop' | 'extend' | 'pit-now';
  };
  timestamp: number;
}

/**
 * Enhanced Live Analysis Engine for Phase 7B
 * Builds on top of existing F1AnalysisEngine with intelligent insights
 */
export class LiveAnalysisEngine {
  private baseEngine: F1AnalysisEngine;
  private performanceBaseline: PerformanceBaseline | null = null;
  private tyreSetsData: TyreSetsData | null = null;
  private carSetupData: CarSetupData | null = null;
  private analysisHistory: AnalysisResult[] = [];
  
  // Enhanced analysis buffers for mathematical models
  private recentLapTimes: number[] = []; // Last 10 laps for optimal calculation
  private last5LapTimes: number[] = []; // For regression analysis
  private tyrePerformanceHistory: number[] = []; // Last 3 tyre performance values for trend
  private sectorBaseline: { sector1: number, sector2: number, sector3: number } | null = null;
  
  // Analysis state
  private lastAnalysisTime = 0;
  private readonly ANALYSIS_INTERVAL = 2000; // Analyze every 2 seconds
  private sessionStartTime = Date.now();
  private readonly MAX_RECENT_LAPS = 10;
  private readonly REGRESSION_WINDOW = 5;

  constructor() {
    this.baseEngine = new F1AnalysisEngine();
    console.log('🧠 Live Analysis Engine initialized for Phase 7B');
  }

  /**
   * Main analysis update - enhanced with intelligent insights
   */
  updateAnalysis(telemetry: TelemetryData, tyreSets?: TyreSetsData, carSetup?: CarSetupData): AnalysisResult {
    // Update base analysis
    const baseAnalysis = this.baseEngine.updateAnalysis(telemetry);
    
    // Store additional data
    if (tyreSets) this.tyreSetsData = tyreSets;
    if (carSetup) this.carSetupData = carSetup;

    // ENHANCED: Update lap data buffers for mathematical models
    this.updateLapBuffers(baseAnalysis);

    // Only run enhanced analysis every 2 seconds
    const now = Date.now();
    if (now - this.lastAnalysisTime < this.ANALYSIS_INTERVAL) {
      // Return last analysis if too frequent
      return this.analysisHistory[this.analysisHistory.length - 1] || this.createEmptyAnalysis();
    }
    this.lastAnalysisTime = now;

    // Update performance baseline
    this.updatePerformanceBaseline(baseAnalysis);

    // Generate insights
    const insights = this.generateInsights(baseAnalysis, telemetry);
    
    // Calculate real-time performance metrics
    const performance = this.calculatePerformanceMetrics(baseAnalysis, telemetry);
    
    // Generate lap trend prediction
    const lapTrendPrediction = this.predictLapTrend(baseAnalysis);

    const result: AnalysisResult = {
      insights,
      performance,
      baseline: this.performanceBaseline!,
      lapTrendPrediction,
      timestamp: now
    };

    // Store analysis history (keep last 100 results)
    this.analysisHistory.push(result);
    if (this.analysisHistory.length > 100) {
      this.analysisHistory.shift();
    }

    return result;
  }

  /**
   * Update performance baseline with new data
   */
  private updatePerformanceBaseline(analysis: F1Analysis): void {
    if (!this.performanceBaseline) {
      this.performanceBaseline = {
        bestSector1: analysis.personalBest?.sector1Time || 999,
        bestSector2: analysis.personalBest?.sector2Time || 999,
        bestSector3: analysis.personalBest?.sector3Time || 999,
        bestLapTime: analysis.personalBest?.lapTime || 999,
        consistencyIndex: analysis.sessionStats.consistencyRating,
        tirePerformanceWindow: {
          optimalStartLap: 2,
          optimalEndLap: 15,
          peakPerformanceLap: 5
        },
        optimalRacePace: analysis.sessionStats.bestLapTime,
        fuelConsumptionRate: 2.5, // Default estimate
        lastUpdated: Date.now()
      };
    }

    // Update baseline with better data
    if (analysis.personalBest) {
      this.performanceBaseline.bestSector1 = Math.min(this.performanceBaseline.bestSector1, analysis.personalBest.sector1Time);
      this.performanceBaseline.bestSector2 = Math.min(this.performanceBaseline.bestSector2, analysis.personalBest.sector2Time);
      this.performanceBaseline.bestSector3 = Math.min(this.performanceBaseline.bestSector3, analysis.personalBest.sector3Time);
      this.performanceBaseline.bestLapTime = Math.min(this.performanceBaseline.bestLapTime, analysis.personalBest.lapTime);
    }

    this.performanceBaseline.consistencyIndex = analysis.sessionStats.consistencyRating;
    this.performanceBaseline.lastUpdated = Date.now();
  }

  /**
   * Generate intelligent insights based on analysis
   */
  private generateInsights(analysis: F1Analysis, telemetry: TelemetryData): StrategyInsight[] {
    const insights: StrategyInsight[] = [];

    // Tire degradation insights
    if (analysis.tyreAnalysis.isOverheating) {
      insights.push({
        type: 'tire_degradation',
        priority: 'high',
        message: `Tire overheating detected - ${analysis.tyreAnalysis.averageTemp.toFixed(1)}°C`,
        confidence: 85,
        suggestedAction: 'Reduce tire loading through corners or consider pit stop',
        timeRelevant: true
      });
    }

    // Fuel critical insights
    if (telemetry.fuel_remaining_laps && telemetry.fuel_remaining_laps < 5) {
      insights.push({
        type: 'fuel_critical',
        priority: 'critical',
        message: `Fuel critical - ${telemetry.fuel_remaining_laps.toFixed(1)} laps remaining`,
        confidence: 95,
        suggestedAction: 'Immediate fuel saving mode required',
        timeRelevant: true
      });
    }

    // Pace improvement insights
    if (analysis.sessionStats.improvementRate > 0.1) {
      insights.push({
        type: 'pace_improvement',
        priority: 'medium',
        message: `Positive pace trend - improving ${analysis.sessionStats.improvementRate.toFixed(2)}s per lap`,
        confidence: 70,
        timeRelevant: false
      });
    }

    // Pit window insights
    const currentLap = telemetry.current_lap_num || 1;
    const totalLaps = telemetry.total_laps || 50;
    const raceProgress = currentLap / totalLaps;
    
    if (raceProgress > 0.4 && raceProgress < 0.7 && analysis.tyreAnalysis.age > 10) {
      insights.push({
        type: 'pit_window',
        priority: 'medium',
        message: `Optimal pit window open - lap ${currentLap} of ${totalLaps}`,
        confidence: 80,
        suggestedAction: 'Consider pit stop for fresh tires',
        timeRelevant: true,
        lapsRelevant: [currentLap + 1, currentLap + 2, currentLap + 3]
      });
    }

    return insights;
  }

  /**
   * Calculate real-time performance metrics with enhanced mathematical models
   */
  private calculatePerformanceMetrics(analysis: F1Analysis, telemetry: TelemetryData): RealTimePerformanceMetrics {
    const currentLap = analysis.currentLap;
    const baseline = this.performanceBaseline;

    if (!currentLap || !baseline) {
      return this.createEmptyPerformanceMetrics();
    }

    // ENHANCED: Use sector-based pace vs optimal with real-time projection
    const currentPaceVsOptimal = this.calculateEnhancedPaceVsOptimal(telemetry, analysis);
    
    // ENHANCED: Use improved tyre performance index with linear penalties
    const tirePerformanceIndex = this.calculateEnhancedTyrePerformance(telemetry, analysis);

    // Fuel efficiency (higher is better)
    const fuelEfficiencyRating = Math.max(0, 100 - (currentLap.fuelUsed * 10));

    // ENHANCED: Use proper statistical consistency calculation
    const racePaceConsistency = this.calculateEnhancedConsistency();

    return {
      currentPaceVsOptimal,
      tirePerformanceIndex: Math.min(100, Math.max(0, tirePerformanceIndex)),
      fuelEfficiencyRating: Math.min(100, Math.max(0, fuelEfficiencyRating)),
      setupPerformanceRating: 75, // Placeholder - would need setup analysis
      racePaceConsistency: Math.min(100, Math.max(0, racePaceConsistency)),
      improvementPotential: Math.max(0, currentPaceVsOptimal) // How much time we're losing vs optimal
    };
  }

  /**
   * ENHANCED: Pace vs Optimal with sector-based extrapolation
   * Uses theoretical optimal lap as benchmark (sum of best sectors from last 10 laps)
   */
  private calculateEnhancedPaceVsOptimal(telemetry: TelemetryData, analysis: F1Analysis): number {
    if (!this.sectorBaseline || this.recentLapTimes.length < 2) {
      return analysis.currentLap ? analysis.currentLap.lapTime - (this.performanceBaseline?.bestLapTime || 90) : 0;
    }

    // Calculate optimal lap time (sum of best sectors)
    const optimalLapTime = this.sectorBaseline.sector1 + this.sectorBaseline.sector2 + this.sectorBaseline.sector3;

    // Current lap projection
    let projectedLapTime = 0;
    const sector1Time = telemetry.sector1_time || 0;
    const sector2Time = telemetry.sector2_time || 0;
    const currentSector = telemetry.current_sector || 1;
    
    if (currentSector === 1) {
      // Still in sector 1 - estimate full lap
      const avgSector1 = this.getAverageSectorTime(1);
      const sector1Ratio = sector1Time > 0 ? sector1Time / 1000 : 0;
      const remainingS1 = avgSector1 - sector1Ratio;
      projectedLapTime = sector1Ratio + remainingS1 + this.sectorBaseline.sector2 + this.sectorBaseline.sector3;
    } else if (currentSector === 2) {
      // Completed S1, in S2
      projectedLapTime = (sector1Time / 1000) + (sector2Time > 0 ? sector2Time / 1000 : this.sectorBaseline.sector2) + this.sectorBaseline.sector3;
    } else {
      // In S3 or completed lap
      const s1 = sector1Time / 1000;
      const s2 = sector2Time / 1000;
      const s3 = analysis.currentLap?.sector3Time || this.sectorBaseline.sector3;
      projectedLapTime = s1 + s2 + s3;
    }

    // Add tire wear adjustment
    const tyreWearAdj = this.getTyreWearAdjustment(telemetry);
    projectedLapTime += tyreWearAdj;

    return projectedLapTime - optimalLapTime;
  }

  /**
   * ENHANCED: Tyre Performance Index with linear penalties
   */
  private calculateEnhancedTyrePerformance(telemetry: TelemetryData, analysis: F1Analysis): number {
    const tyreData = analysis.tyreAnalysis;
    
    // Start at 100%
    let performance = 100;
    
    // Temperature penalty: 2% per °C from optimal 95°C
    const avgTemp = tyreData.averageTemp;
    const tempPenalty = Math.abs(avgTemp - 95) * 2;
    
    // Age penalty: 0.5% per lap
    const agePenalty = tyreData.age * 0.5;
    
    // Wear penalty: 0.1% per % wear (estimate from age and usage)
    const wearEstimate = Math.min(100, tyreData.age * 2); // Rough estimate
    const wearPenalty = wearEstimate * 0.1;
    
    // Apply penalties
    performance = Math.max(0, performance - tempPenalty - agePenalty - wearPenalty);
    
    // Store for trend analysis
    this.tyrePerformanceHistory.push(performance);
    if (this.tyrePerformanceHistory.length > 3) {
      this.tyrePerformanceHistory.shift();
    }
    
    return performance;
  }

  /**
   * ENHANCED: Race Pace Consistency with proper statistics
   */
  private calculateEnhancedConsistency(): number {
    if (this.last5LapTimes.length < 2) return 100;
    
    const avg = this.last5LapTimes.reduce((sum, time) => sum + time, 0) / this.last5LapTimes.length;
    const variance = this.last5LapTimes.reduce((sum, time) => sum + Math.pow(time - avg, 2), 0) / this.last5LapTimes.length;
    const stdDev = Math.sqrt(variance);
    
    // Consistency score: 100 * (1 - (std_dev / avg_lap_time))
    const consistency = 100 * (1 - (stdDev / avg));
    return Math.max(0, Math.min(100, consistency));
  }

  /**
   * ENHANCED: Predict lap trend with linear regression and degradation analysis
   */
  private predictLapTrend(analysis: F1Analysis): AnalysisResult['lapTrendPrediction'] {
    if (this.last5LapTimes.length < 2) {
      return {
        nextLapPrediction: analysis.personalBest?.lapTime || 90,
        degradationTrend: 'stable',
        recommendedStrategy: 'extend'
      };
    }

    // ENHANCED: Use linear regression on last 5 lap times
    const { slope, intercept } = this.calculateLinearRegression(this.last5LapTimes);
    
    // Degradation classification based on slope
    let degradationTrend: 'improving' | 'stable' | 'degrading';
    if (slope < -0.2) degradationTrend = 'improving';
    else if (slope > 0.2) degradationTrend = 'degrading';
    else degradationTrend = 'stable';

    // Predict next lap using regression + adjustments
    const nextLapIndex = this.last5LapTimes.length + 1;
    let nextLapPrediction = intercept + slope * nextLapIndex;
    
    // Add degradation factors if available
    const tyreAge = analysis.tyreAnalysis.age;
    const tireDegradationAdj = tyreAge * 0.05; // 0.05s per lap age
    const fuelBurnAdj = -0.03 * 2.5; // -0.03s per kg, assume 2.5kg/lap
    
    nextLapPrediction += tireDegradationAdj + fuelBurnAdj;

    // Strategy recommendation based on tire age and pace trend
    // Note: Backend analysis will provide more accurate race-length-aware recommendations
    let recommendedStrategy: 'no-stop' | '1-stop' | '2-stop' | 'extend' | 'pit-now';
    
    if (tyreAge > 20 && degradationTrend === 'degrading') {
      recommendedStrategy = 'pit-now';
    } else if (tyreAge > 15) {
      recommendedStrategy = '1-stop';
    } else if (degradationTrend === 'improving') {
      recommendedStrategy = 'extend';
    } else {
      recommendedStrategy = 'extend'; // Default to extend for frontend
    }

    return {
      nextLapPrediction,
      degradationTrend,
      recommendedStrategy
    };
  }

  /**
   * Calculate linear regression slope and intercept
   */
  private calculateLinearRegression(lapTimes: number[]): { slope: number; intercept: number } {
    const n = lapTimes.length;
    if (n < 2) return { slope: 0, intercept: lapTimes[0] || 90 };
    
    // x = lap indices (1, 2, 3, 4, 5), y = lap times
    const x = Array.from({ length: n }, (_, i) => i + 1);
    const y = lapTimes;
    
    const sumX = x.reduce((sum, val) => sum + val, 0);
    const sumY = y.reduce((sum, val) => sum + val, 0);
    const sumXY = x.reduce((sum, val, i) => sum + val * y[i], 0);
    const sumX2 = x.reduce((sum, val) => sum + val * val, 0);
    
    // Linear regression formulas
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    
    return { slope, intercept };
  }

  // Helper methods
  private createEmptyAnalysis(): AnalysisResult {
    return {
      insights: [],
      performance: this.createEmptyPerformanceMetrics(),
      baseline: this.performanceBaseline!,
      lapTrendPrediction: {
        nextLapPrediction: 90,
        degradationTrend: 'stable',
        recommendedStrategy: 'extend'
      },
      timestamp: Date.now()
    };
  }

  private createEmptyPerformanceMetrics(): RealTimePerformanceMetrics {
    return {
      currentPaceVsOptimal: 0,
      tirePerformanceIndex: 100,
      fuelEfficiencyRating: 100,
      setupPerformanceRating: 100,
      racePaceConsistency: 100,
      improvementPotential: 0
    };
  }

  private calculateStandardDeviation(values: number[]): number {
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }

  /**
   * Helper methods for enhanced analysis
   */
  private getAverageSectorTime(sector: number): number {
    if (!this.sectorBaseline) return 30; // Fallback
    
    switch (sector) {
      case 1: return this.sectorBaseline.sector1;
      case 2: return this.sectorBaseline.sector2;
      case 3: return this.sectorBaseline.sector3;
      default: return 30;
    }
  }

  private getTyreWearAdjustment(telemetry: TelemetryData): number {
    // Estimate tire wear based on age and add penalty
    const tyreAge = telemetry.tire_age_laps || 0;
    const estimatedWear = Math.min(100, tyreAge * 3); // Rough wear estimate
    
    // Add 0.05s per % wear over 50%
    return estimatedWear > 50 ? (estimatedWear - 50) * 0.0005 : 0;
  }

  private updateLapBuffers(analysis: F1Analysis): void {
    const currentLap = analysis.currentLap;
    if (!currentLap) return;

    // Update recent lap times (last 10 laps)
    this.recentLapTimes.push(currentLap.lapTime);
    if (this.recentLapTimes.length > this.MAX_RECENT_LAPS) {
      this.recentLapTimes.shift();
    }

    // Update last 5 lap times for regression
    this.last5LapTimes.push(currentLap.lapTime);
    if (this.last5LapTimes.length > this.REGRESSION_WINDOW) {
      this.last5LapTimes.shift();
    }

    // Update sector baseline with best sectors
    if (!this.sectorBaseline) {
      this.sectorBaseline = {
        sector1: currentLap.sector1Time || 30,
        sector2: currentLap.sector2Time || 30,
        sector3: currentLap.sector3Time || 30
      };
    } else {
      if (currentLap.sector1Time > 0) {
        this.sectorBaseline.sector1 = Math.min(this.sectorBaseline.sector1, currentLap.sector1Time);
      }
      if (currentLap.sector2Time > 0) {
        this.sectorBaseline.sector2 = Math.min(this.sectorBaseline.sector2, currentLap.sector2Time);
      }
      if (currentLap.sector3Time > 0) {
        this.sectorBaseline.sector3 = Math.min(this.sectorBaseline.sector3, currentLap.sector3Time);
      }
    }
  }

  /**
   * Get current analysis state
   */
  getCurrentAnalysis(): AnalysisResult | null {
    return this.analysisHistory[this.analysisHistory.length - 1] || null;
  }

  /**
   * Reset analysis state (for new session)
   */
  reset(): void {
    this.performanceBaseline = null;
    this.analysisHistory = [];
    this.sessionStartTime = Date.now();
    
    // ENHANCED: Reset analysis buffers
    this.recentLapTimes = [];
    this.last5LapTimes = [];
    this.tyrePerformanceHistory = [];
    this.sectorBaseline = null;
    
    console.log('🔄 Live Analysis Engine reset for new session');
  }
}
