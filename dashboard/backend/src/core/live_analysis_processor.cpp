#include "../../include/telemetry/live_analysis_processor.h"
#include <sstream>
#include <iomanip>
#include <map>

// Track-specific DRS gains definition (based on F1 telemetry data analysis)
const std::map<int, float> LiveAnalysisProcessor::DRSModel::trackDRSGains = {
    {3,  0.35f},  // Bahrain - ~350ms with both DRS zones
    {30, 0.42f},  // Jeddah - ~420ms with 3 DRS zones  
    {20, 0.38f},  // Baku - ~380ms with long straight
    {10, 0.25f},  // Spa - ~250ms (less effective due to elevation)
    {11, 0.45f},  // Monza - ~450ms (maximum DRS benefit)
    {7,  0.32f},  // Silverstone - ~320ms
    {4,  0.34f},  // Catalunya - ~340ms
    {5,  0.28f},  // Monaco - ~280ms (limited straights)
    {6,  0.36f},  // Montreal - ~360ms
    {8,  0.30f},  // Hockenheim - ~300ms
    {9,  0.33f},  // Hungaroring - ~330ms
    {12, 0.29f},  // Singapore - ~290ms
    {13, 0.37f},  // Suzuka - ~370ms
    {14, 0.41f},  // Abu Dhabi - ~410ms
    {15, 0.39f},  // Texas - ~390ms
    {16, 0.44f},  // Brazil - ~440ms
    {17, 0.31f},  // Austria - ~310ms
    {19, 0.40f},  // Mexico - ~400ms
    {26, 0.43f},  // Zandvoort - ~430ms
    {27, 0.35f},  // Imola - ~350ms
    {29, 0.38f},  // Jeddah - ~380ms
    {30, 0.42f},  // Miami - ~420ms
    {31, 0.46f},  // Las Vegas - ~460ms (longest straights)
    {32, 0.36f}   // Losail - ~360ms
};

LiveAnalysisProcessor::LiveAnalysisProcessor() : current_lap_number(0), session_active(false), 
                                                 last_analysis_time(0) {
    std::cout << "🧠 Backend Live Analysis Processor initialized for Phase 7B" << std::endl;
}

LiveAnalysisProcessor::CompleteAnalysis LiveAnalysisProcessor::updateAnalysis(const DataProcessor::ProcessedTelemetry& telemetry_data) {
    CompleteAnalysis result;
    
    // Update lap data buffers
    updateLapBuffers(telemetry_data);
    
    // Only run analysis every second to avoid overload
    uint64_t now = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::system_clock::now().time_since_epoch()).count();
    
    if (now - last_analysis_time < ANALYSIS_INTERVAL_MS) {
        return result; // Return invalid analysis if too frequent
    }
    last_analysis_time = now;
    
    // Calculate all analysis components
    result.pace_vs_optimal = calculatePaceVsOptimal(telemetry_data);
    result.lap_predictions = calculateLapPredictions(telemetry_data);
    result.tyre_performance = calculateTyrePerformance(telemetry_data);
    result.consistency = calculateConsistency();
    result.degradation = calculateDegradationTrend();
    
    result.timestamp_ms = now;
    result.valid = true;
    
    return result;
}

LiveAnalysisProcessor::PaceAnalysis LiveAnalysisProcessor::calculatePaceVsOptimal(const DataProcessor::ProcessedTelemetry& data) {
    PaceAnalysis result;
    
    if (!sector_baseline.valid || recent_lap_times.size() < 2) {
        return result; // Not enough data
    }
    
    // Calculate optimal lap time (sum of best sectors)
    float optimal_lap_time = sector_baseline.sector1 + sector_baseline.sector2 + sector_baseline.sector3;
    
    // Project current lap based on completed sectors and current progress
    float projected_lap_time = 0.0f;
    float sector1_time = data.sector1_time_ms / 1000.0f;
    float sector2_time = data.sector2_time_ms / 1000.0f;
    float sector3_time = data.sector3_time_ms / 1000.0f;
    uint8_t current_sector = data.current_sector;
    
    if (current_sector == 1) {
        // Still in sector 1 - project full lap
        float s1_ratio = sector1_time > 0 ? sector1_time : 0;
        float remaining_s1 = sector_baseline.sector1 - s1_ratio;
        projected_lap_time = s1_ratio + remaining_s1 + sector_baseline.sector2 + sector_baseline.sector3;
    } else if (current_sector == 2) {
        // Completed S1, in S2
        projected_lap_time = sector1_time + (sector2_time > 0 ? sector2_time : sector_baseline.sector2) + sector_baseline.sector3;
    } else {
        // In S3 or completed lap
        projected_lap_time = sector1_time + sector2_time + (sector3_time > 0 ? sector3_time : sector_baseline.sector3);
    }
    
    // Add tire wear adjustment (+0.05s per % wear over 50%)
    projected_lap_time += getTyreWearAdjustment(data);
    
    // Calculate delta
    result.delta_to_optimal = projected_lap_time - optimal_lap_time;
    result.projected_lap_time = projected_lap_time;
    result.formatted_delta = formatDelta(result.delta_to_optimal);
    result.valid = true;
    
    return result;
}

LiveAnalysisProcessor::LapPrediction LiveAnalysisProcessor::calculateLapPredictions(const DataProcessor::ProcessedTelemetry& data) {
    LapPrediction result;
    
    if (last_5_lap_times.size() < 2) {
        return result; // Not enough data
    }
    
    // Linear regression on last 5 lap times
    auto regression = calculateLinearRegression(last_5_lap_times);
    if (!regression.valid) {
        return result;
    }
    
    // Current lap prediction (time so far + remaining sectors estimated)
    float current_lap_progress = data.current_lap_time;
    if (current_lap_progress > 0) {
        result.current_lap_prediction = current_lap_progress; // Use actual if available
    } else {
        // Estimate based on completed sectors
        float sector1_time = data.sector1_time_ms / 1000.0f;
        float sector2_time = data.sector2_time_ms / 1000.0f;
        float avg_lap_time = last_5_lap_times.empty() ? 90.0f : 
                            last_5_lap_times.back(); // Use latest lap time as base
        result.current_lap_prediction = avg_lap_time; // Fallback
    }
    
    // Base prediction from regression
    size_t next_lap_index = last_5_lap_times.size() + 1;
    float basePrediction = regression.intercept + regression.slope * next_lap_index;
    
    // === PHASE 7B: ENHANCED ERS/DRS MODELING ===
    std::cout << "🔋 Phase 7B: Applying ERS/DRS modeling for lap prediction accuracy" << std::endl;
    
    // ERS adjustment (from Car Status Packet 7)
    float ersDeployed = data.ers_deployed_this_lap;
    float ersStoreEnergy = data.ers_store_energy; 
    uint8_t ersDeployMode = data.ers_deploy_mode;
    
    float ersTimeBenefit = ERSModel::calculateERSTimeBenefit(ersDeployed, ersStoreEnergy, ersDeployMode);
    
    // DRS adjustment (from Car Status Packet 7 + Session data)
    bool drsAllowed = data.drs_allowed == 1;
    uint16_t drsActivationDistance = data.drs_activation_distance;
    int trackId = data.track_id;
    
    float drsTimeBenefit = DRSModel::calculateDRSTimeBenefit(trackId, drsAllowed, drsActivationDistance);
    
    // Enhanced tire degradation (compound-specific)
    float tyre_age = static_cast<float>(data.tyre_age_laps);
    uint8_t tyreCompound = data.actual_tyre_compound;
    float compoundDegradation = calculateCompoundDegradation(tyreCompound, tyre_age);
    
    // Temperature-based performance penalty
    float avgTemp = (data.tyre_surface_temp[0] + data.tyre_surface_temp[1] + 
                    data.tyre_surface_temp[2] + data.tyre_surface_temp[3]) / 4.0f;
    float tempPenalty = 0.0f;
    if (avgTemp > 110.0f) tempPenalty = (avgTemp - 110.0f) * 0.015f;  // 15ms per °C over 110°C
    else if (avgTemp < 80.0f) tempPenalty = (80.0f - avgTemp) * 0.01f; // 10ms per °C under 80°C
    
    // Enhanced fuel effect
    float fuelMass = data.fuel_in_tank;
    float fuelPenalty = fuelMass * 0.035f;  // 35ms per kg (more accurate)
    
    // Final enhanced prediction
    result.next_lap_prediction = basePrediction
                               - ersTimeBenefit        // ERS makes you faster
                               - drsTimeBenefit        // DRS makes you faster  
                               + tempPenalty           // Temp issues slow you down
                               + compoundDegradation   // Tire wear slows you down
                               + fuelPenalty;          // Fuel weight slows you down
    
    result.trend_slope = regression.slope;
    result.valid = true;
    
    // Debug output for testing
    if (ersTimeBenefit > 0 || drsTimeBenefit > 0) {
        std::cout << "📊 Prediction adjustments - ERS: -" << ersTimeBenefit 
                  << "s, DRS: -" << drsTimeBenefit << "s, Compound: +" 
                  << compoundDegradation << "s, Temp: +" << tempPenalty 
                  << "s, Fuel: +" << fuelPenalty << "s" << std::endl;
    }
    
    return result;
}

LiveAnalysisProcessor::TyrePerformanceIndex LiveAnalysisProcessor::calculateTyrePerformance(const DataProcessor::ProcessedTelemetry& data) {
    TyrePerformanceIndex result;
    
    // Start at 100% performance
    float performance = 100.0f;
    
    // Temperature penalty: 2% per °C from optimal 95°C
    float avg_temp = (data.tyre_surface_temp[0] + data.tyre_surface_temp[1] + 
                     data.tyre_surface_temp[2] + data.tyre_surface_temp[3]) / 4.0f;
    result.temp_penalty = std::abs(avg_temp - OPTIMAL_TYRE_TEMP) * 2.0f;
    
    // Age penalty: 0.5% per lap
    result.age_penalty = static_cast<float>(data.tyre_age_laps) * 0.5f;
    
    // Wear penalty: 0.1% per % wear (estimate from age)
    float wear_estimate = std::min(100.0f, static_cast<float>(data.tyre_age_laps) * 2.0f);
    result.wear_penalty = wear_estimate * 0.1f;
    
    // Apply penalties
    performance -= result.temp_penalty + result.age_penalty + result.wear_penalty;
    result.performance_index = std::max(0.0f, std::min(100.0f, performance));
    
    // Determine trend based on last 3 values
    tyre_performance_history.push_back(result.performance_index);
    if (tyre_performance_history.size() > TYRE_HISTORY_SIZE) {
        tyre_performance_history.erase(tyre_performance_history.begin());
    }
    
    if (tyre_performance_history.size() >= 2) {
        float delta = tyre_performance_history.back() - tyre_performance_history.front();
        if (delta > 5.0f) result.trend = "improving";
        else if (delta < -5.0f) result.trend = "degrading";
        else result.trend = "stable";
    }
    
    result.valid = true;
    return result;
}

LiveAnalysisProcessor::ConsistencyAnalysis LiveAnalysisProcessor::calculateConsistency() {
    ConsistencyAnalysis result;
    
    if (last_5_lap_times.size() < 2) {
        return result;
    }
    
    // Calculate average lap time
    result.average_lap_time = 0.0f;
    for (float time : last_5_lap_times) {
        result.average_lap_time += time;
    }
    result.average_lap_time /= last_5_lap_times.size();
    
    // Calculate standard deviation
    result.standard_deviation = calculateStandardDeviation(last_5_lap_times);
    
    // Consistency score: 100 * (1 - (std_dev / avg_lap_time))
    result.consistency_score = 100.0f * (1.0f - (result.standard_deviation / result.average_lap_time));
    result.consistency_score = std::max(0.0f, std::min(100.0f, result.consistency_score));
    
    // Classification
    if (result.consistency_score > 95.0f) result.classification = "excellent";
    else if (result.consistency_score > 80.0f) result.classification = "good";
    else if (result.consistency_score > 70.0f) result.classification = "fair";
    else result.classification = "poor";
    
    result.valid = true;
    return result;
}

LiveAnalysisProcessor::DegradationTrend LiveAnalysisProcessor::calculateDegradationTrend() {
    DegradationTrend result;
    
    if (last_5_lap_times.size() < 2) {
        return result;
    }
    
    // Use linear regression for trend
    auto regression = calculateLinearRegression(last_5_lap_times);
    if (!regression.valid) {
        return result;
    }
    
    result.slope = regression.slope;
    
    // Classification based on slope
    if (result.slope < -0.2f) result.trend_class = "improving";
    else if (result.slope > 0.2f) result.trend_class = "degrading";  
    else result.trend_class = "stable";
    
    // Format trend string
    result.formatted_trend = formatTrend(result.slope);
    
    // Predict next lap time
    size_t next_index = last_5_lap_times.size() + 1;
    result.next_predicted_time = regression.intercept + regression.slope * next_index;
    
    result.valid = true;
    return result;
}

// Utility method implementations

LiveAnalysisProcessor::LinearRegressionResult LiveAnalysisProcessor::calculateLinearRegression(const std::vector<float>& values) {
    LinearRegressionResult result;
    
    size_t n = values.size();
    if (n < 2) {
        return result;
    }
    
    // x = lap indices (1, 2, 3, 4, 5), y = lap times
    float sum_x = 0, sum_y = 0, sum_xy = 0, sum_x2 = 0;
    
    for (size_t i = 0; i < n; i++) {
        float x = static_cast<float>(i + 1);
        float y = values[i];
        
        sum_x += x;
        sum_y += y;
        sum_xy += x * y;
        sum_x2 += x * x;
    }
    
    float n_f = static_cast<float>(n);
    
    // Linear regression formulas: slope = (n * sum(x*y) - sum(x)*sum(y)) / (n * sum(x^2) - (sum(x))^2)
    float denominator = n_f * sum_x2 - sum_x * sum_x;
    if (std::abs(denominator) < 0.0001f) {
        return result; // Avoid division by zero
    }
    
    result.slope = (n_f * sum_xy - sum_x * sum_y) / denominator;
    result.intercept = (sum_y - result.slope * sum_x) / n_f;
    result.valid = true;
    
    return result;
}

std::string LiveAnalysisProcessor::formatDelta(float delta_seconds) {
    std::ostringstream oss;
    oss << std::fixed << std::setprecision(3);
    
    if (delta_seconds > 0) {
        oss << "+" << delta_seconds << "s";
    } else if (delta_seconds < 0) {
        oss << delta_seconds << "s";
    } else {
        oss << "±0.000s";
    }
    
    return oss.str();
}

std::string LiveAnalysisProcessor::formatTrend(float slope) {
    if (std::abs(slope) < 0.05f) {
        return "stable";
    }
    
    std::ostringstream oss;
    oss << std::fixed << std::setprecision(2);
    
    if (slope > 0) {
        oss << "+" << slope << "s/lap";
    } else {
        oss << slope << "s/lap";
    }
    
    return oss.str();
}

float LiveAnalysisProcessor::calculateStandardDeviation(const std::vector<float>& values) {
    if (values.size() < 2) return 0.0f;
    
    float mean = 0.0f;
    for (float val : values) {
        mean += val;
    }
    mean /= values.size();
    
    float variance = 0.0f;
    for (float val : values) {
        variance += (val - mean) * (val - mean);
    }
    variance /= values.size();
    
    return std::sqrt(variance);
}

float LiveAnalysisProcessor::getTyreWearAdjustment(const DataProcessor::ProcessedTelemetry& data) {
    // Estimate tire wear based on age and usage
    float tyre_age = static_cast<float>(data.tyre_age_laps);
    float estimated_wear = std::min(100.0f, tyre_age * 3.0f); // Rough wear estimate
    
    // Add 0.05s per % wear over 50%
    return estimated_wear > 50.0f ? (estimated_wear - 50.0f) * 0.0005f : 0.0f;
}

void LiveAnalysisProcessor::updateLapBuffers(const DataProcessor::ProcessedTelemetry& data) {
    // Check for new lap completion
    if (data.current_lap_num != current_lap_number && data.last_lap_time > 0) {
        current_lap_number = data.current_lap_num;
        
        // Update recent lap times (last 10 laps)
        recent_lap_times.push_back(data.last_lap_time);
        if (recent_lap_times.size() > MAX_RECENT_LAPS) {
            recent_lap_times.erase(recent_lap_times.begin());
        }
        
        // Update last 5 lap times for regression
        last_5_lap_times.push_back(data.last_lap_time);
        if (last_5_lap_times.size() > REGRESSION_WINDOW) {
            last_5_lap_times.erase(last_5_lap_times.begin());
        }
        
        std::cout << "📊 Backend Analysis: Updated buffers with lap " << (int)current_lap_number 
                  << " time: " << data.last_lap_time << "s" << std::endl;
    }
    
    // Update sector baseline with best sectors
    float sector1_time = data.sector1_time_ms / 1000.0f;
    float sector2_time = data.sector2_time_ms / 1000.0f; 
    float sector3_time = data.sector3_time_ms / 1000.0f;
    
    if (!sector_baseline.valid) {
        if (sector1_time > 0 && sector2_time > 0 && sector3_time > 0) {
            sector_baseline.sector1 = sector1_time;
            sector_baseline.sector2 = sector2_time;
            sector_baseline.sector3 = sector3_time;
            sector_baseline.valid = true;
            std::cout << "🎯 Backend Analysis: Initialized sector baseline" << std::endl;
        }
    } else {
        // Update with better sector times
        if (sector1_time > 0 && sector1_time < sector_baseline.sector1) {
            sector_baseline.sector1 = sector1_time;
        }
        if (sector2_time > 0 && sector2_time < sector_baseline.sector2) {
            sector_baseline.sector2 = sector2_time;
        }
        if (sector3_time > 0 && sector3_time < sector_baseline.sector3) {
            sector_baseline.sector3 = sector3_time;
        }
    }
}

std::string LiveAnalysisProcessor::analysisToJSON(const CompleteAnalysis& analysis) {
    if (!analysis.valid) {
        return "{\"analysis_valid\":false}";
    }
    
    std::ostringstream json;
    json << std::fixed << std::setprecision(3);
    
    json << "{"
         << "\"analysis_valid\":true,"
         << "\"timestamp\":" << analysis.timestamp_ms << ","
         << "\"pace_vs_optimal\":{"
         << "\"delta\":\"" << analysis.pace_vs_optimal.formatted_delta << "\","
         << "\"delta_seconds\":" << analysis.pace_vs_optimal.delta_to_optimal << ","
         << "\"projected_lap\":" << analysis.pace_vs_optimal.projected_lap_time
         << "},"
         << "\"lap_predictions\":{"
         << "\"current_lap\":" << analysis.lap_predictions.current_lap_prediction << ","
         << "\"next_lap\":" << analysis.lap_predictions.next_lap_prediction << ","
         << "\"trend_slope\":" << analysis.lap_predictions.trend_slope
         << "},"
         << "\"tyre_performance\":{"
         << "\"index\":" << analysis.tyre_performance.performance_index << ","
         << "\"trend\":\"" << analysis.tyre_performance.trend << "\","
         << "\"temp_penalty\":" << analysis.tyre_performance.temp_penalty << ","
         << "\"age_penalty\":" << analysis.tyre_performance.age_penalty << ","
         << "\"wear_penalty\":" << analysis.tyre_performance.wear_penalty
         << "},"
         << "\"consistency\":{"
         << "\"score\":" << analysis.consistency.consistency_score << ","
         << "\"class\":\"" << analysis.consistency.classification << "\","
         << "\"std_dev\":" << analysis.consistency.standard_deviation << ","
         << "\"avg_lap\":" << analysis.consistency.average_lap_time
         << "},"
         << "\"degradation\":{"
         << "\"slope\":" << analysis.degradation.slope << ","
         << "\"trend\":\"" << analysis.degradation.trend_class << "\","
         << "\"formatted\":\"" << analysis.degradation.formatted_trend << "\","
         << "\"next_pred\":" << analysis.degradation.next_predicted_time
         << "}"
         << "}";
    
    return json.str();
}

void LiveAnalysisProcessor::resetSession() {
    recent_lap_times.clear();
    last_5_lap_times.clear();
    tyre_performance_history.clear();
    sector_baseline = SectorBaseline();
    current_lap_number = 0;
    session_active = false;
    last_analysis_time = 0;
    
    std::cout << "🔄 Backend Live Analysis Processor reset for new session" << std::endl;
}

bool LiveAnalysisProcessor::hasValidData() const {
    return sector_baseline.valid && recent_lap_times.size() >= 2;
}