#include "ac_shared_memory.h"
#include "../../../include/telemetry/data_processor.h"
#include <iostream>
#include <thread>
#include <chrono>
#include <cstring>
#include <cstdio>
#include <vector>
#include <algorithm>
#include <cmath>
#include <array>
#include <limits>

#ifdef _WIN32

class AC_Parser {
private:
    enum class TyreWearMode {
        Unknown,
        FractionZeroFresh,
        FractionOneFresh,
        PercentageCondition
    };

    AC::SharedMemoryReader shared_memory;
    bool initialized;
    int consecutive_failures;
    std::chrono::steady_clock::time_point last_data_time;

    // Previous data for delta calculations
    float previous_speed = 0.0f;
    uint16_t previous_rpm = 0;

    // Tyre state tracking for age estimation
    float previous_max_tyre_wear = 0.0f;
    int tyre_age_lap_counter = 0;
    int last_completed_laps_age = -1;
    bool last_in_pit_state = false;
    TyreWearMode tyre_wear_mode = TyreWearMode::Unknown;

public:
    AC_Parser()
        : initialized(false)
        , consecutive_failures(0)
        , previous_speed(0.0f)
        , previous_rpm(0)
        , previous_max_tyre_wear(0.0f)
        , tyre_age_lap_counter(0)
        , last_completed_laps_age(-1)
        , last_in_pit_state(false)
        , tyre_wear_mode(TyreWearMode::Unknown) {}
    
    bool isGameRunning() {
        return shared_memory.isGameRunning();
    }
    
    bool initialize() {
        std::cout << "Initializing AC parser..." << std::endl;
        
        if (!isGameRunning()) {
            std::cout << "AC (acs.exe or AssettoCorsa.exe) not detected. Please start Assetto Corsa." << std::endl;
            std::cout << "Note: AC works with both standalone and Content Manager launches." << std::endl;
            return false;
        }
        
        // Try multiple times as AC might take time to create shared memory
        for (int attempts = 0; attempts < 10; attempts++) {
            if (shared_memory.initialize()) {
                initialized = true;
                consecutive_failures = 0;
                std::cout << "✓ [AC] Connected to shared memory." << std::endl;
                
                // Log AC version info
                auto static_data = shared_memory.getStatic();
                if (static_data) {
                    std::wcout << L"AC Version: " << std::wstring(static_data->acVersion) << std::endl;
                    std::wcout << L"Track: " << std::wstring(static_data->track) << std::endl;
                    std::wcout << L"Car: " << std::wstring(static_data->carModel) << std::endl;
                    std::wcout << L"Player: " << std::wstring(static_data->playerName) 
                              << L" " << std::wstring(static_data->playerSurname) << std::endl;
                }
                
                return true;
            }
            
            std::cout << "AC shared memory not ready, attempt " << (attempts + 1) << "/10..." << std::endl;
            std::this_thread::sleep_for(std::chrono::milliseconds(500));
        }
        
        std::cout << "✗ Failed to connect to AC shared memory after 10 attempts." << std::endl;
        std::cout << "Make sure AC is running and in a live session (not paused or in menu)." << std::endl;
        return false;
    }
    
    bool isConnected() {
        return initialized && shared_memory.isConnected();
    }
    
    bool hasValidData() {
        if (!isConnected()) {
            consecutive_failures++;
            if (consecutive_failures > 100) {
                std::cout << "Lost connection to AC, attempting reconnect..." << std::endl;
                initialized = false;
                consecutive_failures = 0;
            }
            return false;
        }

        // Check if we have valid shared memory data
        if (!shared_memory.isDataValid()) {
            return false;
        }

        // Accept data regardless of session state - AC might report incorrect status
        // Original code was too restrictive: if (!shared_memory.isSessionActive()) return false;
        // This allows telemetry even when AC reports status as OFF/PAUSED

        consecutive_failures = 0;
        return true;
    }
    
    DataProcessor::ProcessedTelemetry readTelemetry() {
        DataProcessor::ProcessedTelemetry data = {}; // Initialize all to zero
        
        if (!hasValidData()) {
            return data;
        }
        
        auto physics = shared_memory.getPhysics();
        auto graphics = shared_memory.getGraphics();
        auto static_info = shared_memory.getStatic();
        
        if (!physics || !graphics || !static_info) {
            return data;
        }
        
        // Basic telemetry data
        data.speed_kph = physics->speedKmh;
        data.rpm = static_cast<uint16_t>(physics->rpms);
        
        // AC gear numbering: 0=reverse, 1=neutral, 2=1st, 3=2nd, etc.
        // Convert to F1 style: -1=reverse, 0=neutral, 1=1st, 2=2nd, etc.
        if (physics->gear == 0) {
            data.gear = -1; // Reverse
        } else if (physics->gear == 1) {
            data.gear = 0;  // Neutral
        } else {
            data.gear = static_cast<int8_t>(physics->gear - 1); // 1st, 2nd, etc.
        }
        
        data.throttle_percent = physics->gas * 100.0f;
        data.brake_percent = physics->brake * 100.0f;
        
        // Calculate deltas for smooth visualization
        data.speed_delta = data.speed_kph - previous_speed;
        data.rpm_delta = static_cast<float>(data.rpm) - static_cast<float>(previous_rpm);
        
        previous_speed = data.speed_kph;
        previous_rpm = data.rpm;
        
        // Timing data (convert milliseconds to seconds)
        data.current_lap_time = graphics->iCurrentTime / 1000.0f;
        data.last_lap_time = graphics->iLastTime / 1000.0f;
        data.best_lap_time = graphics->iBestTime / 1000.0f;

        int displayLap = static_cast<int>(graphics->completedLaps) + 1;
        if (displayLap < 0) {
            displayLap = 0;
        }
        const int totalLaps = static_cast<int>(graphics->numberOfLaps);
        if (totalLaps > 0 && displayLap > totalLaps) {
            displayLap = totalLaps;
        }
        data.current_lap_num = static_cast<uint8_t>(displayLap);

        // Delta calculations using AC's built-in performance meter
        static float session_fastest_time = 0.0f;
        static float last_completed_lap_time = 0.0f;
        static int last_completed_lap_count = -1;

        // Track session fastest lap (start with our personal best)
        if (data.best_lap_time > 0 && (session_fastest_time == 0 || data.best_lap_time < session_fastest_time)) {
            session_fastest_time = data.best_lap_time;
        }

        // Update last completed lap time when lap count changes
        if (graphics->completedLaps > last_completed_lap_count) {
            last_completed_lap_time = data.last_lap_time;
            last_completed_lap_count = graphics->completedLaps;
        }

        // Delta (personal): AC provides this directly via performanceMeter!
        // performanceMeter: 0 = on pace, positive = slower, negative = faster
        data.delta_time = physics->performanceMeter;

        // Delta (session): Compare against session fastest using same performance meter logic
        if (session_fastest_time > 0 && data.best_lap_time > 0) {
            // Calculate how much our personal best differs from session fastest
            float personal_vs_session = data.best_lap_time - session_fastest_time;
            // Add current performance delta to that baseline
            data.delta_time_session = personal_vs_session + physics->performanceMeter;
        } else {
            data.delta_time_session = physics->performanceMeter; // Fallback to personal delta
        }

        // Delta (last): Compare current pace against last completed lap
        if (last_completed_lap_time > 0 && data.current_lap_time > 0) {
            // Simple comparison: current lap time vs last lap time at current position
            float progress_ratio = data.current_lap_time / last_completed_lap_time;
            if (progress_ratio <= 1.0f) {
                // We're still within the timeframe of the last lap
                float expected_time_at_position = last_completed_lap_time * progress_ratio;
                data.delta_time_last = data.current_lap_time - expected_time_at_position;
            } else {
                // Current lap is already longer than last lap
                data.delta_time_last = data.current_lap_time - last_completed_lap_time;
            }
        } else {
            data.delta_time_last = 0.0f; // No last lap to compare to
        }

        // Estimated lap time: Personal best + current delta
        if (data.best_lap_time > 0) {
            data.estimated_lap_time = data.best_lap_time + physics->performanceMeter;
        } else {
            data.estimated_lap_time = 0.0f; // No personal best yet
        }
        data.position = static_cast<uint8_t>(graphics->position);
        
        // AC Sector System - Simple 3 sectors only
        // AC provides currentSectorIndex (0, 1, 2) directly
        data.current_sector = static_cast<uint8_t>(graphics->currentSectorIndex);

        // AC Sector Timing - Calculate from iCurrentTime since lastSectorTime is unreliable
        static uint32_t sector1_time = 0, sector2_time = 0, sector3_time = 0;
        static uint32_t s1_end_time = 0; // Store when S1 ended for S2 calculation
        static int last_sector = -1;
        static int last_lap = -1;
        static bool s3_completed = false;
        static std::chrono::steady_clock::time_point s3_display_until;
        static uint32_t saved_s3_time = 0;

        // Handle lap completion - FIRST save S3, THEN reset
        if (graphics->completedLaps != last_lap) {
            // NEW LAP DETECTED - but DON'T reset sectors immediately
            // Let the sector transition logic below handle S3 saving first
            last_lap = graphics->completedLaps;
            // Note: Don't reset sectors here - let sector transition save S3 first
        }

        // Detect sector completion and calculate the time
        if (graphics->currentSectorIndex != last_sector) {
            // Sector just changed, calculate the time of the completed sector
            if (last_sector == 0 && graphics->currentSectorIndex == 1) {
                // Just completed sector 1
                // S1 split = time from lap start to end of S1
                sector1_time = graphics->iCurrentTime; // Total time to S1 finish
                s1_end_time = sector1_time; // Store absolute time for S2 calculation
            } else if (last_sector == 1 && graphics->currentSectorIndex == 2) {
                // Just completed sector 2
                // S2 split = time from S1 end to S2 end
                sector2_time = graphics->iCurrentTime - s1_end_time;
            } else if (last_sector == 2 && graphics->currentSectorIndex == 0) {
                // Just completed sector 3 (lap complete)
                // S3 split = time from S2 end to lap end
                if (graphics->iLastTime > 0) {
                    sector3_time = graphics->iLastTime - (s1_end_time + sector2_time);
                    saved_s3_time = sector3_time;
                    s3_completed = true;
                    // Show S3 for 4 seconds after lap completion
                    s3_display_until = std::chrono::steady_clock::now() + std::chrono::seconds(4);

                    // NOW reset the sector times for the new lap (after saving S3)
                    sector1_time = 0;
                    sector2_time = 0;
                    sector3_time = 0;
                    s1_end_time = 0;
                }
            }
            last_sector = graphics->currentSectorIndex;
        }

        // Check if S3 display period has expired
        if (s3_completed && std::chrono::steady_clock::now() > s3_display_until) {
            // S3 display period expired, clear the flag
            s3_completed = false;
            saved_s3_time = 0;
        }

        // Set the sector times - show saved S3 if in display period
        data.sector1_time_ms = sector1_time;
        data.sector2_time_ms = sector2_time;
        if (s3_completed && std::chrono::steady_clock::now() <= s3_display_until) {
            data.sector3_time_ms = saved_s3_time; // Show saved S3 for 4 seconds
        } else {
            data.sector3_time_ms = sector3_time;
        }

        // Position and status
        data.result_status = 0; // AC doesn't have result status like F1

        // Pit status
        data.pit_status = graphics->isInPit ? 1 : 0;
        
        // AC has very detailed tire data - use outer temperature for compatibility
        float raw_tyre_wear_values[4] = {0.0f, 0.0f, 0.0f, 0.0f};
        float raw_tyre_condition_drop[4] = {0.0f, 0.0f, 0.0f, 0.0f};
        float raw_wear_sum = 0.0f;
        float raw_wear_max = -1.0f;

        for (int i = 0; i < 4; i++) {
            data.tyre_surface_temp[i] = static_cast<uint8_t>(std::min(255.0f, std::max(0.0f, physics->tyreTempO[i])));
            data.tyre_inner_temp[i] = static_cast<uint8_t>(std::min(255.0f, std::max(0.0f, physics->tyreTempI[i])));
            data.tyre_pressure[i] = physics->wheelsPressure[i];
            raw_tyre_wear_values[i] = physics->tyreWear[i];
            raw_wear_sum += raw_tyre_wear_values[i];
            if (raw_tyre_wear_values[i] > raw_wear_max) {
                raw_wear_max = raw_tyre_wear_values[i];
            }
        }

        if (raw_wear_max > 1.5f) {
            tyre_wear_mode = TyreWearMode::PercentageCondition;
        } else if (tyre_wear_mode == TyreWearMode::Unknown) {
            const float average_raw_wear = raw_wear_sum / 4.0f;
            if (average_raw_wear >= 0.7f) {
                tyre_wear_mode = TyreWearMode::FractionOneFresh;
            } else {
                tyre_wear_mode = TyreWearMode::FractionZeroFresh;
            }
        }

        const float wear_scale_factor = 300.0f; // empirical scaling to approximate in-game AC UI (100% -> 0%)
        float max_tyre_wear_percent = 0.0f;
        float base_tyre_drop[4] = {0.0f, 0.0f, 0.0f, 0.0f};
        for (int i = 0; i < 4; ++i) {
            const float raw_wear = raw_tyre_wear_values[i];
            float wear_percent = 0.0f;

            switch (tyre_wear_mode) {
                case TyreWearMode::PercentageCondition:
                    wear_percent = std::clamp(100.0f - raw_wear, 0.0f, 100.0f);
                    break;
                case TyreWearMode::FractionOneFresh:
                    wear_percent = std::clamp((1.0f - std::clamp(raw_wear, 0.0f, 1.0f)) * 100.0f, 0.0f, 100.0f);
                    break;
                case TyreWearMode::FractionZeroFresh:
                case TyreWearMode::Unknown:
                default:
                    if (raw_wear > 1.5f) {
                        wear_percent = std::clamp(100.0f - raw_wear, 0.0f, 100.0f);
                        tyre_wear_mode = TyreWearMode::PercentageCondition;
                    } else {
                        wear_percent = std::clamp((1.0f - std::clamp(raw_wear, 0.0f, 1.0f)) * 100.0f, 0.0f, 100.0f);
                        if (tyre_wear_mode == TyreWearMode::Unknown) {
                            tyre_wear_mode = TyreWearMode::FractionZeroFresh;
                        }
                    }
                    break;
            }

            base_tyre_drop[i] = wear_percent;
            const float scaled_wear = std::clamp(wear_percent * wear_scale_factor, 0.0f, 100.0f);
            raw_tyre_condition_drop[i] = scaled_wear;

            data.tyre_wear[i] = scaled_wear;
            if (scaled_wear > max_tyre_wear_percent) {
                max_tyre_wear_percent = scaled_wear;
            }
        }

        static int wear_debug_counter = 0;
        if (++wear_debug_counter >= 60) {
            wear_debug_counter = 0;
            std::cout << "[AC] Tyre wear debug - raw=("
                      << raw_tyre_wear_values[0] << ", "
                      << raw_tyre_wear_values[1] << ", "
                      << raw_tyre_wear_values[2] << ", "
                      << raw_tyre_wear_values[3] << ") "
                      << "base_drop=("
                      << base_tyre_drop[0] << ", "
                      << base_tyre_drop[1] << ", "
                      << base_tyre_drop[2] << ", "
                      << base_tyre_drop[3] << ") "
                      << "converted=("
                      << raw_tyre_condition_drop[0] << ", "
                      << raw_tyre_condition_drop[1] << ", "
                      << raw_tyre_condition_drop[2] << ", "
                      << raw_tyre_condition_drop[3] << ") "
                      << "mode=" << static_cast<int>(tyre_wear_mode)
                      << std::endl;
        }

        // Estimate tyre age in laps since the last tyre change (best effort)
        int completed_laps = std::max(0, graphics->completedLaps);
        if (last_completed_laps_age == -1) {
            last_completed_laps_age = completed_laps;
            tyre_age_lap_counter = 0;
            previous_max_tyre_wear = max_tyre_wear_percent;
        } else {
            if (completed_laps < last_completed_laps_age) {
                // Session reset or restart
                tyre_age_lap_counter = completed_laps;
                last_completed_laps_age = completed_laps;
                tyre_wear_mode = TyreWearMode::Unknown;
                previous_max_tyre_wear = max_tyre_wear_percent;
            } else if (completed_laps > last_completed_laps_age) {
                tyre_age_lap_counter += (completed_laps - last_completed_laps_age);
                last_completed_laps_age = completed_laps;
            }
        }

        bool in_pit_state = (graphics->isInPit != 0) || (graphics->isInPitLane != 0);
        bool tyres_look_fresh = max_tyre_wear_percent < 2.0f;

        if (tyres_look_fresh && previous_max_tyre_wear > 5.0f) {
            tyre_age_lap_counter = 0;
        } else if (in_pit_state && !last_in_pit_state && tyres_look_fresh && previous_max_tyre_wear > 2.5f) {
            tyre_age_lap_counter = 0;
        }

        last_in_pit_state = in_pit_state;
        previous_max_tyre_wear = max_tyre_wear_percent;
        tyre_age_lap_counter = std::max(0, tyre_age_lap_counter);
        data.tyre_age_laps = static_cast<uint8_t>(std::clamp(tyre_age_lap_counter, 0, 255));
        
        // Tire compound (AC uses wide string, convert to simplified format)
        // Extract tire compound name from AC graphics data
        std::wstring compound_wide(graphics->tyreCompound);
        std::string compound_str(compound_wide.begin(), compound_wide.end());

        // Map common AC tire compounds to simple IDs for display
        if (compound_str.find("Medium") != std::string::npos || compound_str.find("MEDIUM") != std::string::npos) {
            data.tyre_compound_actual = 17; // Use F1 medium ID
            data.tyre_compound_visual = 17;
        } else if (compound_str.find("Soft") != std::string::npos || compound_str.find("SOFT") != std::string::npos) {
            data.tyre_compound_actual = 16; // Use F1 soft ID
            data.tyre_compound_visual = 16;
        } else if (compound_str.find("Hard") != std::string::npos || compound_str.find("HARD") != std::string::npos) {
            data.tyre_compound_actual = 18; // Use F1 hard ID
            data.tyre_compound_visual = 18;
        } else if (compound_str.find("Street") != std::string::npos || compound_str.find("STREET") != std::string::npos) {
            data.tyre_compound_actual = 19; // Use custom street ID
            data.tyre_compound_visual = 19;
        } else if (compound_str.find("Semi") != std::string::npos || compound_str.find("SEMI") != std::string::npos) {
            data.tyre_compound_actual = 20; // Use custom semi-slick ID
            data.tyre_compound_visual = 20;
        } else if (compound_str.find("Slick") != std::string::npos || compound_str.find("SLICK") != std::string::npos) {
            data.tyre_compound_actual = 21; // Use custom slick ID
            data.tyre_compound_visual = 21;
        } else {
            // Default to medium if we can't identify the compound
            data.tyre_compound_actual = 17;
            data.tyre_compound_visual = 17;
        }
        // tyre_age_laps already populated above
        
        // Fuel data - send actual liters, not percentage
        data.fuel_in_tank = physics->fuel;
        data.maxFuel = static_info->maxFuel;
        data.fuel_last_lap = 0.0f;

        // Track lap-by-lap fuel usage to project remaining laps
        static float last_fuel_sample = -1.0f;
        static int last_fuel_sample_lap = -1;
        static std::array<float, 8> fuel_usage_samples = {0.0f};
        static size_t fuel_usage_count = 0;
        static size_t fuel_usage_index = 0;
        static float last_completed_lap_burn = 0.0f;
        static bool rate_initialized = false;
        static auto last_rate_sample_time = std::chrono::steady_clock::now();
        static float last_rate_fuel = -1.0f;
        static std::array<float, 120> fuel_rate_samples = {0.0f};
        static size_t fuel_rate_index = 0;
        static size_t fuel_rate_count = 0;
        static float fuel_rate_sum = 0.0f;

        if (last_fuel_sample < 0.0f) {
            last_fuel_sample = physics->fuel;
            last_fuel_sample_lap = graphics->completedLaps;
        }

        if (graphics->completedLaps != last_fuel_sample_lap) {
            float fuel_used = last_fuel_sample - physics->fuel;
            if (fuel_used > 0.01f) {
                fuel_usage_samples[fuel_usage_index] = fuel_used;
                fuel_usage_index = (fuel_usage_index + 1) % fuel_usage_samples.size();
                if (fuel_usage_count < fuel_usage_samples.size()) {
                    fuel_usage_count++;
                }
                last_completed_lap_burn = fuel_used;
            } else {
                last_completed_lap_burn = 0.0f;
            }
            last_fuel_sample = physics->fuel;
            last_fuel_sample_lap = graphics->completedLaps;
        } else if (physics->fuel > last_fuel_sample + 0.2f) {
            // Refuel detected (pit stop, restart, etc.) - reset baseline to new fuel load
            last_fuel_sample = physics->fuel;
        }
        data.fuel_last_lap = last_completed_lap_burn;

        float average_fuel_per_lap = 0.0f;
        if (fuel_usage_count > 0) {
            const size_t window = std::min(fuel_usage_count, static_cast<size_t>(5));
            float sum = 0.0f;
            for (size_t i = 0; i < window; ++i) {
                size_t idx = (fuel_usage_index + fuel_usage_samples.size() - 1 - i) % fuel_usage_samples.size();
                sum += fuel_usage_samples[idx];
            }
            average_fuel_per_lap = sum / static_cast<float>(window);
            data.fuel_per_lap_average = average_fuel_per_lap;
            data.fuel_calc_ready = fuel_usage_count >= 5 ? 1 : 0;
        } else {
            data.fuel_calc_ready = 0;
        }

        // Project remaining laps based on rolling average
        float estimated_remaining_laps = 0.0f;
        if (average_fuel_per_lap > 0.01f) {
            estimated_remaining_laps = physics->fuel / average_fuel_per_lap;
        }
        data.fuel_remaining_laps = estimated_remaining_laps;

        // Compare against laps remaining in session (if available)
        int laps_remaining_in_session = 0;
        if (graphics->numberOfLaps > 0) {
            laps_remaining_in_session = std::max(0, graphics->numberOfLaps - graphics->completedLaps);
        }

        if (laps_remaining_in_session > 0 && average_fuel_per_lap > 0.01f) {
            float fuel_margin = estimated_remaining_laps - static_cast<float>(laps_remaining_in_session);
            data.fuel_margin_laps = fuel_margin;
            data.fuel_deficit_laps = fuel_margin < 0.0f ? -fuel_margin : 0.0f;
            data.fuel_target_save_per_lap = fuel_margin < 0.0f
                ? (-fuel_margin / static_cast<float>(laps_remaining_in_session))
                : 0.0f;
            data.fuel_strategy_status = fuel_margin < -0.5f
                ? 2
                : (fuel_margin < 0.5f ? 1 : 0);
        } else {
            data.fuel_margin_laps = 0.0f;
            data.fuel_deficit_laps = 0.0f;
            data.fuel_target_save_per_lap = 0.0f;
            data.fuel_strategy_status = 0;
        }

        // Real-time burn fallback for early laps
        auto rate_now = std::chrono::steady_clock::now();
        if (!rate_initialized) {
            last_rate_sample_time = rate_now;
            last_rate_fuel = physics->fuel;
            rate_initialized = true;
        } else {
            double dt = std::chrono::duration<double>(rate_now - last_rate_sample_time).count();
            float fuel_drop = last_rate_fuel - physics->fuel;
            if (fuel_drop < -1.0f) {
                fuel_rate_index = 0;
                fuel_rate_count = 0;
                fuel_rate_sum = 0.0f;
                fuel_rate_samples.fill(0.0f);
            } else if (dt > 0.05) {
                float new_sample = 0.0f;
                if (fuel_drop > 0.0005f) {
                    new_sample = fuel_drop / static_cast<float>(dt);
                }
                fuel_rate_sum -= fuel_rate_samples[fuel_rate_index];
                fuel_rate_samples[fuel_rate_index] = new_sample;
                fuel_rate_sum += new_sample;
                fuel_rate_index = (fuel_rate_index + 1) % fuel_rate_samples.size();
                if (fuel_rate_count < fuel_rate_samples.size()) {
                    fuel_rate_count++;
                }
                last_rate_sample_time = rate_now;
                last_rate_fuel = physics->fuel;
            }
        }

        float average_rate = (fuel_rate_count > 0)
            ? fuel_rate_sum / static_cast<float>(fuel_rate_count)
            : 0.0f;

        if (average_rate > 0.0001f) {
            float lap_time_est = 0.0f;
            if (graphics->iCurrentTime > 1000) {
                lap_time_est = static_cast<float>(graphics->iCurrentTime) / 1000.0f;
            }
            if (lap_time_est < 5.0f && graphics->iBestTime > 1000) {
                lap_time_est = static_cast<float>(graphics->iBestTime) / 1000.0f;
            }
            if (lap_time_est < 5.0f && data.current_lap_time > 0.1f) {
                lap_time_est = data.current_lap_time;
            }
            if (lap_time_est < 5.0f && data.best_lap_time > 0.1f) {
                lap_time_est = data.best_lap_time;
            }
            if (lap_time_est < 5.0f) {
                lap_time_est = 90.0f;
            }

            float projected_per_lap = average_rate * lap_time_est;
            if (projected_per_lap > 0.001f) {
                bool have_lap_window = average_fuel_per_lap > 0.01f;
                if (!have_lap_window) {
                    data.fuel_per_lap_average = projected_per_lap;
                    data.fuel_calc_ready = fuel_rate_count >= 5 ? 1 : data.fuel_calc_ready;
                }
                if (data.fuel_last_lap < 0.01f) {
                    data.fuel_last_lap = projected_per_lap;
                }
                if (!have_lap_window) {
                    data.fuel_remaining_laps = physics->fuel / projected_per_lap;

                    if (laps_remaining_in_session > 0) {
                        float fuel_margin = data.fuel_remaining_laps - static_cast<float>(laps_remaining_in_session);
                        data.fuel_margin_laps = fuel_margin;
                        data.fuel_deficit_laps = fuel_margin < 0.0f ? -fuel_margin : 0.0f;
                        data.fuel_target_save_per_lap = fuel_margin < 0.0f
                            ? (-fuel_margin / std::max(1, laps_remaining_in_session))
                            : 0.0f;
                        data.fuel_strategy_status = fuel_margin < -0.5f
                            ? 2
                            : (fuel_margin < 0.5f ? 1 : 0);
                    }
                }
            }
        }

        data.aid_fuel_rate = average_rate;
        data.fuel_mix = 1; // AC doesn't offer mix settings
        
        // DRS/ERS data (AC has different systems)
        data.drs_allowed = physics->drsAvailable;
        data.drs_open = physics->drsEnabled ? 1 : 0;
        data.drs_activation_distance = 0; // AC doesn't provide this
        data.ers_deploy_mode = 0; // AC doesn't have ERS, but has KERS
        data.ers_store_energy = physics->kersCharge; // Keep native 0-1 scale from AC
        data.ers_deployed_this_lap = 0.0f; // AC doesn't track this
        data.ers_harvested_this_lap_mguk = 0.0f; // AC doesn't have MGU-K
        data.ers_harvested_this_lap_mguh = 0.0f; // AC doesn't have MGU-H

        // RPM and engine data
        data.max_rpm = 9000; // AC doesn't provide max RPM directly, use typical value
        
        // Enhanced brake temperature data
        for (int i = 0; i < 4; i++) {
            // AC brake temps can be very low when not braking (near ambient temp)
            // Values around 12°C are normal for ambient brake temperature
            data.brake_temperature[i] = static_cast<uint16_t>(std::min(65535.0f, std::max(0.0f, physics->brakeTemp[i])));
            data.surface_type[i] = 0; // AC doesn't provide surface type per wheel
        }
        
        // Session data
        data.weather = 0; // AC doesn't provide weather enum like F1
        data.track_temperature = static_cast<int8_t>(physics->roadTemp);
        data.air_temperature = static_cast<int8_t>(physics->airTemp);
        data.total_laps = static_cast<uint8_t>(graphics->numberOfLaps);
        data.track_id = -1; // AC tracks rely on string names rather than F1 IDs
        
        // AC session types: 0=practice, 1=qualify, 2=race, 3=hotlap, 4=time_attack, 5=drift, 6=drag
        data.session_type = static_cast<uint8_t>(graphics->session);
        float session_time_left_seconds = graphics->sessionTimeLeft;
        if (session_time_left_seconds < 0.0f) {
            session_time_left_seconds = 0.0f;
        }
        session_time_left_seconds = std::min(session_time_left_seconds, 65535.0f);
        data.session_time_left = static_cast<uint16_t>(session_time_left_seconds);
        data.safety_car_status = 0; // AC doesn't have safety car status

        // Gap data (AC doesn't provide these directly, set to 0)
        data.gap_to_car_ahead = 0.0f;
        data.gap_to_race_leader = 0.0f;
        
        // Marshal zones - AC has simpler flag system
        data.marshal_zones_count = 0;
        for (float& flag : data.marshal_zone_flags) {
            flag = 0.0f;
        }
        
        // World position for track map (AC uses different coordinate system - try X,Z instead of X,Y)
        data.world_position_x = graphics->carCoordinates[0];
        data.world_position_y = graphics->carCoordinates[2]; // Use Z coordinate as Y for 2D map
        data.lap_distance = graphics->normalizedCarPosition * static_info->trackSPlineLength;
        
        // Debug: Log coordinates to see what we're getting
        static int debug_counter = 0;
        if (debug_counter % 60 == 0) { // Log every 60 frames (~1 second)
            std::cout << "[AC] Position: X=" << graphics->carCoordinates[0] 
                      << " Y=" << graphics->carCoordinates[1] 
                      << " Z=" << graphics->carCoordinates[2] 
                      << " Norm=" << graphics->normalizedCarPosition << std::endl;
        }
        debug_counter++;
        
        // AC-Specific Extended Telemetry Data
        // Detailed tire temperature zones (3-zone analysis)
        for (int i = 0; i < 4; i++) {
            data.tyre_temp_inner[i] = physics->tyreTempI[i];
            data.tyre_temp_middle[i] = physics->tyreTempM[i];
            data.tyre_temp_outer[i] = physics->tyreTempO[i];
            data.tyre_core_temperature[i] = physics->tyreCoreTemperature[i];
            data.tyre_wear_detailed[i] = physics->tyreWear[i];
            data.suspension_travel[i] = physics->suspensionTravel[i];
            data.camber_angle[i] = physics->camberRAD[i];
            data.wheel_slip[i] = physics->wheelSlip[i];
            data.wheel_load[i] = physics->wheelLoad[i];
        }
        
        // Performance and environment data
        data.performance_meter = physics->performanceMeter;
        data.surface_grip = graphics->surfaceGrip;
        data.wind_speed = graphics->windSpeed;
        data.wind_direction = graphics->windDirection;

        // AC Aid/Rate settings from static data
        data.aid_tire_rate = static_info->aidTireRate;
        data.aid_fuel_rate = static_info->aidFuelRate;
        data.aid_mechanical_damage = static_info->aidMechanicalDamage;
        data.aid_stability = static_info->aidStability;
        data.aid_auto_clutch = static_cast<uint8_t>(static_info->aidAutoClutch);
        data.aid_auto_blip = static_cast<uint8_t>(static_info->aidAutoBlip);
        data.aid_allow_tyre_blankets = static_cast<uint8_t>(static_info->aidAllowTyreBlankets);
        
        // Car control and dynamics
        data.clutch_position = physics->clutch;
        data.turbo_boost = physics->turboBoost;
        data.ballast_kg = physics->ballast;
        data.air_density = physics->airDensity;
        data.center_of_gravity_height = physics->cgHeight;
        data.force_feedback = physics->finalFF;
        data.steering_angle = physics->steerAngle;
        data.heading_angle = physics->heading;
        data.pitch_angle = physics->pitch;
        data.roll_angle = physics->roll;
        data.brake_bias = physics->brakeBias;
        
        // Angular and linear velocity
        for (int i = 0; i < 3; i++) {
            data.local_angular_velocity[i] = physics->localAngularVel[i];
            data.local_velocity[i] = physics->localVelocity[i];
            data.acceleration_g[i] = physics->accG[i];
        }
        
        // Car damage (first 4 are valid according to docs)
        for (int i = 0; i < 4; i++) {
            data.car_damage[i] = physics->carDamage[i];
        }
        data.car_damage[4] = 0.0f; // 5th element not used
        
        // Car settings and assists
        data.is_ai_controlled = static_cast<uint8_t>(physics->isAIControlled);
        data.auto_shifter_enabled = static_cast<uint8_t>(physics->autoShifterOn);
        data.pit_limiter_enabled = static_cast<uint8_t>(physics->pitLimiterOn);
        data.ideal_line_enabled = static_cast<uint8_t>(graphics->idealLineOn);
        // TC/ABS values from AC are slip ratios that decrease as setting increases
        // Based on user testing:
        // TC: 0=OFF, 0.14=1/11, 0.04=11/11 (inverted relationship)
        // ABS: 0=OFF, 0.16=1/12, 0.05=12/12 (inverted relationship)
        float tc_raw = physics->tc;
        float abs_raw = physics->abs;
        int ers_power_level_raw = physics->ersPowerLevel;
        int ers_recovery_level_raw = physics->ersRecoveryLevel;
        int ers_power_count = static_info ? static_info->ersPowerControllerCount : 0;

        auto compute_level_from_range = [](float raw, float max_value, float min_value, int max_steps) -> uint8_t {
            if (raw <= 0.0f) {
                return 0;
            }
            float clamped = std::clamp(raw, min_value, max_value);
            float span = max_value - min_value;
            if (span <= 0.0f) {
                return 0;
            }
            float normalized = (max_value - clamped) / span; // 0 -> lowest, 1 -> highest
            int level = static_cast<int>(std::round(normalized * static_cast<float>(max_steps)));
            level = std::clamp(level, 0, max_steps);
            return static_cast<uint8_t>(level + 1); // Game displays 1..N for enabled settings
        };

        // Convert TC slip ratio into discrete level (0 == OFF, 10 == highest)
        data.traction_control_setting = compute_level_from_range(tc_raw, 0.14f, 0.04f, 10);

        // Secondary TC (TC2) not exposed in vanilla shared memory - mark unavailable.
        data.traction_control_setting_secondary = std::numeric_limits<uint8_t>::max();

        // Convert ABS slip ratio into discrete level (0 == OFF, 11 == highest)
        data.abs_setting = compute_level_from_range(abs_raw, 0.16f, 0.05f, 11);
        data.engine_brake_setting = static_cast<uint8_t>(physics->engineBrake);
        data.fuel_map_setting = static_cast<uint8_t>(std::max(0, ers_power_level_raw));
        data.fuel_map_max = static_cast<uint8_t>(std::max(0, ers_power_count));

        static int control_debug_counter = 0;
        if (++control_debug_counter >= 120) {
            control_debug_counter = 0;
            std::cout << "[AC] Control debug - tc_raw=" << tc_raw
                      << " ->TC=" << static_cast<int>(data.traction_control_setting)
                      << " abs_raw=" << abs_raw
                      << " ->ABS=" << static_cast<int>(data.abs_setting)
                      << " ersPower=" << ers_power_level_raw
                      << "/" << ers_power_count
                      << " ersRecovery=" << ers_recovery_level_raw
                      << " engineBrake=" << physics->engineBrake
                      << " brakeBias=" << physics->brakeBias
                      << std::endl;
        }

        // Track and position data
        data.normalized_car_position = graphics->normalizedCarPosition;
        data.track_spline_length = static_info->trackSPlineLength;
        data.penalties_enabled = static_cast<uint8_t>(static_info->penaltiesEnabled);
        data.penalty_time = graphics->penaltyTime;
        data.numberOfTyresOut = static_cast<uint8_t>(physics->numberOfTyresOut);
        data.flag_type = static_cast<uint8_t>(graphics->flag);

        // AC pit status fields
        data.is_in_pit = static_cast<uint8_t>(graphics->isInPit);
        data.is_in_pitlane = static_cast<uint8_t>(graphics->isInPitLane);
        data.mandatory_pit_done = static_cast<uint8_t>(graphics->mandatoryPitDone);

        // AC Session Restart Detection - Reset all flags and penalties on restart
        static float last_distance_traveled = -1.0f;
        static int last_completed_laps = -1;
        static float last_session_time_left = -1.0f;
        static int last_packet_id = -1;
        static bool restart_detection_initialized = false;

        // Check for session restart (multiple methods for reliability)
        bool session_restarted = false;
        if (!restart_detection_initialized) {
            // First time initialization
            last_distance_traveled = graphics->distanceTraveled;
            last_completed_laps = graphics->completedLaps;
            last_session_time_left = graphics->sessionTimeLeft;
            last_packet_id = graphics->packetId;
            restart_detection_initialized = true;
        } else {
            // Method 1: Distance traveled reset to 0 (most reliable)
            if (graphics->distanceTraveled < last_distance_traveled - 1000.0f && last_distance_traveled > 500.0f) {
                session_restarted = true;
                std::cout << "🔄 AC Session RESTART detected: Distance reset from "
                          << last_distance_traveled << " to " << graphics->distanceTraveled << std::endl;
            }

            // Method 2: Completed laps reset
            if (graphics->completedLaps < last_completed_laps && last_completed_laps > 0) {
                session_restarted = true;
                std::cout << "🔄 AC Session RESTART detected: Laps reset from "
                          << last_completed_laps << " to " << graphics->completedLaps << std::endl;
            }

            // Method 3: Session time increases significantly (session restarted with more time)
            if (graphics->sessionTimeLeft > last_session_time_left + 300.0f) { // +5 minutes
                session_restarted = true;
                std::cout << "🔄 AC Session RESTART detected: Session time increased from "
                          << last_session_time_left << " to " << graphics->sessionTimeLeft << std::endl;
            }
        }

        // Update tracking variables
        last_distance_traveled = graphics->distanceTraveled;
        last_completed_laps = graphics->completedLaps;
        last_session_time_left = graphics->sessionTimeLeft;
        last_packet_id = graphics->packetId;

        // Lap invalidation logic - AC doesn't provide this directly
        // Consider lap invalid if: penalty flag is shown OR significant penalty time added recently
        static float last_penalty_time = 0.0f;
        static bool lap_was_invalidated = false;
        static int penalty_debug_counter = 0;

        // Reset invalidation flag on new lap (or session restart)
        static int last_current_lap = -1;

        // RESET ALL FLAGS AND PENALTIES ON SESSION RESTART
        if (session_restarted) {
            std::cout << "🧹 AC Session RESTART: Resetting ALL flags, penalties, and session data!" << std::endl;

            // Reset lap invalidation
            lap_was_invalidated = false;
            last_penalty_time = 0.0f;

            // Reset all static tracking variables
            last_current_lap = -1;
            penalty_debug_counter = 0;

            std::cout << "✅ AC Session data reset complete!" << std::endl;
        }

        if (graphics->completedLaps != last_current_lap || session_restarted) {
            if (lap_was_invalidated && !session_restarted) {
                std::cout << "🚩 AC Lap invalidation RESET on new lap " << graphics->completedLaps << std::endl;
            }
            lap_was_invalidated = false;
            last_current_lap = graphics->completedLaps;
        }

        // Check for new penalty (lap invalidation)
        if (graphics->penaltyTime > last_penalty_time && graphics->penaltyTime > 0) {
            lap_was_invalidated = true; // Penalty added = lap likely invalidated
            std::cout << "🚩 AC Lap INVALIDATED: Penalty time increased from " << last_penalty_time
                      << " to " << graphics->penaltyTime << std::endl;
        }

        // Also consider penalty flag as invalidation indicator
        if (graphics->flag == 6) { // AC_PENALTY_FLAG
            lap_was_invalidated = true;
            std::cout << "🚩 AC Lap INVALIDATED: Penalty flag detected (flag=" << graphics->flag << ")" << std::endl;
        }

        // PRIMARY METHOD: All 4 tires off track = lap invalidated
        // BUT ONLY in practice, qualifying, hotlap, or time attack sessions (NOT race)
        static bool was_all_tires_out = false;
        bool current_all_tires_out = (physics->numberOfTyresOut >= 4);
        bool is_session_with_lap_invalidation = (graphics->session == 0 ||  // AC_PRACTICE
                                                graphics->session == 1 ||  // AC_QUALIFY
                                                graphics->session == 3 ||  // AC_HOTLAP
                                                graphics->session == 4);   // AC_TIME_ATTACK

        if (current_all_tires_out && !was_all_tires_out) {
            if (is_session_with_lap_invalidation) {
                lap_was_invalidated = true;
                std::cout << "🚩 AC Lap INVALIDATED: All 4 tires off track in session type "
                          << graphics->session << " (Practice/Quali/Hotlap)" << std::endl;
            } else if (graphics->session == 2) { // AC_RACE
                std::cout << "🏁 AC Race: 4 tires off track (penalty applied but lap remains valid)" << std::endl;
            }
        }
        was_all_tires_out = current_all_tires_out;

        // Debug output every 300 frames (~5 seconds) to show current state
        if (++penalty_debug_counter % 300 == 0) {
            std::cout << "🔍 AC Debug - Session: " << graphics->session
                      << ", Flag: " << graphics->flag
                      << ", PenaltyTime: " << graphics->penaltyTime
                      << ", TiresOut: " << physics->numberOfTyresOut
                      << ", LapInvalid: " << (lap_was_invalidated ? "YES" : "NO") << std::endl;
        }

        data.lap_invalidated = static_cast<uint8_t>(lap_was_invalidated);
        last_penalty_time = graphics->penaltyTime;
        
        // Ride height
        data.ride_height[0] = physics->rideHeight[0]; // Front
        data.ride_height[1] = physics->rideHeight[1]; // Rear
        
        // Advanced Contact Patch Data - Extract ALL available fields
        for (int i = 0; i < 4; i++) {
            // Contact patch points and vectors (critical for advanced analysis)
            for (int j = 0; j < 3; j++) {
                data.tyre_contact_point[i][j] = physics->tyreContactPoint[i][j];
                data.tyre_contact_normal[i][j] = physics->tyreContactNormal[i][j];
                data.tyre_contact_heading[i][j] = physics->tyreContactHeading[i][j];
            }
            
            // Additional tire data not previously extracted
            data.tyre_dirty_level[i] = physics->tyreDirtyLevel[i];
            data.suspension_max_travel[i] = static_info->suspensionMaxTravel[i];
            data.tyre_radius[i] = static_info->tyreRadius[i];
        }
        
        // Game identifier and AC-specific names
        strcpy(data.game_name, "Assetto Corsa");
        
        // Convert wide char strings to UTF-8
        WideCharToMultiByte(CP_UTF8, 0, static_info->carModel, -1, data.car_name, sizeof(data.car_name), NULL, NULL);
        WideCharToMultiByte(CP_UTF8, 0, static_info->track, -1, data.track_name, sizeof(data.track_name), NULL, NULL);

        // Extract available static data
        data.max_rpm = static_cast<uint16_t>(static_info->maxRpm);

        // === Atlas AI derived fields for AC ===
        // Fuel projections (align with atlas_ai)
        data.fuel_laps_remaining_calculated = (data.fuel_remaining_laps > 0.0f)
            ? data.fuel_remaining_laps
            : estimated_remaining_laps;

        // Tyre health + stint modeling
        float wear_per_lap = (data.tyre_age_laps > 0)
            ? (max_tyre_wear_percent / static_cast<float>(std::max<int>(data.tyre_age_laps, 1)))
            : (max_tyre_wear_percent > 0.1f ? max_tyre_wear_percent : 1.0f);
        wear_per_lap = std::max(wear_per_lap, 0.5f); // avoid zero/infinite

        data.tyre_degradation_rate = wear_per_lap * 0.02f; // map wear%/lap into sec/lap loss
        data.tyre_life_remaining_laps = std::max(
            0.0f,
            (100.0f - max_tyre_wear_percent) / std::max(0.5f, wear_per_lap)
        );
        data.tyre_performance_index = std::clamp(100.0f - (max_tyre_wear_percent * 0.6f), 0.0f, 100.0f);
        float stint_total = static_cast<float>(data.tyre_age_laps) + data.tyre_life_remaining_laps;
        data.tyre_stint_progress = (stint_total > 0.01f)
            ? std::clamp(static_cast<float>(data.tyre_age_laps) / stint_total, 0.0f, 1.0f)
            : 0.0f;
        data.tyre_critical_warning = (data.tyre_life_remaining_laps < 3.0f || max_tyre_wear_percent >= 75.0f) ? 1 : 0;
        data.tyre_strategy_status = data.tyre_critical_warning ? 2 : (max_tyre_wear_percent >= 55.0f ? 1 : 0);

        // ERS/KERS presentation (AC uses 0-1 charge)
        data.ers_store_percent = std::clamp(data.ers_store_energy * 100.0f, 0.0f, 100.0f);
        data.ers_strategy_mode = 0; // balanced placeholder for AC
        data.ers_attack_gap = 1.2f;
        data.ers_defend_gap = 1.0f;
        data.ers_harvest_gap = 2.5f;

        // Pit/strategy scaffolding for AC
        const float lap_len_km = (data.track_spline_length > 1.0f)
            ? (data.track_spline_length / 1000.0f)
            : 5.0f;
        const float base_pit_loss = std::clamp(18.0f + lap_len_km * 0.9f, 18.0f, 32.0f);
        const float tyre_time_gain = max_tyre_wear_percent * 0.025f; // ~2.5s at 100% wear
        const float fuel_time_gain = std::max(0.0f, data.fuel_in_tank * 0.03f);

        data.pit_delta_time = base_pit_loss;
        data.pit_delta_with_wing = base_pit_loss + 6.0f;
        data.pit_tire_time_gain = tyre_time_gain;
        data.pit_fuel_time_gain = fuel_time_gain;
        data.pit_net_time_delta = base_pit_loss - (tyre_time_gain + fuel_time_gain);
        data.pit_time_loss_no_pit = base_pit_loss;
        data.pit_break_even_laps = (tyre_time_gain > 0.01f)
            ? (data.pit_delta_time / std::max(tyre_time_gain, 0.01f))
            : 0.0f;

        const bool fuel_critical = data.fuel_margin_laps < -0.25f;
        data.pit_advantage_available = (data.tyre_critical_warning || fuel_critical || data.pit_net_time_delta < 18.0f) ? 1 : 0;

        // Recommend next pit based on fuel deficit or tyre warning
        float recommended_lap = static_cast<float>(data.current_lap_num) + (fuel_critical ? 1.0f : (data.tyre_critical_warning ? 1.0f : 3.0f));
        if (data.total_laps > 0) {
            recommended_lap = std::min(recommended_lap, static_cast<float>(data.total_laps));
        }
        data.pit_recommended_lap = recommended_lap;

        // Simple pit plans (A/B/C) mirroring F1 fields
        auto buildPlan = [&](const char* label, float target_lap, float window) -> DataProcessor::ProcessedTelemetry::PitStrategyPlan {
            DataProcessor::ProcessedTelemetry::PitStrategyPlan plan = {};
            std::snprintf(plan.label, sizeof(plan.label), "%s", label);
            plan.total_stops = 1;
            plan.stops_completed = data.pit_stops_completed;
            plan.risk_rating = data.tyre_critical_warning ? 2 : 1;
            plan.projected_total_time = 0.0f;
            plan.delta_vs_best = 0.0f;
            plan.confidence = 0.6f;
            plan.stop_count = 1;
            plan.cheap_pit_opportunity = 0;
            plan.stops[0].target_lap = target_lap;
            plan.stops[0].window_open = std::max(1.0f, target_lap - window);
            plan.stops[0].window_close = target_lap + window;
            plan.stops[0].compound_visual = data.tyre_compound_visual;
            plan.stops[0].expected_stint_length = std::max(5.0f, data.tyre_life_remaining_laps);
            return plan;
        };

        data.pit_plan_primary = buildPlan("A", recommended_lap, 1.0f);
        data.pit_plan_alternative = buildPlan("B", recommended_lap + 2.0f, 1.5f);
        data.pit_plan_third = buildPlan("C", recommended_lap + 4.0f, 2.0f);
        data.pit_plan_count = 3;
        data.pit_plan_selected = 0;
        data.pit_cheap_stop_available = 0;

        // Opponent context not available in vanilla AC shared memory
        auto resetOpponent = [](DataProcessor::ProcessedTelemetry::NearbyOpponent& opp) {
            std::memset(opp.driver_name, 0, sizeof(opp.driver_name));
            opp.position = 0;
            opp.gap_seconds = 0.0f;
            opp.tyre_age = 0;
            opp.last_lap_time = 0.0f;
            opp.tyre_compound = 0;
        };
        resetOpponent(data.opponent_ahead_1);
        resetOpponent(data.opponent_ahead_2);
        resetOpponent(data.opponent_behind_1);
        resetOpponent(data.opponent_behind_2);
        data.num_opponents_ahead = 0;
        data.num_opponents_behind = 0;
        
        // Timestamp
        data.timestamp_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
            std::chrono::steady_clock::now().time_since_epoch()
        ).count();
        
        last_data_time = std::chrono::steady_clock::now();
        
        return data;
    }
    
    std::string getGameName() {
        return "Assetto Corsa";
    }
    
    void cleanup() {
        std::cout << "Cleaning up AC parser..." << std::endl;
        initialized = false;
        shared_memory.cleanup();
    }

    void logConnectionInfo() {
        if (!isConnected()) {
            std::cout << "AC Parser: Not connected" << std::endl;
            return;
        }
        
        auto static_data = shared_memory.getStatic();
        auto graphics = shared_memory.getGraphics();
        
        if (static_data && graphics) {
            std::cout << "AC Connection Info:" << std::endl;
            std::wcout << L"  Track: " << std::wstring(static_data->track) << std::endl;
            std::wcout << L"  Car: " << std::wstring(static_data->carModel) << std::endl;
            std::cout << "  Session: " << graphics->session << std::endl;
            std::cout << "  Status: " << graphics->status << " (2=live)" << std::endl;
            std::cout << "  Completed Laps: " << graphics->completedLaps << std::endl;
            std::cout << "  Position: " << graphics->position << std::endl;
        }
    }
};

#endif // _WIN32



