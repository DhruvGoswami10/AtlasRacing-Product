#include "../../include/telemetry/accurate_lap_predictor.h"
#include <sstream>
#include <iomanip>
#include <numeric>

AccurateLapPredictor::AccurateLapPredictor() : current_lap_number(0), last_analysis_time(0) {
    initializeTireCurves();
}

AccurateLapPredictor::CompleteAnalysis AccurateLapPredictor::updateAnalysis(const DataProcessor::ProcessedTelemetry& telemetry) {
    CompleteAnalysis result;
    
    // Update lap history
    updateLapHistory(telemetry);
    
    // Throttle analysis frequency
    uint64_t now = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::system_clock::now().time_since_epoch()).count();
    
    if (now - last_analysis_time < ANALYSIS_INTERVAL_MS) {
        return result; // Return invalid if too frequent
    }
    last_analysis_time = now;
    
    // Filter and validate lap data
    filterValidLaps();
    
    if (!hasValidData()) {
        return result; // Not enough valid data
    }
    
    // Calculate prediction
    result.prediction = calculateMultiFactorPrediction(telemetry);
    
    // Calculate session analysis
    result.session.optimal_lap_time = optimal_baseline.theoretical_best;
    result.session.consistency_score = calculateConsistency();
    result.session.tire_performance = calculateTirePerformance(telemetry);
    result.session.pace_vs_optimal = calculatePaceVsOptimal(telemetry);
    result.session.session_phase = getSessionPhase();
    
    result.timestamp_ms = now;
    result.valid = true;
    
    return result;
}

AccurateLapPredictor::PredictionResult AccurateLapPredictor::calculateMultiFactorPrediction(const DataProcessor::ProcessedTelemetry& telemetry) {
    PredictionResult result;
    
    if (valid_laps_only.size() < MIN_LAPS_FOR_PREDICTION) {
        result.reasoning = "Need at least " + std::to_string(MIN_LAPS_FOR_PREDICTION) + " valid laps";
        return result;
    }
    
    // Early session prediction (first 5 laps) - much simpler approach
    if (valid_laps_only.size() <= 5) {
        return calculateEarlySessionPrediction(telemetry);
    }
    
    // 1. Calculate base pace (driver's optimal pace on this track)
    result.base_pace = calculateBasePace();
    
    // 2. Calculate fuel effect for next lap
    float current_fuel = telemetry.fuel_in_tank;
    float fuel_per_lap = 2.3f; // F1 24 typical consumption
    float next_lap_fuel = std::max(0.0f, current_fuel - fuel_per_lap);
    result.fuel_adjustment = calculateFuelEffect(current_fuel, next_lap_fuel);
    
    // 3. Calculate tire degradation (reduced for early session)
    std::string compound = getCompoundFromTelemetry(telemetry);
    uint8_t next_tire_age = telemetry.tyre_age_laps + 1;
    result.tire_adjustment = calculateTireDegradation(next_tire_age, compound) * 0.7f; // Reduce early impact
    
    // 4. Track evolution (track getting faster/slower)
    result.track_evolution = calculateTrackEvolution();
    
    // 5. Combine all factors
    result.next_lap_time = result.base_pace + result.fuel_adjustment + 
                          result.tire_adjustment + result.track_evolution;
    
    // 6. Calculate confidence based on data quality
    float lap_count_factor = std::min(1.0f, static_cast<float>(valid_laps_only.size()) / 5.0f);
    float consistency_factor = calculateConsistency() / 100.0f;
    result.confidence = (lap_count_factor * 0.6f) + (consistency_factor * 0.4f);
    
    // 7. Generate reasoning for AI
    std::ostringstream reasoning;
    reasoning << std::fixed << std::setprecision(3)
              << "Base pace: " << result.base_pace << "s, "
              << "fuel effect: " << result.fuel_adjustment << "s, "
              << "tire deg: " << result.tire_adjustment << "s, "
              << "track evolution: " << result.track_evolution << "s";
    result.reasoning = reasoning.str();
    
    result.valid = true;
    return result;
}

float AccurateLapPredictor::calculateBasePace() {
    if (valid_laps_only.size() < 3) {
        // Use best lap if we don't have enough data
        return valid_laps_only.empty() ? 90.0f : 
               (*std::min_element(valid_laps_only.begin(), valid_laps_only.end(),
                [](const LapData& a, const LapData& b) { return a.lap_time < b.lap_time; })).lap_time;
    }
    
    // Take average of best 3 laps, adjusted for fuel
    std::vector<LapData> sorted_laps = valid_laps_only;
    std::sort(sorted_laps.begin(), sorted_laps.end(),
              [](const LapData& a, const LapData& b) { return a.lap_time < b.lap_time; });
    
    float total_adjusted_time = 0;
    for (size_t i = 0; i < std::min(size_t(3), sorted_laps.size()); i++) {
        float fuel_correction = (sorted_laps[i].fuel_at_start - 50.0f) * 0.035f; // Normalize to 50kg
        total_adjusted_time += sorted_laps[i].lap_time - fuel_correction;
    }
    
    return total_adjusted_time / std::min(size_t(3), sorted_laps.size());
}

float AccurateLapPredictor::calculateFuelEffect(float current_fuel, float next_lap_fuel) {
    // F1 24: approximately 0.035s per kg of fuel
    float fuel_delta = current_fuel - next_lap_fuel;
    return -fuel_delta * 0.035f; // Negative because less fuel = faster lap
}

float AccurateLapPredictor::calculateTireDegradation(uint8_t tire_age, const std::string& compound) {
    if (tire_deg_curves.find(compound) == tire_deg_curves.end()) {
        // Fallback: generic degradation curve
        return std::min(2.0f, tire_age * 0.05f);
    }
    
    const auto& curve = tire_deg_curves[compound];
    if (tire_age >= curve.size()) {
        return curve.back(); // Use last value for very old tires
    }
    
    return curve[tire_age];
}

float AccurateLapPredictor::calculateTrackEvolution() {
    if (valid_laps_only.size() < 4) {
        return 0.0f; // Not enough data for trend
    }
    
    // Linear regression on recent laps to detect track evolution
    size_t recent_count = std::min(size_t(6), valid_laps_only.size());
    size_t start_idx = valid_laps_only.size() - recent_count;
    
    float sum_x = 0, sum_y = 0, sum_xy = 0, sum_x2 = 0;
    
    for (size_t i = 0; i < recent_count; i++) {
        float x = static_cast<float>(i + 1);
        float y = valid_laps_only[start_idx + i].lap_time;
        
        // Correct for fuel effect to isolate track evolution
        float fuel_correction = (valid_laps_only[start_idx + i].fuel_at_start - 50.0f) * 0.035f;
        y -= fuel_correction;
        
        sum_x += x;
        sum_y += y;
        sum_xy += x * y;
        sum_x2 += x * x;
    }
    
    float n = static_cast<float>(recent_count);
    float denominator = n * sum_x2 - sum_x * sum_x;
    
    if (std::abs(denominator) < 0.001f) {
        return 0.0f; // Avoid division by zero
    }
    
    float slope = (n * sum_xy - sum_x * sum_y) / denominator;
    
    // Project one lap ahead
    return slope;
}

bool AccurateLapPredictor::isValidLap(const LapData& lap) const {
    if (!lap.valid_lap || lap.lap_time <= 0 || lap.lap_number <= 1) {
        return false;
    }
    
    // For early prediction, be more lenient with outliers
    if (valid_laps_only.size() < 3) {
        return true; // Accept any reasonable lap time when starting
    }
    
    // Filter out outliers (laps more than 25% slower than optimal for established sessions)
    if (optimal_baseline.valid && lap.lap_time > optimal_baseline.theoretical_best * 1.25f) {
        return false;
    }
    
    return true;
}

void AccurateLapPredictor::updateOptimalBaseline(const LapData& lap) {
    if (lap.sector1_time <= 0 || lap.sector2_time <= 0 || lap.sector3_time <= 0) {
        return; // Invalid sector times
    }
    
    if (!optimal_baseline.valid) {
        optimal_baseline.best_sector1 = lap.sector1_time;
        optimal_baseline.best_sector2 = lap.sector2_time;
        optimal_baseline.best_sector3 = lap.sector3_time;
        optimal_baseline.valid = true;
    } else {
        // Update with better sector times
        optimal_baseline.best_sector1 = std::min(optimal_baseline.best_sector1, lap.sector1_time);
        optimal_baseline.best_sector2 = std::min(optimal_baseline.best_sector2, lap.sector2_time);
        optimal_baseline.best_sector3 = std::min(optimal_baseline.best_sector3, lap.sector3_time);
    }
    
    optimal_baseline.theoretical_best = optimal_baseline.best_sector1 + 
                                      optimal_baseline.best_sector2 + 
                                      optimal_baseline.best_sector3;
}

void AccurateLapPredictor::filterValidLaps() {
    valid_laps_only.clear();
    
    for (const auto& lap : lap_history) {
        if (isValidLap(lap)) {
            valid_laps_only.push_back(lap);
        }
    }
    
}

float AccurateLapPredictor::calculateConsistency() {
    if (valid_laps_only.size() < 2) {
        return 0.0f;
    }
    
    // Calculate standard deviation of valid lap times (fuel-corrected)
    float mean = 0.0f;
    for (const auto& lap : valid_laps_only) {
        float fuel_correction = (lap.fuel_at_start - 50.0f) * 0.035f;
        mean += lap.lap_time - fuel_correction;
    }
    mean /= valid_laps_only.size();
    
    float variance = 0.0f;
    for (const auto& lap : valid_laps_only) {
        float fuel_correction = (lap.fuel_at_start - 50.0f) * 0.035f;
        float corrected_time = lap.lap_time - fuel_correction;
        variance += (corrected_time - mean) * (corrected_time - mean);
    }
    variance /= valid_laps_only.size();
    
    float std_dev = std::sqrt(variance);
    
    // Convert to 0-100 scale (lower std dev = higher consistency)
    float consistency = 100.0f * (1.0f - std::min(1.0f, std_dev / 2.0f));
    
    return std::max(0.0f, consistency);
}

float AccurateLapPredictor::calculateTirePerformance(const DataProcessor::ProcessedTelemetry& telemetry) {
    // Simple tire performance model
    float performance = 100.0f;
    
    // Temperature penalty (optimal around 90-100°C for F1 24)
    float avg_temp = (telemetry.tyre_surface_temp[0] + telemetry.tyre_surface_temp[1] + 
                     telemetry.tyre_surface_temp[2] + telemetry.tyre_surface_temp[3]) / 4.0f;
    
    float optimal_temp = 95.0f;
    float temp_penalty = std::abs(avg_temp - optimal_temp) * 0.5f;
    
    // Age penalty
    float age_penalty = telemetry.tyre_age_laps * 1.0f;
    
    performance -= temp_penalty + age_penalty;
    
    return std::max(0.0f, std::min(100.0f, performance));
}

float AccurateLapPredictor::calculatePaceVsOptimal(const DataProcessor::ProcessedTelemetry& telemetry) {
    if (!optimal_baseline.valid) {
        return 0.0f;
    }
    
    float current_lap_time = telemetry.current_lap_time;
    if (current_lap_time <= 0) {
        // Estimate based on last lap
        current_lap_time = telemetry.last_lap_time;
    }
    
    return current_lap_time - optimal_baseline.theoretical_best;
}

void AccurateLapPredictor::initializeTireCurves() {
    // F1 24 tire degradation curves (seconds of lap time penalty)
    tire_deg_curves["C5"] = {0.0f, 0.1f, 0.25f, 0.45f, 0.7f, 1.0f, 1.4f, 1.9f, 2.5f}; // Soft - fast dropoff
    tire_deg_curves["C4"] = {0.0f, 0.05f, 0.12f, 0.22f, 0.35f, 0.5f, 0.7f, 0.95f, 1.25f}; // Medium
    tire_deg_curves["C3"] = {0.0f, 0.03f, 0.08f, 0.15f, 0.24f, 0.35f, 0.48f, 0.65f, 0.85f}; // Hard - gradual
    tire_deg_curves["INTERMEDIATE"] = {0.0f, 0.02f, 0.05f, 0.1f, 0.16f, 0.24f, 0.34f, 0.46f, 0.6f};
    tire_deg_curves["WET"] = {0.0f, 0.01f, 0.03f, 0.06f, 0.1f, 0.15f, 0.21f, 0.28f, 0.36f};
    
}

std::string AccurateLapPredictor::getCompoundFromTelemetry(const DataProcessor::ProcessedTelemetry& telemetry) {
    // Map F1 24 compound IDs to strings
    switch (telemetry.tyre_compound_actual) {
        case 16: return "C5"; // Soft
        case 17: return "C4"; // Medium  
        case 18: return "C3"; // Hard
        case 7: return "INTERMEDIATE";
        case 8: return "WET";
        default: return "C4"; // Default to medium
    }
}

void AccurateLapPredictor::updateLapHistory(const DataProcessor::ProcessedTelemetry& telemetry) {
    // Check for lap completion
    if (telemetry.current_lap_num != current_lap_number && telemetry.last_lap_time > 0) {
        current_lap_number = telemetry.current_lap_num;
        
        LapData lap;
        lap.lap_time = telemetry.last_lap_time;
        lap.lap_number = current_lap_number - 1; // Last completed lap
        lap.fuel_at_start = telemetry.fuel_in_tank + 2.3f; // Estimate fuel at start
        lap.avg_tire_temp = (telemetry.tyre_surface_temp[0] + telemetry.tyre_surface_temp[1] + 
                           telemetry.tyre_surface_temp[2] + telemetry.tyre_surface_temp[3]) / 4.0f;
        lap.tire_age_laps = telemetry.tyre_age_laps;
        lap.tire_compound = getCompoundFromTelemetry(telemetry);
        lap.sector1_time = telemetry.sector1_time_ms / 1000.0f;
        lap.sector2_time = telemetry.sector2_time_ms / 1000.0f;
        lap.sector3_time = telemetry.sector3_time_ms / 1000.0f;
        
        // Basic validation - assume valid if reasonable lap time
        lap.valid_lap = (lap.lap_time > 30.0f && lap.lap_time < 300.0f);
        
        lap_history.push_back(lap);
        
        // Maintain history size
        if (lap_history.size() > MAX_LAP_HISTORY) {
            lap_history.erase(lap_history.begin());
        }
        
        // Update optimal baseline
        if (lap.valid_lap) {
            updateOptimalBaseline(lap);
        }
        
        std::cout << "📊 Added lap " << static_cast<int>(lap.lap_number) 
                  << ": " << std::fixed << std::setprecision(3) << lap.lap_time 
                  << "s (" << lap.tire_compound << ", age " << static_cast<int>(lap.tire_age_laps) << ")" << std::endl;
    }
}

std::string AccurateLapPredictor::getSessionPhase() const {
    if (lap_history.size() < 3) {
        return "practice";
    }
    
    // Simple heuristic based on tire usage patterns
    bool multiple_compounds = false;
    std::string first_compound = lap_history.empty() ? "" : lap_history[0].tire_compound;
    
    for (const auto& lap : lap_history) {
        if (lap.tire_compound != first_compound) {
            multiple_compounds = true;
            break;
        }
    }
    
    return multiple_compounds ? "race" : "qualifying";
}

std::string AccurateLapPredictor::analysisToJSON(const CompleteAnalysis& analysis) {
    if (!analysis.valid) {
        return "{\"analysis_valid\":false}";
    }
    
    std::ostringstream json;
    json << std::fixed << std::setprecision(3);
    
    json << "{"
         << "\"analysis_valid\":true,"
         << "\"timestamp\":" << analysis.timestamp_ms << ","
         << "\"prediction\":{"
         << "\"next_lap_time\":" << analysis.prediction.next_lap_time << ","
         << "\"confidence\":" << analysis.prediction.confidence << ","
         << "\"base_pace\":" << analysis.prediction.base_pace << ","
         << "\"fuel_adjustment\":" << analysis.prediction.fuel_adjustment << ","
         << "\"tire_adjustment\":" << analysis.prediction.tire_adjustment << ","
         << "\"track_evolution\":" << analysis.prediction.track_evolution << ","
         << "\"reasoning\":\"" << analysis.prediction.reasoning << "\""
         << "},"
         << "\"session\":{"
         << "\"optimal_lap_time\":" << analysis.session.optimal_lap_time << ","
         << "\"consistency_score\":" << analysis.session.consistency_score << ","
         << "\"tire_performance\":" << analysis.session.tire_performance << ","
         << "\"pace_vs_optimal\":" << analysis.session.pace_vs_optimal << ","
         << "\"session_phase\":\"" << analysis.session.session_phase << "\""
         << "}"
         << "}";
    
    return json.str();
}

AccurateLapPredictor::PredictionResult AccurateLapPredictor::calculateEarlySessionPrediction(const DataProcessor::ProcessedTelemetry& telemetry) {
    PredictionResult result;
    
    // For early laps, use a simple approach that accounts for driver improvement
    if (valid_laps_only.size() == 1) {
        // First prediction: very conservative improvement assumption
        result.base_pace = valid_laps_only[0].lap_time * 0.995f; // 0.5% improvement only
        result.fuel_adjustment = -0.08f; // Lighter fuel, faster lap
        result.tire_adjustment = 0.0f;   // No tire deg yet
        result.track_evolution = -0.05f; // Minor track improvement
        result.confidence = 0.3f;        // Low confidence
        result.reasoning = "Early session: Conservative improvement estimate";
    }
    else if (valid_laps_only.size() == 2) {
        // Second prediction: analyze actual improvement and continue trend
        float lap1_time = valid_laps_only[0].lap_time;
        float lap2_time = valid_laps_only[1].lap_time;
        float raw_improvement = lap1_time - lap2_time;
        
        // If driver got faster, expect continued improvement at reduced rate
        // If driver got slower, expect stabilization around lap 2 time
        if (raw_improvement > 0) {
            // Driver improved - expect 30% of that improvement to continue
            result.base_pace = lap2_time - (raw_improvement * 0.3f);
        } else {
            // Driver got slower - probably a mistake, expect recovery
            result.base_pace = lap2_time - 0.2f; // Small recovery
        }
        
        result.fuel_adjustment = -0.08f; // Fuel effect
        result.tire_adjustment = 0.02f;  // Minimal tire deg
        result.track_evolution = -0.03f; // Minor track improvement
        result.confidence = 0.5f;
        result.reasoning = "Trend continuation: " + std::to_string(raw_improvement) + "s change";
    }
    else if (valid_laps_only.size() == 3) {
        // Third prediction: use best of last 2 laps with small adjustments
        float recent_best = std::min(valid_laps_only[1].lap_time, valid_laps_only[2].lap_time);
        
        // Check for potential driver error in recent laps
        float lap2_time = valid_laps_only[1].lap_time;
        float lap3_time = valid_laps_only[2].lap_time;
        float time_variance = std::abs(lap2_time - lap3_time);
        
        if (time_variance > 1.0f) {
            // Large variance suggests driver error - use more conservative estimate
            result.base_pace = (lap2_time + lap3_time) / 2.0f;
            result.reasoning = "High lap variance detected - using average";
        } else {
            result.base_pace = recent_best + 0.1f;
            result.reasoning = "Consistent pace - best recent + margin";
        }
        
        // Account for ERS deployment
        float ers_adjustment = calculateERSEffect(telemetry);
        
        result.fuel_adjustment = -0.08f;
        result.tire_adjustment = 0.03f;  // Minor tire deg
        result.track_evolution = -0.02f + ers_adjustment; // Include ERS effect
        result.confidence = 0.65f;
    }
    else if (valid_laps_only.size() == 4) {
        // Fourth prediction: average of best 2 of last 3 laps
        std::vector<float> recent_times = {
            valid_laps_only[1].lap_time,
            valid_laps_only[2].lap_time,
            valid_laps_only[3].lap_time
        };
        std::sort(recent_times.begin(), recent_times.end());
        float avg_best_2 = (recent_times[0] + recent_times[1]) / 2.0f;
        
        // Check for outliers that suggest driver errors
        float time_range = recent_times[2] - recent_times[0];
        if (time_range > 1.5f) {
            // Large spread suggests inconsistency - be more conservative
            result.base_pace = avg_best_2 + 0.15f;
            result.reasoning = "Large lap time spread - conservative estimate";
        } else {
            result.base_pace = avg_best_2 + 0.05f;
            result.reasoning = "Average of 2 best recent laps";
        }
        
        float ers_adjustment = calculateERSEffect(telemetry);
        result.fuel_adjustment = -0.08f;
        result.tire_adjustment = 0.05f;  // Minor tire deg
        result.track_evolution = ers_adjustment;   // Mainly ERS effect
        result.confidence = 0.75f;
    }
    else { // 5 laps
        // Fifth prediction: more conservative, expect consistency
        std::vector<float> recent_times = {
            valid_laps_only[2].lap_time,
            valid_laps_only[3].lap_time,
            valid_laps_only[4].lap_time
        };
        std::sort(recent_times.begin(), recent_times.end());
        float median = recent_times[1]; // Middle value
        
        // Advanced outlier detection for 5+ laps
        float iqr = recent_times[2] - recent_times[0]; // Interquartile range
        if (iqr > 2.0f) {
            // Very inconsistent - use most conservative estimate
            result.base_pace = median + 0.2f;
            result.reasoning = "High inconsistency - very conservative";
        } else if (iqr > 1.0f) {
            result.base_pace = median + 0.1f;
            result.reasoning = "Moderate inconsistency - conservative";
        } else {
            result.base_pace = median;
            result.reasoning = "Consistent pace - median based";
        }
        
        float ers_adjustment = calculateERSEffect(telemetry);
        result.fuel_adjustment = -0.08f;
        result.tire_adjustment = 0.07f;  // Slight tire deg
        result.track_evolution = ers_adjustment;   // Mainly ERS effect
        result.confidence = 0.8f;
    }
    
    // Combine factors
    result.next_lap_time = result.base_pace + result.fuel_adjustment + 
                          result.tire_adjustment + result.track_evolution;
    
    result.valid = true;
    return result;
}

float AccurateLapPredictor::calculateERSEffect(const DataProcessor::ProcessedTelemetry& telemetry) {
    // ERS can provide approximately 0.3-0.5s per lap advantage when deployed optimally
    // ers_deploy_mode: 0=None, 1=Medium, 2=Hotlap, 3=Overtake
    // ers_store_energy: 0-4000000 (joules * 1000)
    
    float ers_energy_percent = telemetry.ers_store_energy / 4000000.0f; // Normalize to 0-1
    
    switch (telemetry.ers_deploy_mode) {
        case 0: // No deployment
            return 0.0f;
            
        case 1: // Medium deployment
            if (ers_energy_percent > 0.5f) {
                return -0.15f; // 0.15s faster
            } else if (ers_energy_percent > 0.2f) {
                return -0.08f; // Limited benefit
            }
            return 0.0f; // Not enough energy
            
        case 2: // Hotlap deployment
            if (ers_energy_percent > 0.7f) {
                return -0.35f; // Maximum benefit
            } else if (ers_energy_percent > 0.4f) {
                return -0.25f; // Good benefit
            } else if (ers_energy_percent > 0.2f) {
                return -0.15f; // Limited benefit
            }
            return -0.05f; // Minimal benefit even with low energy
            
        case 3: // Overtake deployment (similar to hotlap)
            if (ers_energy_percent > 0.6f) {
                return -0.3f; // Strong benefit
            } else if (ers_energy_percent > 0.3f) {
                return -0.2f; // Moderate benefit
            }
            return -0.1f; // Some benefit even with low energy
            
        default:
            return 0.0f;
    }
}

void AccurateLapPredictor::resetSession() {
    lap_history.clear();
    valid_laps_only.clear();
    optimal_baseline = OptimalBaseline();
    current_lap_number = 0;
    last_analysis_time = 0;
    
    std::cout << "🔄 Accurate Lap Predictor reset for new session" << std::endl;
}

bool AccurateLapPredictor::hasValidData() const {
    return valid_laps_only.size() >= MIN_LAPS_FOR_PREDICTION;
}
