#pragma once
#include <iostream>
#include <vector>
#include <string>
#include <chrono>
#include <cmath>
#include <algorithm>
#include <map>
#include "data_processor.h"

/**
 * Accurate Lap Predictor for Phase 7B 
 * Advanced multi-factor lap prediction system
 * Designed for AI integration (Phase 7A)
 */
class AccurateLapPredictor {
public:
    // Core data structures
    struct LapData {
        float lap_time;
        uint8_t lap_number;
        float fuel_at_start;
        float avg_tire_temp;
        uint8_t tire_age_laps;
        float track_temp;
        std::string tire_compound;
        bool valid_lap; // No yellows, mistakes, etc.
        
        // Sector times for detailed analysis
        float sector1_time;
        float sector2_time; 
        float sector3_time;
        
        LapData() : lap_time(0), lap_number(0), fuel_at_start(0), 
                   avg_tire_temp(0), tire_age_laps(0), track_temp(0),
                   tire_compound("unknown"), valid_lap(false),
                   sector1_time(0), sector2_time(0), sector3_time(0) {}
    };

    struct PredictionResult {
        float next_lap_time;        // Main prediction
        float confidence;           // 0.0 to 1.0
        float fuel_adjustment;      // Expected fuel effect
        float tire_adjustment;      // Expected tire degradation
        float track_evolution;      // Track rubber/learning
        float base_pace;           // Driver's optimal pace
        std::string reasoning;      // For AI debugging
        bool valid;
        
        PredictionResult() : next_lap_time(0), confidence(0), fuel_adjustment(0),
                           tire_adjustment(0), track_evolution(0), base_pace(0),
                           reasoning("insufficient data"), valid(false) {}
    };

    struct SessionAnalysis {
        float optimal_lap_time;     // Best theoretical lap
        float consistency_score;    // 0-100%
        float tire_performance;     // 0-100% 
        float pace_vs_optimal;      // Current delta to optimal
        std::string session_phase;  // "qualifying", "race", "practice"
        
        SessionAnalysis() : optimal_lap_time(0), consistency_score(0),
                          tire_performance(100), pace_vs_optimal(0),
                          session_phase("unknown") {}
    };

    struct CompleteAnalysis {
        PredictionResult prediction;
        SessionAnalysis session;
        uint64_t timestamp_ms;
        bool valid;
        
        CompleteAnalysis() : valid(false) {
            timestamp_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
                std::chrono::system_clock::now().time_since_epoch()).count();
        }
    };

private:
    // Data storage
    std::vector<LapData> lap_history;
    std::vector<LapData> valid_laps_only; // Filtered for analysis
    
    // Baseline calculations
    struct OptimalBaseline {
        float best_sector1;
        float best_sector2;
        float best_sector3;
        float theoretical_best;
        bool valid;
        
        OptimalBaseline() : best_sector1(999), best_sector2(999), 
                          best_sector3(999), theoretical_best(999), valid(false) {}
    } optimal_baseline;

    // Tire degradation curves (compound specific)
    std::map<std::string, std::vector<float>> tire_deg_curves;
    
    // Analysis configuration
    static const size_t MIN_LAPS_FOR_PREDICTION = 1;
    static const size_t MAX_LAP_HISTORY = 20;
    static constexpr float MAX_VALID_LAP_DELTA = 1.1f; // 110% of best
    static const uint64_t ANALYSIS_INTERVAL_MS = 2000; // Every 2 seconds
    
    // State tracking
    uint8_t current_lap_number;
    uint64_t last_analysis_time;
    
    // Core prediction algorithms
    PredictionResult calculateMultiFactorPrediction(const DataProcessor::ProcessedTelemetry& telemetry);
    PredictionResult calculateEarlySessionPrediction(const DataProcessor::ProcessedTelemetry& telemetry);
    float calculateBasePace();
    float calculateFuelEffect(float current_fuel, float next_lap_fuel);
    float calculateTireDegradation(uint8_t tire_age, const std::string& compound);
    float calculateTrackEvolution();
    float calculateDriverLearning();
    float calculateERSEffect(const DataProcessor::ProcessedTelemetry& telemetry);
    
    // Data validation and filtering
    bool isValidLap(const LapData& lap) const;
    void updateOptimalBaseline(const LapData& lap);
    void filterValidLaps();
    
    // Statistical analysis
    float calculateConsistency();
    float calculateTirePerformance(const DataProcessor::ProcessedTelemetry& telemetry);
    float calculatePaceVsOptimal(const DataProcessor::ProcessedTelemetry& telemetry);
    
    // Utilities
    void initializeTireCurves();
    float interpolateValue(float progress, const std::vector<float>& curve);
    std::string getCompoundFromTelemetry(const DataProcessor::ProcessedTelemetry& telemetry);
    void updateLapHistory(const DataProcessor::ProcessedTelemetry& telemetry);

public:
    AccurateLapPredictor();
    ~AccurateLapPredictor() = default;
    
    // Main analysis interface
    CompleteAnalysis updateAnalysis(const DataProcessor::ProcessedTelemetry& telemetry);
    std::string analysisToJSON(const CompleteAnalysis& analysis);
    
    // Session management
    void resetSession();
    bool hasValidData() const;
    
    // Debugging and status
    size_t getLapCount() const { return lap_history.size(); }
    size_t getValidLapCount() const { return valid_laps_only.size(); }
    float getOptimalLapTime() const { return optimal_baseline.theoretical_best; }
    std::string getSessionPhase() const;
};