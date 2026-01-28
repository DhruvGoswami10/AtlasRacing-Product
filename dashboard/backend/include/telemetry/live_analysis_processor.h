#pragma once
#include <iostream>
#include <vector>
#include <string>
#include <chrono>
#include <cmath>
#include <algorithm>
#include "data_processor.h"

/**
 * Backend Live Analysis Processor for Phase 7B
 * Provides real-time mathematical analysis of telemetry data
 * Implements the same mathematical models as frontend for consistency
 */
class LiveAnalysisProcessor {
public:
    // Analysis Results Structures
    struct PaceAnalysis {
        float delta_to_optimal;      // seconds delta from optimal lap
        std::string formatted_delta; // "+0.234s" or "-0.156s"
        float projected_lap_time;    // current lap projection
        bool valid;
        
        PaceAnalysis() : delta_to_optimal(0.0f), formatted_delta("--"), 
                        projected_lap_time(0.0f), valid(false) {}
    };
    
    struct LapPrediction {
        float current_lap_prediction;
        float next_lap_prediction;
        float trend_slope; // s/lap from regression
        bool valid;
        
        LapPrediction() : current_lap_prediction(0.0f), next_lap_prediction(0.0f),
                         trend_slope(0.0f), valid(false) {}
    };
    
    struct TyrePerformanceIndex {
        float performance_index; // 0-100%
        std::string trend; // "improving", "stable", "degrading"
        float temp_penalty;
        float age_penalty; 
        float wear_penalty;
        bool valid;
        
        TyrePerformanceIndex() : performance_index(100.0f), trend("stable"),
                                temp_penalty(0.0f), age_penalty(0.0f), 
                                wear_penalty(0.0f), valid(false) {}
    };
    
    struct ConsistencyAnalysis {
        float consistency_score; // 0-100%
        std::string classification; // "excellent", "good", "fair", "poor"
        float standard_deviation;
        float average_lap_time;
        bool valid;
        
        ConsistencyAnalysis() : consistency_score(100.0f), classification("unknown"),
                               standard_deviation(0.0f), average_lap_time(0.0f), valid(false) {}
    };
    
    struct DegradationTrend {
        float slope; // s/lap
        std::string trend_class; // "improving", "stable", "degrading"
        std::string formatted_trend; // "+0.15s/lap", "-0.05s/lap", "stable"
        float next_predicted_time;
        bool valid;
        
        DegradationTrend() : slope(0.0f), trend_class("stable"), formatted_trend("stable"),
                            next_predicted_time(0.0f), valid(false) {}
    };
    
    struct CompleteAnalysis {
        PaceAnalysis pace_vs_optimal;
        LapPrediction lap_predictions;
        TyrePerformanceIndex tyre_performance;
        ConsistencyAnalysis consistency;
        DegradationTrend degradation;
        uint64_t timestamp_ms;
        bool valid;
        
        CompleteAnalysis() : valid(false) {
            timestamp_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
                std::chrono::system_clock::now().time_since_epoch()).count();
        }
    };

private:
    // In-memory data buffers (matching frontend implementation)
    std::vector<float> recent_lap_times;    // Last 10 laps for optimal calculation
    std::vector<float> last_5_lap_times;    // For regression analysis
    std::vector<float> tyre_performance_history; // Last 3 values for trend
    
    // Sector baseline for optimal lap calculation
    struct SectorBaseline {
        float sector1;
        float sector2; 
        float sector3;
        bool valid;
        
        SectorBaseline() : sector1(999.0f), sector2(999.0f), sector3(999.0f), valid(false) {}
    } sector_baseline;
    
    // Configuration constants
    static const size_t MAX_RECENT_LAPS = 10;
    static const size_t REGRESSION_WINDOW = 5;
    static const size_t TYRE_HISTORY_SIZE = 3;
    static constexpr float OPTIMAL_TYRE_TEMP = 95.0f; // F1 24 optimal temp
    
    // Analysis state
    uint8_t current_lap_number;
    bool session_active;
    uint64_t last_analysis_time;
    static const uint64_t ANALYSIS_INTERVAL_MS = 1000; // Analyze every 1 second
    
    // Mathematical calculation methods
    PaceAnalysis calculatePaceVsOptimal(const DataProcessor::ProcessedTelemetry& data);
    LapPrediction calculateLapPredictions(const DataProcessor::ProcessedTelemetry& data);
    TyrePerformanceIndex calculateTyrePerformance(const DataProcessor::ProcessedTelemetry& data);
    ConsistencyAnalysis calculateConsistency();
    DegradationTrend calculateDegradationTrend();
    
    // Enhanced ERS/DRS Models for Phase 7B Lap Prediction Accuracy
    struct ERSModel {
        static constexpr float MAX_ERS_MJ = 4.0f;           // 4 MJ max per lap
        static constexpr float TIME_PER_MJ = 0.28f;          // 0.28s benefit per MJ
        static constexpr float TYPICAL_DEPLOYMENT = 2.8f;    // Average deployment
        static constexpr float DEPLOYMENT_EFFICIENCY = 0.85f; // Real vs theoretical
        
        static float calculateERSTimeBenefit(float deployedThisLap, float storeEnergy, uint8_t deployMode) {
            if (deployedThisLap <= 0.0f) return 0.0f;
            
            float efficiency = DEPLOYMENT_EFFICIENCY;
            
            // Adjust efficiency based on deployment mode
            // 0=none, 1=medium, 2=hotlap, 3=overtake
            switch(deployMode) {
                case 0: return 0.0f;  // No deployment
                case 1: efficiency *= 0.7f; break;  // Conservative deployment  
                case 2: efficiency *= 0.95f; break; // Hotlap mode - near optimal
                case 3: efficiency *= 0.9f; break;  // Overtake mode
                default: efficiency *= 0.8f; break; // Unknown mode - conservative
            }
            
            return deployedThisLap * TIME_PER_MJ * efficiency;
        }
    };
    
    struct DRSModel {
        // Track-specific DRS time gains (research-based F1 data)
        static const std::map<int, float> trackDRSGains;
        
        static float calculateDRSTimeBenefit(int trackId, bool drsAllowed, uint16_t drsActivationDistance) {
            if (!drsAllowed || drsActivationDistance > 5) return 0.0f;
            
            auto it = trackDRSGains.find(trackId);
            float baseGain = it != trackDRSGains.end() ? it->second : 0.3f; // Default 300ms
            
            // Reduce effectiveness if DRS zone isn't optimal
            float effectiveness = drsActivationDistance == 0 ? 0.9f : 0.7f;
            
            return baseGain * effectiveness;
        }
    };
    
    // Enhanced tire degradation model
    static float calculateCompoundDegradation(uint8_t compound, float age) {
        // Compound degradation rates (per lap in seconds)
        std::map<uint8_t, float> degradationRates = {
            {16, 0.08f}, // C5 (softest) - 80ms per lap
            {17, 0.06f}, // C4 - 60ms per lap  
            {18, 0.045f},// C3 - 45ms per lap
            {19, 0.035f},// C2 - 35ms per lap
            {20, 0.025f},// C1 (hardest) - 25ms per lap
            {7,  0.02f}, // Inter - 20ms per lap
            {8,  0.015f} // Wet - 15ms per lap
        };
        
        auto it = degradationRates.find(compound);
        float ratePerLap = it != degradationRates.end() ? it->second : 0.05f;
        
        // Non-linear degradation: accelerates after certain age
        float degradation = age * ratePerLap;
        if (age > 15.0f) degradation += (age - 15.0f) * 0.02f; // Extra penalty after 15 laps
        
        return degradation;
    }

    // Utility methods
    struct LinearRegressionResult {
        float slope;
        float intercept;
        bool valid;
    };
    LinearRegressionResult calculateLinearRegression(const std::vector<float>& values);
    
    std::string formatDelta(float delta_seconds);
    std::string formatTrend(float slope);
    float calculateStandardDeviation(const std::vector<float>& values);
    float getTyreWearAdjustment(const DataProcessor::ProcessedTelemetry& data);
    void updateLapBuffers(const DataProcessor::ProcessedTelemetry& data);
    
public:
    LiveAnalysisProcessor();
    ~LiveAnalysisProcessor() = default;
    
    // Main analysis methods
    CompleteAnalysis updateAnalysis(const DataProcessor::ProcessedTelemetry& telemetry_data);
    std::string analysisToJSON(const CompleteAnalysis& analysis);
    
    // Session management
    void resetSession();
    bool hasValidData() const;
    
    // Getters for debugging
    size_t getRecentLapsCount() const { return recent_lap_times.size(); }
    size_t getLast5LapsCount() const { return last_5_lap_times.size(); }
    bool hasSectorBaseline() const { return sector_baseline.valid; }
};