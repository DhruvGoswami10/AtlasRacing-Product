#include "../../include/telemetry/data_processor.h"
#include "../../include/telemetry/accurate_lap_predictor.h"
#include "../../include/telemetry/pit_strategy_calculator.h"
#include <algorithm>
#include <cmath>
#include <cstring>
#include <cstdio>
#include <iomanip>  // For std::fixed and std::setprecision
#include <sstream>
#include <string>
#include <vector>

namespace {
    inline float normalizeTyreWearValue(float raw_wear, uint16_t packet_format) {
        // F1 24/25 report tyre wear in percentage already; older packets used 0-1 fractions.
        float normalized = raw_wear;

        if (packet_format < 2024 && normalized >= 0.0f && normalized <= 1.0f) {
            normalized *= 100.0f;
        }

        return std::clamp(normalized, 0.0f, 100.0f);
    }

std::string buildPlanJson(const DataProcessor::ProcessedTelemetry::PitStrategyPlan& plan) {
    std::ostringstream ss;
    auto appendFloat = [](float value, int precision) {
        std::ostringstream tmp;
        tmp.setf(std::ios::fixed);
        tmp.precision(precision);
        tmp << value;
        return tmp.str();
    };

    ss << "{";
    ss << "\"label\":\"" << plan.label << "\",";
    ss << "\"total_stops\":" << static_cast<int>(plan.total_stops) << ",";
    ss << "\"stops_completed\":" << static_cast<int>(plan.stops_completed) << ",";
    ss << "\"risk_rating\":" << static_cast<int>(plan.risk_rating) << ",";
    ss << "\"projected_total_time\":" << appendFloat(plan.projected_total_time, 2) << ",";
    ss << "\"delta_vs_best\":" << appendFloat(plan.delta_vs_best, 2) << ",";
    ss << "\"confidence\":" << appendFloat(plan.confidence, 1) << ",";
    ss << "\"stop_count\":" << static_cast<int>(plan.stop_count) << ",";
    ss << "\"cheap_pit_opportunity\":" << static_cast<int>(plan.cheap_pit_opportunity) << ",";
    ss << "\"stops\":[";
    for (uint8_t i = 0; i < plan.stop_count && i < 3; ++i) {
        if (i > 0) {
            ss << ",";
        }
        const auto& stop = plan.stops[i];
        ss << "{";
        ss << "\"target_lap\":" << appendFloat(stop.target_lap, 1) << ",";
        ss << "\"window_open\":" << appendFloat(stop.window_open, 1) << ",";
        ss << "\"window_close\":" << appendFloat(stop.window_close, 1) << ",";
        ss << "\"compound\":" << static_cast<int>(stop.compound_visual) << ",";
        ss << "\"stint_length\":" << appendFloat(stop.expected_stint_length, 1);
        ss << "}";
    }
    ss << "]";
    ss << "}";
    return ss.str();
}
}

DataProcessor::DataProcessor() : has_previous_data(false), has_telemetry_data(false), 
                                has_lap_data(false), has_status_data(false), has_motion_data(false),
                                has_session_data(false), game_identified(false), session_best_lap_time(0.0f),
                                has_multi_car_lap_data(false), has_multi_car_telemetry_data(false),
                                has_multi_car_status_data(false), has_participants_data(false),
                                sector1_completed(false), sector2_completed(false), sector3_completed(false),
                                last_lap_number(0), saved_sector3_time_ms(0),
                                personal_best_sector1(999.0f), personal_best_sector2(999.0f),
                                personal_best_sector3(999.0f), last_safety_car_status(0), last_red_flag_periods(0),
                                has_yellow_flags(false), last_yellow_flag_state(false),
                                last_player_result_status(0), player_retirement_detected(false),
                                current_session_uid(0), session_uid_initialized(false),
                                last_session_time(0.0f), last_frame_identifier(0),
                                last_player_lap_number(0), restart_detection_initialized(false),
                                last_lap_fuel(0.0f), fuel_tracking_active(false),
                                  fuel_tracking_reference_lap(0),
                                  current_tire_stint_age(0), personal_best_combined_sectors(999.0f),
                                  last_strategy_log_lap(0), strategy_log_initialized(false),
                                  pending_sector1_time(0.0f), pending_sector2_time(0.0f),
                                  pit_stops_completed_internal(0), pit_stop_active(false),
                                  pit_entry_lap(0), last_pit_stop_lap_internal(0.0f) {
    // Initialize current combined data with defaults
    memset(&current_combined_data, 0, sizeof(current_combined_data));
    memset(&current_multi_car_data, 0, sizeof(current_multi_car_data));

    // Initialize ATLAS AI tracking structures
    memset(&fuel_history, 0, sizeof(fuel_history));
    memset(&sector_history, 0, sizeof(sector_history));

    // Initialize lap predictor
    lap_predictor = new AccurateLapPredictor();
}

DataProcessor::~DataProcessor() {
    delete lap_predictor;
}

void DataProcessor::updateTelemetryData(const CarTelemetryData& telemetry_data) {
    // Update timestamp
    auto now = std::chrono::system_clock::now();
    current_combined_data.timestamp_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
        now.time_since_epoch()).count();

    // Core telemetry values
    current_combined_data.speed_kph = telemetry_data.m_speed;
    current_combined_data.rpm = telemetry_data.m_engineRPM;
    current_combined_data.gear = telemetry_data.m_gear;
    current_combined_data.throttle_percent = telemetry_data.m_throttle * 100.0f;
    current_combined_data.brake_percent = telemetry_data.m_brake * 100.0f;

    // Steering angle - convert from -1 to 1 range to degrees (-90 to 90)
    current_combined_data.steering_angle = telemetry_data.m_steer * 90.0f;

    // Debug steering angle occasionally
    static int steering_log_counter = 0;
    if (++steering_log_counter % 300 == 0) { // Every ~5 seconds at 60fps
        std::cout << "🎮 Steering Debug - Raw: " << telemetry_data.m_steer
                  << ", Degrees: " << current_combined_data.steering_angle << "°" << std::endl;
    }

    // DRS status - F1 Dashboard V4 requirement
    current_combined_data.drs_open = telemetry_data.m_drs; // 0 = off, 1 = on

    // Tire data from telemetry packet
    for (int i = 0; i < 4; i++) {
        current_combined_data.tyre_surface_temp[i] = telemetry_data.m_tyresSurfaceTemperature[i];
        current_combined_data.tyre_inner_temp[i] = telemetry_data.m_tyresInnerTemperature[i];
        current_combined_data.tyre_pressure[i] = telemetry_data.m_tyresPressure[i];
        current_combined_data.brake_temperature[i] = telemetry_data.m_brakesTemperature[i];
        current_combined_data.surface_type[i] = telemetry_data.m_surfaceType[i];
    }

    // Calculate deltas if we have previous data
    if (has_previous_data) {
        current_combined_data.speed_delta = current_combined_data.speed_kph - last_telemetry.speed_kph;
        current_combined_data.rpm_delta = current_combined_data.rpm - last_telemetry.rpm;
    } else {
        current_combined_data.speed_delta = 0.0f;
        current_combined_data.rpm_delta = 0.0f;
    }

    // Set game identifier for F1 24
    strcpy(current_combined_data.game_name, "F1 24");
    
    has_telemetry_data = true;
}

void DataProcessor::updateLapData(const LapData& lap_data) {
    // FIXED: Calculate S3 when lap is completed using last lap time
    if (lap_data.m_currentLapNum != last_lap_number) {
        if (last_lap_number > 0 && lap_data.lastLapTime() > 0) {
            // Lap just completed! Calculate S3 from total lap time
            float total_lap_ms = lap_data.lastLapTime() * 1000.0f;
            float s1_ms = current_combined_data.sector1_time_ms;
            float s2_ms = current_combined_data.sector2_time_ms;

            if (s1_ms > 0 && s2_ms > 0 && total_lap_ms > 0) {
                // Calculate S3: Total - S1 - S2
                saved_sector3_time_ms = total_lap_ms - s1_ms - s2_ms;
                sector3_display_until = std::chrono::steady_clock::now() + std::chrono::seconds(4);
                sector3_completed = true;

                std::cout << "============================================" << std::endl;
                std::cout << "LAP " << (int)last_lap_number << " COMPLETED:" << std::endl;
                std::cout << "  Total: " << (total_lap_ms / 1000.0f) << "s" << std::endl;
                std::cout << "  S1: " << (s1_ms / 1000.0f) << "s" << std::endl;
                std::cout << "  S2: " << (s2_ms / 1000.0f) << "s" << std::endl;
                std::cout << "  S3 (calculated): " << (saved_sector3_time_ms / 1000.0f) << "s" << std::endl;
                std::cout << "  S3 will display for 4 seconds" << std::endl;
                std::cout << "============================================" << std::endl;
            }
        }

        // Reset for new lap
        last_lap_number = lap_data.m_currentLapNum;
        sector1_completed = false;
        sector2_completed = false;
        // Don't reset S3 completed flag immediately

        // Clear S1 and S2 for new lap, but keep S3 for display
        current_combined_data.sector1_time_ms = 0;
        current_combined_data.sector2_time_ms = 0;
        // S3 will be handled below based on display timeout
    }
    
    // Session/Lap data
    current_combined_data.current_lap_time = lap_data.currentLapTime();
    current_combined_data.last_lap_time = lap_data.lastLapTime();
    
    // Track best lap time across the session
    float last_lap = lap_data.lastLapTime();
    if (last_lap > 0.0f && (session_best_lap_time == 0.0f || last_lap < session_best_lap_time)) {
        session_best_lap_time = last_lap;
    }
    current_combined_data.best_lap_time = session_best_lap_time;

    // FIXED: Delta vs PERSONAL BEST (match F1 24 game behavior)
    // For dashboard: match what F1 24 shows (personal best)
    // For AI: we calculate all 3 types and store them

    float personal_best_lap = session_best_lap_time;  // YOUR best lap
    float session_fastest_lap = 0.0f;  // ANYONE's best lap
    float last_lap_time = current_combined_data.last_lap_time;  // Previous lap

    if (has_multi_car_lap_data && current_multi_car_data.best_lap_time > 0.0f) {
        session_fastest_lap = current_multi_car_data.best_lap_time;
    }

    // Primary delta calculation (match F1 24 game)
    if (personal_best_lap > 0.0f && current_combined_data.lap_distance > 0.0f) {
        // Get track length
        float track_length = 5000.0f; // Default 5km
        if (has_session_data && current_combined_data.track_spline_length > 0) {
            track_length = current_combined_data.track_spline_length;
        }

        // Calculate progress through lap (0.0 to 1.0)
        float lap_progress = current_combined_data.lap_distance / track_length;
        lap_progress = std::min(1.0f, std::max(0.0f, lap_progress));

        // Only calculate when actually racing
        if (lap_progress > 0.001f && lap_progress < 0.999f &&
            current_combined_data.current_lap_time > 0.0f) {

            // DASHBOARD: Delta vs PERSONAL BEST (match F1 24)
            float expected_time_personal = personal_best_lap * lap_progress;
            current_combined_data.delta_time = current_combined_data.current_lap_time - expected_time_personal;

            // Estimated lap time based on personal best
            float remaining_ratio = 1.0f - lap_progress;
            float base_remaining = personal_best_lap * remaining_ratio;
            float pace_adjustment = (current_combined_data.delta_time / lap_progress) * remaining_ratio;
            current_combined_data.estimated_lap_time = current_combined_data.current_lap_time + base_remaining + pace_adjustment;

            // ADDITIONAL: Calculate all 3 delta types for AI/testing
            float delta_vs_session_fastest = 0.0f;
            float delta_vs_last_lap = 0.0f;

            if (session_fastest_lap > 0.0f) {
                float expected_time_session = session_fastest_lap * lap_progress;
                delta_vs_session_fastest = current_combined_data.current_lap_time - expected_time_session;
            }

            if (last_lap_time > 0.0f) {
                float expected_time_last = last_lap_time * lap_progress;
                delta_vs_last_lap = current_combined_data.current_lap_time - expected_time_last;
            }

            // Clamp primary delta
            current_combined_data.delta_time = std::max(-10.0f, std::min(10.0f, current_combined_data.delta_time));

            // Debug log
            static int delta_log_counter = 0;
            if (++delta_log_counter % 60 == 0) { // Every second
                char delta_str[32];
                char est_str[32];
                char ref_str[32];
                snprintf(delta_str, sizeof(delta_str), "%+.3f", current_combined_data.delta_time);
                snprintf(est_str, sizeof(est_str), "%.3f", current_combined_data.estimated_lap_time);
                snprintf(ref_str, sizeof(ref_str), "%.3f", session_fastest_lap);
                char session_delta_str[32];
                char last_delta_str[32];
                snprintf(session_delta_str, sizeof(session_delta_str), "%+.3f", delta_vs_session_fastest);
                snprintf(last_delta_str, sizeof(last_delta_str), "%+.3f", delta_vs_last_lap);

                std::cout << "Delta Debug: Personal=" << delta_str << "s | Session=" << session_delta_str
                          << "s | Last=" << last_delta_str << "s | Est=" << est_str << "s" << std::endl;
            }
        } else {
            current_combined_data.delta_time = 0.0f;
            current_combined_data.estimated_lap_time = 0.0f;
        }
    } else {
        current_combined_data.delta_time = 0.0f;
        current_combined_data.estimated_lap_time = 0.0f;
    }

    current_combined_data.position = lap_data.m_carPosition;
    current_combined_data.current_lap_num = lap_data.m_currentLapNum;
    
    // FIXED: Always use live sector times from Lap Data packet
    if (lap_data.m_sector1TimeMSPart > 0) {
        current_combined_data.sector1_time_ms = lap_data.m_sector1TimeMSPart;
        if (!sector1_completed && lap_data.m_sector >= 1) {
            sector1_completed = true;
            std::cout << "✓ S1 Completed: " << (lap_data.m_sector1TimeMSPart / 1000.0f) << "s (sector: " << (int)lap_data.m_sector << ")" << std::endl;
        }
    }

    if (lap_data.m_sector2TimeMSPart > 0) {
        current_combined_data.sector2_time_ms = lap_data.m_sector2TimeMSPart;
        if (!sector2_completed && lap_data.m_sector >= 2) {
            sector2_completed = true;
            std::cout << "✓ S2 Completed: " << (lap_data.m_sector2TimeMSPart / 1000.0f) << "s (sector: " << (int)lap_data.m_sector << ")" << std::endl;
        }
    }

    // Display saved S3 for 4 seconds after lap completion
    if (saved_sector3_time_ms > 0) {
        if (std::chrono::steady_clock::now() < sector3_display_until) {
            // Still within display window, show S3
            current_combined_data.sector3_time_ms = saved_sector3_time_ms;
        } else {
            // Display timeout expired, clear S3
            current_combined_data.sector3_time_ms = 0;
            saved_sector3_time_ms = 0;
            sector3_completed = false;
            std::cout << "S3 display timeout - cleared" << std::endl;
        }
    } else {
        current_combined_data.sector3_time_ms = 0;
    }
    
    current_combined_data.current_sector = lap_data.m_sector;
    const uint8_t previous_pit_status = current_combined_data.pit_status;
    current_combined_data.pit_status = lap_data.m_pitStatus;

    if (!pit_stop_active && lap_data.m_pitStatus > 0) {
        pit_stop_active = true;
        pit_entry_lap = lap_data.m_currentLapNum;
    }

    if (pit_stop_active && lap_data.m_pitStatus == 0 && previous_pit_status > 0) {
        pit_stop_active = false;
        pit_stops_completed_internal = static_cast<uint8_t>(std::min<int>(pit_stops_completed_internal + 1, 6));
        const uint8_t exit_lap = (pit_entry_lap > 0) ? pit_entry_lap : lap_data.m_currentLapNum;
        last_pit_stop_lap_internal = static_cast<float>(exit_lap);
        pit_entry_lap = 0;
    }

    current_combined_data.pit_stops_completed = pit_stops_completed_internal;
    current_combined_data.last_pit_stop_lap = last_pit_stop_lap_internal;
    current_combined_data.result_status = lap_data.m_resultStatus;

    // F1 24 Penalties
    current_combined_data.penalties_time = lap_data.m_penalties;
    current_combined_data.num_penalties = lap_data.m_totalWarnings; // Using warnings as penalty count
    current_combined_data.lap_invalid = (lap_data.m_currentLapInvalid == 1) ? 1 : 0;
    current_combined_data.corner_cutting_warnings = lap_data.m_cornerCuttingWarnings;

    // Store lap distance for motion data
    current_combined_data.lap_distance = lap_data.m_lapDistance;

    // Store gap data for the player (for ATLAS AI to use)
    current_combined_data.gap_to_car_ahead = (lap_data.m_deltaToCarInFrontMinutesPart * 60.0f) +
                                             (lap_data.m_deltaToCarInFrontMSPart / 1000.0f);
    current_combined_data.gap_to_race_leader = (lap_data.m_deltaToRaceLeaderMinutesPart * 60.0f) +
                                               (lap_data.m_deltaToRaceLeaderMSPart / 1000.0f);

    has_lap_data = true;
}

void DataProcessor::updateStatusData(const CarStatusData& status_data) {
    // Tire compound data
    current_combined_data.tyre_compound_actual = status_data.m_actualTyreCompound;
    current_combined_data.tyre_compound_visual = status_data.m_visualTyreCompound;

    // Debug tire compound values every time - this is important!
    static int compound_log_counter = 0;
    if (++compound_log_counter % 60 == 0) { // Every ~1 second at 60fps
        std::cout << "🔧 Tire Compound Debug - Actual: " << (int)status_data.m_actualTyreCompound
                  << ", Visual: " << (int)status_data.m_visualTyreCompound
                  << " (16=C5/Soft, 17=C4/Med, 18=C3/Hard, 7=Inter, 8=Wet)" << std::endl;
    }
    current_combined_data.tyre_age_laps = status_data.m_tyresAgeLaps;

    // Car status data
    current_combined_data.fuel_in_tank = status_data.m_fuelInTank;
    current_combined_data.fuel_remaining_laps = status_data.m_fuelRemainingLaps;
    current_combined_data.fuel_mix = status_data.m_fuelMix;
    current_combined_data.drs_allowed = status_data.m_drsAllowed;
    current_combined_data.drs_activation_distance = status_data.m_drsActivationDistance; // Phase 7B
    current_combined_data.max_rpm = status_data.m_maxRPM; // F1 Dashboard V4 requirement
    current_combined_data.ers_deploy_mode = status_data.m_ersDeployMode;
    current_combined_data.ers_store_energy = status_data.m_ersStoreEnergy / 1000000.0f; // Convert Joules to MJ
    current_combined_data.ers_deployed_this_lap = status_data.m_ersDeployedThisLap / 1000000.0f; // Phase 7B: Convert J to MJ
    current_combined_data.ers_harvested_this_lap_mguk = status_data.m_ersHarvestedThisLapMGUK / 1000000.0f; // Phase 7B
    current_combined_data.ers_harvested_this_lap_mguh = status_data.m_ersHarvestedThisLapMGUH / 1000000.0f; // Phase 7B
    current_combined_data.actual_tyre_compound = status_data.m_actualTyreCompound; // Phase 7B
    
    // F1 24 brake bias (from Car Status packet)
    current_combined_data.brake_bias = static_cast<float>(status_data.m_frontBrakeBias);

    has_status_data = true;
}

void DataProcessor::updateMotionData(const CarMotionData& motion_data, float lap_distance) {
    // Position data for track map - use X and Z coordinates (ground plane)
    current_combined_data.world_position_x = motion_data.m_worldPositionX;
    current_combined_data.world_position_y = motion_data.m_worldPositionZ; // Use Z instead of Y
    // Note: lap_distance comes from lap data packet, not motion data
    
    // Debug: Log motion data occasionally
    static int motion_log_counter = 0;
    if (++motion_log_counter % 60 == 0) { // Every ~1 second
        std::cout << "Motion Data - X: " << motion_data.m_worldPositionX 
                  << ", Y: " << motion_data.m_worldPositionY 
                  << ", Z: " << motion_data.m_worldPositionZ << " (Using X,Z for map)" << std::endl;
    }
    
    has_motion_data = true;
}

void DataProcessor::updateSessionData(const SessionData& session_data) {
    // Note: Session reset detection happens in packet processing (main_unified.cpp)
    // where we have access to the packet header with sessionUID

    // Weather and track conditions
    current_combined_data.weather = session_data.m_weather;
    current_combined_data.track_temperature = session_data.m_trackTemperature;
    current_combined_data.air_temperature = session_data.m_airTemperature;
    
    // Session info
    current_combined_data.total_laps = session_data.m_totalLaps;
    current_combined_data.track_id = session_data.m_trackId;
    current_combined_data.session_type = session_data.m_sessionType;
    current_combined_data.session_time_left = session_data.m_sessionTimeLeft;

    // FIXED: Store track length for delta calculation
    current_combined_data.track_spline_length = session_data.m_trackLength;
    current_combined_data.safety_car_status = session_data.m_safetyCarStatus;
    
    // Marshal zones for flags
    current_combined_data.marshal_zones_count = session_data.m_numMarshalZones;
    for (int i = 0; i < session_data.m_numMarshalZones && i < 21; i++) {
        current_combined_data.marshal_zone_flags[i] = session_data.m_marshalZones[i].m_zoneFlag;
    }

    current_combined_data.forecast_accuracy = session_data.m_forecastAccuracy;
    current_combined_data.num_weather_forecast_samples = session_data.m_numWeatherForecastSamples;
    int forecast_count = std::min<int>(session_data.m_numWeatherForecastSamples, 64);
    for (int i = 0; i < forecast_count; ++i) {
        current_combined_data.weather_forecast_samples[i] = session_data.m_weatherForecastSamples[i];
    }
    for (int i = forecast_count; i < 64; ++i) {
        current_combined_data.weather_forecast_samples[i] = WeatherForecastSample{};
    }

    // Pit window data for F1 Dashboard V4
    current_combined_data.pit_window_ideal_lap = session_data.m_pitStopWindowIdealLap;
    current_combined_data.pit_window_latest_lap = session_data.m_pitStopWindowLatestLap;

    // Calculate if pit window is currently open (need current lap from lap data)
    if (current_combined_data.current_lap_num > 0 &&
        current_combined_data.pit_window_ideal_lap > 0 &&
        current_combined_data.pit_window_latest_lap > 0) {
        current_combined_data.pit_window_open = (current_combined_data.current_lap_num >= current_combined_data.pit_window_ideal_lap &&
                                                current_combined_data.current_lap_num <= current_combined_data.pit_window_latest_lap);
    } else {
        current_combined_data.pit_window_open = 0; // No pit window data available
    }

    has_session_data = true;
}

void DataProcessor::updateSessionHistoryData(const PacketSessionHistoryData& history_packet) {
    // Only process data for the player car
    if (history_packet.m_carIdx != history_packet.m_header.m_playerCarIndex) {
        return; // Not the player's car
    }
    
    // Get the most recent completed lap from history
    if (history_packet.m_numLaps > 0) {
        const LapHistoryData& latest_lap = history_packet.m_lapHistoryData[history_packet.m_numLaps - 1];
        
        // Extract all sector times from Session History (more accurate than live telemetry)
        // AND set completion flags to prevent Lap Data from overwriting
        if (latest_lap.m_lapValidBitFlags & 0x02) { // Bit 1 = sector 1 valid
            current_combined_data.sector1_time_ms = latest_lap.m_sector1TimeMSPart;
            sector1_completed = true;
            std::cout << "✓ Sector 1 completed from Session History: " 
                      << (latest_lap.m_sector1TimeMSPart / 1000.0f) << "s" << std::endl;
        }
        
        if (latest_lap.m_lapValidBitFlags & 0x04) { // Bit 2 = sector 2 valid
            current_combined_data.sector2_time_ms = latest_lap.m_sector2TimeMSPart;
            sector2_completed = true;
            std::cout << "✓ Sector 2 completed from Session History: " 
                      << (latest_lap.m_sector2TimeMSPart / 1000.0f) << "s" << std::endl;
        }
        
        // FIXED: Check if this is a completed lap by looking at previous lap data
        if (history_packet.m_numLaps > 1 && current_combined_data.current_lap_num > last_lap_number) {
            // Get PREVIOUS lap's S3 (the one that just completed)
            const LapHistoryData& completed_lap = history_packet.m_lapHistoryData[history_packet.m_numLaps - 2];
            if (completed_lap.m_lapValidBitFlags & 0x08) {
                saved_sector3_time_ms = completed_lap.m_sector3TimeMSPart;
                sector3_display_until = std::chrono::steady_clock::now() + std::chrono::seconds(4);
                std::cout << "✓ Captured S3 from completed lap: "
                          << (completed_lap.m_sector3TimeMSPart / 1000.0f) << "s - will display for 4s" << std::endl;
                sector3_completed = true;
            }
        }

        // Also check current lap S3 for live display
        if (latest_lap.m_lapValidBitFlags & 0x08) { // Bit 3 = sector 3 valid
            current_combined_data.sector3_time_ms = latest_lap.m_sector3TimeMSPart;
            std::cout << "✓ Live Sector 3 from Session History: "
                      << (latest_lap.m_sector3TimeMSPart / 1000.0f) << "s" << std::endl;
        }
        
        // Enhanced debug log for sector data
        static int sector_log_counter = 0;
        if (++sector_log_counter % 60 == 0) { // Log every ~1 second
            std::cout << "🔍 Session History DEBUG (Car " << (int)history_packet.m_carIdx 
                      << ", Lap " << (int)history_packet.m_numLaps << "):" << std::endl;
            std::cout << "  Raw S1: " << latest_lap.m_sector1TimeMSPart << "ms"
                      << ", Raw S2: " << latest_lap.m_sector2TimeMSPart << "ms"
                      << ", Raw S3: " << latest_lap.m_sector3TimeMSPart << "ms" << std::endl;
            std::cout << "  Valid flags: 0x" << std::hex << (int)latest_lap.m_lapValidBitFlags << std::dec
                      << " (S1=" << ((latest_lap.m_lapValidBitFlags & 0x02) ? "✓" : "✗")
                      << ", S2=" << ((latest_lap.m_lapValidBitFlags & 0x04) ? "✓" : "✗") 
                      << ", S3=" << ((latest_lap.m_lapValidBitFlags & 0x08) ? "✓" : "✗") << ")" << std::endl;
            std::cout << "  Converted: S1=" << (latest_lap.m_sector1TimeMSPart / 1000.0f) << "s, "
                      << "S2=" << (latest_lap.m_sector2TimeMSPart / 1000.0f) << "s, "
                      << "S3=" << (latest_lap.m_sector3TimeMSPart / 1000.0f) << "s" << std::endl;
        }
    }
}

void DataProcessor::updateCarDamageData(const CarDamageData& damage_data, uint16_t packet_format) {
    static bool logged_fraction_normalization = false;

    for (int i = 0; i < 4; i++) {
        bool rawLooksFractional = (damage_data.m_tyresWear[i] >= 0.0f && damage_data.m_tyresWear[i] <= 1.0f);
        if (packet_format < 2024 && rawLooksFractional && !logged_fraction_normalization) {
            std::cout << "?? Normalising tyre wear (fraction -> percentage) for packet format "
                      << packet_format << " (raw=" << damage_data.m_tyresWear[i] << ")" << std::endl;
            logged_fraction_normalization = true;
        }

        current_combined_data.tyre_wear[i] = normalizeTyreWearValue(damage_data.m_tyresWear[i], packet_format);
        current_combined_data.tyres_damage[i] = damage_data.m_tyresDamage[i];
        current_combined_data.tyre_blisters[i] = damage_data.m_tyreBlisters[i];
    }

    current_combined_data.front_left_wing_damage = damage_data.m_frontLeftWingDamage;
    current_combined_data.front_right_wing_damage = damage_data.m_frontRightWingDamage;
    current_combined_data.rear_wing_damage = damage_data.m_rearWingDamage;
    current_combined_data.floor_damage = damage_data.m_floorDamage;
    current_combined_data.diffuser_damage = damage_data.m_diffuserDamage;
    current_combined_data.sidepod_damage = damage_data.m_sidepodDamage;
    current_combined_data.engine_damage = damage_data.m_engineDamage;
    current_combined_data.gearbox_damage = damage_data.m_gearBoxDamage;

    static int damage_log_counter = 0;
    if (++damage_log_counter % 300 == 0) {
        std::cout << "?? Car Damage - Engine: " << static_cast<int>(damage_data.m_engineDamage) << "%, "
                  << "Gearbox: " << static_cast<int>(damage_data.m_gearBoxDamage) << "%, "
                  << "Rear Wing: " << static_cast<int>(damage_data.m_rearWingDamage) << "%" << std::endl;
        std::cout << std::fixed << std::setprecision(1)
                  << "?? Tire Wear - FL: " << current_combined_data.tyre_wear[2] << "%, "
                  << "FR: " << current_combined_data.tyre_wear[3] << "%, "
                  << "RL: " << current_combined_data.tyre_wear[0] << "%, "
                  << "RR: " << current_combined_data.tyre_wear[1] << "%" << std::endl;
        std::cout << std::defaultfloat;
    }
}
void DataProcessor::updateCarSetupData(const CarSetupData& setup_data) {
    // FIXED: Extract differential setting - handle different session types
    // Time Trial uses standard 0-100 range, other modes use different encoding
    if (setup_data.m_onThrottle <= 100) {
        current_combined_data.differential_on_throttle = setup_data.m_onThrottle;
    } else if (setup_data.m_offThrottle <= 100) {
        // Fallback for race mode where on-throttle might be encoded differently
        current_combined_data.differential_on_throttle = setup_data.m_offThrottle;
        std::cout << "🔄 Using m_offThrottle (" << (int)setup_data.m_offThrottle
                  << ") - m_onThrottle was " << (int)setup_data.m_onThrottle << " (out of range)" << std::endl;
    } else {
        // Both values out of range - likely locked diff in race
        current_combined_data.differential_on_throttle = 50; // Default locked diff
        std::cout << "⚠️ Both diff values invalid (On:" << (int)setup_data.m_onThrottle
                  << " Off:" << (int)setup_data.m_offThrottle << ") - using default 50%" << std::endl;
    }

    // Extract all car setup data from Packet 5 with bounds checking
    // Debug raw setup values occasionally
    static int setup_debug_counter = 0;
    if (++setup_debug_counter % 100 == 0) {
        std::cout << "🔧 Raw Car Setup Values: FWing=" << (int)setup_data.m_frontWing
                  << " RWing=" << (int)setup_data.m_rearWing
                  << " BrakeBias=" << (int)setup_data.m_brakeBias
                  << " BrakePress=" << (int)setup_data.m_brakePressure << std::endl;
    }

    // FIXED: Apply bounds checking - session-aware clamping
    // Different session types use different value ranges
    if (current_combined_data.session_type == 14) { // Time Trial mode
        current_combined_data.front_wing_aero = (setup_data.m_frontWing > 50) ? 50 : setup_data.m_frontWing;
        current_combined_data.rear_wing_aero = (setup_data.m_rearWing > 50) ? 50 : setup_data.m_rearWing;
    } else {
        // For other modes (Practice/Quali/Race), use raw values - they might use different encoding
        current_combined_data.front_wing_aero = setup_data.m_frontWing;
        current_combined_data.rear_wing_aero = setup_data.m_rearWing;

        // Debug log when values seem high
        if (setup_data.m_frontWing > 50 || setup_data.m_rearWing > 50) {
            std::cout << "🔧 High wing values in session " << (int)current_combined_data.session_type
                      << " - Front: " << (int)setup_data.m_frontWing
                      << ", Rear: " << (int)setup_data.m_rearWing << " (passing through)" << std::endl;
        }
    }
    current_combined_data.differential_off_throttle = setup_data.m_offThrottle;
    current_combined_data.front_camber = setup_data.m_frontCamber;
    current_combined_data.rear_camber = setup_data.m_rearCamber;
    current_combined_data.front_toe = setup_data.m_frontToe;
    current_combined_data.rear_toe = setup_data.m_rearToe;
    current_combined_data.front_suspension = setup_data.m_frontSuspension;
    current_combined_data.rear_suspension = setup_data.m_rearSuspension;
    current_combined_data.front_anti_roll_bar = setup_data.m_frontAntiRollBar;
    current_combined_data.rear_anti_roll_bar = setup_data.m_rearAntiRollBar;
    current_combined_data.front_ride_height = setup_data.m_frontSuspensionHeight;
    current_combined_data.rear_ride_height = setup_data.m_rearSuspensionHeight;
    current_combined_data.brake_pressure = (setup_data.m_brakePressure > 100) ? 100 : setup_data.m_brakePressure;
    current_combined_data.f1_brake_bias = (setup_data.m_brakeBias > 100) ? 70 : setup_data.m_brakeBias;

    // NOTE: Engine braking not available in F1 24 Car Setups packet
    // current_combined_data.engine_braking = 0; // Default value

    // Debug logging for differential issue
    if (setup_data.m_onThrottle > 100 || setup_data.m_offThrottle > 100) {
        std::cout << "⚠️ WARNING: Differential values out of spec! "
                  << "m_onThrottle=" << (int)setup_data.m_onThrottle
                  << ", m_offThrottle=" << (int)setup_data.m_offThrottle
                  << " (both should be 0-100), Session Type=" << (int)current_combined_data.session_type
                  << " (18=Time Trial, 10-17=Race modes)" << std::endl;

        // Maybe F1 24 swaps the fields in race mode?
        if (setup_data.m_offThrottle >= 10 && setup_data.m_offThrottle <= 100) {
            std::cout << "💡 HINT: m_offThrottle (" << (int)setup_data.m_offThrottle
                      << ") is in valid range - maybe F1 24 swaps the fields in race mode?" << std::endl;
        }
    }

    // Log setup changes occasionally for debugging
    static int setup_log_counter = 0;
    if (++setup_log_counter % 600 == 0) { // Every ~10 seconds at 60fps
        std::cout << "🔧 Car Setup - Front Wing: " << (int)setup_data.m_frontWing
                  << ", Rear Wing: " << (int)setup_data.m_rearWing
                  << ", Front Susp: " << (int)setup_data.m_frontSuspension
                  << ", Rear Susp: " << (int)setup_data.m_rearSuspension << std::endl;
    }
}

void DataProcessor::setGameIdentification(uint16_t packet_format, uint8_t game_year) {
    const char* detected = "F1 24";
    if (packet_format >= 2025 || game_year >= 25) {
        detected = "F1 25";
    }

    if (!game_identified || std::strcmp(current_combined_data.game_name, detected) != 0) {
        std::strncpy(current_combined_data.game_name, detected, sizeof(current_combined_data.game_name) - 1);
        current_combined_data.game_name[sizeof(current_combined_data.game_name) - 1] = '\0';
        game_identified = true;
    }
}
void DataProcessor::updateEventData(const char* event_code) {
    // Store the last event code for packet detection
    if (event_code && strlen(event_code) >= 4) {
        memset(current_combined_data.last_event_code, 0, 5);
        strncpy(current_combined_data.last_event_code, event_code, 4);
        current_combined_data.last_event_code[4] = '\0';
        std::cout << "📋 Event packet detected: " << event_code << std::endl;
    }
}

void DataProcessor::updateTyreSetsData(uint8_t num_sets) {
    // Store number of available tyre sets for packet detection
    current_combined_data.tyre_sets_available = num_sets;
    std::cout << "🔧 Tyre sets packet detected: " << (int)num_sets << " sets" << std::endl;
}

DataProcessor::ProcessedTelemetry DataProcessor::getCurrentData() {
    // Only return data if we have at least telemetry data
    if (has_telemetry_data) {
        // === ATLAS AI: Strategic Calculations ===
        updateStrategyInsights();

        // Update estimated lap time using lap predictor (F1 Dashboard V4)
        if (has_lap_data && has_session_data && lap_predictor) {
            AccurateLapPredictor::CompleteAnalysis analysis = lap_predictor->updateAnalysis(current_combined_data);
            if (analysis.valid && analysis.prediction.valid) {
                current_combined_data.estimated_lap_time = analysis.prediction.next_lap_time;
            } else {
                current_combined_data.estimated_lap_time = 0.0f; // No valid prediction yet
            }
        } else {
            current_combined_data.estimated_lap_time = 0.0f; // Insufficient data
        }

        // Display saved S3 from previous lap if within display window
        if (saved_sector3_time_ms > 0 && std::chrono::steady_clock::now() <= sector3_display_until) {
            // Temporarily show saved S3 from completed lap
            current_combined_data.sector3_time_ms = saved_sector3_time_ms;
        } else if (saved_sector3_time_ms > 0 && std::chrono::steady_clock::now() > sector3_display_until) {
            // Display timeout expired, clear saved S3
            std::cout << "⏰ Sector 3 display timeout - clearing saved S3 after 4 seconds" << std::endl;
            saved_sector3_time_ms = 0;
        }

        // Update sector status (F1 Dashboard V4) - fastest/personal/none
        updateSectorStatus();

        // Store for next calculation
        last_telemetry = current_combined_data;
        has_previous_data = true;

        return current_combined_data;
    }
    
    // Return empty data if no telemetry yet
    ProcessedTelemetry empty_data = {};
    return empty_data;
}

void DataProcessor::updateSectorStatus() {
    // Check if we have multi-car data for session best comparison
    bool has_session_best_data = has_multi_car_lap_data &&
                                current_multi_car_data.best_sector1_time > 0.0f &&
                                current_multi_car_data.best_sector2_time > 0.0f &&
                                current_multi_car_data.best_sector3_time > 0.0f;

    // Sector 1 status
    if (current_combined_data.sector1_time_ms > 0) {
        float sector1_time = current_combined_data.sector1_time_ms / 1000.0f;

        // Update personal best
        if (sector1_time < personal_best_sector1) {
            personal_best_sector1 = sector1_time;
        }

        // Compare against session best for status
        if (has_session_best_data && sector1_time <= current_multi_car_data.best_sector1_time + 0.001f) {
            current_combined_data.sector1_status = 2; // Fastest (purple)
        } else if (sector1_time <= personal_best_sector1 + 0.001f) {
            current_combined_data.sector1_status = 1; // Personal best (green)
        } else {
            current_combined_data.sector1_status = 0; // None (yellow)
        }
    } else {
        current_combined_data.sector1_status = 0; // No sector time
    }

    // Sector 2 status
    if (current_combined_data.sector2_time_ms > 0) {
        float sector2_time = current_combined_data.sector2_time_ms / 1000.0f;

        // Update personal best
        if (sector2_time < personal_best_sector2) {
            personal_best_sector2 = sector2_time;
        }

        // Compare against session best for status
        if (has_session_best_data && sector2_time <= current_multi_car_data.best_sector2_time + 0.001f) {
            current_combined_data.sector2_status = 2; // Fastest (purple)
        } else if (sector2_time <= personal_best_sector2 + 0.001f) {
            current_combined_data.sector2_status = 1; // Personal best (green)
        } else {
            current_combined_data.sector2_status = 0; // None (yellow)
        }
    } else {
        current_combined_data.sector2_status = 0; // No sector time
    }

    // Sector 3 status
    if (current_combined_data.sector3_time_ms > 0) {
        float sector3_time = current_combined_data.sector3_time_ms / 1000.0f;

        // Update personal best
        if (sector3_time < personal_best_sector3) {
            personal_best_sector3 = sector3_time;
        }

        // Compare against session best for status
        if (has_session_best_data && sector3_time <= current_multi_car_data.best_sector3_time + 0.001f) {
            current_combined_data.sector3_status = 2; // Fastest (purple)
        } else if (sector3_time <= personal_best_sector3 + 0.001f) {
            current_combined_data.sector3_status = 1; // Personal best (green)
        } else {
            current_combined_data.sector3_status = 0; // None (yellow)
        }
    } else {
        current_combined_data.sector3_status = 0; // No sector time
    }
}

std::string DataProcessor::toJSON(const ProcessedTelemetry& data) {
    char json_buffer[12288]; // Further increased buffer size for AC dynamic sectors
    
    // Helper function to get tire compound name
    auto getTyreCompoundName = [](uint8_t compound) -> const char* {
        switch (compound) {
            case 16: return "Soft";
            case 17: return "Medium";
            case 18: return "Hard";
            case 19: return "C2";
            case 20: return "C1";
            case 21: return "C0";
            case 22: return "C6";
            case 7: return "Intermediate";
            case 8: return "Wet";
            default: return "Unknown";
        }
    };

    // Build marshal_zone_flags array string
    std::string marshal_flags_str = "";
    for (int i = 0; i < data.marshal_zones_count && i < 21; i++) {
        if (i > 0) marshal_flags_str += ",";
        marshal_flags_str += std::to_string((int)data.marshal_zone_flags[i]);
    }

    std::string weather_forecast_json = "[";
    for (int i = 0; i < data.num_weather_forecast_samples && i < 64; ++i) {
        const auto& sample = data.weather_forecast_samples[i];
        if (i > 0) {
            weather_forecast_json += ",";
        }

        int time_offset_seconds = sample.m_timeOffset;
        if (sample.m_timeOffset <= 240) {
            time_offset_seconds = sample.m_timeOffset * 60;
        }

        weather_forecast_json += "{";
        weather_forecast_json += "\"m_sessionType\":" + std::to_string(sample.m_sessionType) + ",";
        weather_forecast_json += "\"m_timeOffset\":" + std::to_string(sample.m_timeOffset) + ",";
        weather_forecast_json += "\"m_timeOffsetSeconds\":" + std::to_string(time_offset_seconds) + ",";
        weather_forecast_json += "\"m_weather\":" + std::to_string(sample.m_weather) + ",";
        weather_forecast_json += "\"m_trackTemperature\":" + std::to_string(sample.m_trackTemperature) + ",";
        weather_forecast_json += "\"m_trackTemperatureChange\":" + std::to_string(sample.m_trackTemperatureChange) + ",";
        weather_forecast_json += "\"m_airTemperature\":" + std::to_string(sample.m_airTemperature) + ",";
        weather_forecast_json += "\"m_airTemperatureChange\":" + std::to_string(sample.m_airTemperatureChange) + ",";
        weather_forecast_json += "\"m_rainPercentage\":" + std::to_string(sample.m_rainPercentage);
        weather_forecast_json += "}";
    }
    weather_forecast_json += "]";

    std::string primary_plan_json = buildPlanJson(data.pit_plan_primary);
    std::string alternate_plan_json = buildPlanJson(data.pit_plan_alternative);
    std::string third_plan_json = buildPlanJson(data.pit_plan_third);

    snprintf(json_buffer, sizeof(json_buffer),
        "{"
        "\"timestamp\":%llu,"
        "\"speed_kph\":%.1f,"
        "\"rpm\":%u,"
        "\"gear\":%d,"
        "\"throttle_percent\":%.1f,"
        "\"brake_percent\":%.1f,"
        "\"speed_delta\":%.2f,"
        "\"rpm_delta\":%.0f,"
        "\"current_lap_time\":%.3f,"
        "\"last_lap_time\":%.3f,"
        "\"best_lap_time\":%.3f,"
        "\"position\":%u,"
        "\"current_lap_num\":%u,"
        "\"sector1_time\":%.3f,"
        "\"sector2_time\":%.3f,"
        "\"sector3_time\":%.3f,"
        "\"current_sector\":%u,"
        "\"pit_status\":%u,"
        "\"tire_compound\":\"%s\","
        "\"tyre_compound_actual\":%u,"
        "\"tyre_compound_visual\":%u,"
        "\"tire_age_laps\":%u,"
        "\"tire_temps\":{"
            "\"surface\":[%u,%u,%u,%u],"
            "\"inner\":[%u,%u,%u,%u]"
        "},"
        "\"tire_pressure\":[%.1f,%.1f,%.1f,%.1f],"
        "\"tire_wear\":[%.1f,%.1f,%.1f,%.1f],"
        "\"fuel_in_tank\":%.1f,"
        "\"fuel_remaining_laps\":%.1f,"
        "\"fuel\":%.1f,"
        "\"max_fuel\":%.1f,"
        "\"fuel_mix\":%u,"
        "\"drs_allowed\":%u,"
        "\"drs_open\":%u,"
        "\"max_rpm\":%u,"
        "\"ers_deploy_mode\":%u,"
        "\"ers_store_energy\":%.3f,"
        "\"ers_deployed_this_lap\":%.3f,"
        "\"ers_harvested_mguk\":%.3f,"
        "\"ers_harvested_mguh\":%.3f,"
        "\"differential_on_throttle\":%u,"
        "\"front_wing_aero\":%u,"
        "\"rear_wing_aero\":%u,"
        "\"differential_off_throttle\":%u,"
        "\"front_camber\":%.3f,"
        "\"rear_camber\":%.3f,"
        "\"front_toe\":%.3f,"
        "\"rear_toe\":%.3f,"
        "\"front_suspension\":%u,"
        "\"rear_suspension\":%u,"
        "\"front_anti_roll_bar\":%u,"
        "\"rear_anti_roll_bar\":%u,"
        "\"front_ride_height\":%u,"
        "\"rear_ride_height\":%u,"
        "\"brake_pressure\":%u,"
        "\"f1_brake_bias\":%u,"
        "\"pit_window_ideal_lap\":%u,"
        "\"pit_window_latest_lap\":%u,"
        "\"pit_window_open\":%u,"
        "\"delta_time\":%.3f,"
        "\"delta_time_session\":%.3f,"
        "\"delta_time_last\":%.3f,"
        "\"estimated_lap_time\":%.3f,"
        "\"sector1_status\":%u,"
        "\"sector2_status\":%u,"
        "\"sector3_status\":%u,"
        "\"world_position_x\":%.2f,"
        "\"world_position_y\":%.2f,"
        "\"lap_distance\":%.2f,"
        "\"weather\":%u,"
        "\"track_temperature\":%d,"
        "\"air_temperature\":%d,"
        "\"total_laps\":%u,"
        "\"track_id\":%d,"
        "\"session_type\":%u,"
        "\"session_time_left\":%u,"
        "\"safety_car_status\":%u,"
        "\"brake_bias\":%.1f,"
        "\"marshal_zone_flags\":[%s],"
        "\"forecast_accuracy\":%u,"
        "\"weather_forecast_samples\":%s,"
        "\"brake_temperature\":[%u,%u,%u,%u],"
        "\"surface_type\":[%u,%u,%u,%u],"
        "\"front_left_wing_damage\":%.1f,"
        "\"front_right_wing_damage\":%.1f,"
        "\"rear_wing_damage\":%.1f,"
        "\"floor_damage\":%.1f,"
        "\"diffuser_damage\":%.1f,"
        "\"sidepod_damage\":%.1f,"
        "\"engine_damage\":%.1f,"
        "\"gearbox_damage\":%.1f,"
        "\"tyres_damage\":[%.1f,%.1f,%.1f,%.1f],"
        "\"tyre_blisters\":[%u,%u,%u,%u],"
        "\"game_name\":\"%s\","
        "\"car_name\":\"%s\","
        "\"track_name\":\"%s\","
        "\"penalties_enabled\":%u,"
        "\"penalty_time\":%.3f,"
        "\"numberOfTyresOut\":%u,"
        "\"flag_type\":%u,"
        "\"is_in_pit\":%u,"
        "\"is_in_pitlane\":%u,"
        "\"mandatory_pit_done\":%u,"
        "\"lap_invalidated\":%u,"
        "\"f1_penalties_time\":%u,"
        "\"f1_num_penalties\":%u,"
        "\"f1_lap_invalid\":%u,"
        "\"corner_cutting_warnings\":%u,"
        "\"last_event_code\":\"%s\","
        "\"tyre_sets_available\":%u,"
        "\"normalized_car_position\":%.6f,"
        "\"ac_extended\":{"
            "\"tyre_temp_inner\":[%.1f,%.1f,%.1f,%.1f],"
            "\"tyre_temp_middle\":[%.1f,%.1f,%.1f,%.1f],"
            "\"tyre_temp_outer\":[%.1f,%.1f,%.1f,%.1f],"
            "\"tyre_core_temperature\":[%.1f,%.1f,%.1f,%.1f],"
            "\"tyre_wear_detailed\":[%.3f,%.3f,%.3f,%.3f],"
            "\"suspension_travel\":[%.3f,%.3f,%.3f,%.3f],"
            "\"performance_meter\":%.3f,"
            "\"surface_grip\":%.3f,"
            "\"wind_speed\":%.1f,"
            "\"wind_direction\":%.1f,"
            "\"max_fuel\":%.1f,"
            "\"aid_tire_rate\":%.3f,"
            "\"aid_fuel_rate\":%.3f,"
            "\"aid_mechanical_damage\":%.3f,"
            "\"aid_stability\":%.3f,"
            "\"aid_auto_clutch\":%u,"
            "\"aid_auto_blip\":%u,"
            "\"aid_allow_tyre_blankets\":%u,"
            "\"clutch_position\":%.3f,"
            "\"turbo_boost\":%.2f,"
            "\"ballast_kg\":%.1f,"
            "\"air_density\":%.4f,"
            "\"center_of_gravity_height\":%.3f,"
            "\"force_feedback\":%.2f,"
            "\"camber_angle\":[%.4f,%.4f,%.4f,%.4f],"
            "\"wheel_slip\":[%.3f,%.3f,%.3f,%.3f],"
            "\"wheel_load\":[%.1f,%.1f,%.1f,%.1f],"
            "\"local_angular_velocity\":[%.3f,%.3f,%.3f],"
            "\"local_velocity\":[%.2f,%.2f,%.2f],"
            "\"acceleration_g\":[%.3f,%.3f,%.3f],"
            "\"car_damage\":[%.3f,%.3f,%.3f,%.3f,%.3f],"
            "\"is_ai_controlled\":%u,"
            "\"auto_shifter_enabled\":%u,"
            "\"pit_limiter_enabled\":%u,"
            "\"ideal_line_enabled\":%u,"
            "\"traction_control_setting\":%u,"
            "\"traction_control_setting_secondary\":%u,"
            "\"abs_setting\":%u,"
            "\"fuel_map_setting\":%u,"
            "\"fuel_map_max\":%u,"
            "\"engine_brake_setting\":%u,"
            "\"steering_angle\":%.3f,"
            "\"heading_angle\":%.3f,"
            "\"pitch_angle\":%.3f,"
            "\"roll_angle\":%.3f,"
            "\"brake_bias\":%.3f,"
            "\"track_spline_length\":%.2f,"
            "\"ride_height\":[%.3f,%.3f]"
        "},"

        // === ATLAS AI: Strategic Telemetry ===
        "\"atlas_ai\":{"
            "\"fuel_per_lap_average\":%.2f,"
            "\"fuel_last_lap\":%.2f,"
            "\"fuel_laps_remaining_calculated\":%.2f,"
            "\"fuel_calc_ready\":%u,"
            "\"fuel_margin_laps\":%.2f,"
            "\"fuel_deficit_laps\":%.2f,"
            "\"fuel_target_save_per_lap\":%.3f,"
            "\"fuel_strategy_status\":%u,"
            "\"tyre_degradation_rate\":%.3f,"
            "\"tyre_life_remaining_laps\":%.2f,"
            "\"tyre_performance_index\":%.1f,"
            "\"tyre_critical_warning\":%u,"
            "\"tyre_stint_progress\":%.3f,"
            "\"tyre_strategy_status\":%u,"
            "\"pit_delta_time\":%.2f,"
            "\"pit_delta_with_wing\":%.2f,"
            "\"pit_advantage_available\":%u,"
            "\"pit_break_even_laps\":%.1f,"
            "\"pit_strategy_status\":%u,"
            "\"pit_recommended_lap\":%.1f,"
            "\"pit_net_time_delta\":%.2f,"
            "\"pit_time_loss_no_pit\":%.2f,"
            "\"pit_tire_time_gain\":%.2f,"
            "\"pit_fuel_time_gain\":%.2f,"
            "\"pit_rejoin_position\":%u,"
            "\"pit_rejoin_ahead\":{"
                "\"driver_name\":\"%s\","
                "\"position\":%u,"
                "\"gap_seconds\":%.2f"
            "},"
            "\"pit_rejoin_behind\":{"
                "\"driver_name\":\"%s\","
                "\"position\":%u,"
                "\"gap_seconds\":%.2f"
            "},"
            "\"pit_stops_completed\":%u,"
            "\"last_pit_stop_lap\":%.1f,"
            "\"pit_plan_count\":%u,"
            "\"pit_plan_selected\":%u,"
            "\"pit_cheap_stop_available\":%u,"
            "\"pit_plan_primary\":%s,"
            "\"pit_plan_alternative\":%s,"
            "\"pit_plan_third\":%s,"
            "\"ers_store_percent\":%.1f,"
            "\"ers_strategy_mode\":%u,"
            "\"ers_attack_gap\":%.2f,"
            "\"ers_defend_gap\":%.2f,"
            "\"ers_harvest_gap\":%.2f,"
            "\"opponent_ahead_1\":{"
                "\"driver_name\":\"%s\","
                "\"position\":%u,"
                "\"gap_seconds\":%.2f,"
                "\"tyre_age\":%u,"
                "\"last_lap_time\":%.3f,"
                "\"tyre_compound\":%u"
            "},"
            "\"opponent_ahead_2\":{"
                "\"driver_name\":\"%s\","
                "\"position\":%u,"
                "\"gap_seconds\":%.2f,"
                "\"tyre_age\":%u,"
                "\"last_lap_time\":%.3f,"
                "\"tyre_compound\":%u"
            "},"
            "\"opponent_behind_1\":{"
                "\"driver_name\":\"%s\","
                "\"position\":%u,"
                "\"gap_seconds\":%.2f,"
                "\"tyre_age\":%u,"
                "\"last_lap_time\":%.3f,"
                "\"tyre_compound\":%u"
            "},"
            "\"opponent_behind_2\":{"
                "\"driver_name\":\"%s\","
                "\"position\":%u,"
                "\"gap_seconds\":%.2f,"
                "\"tyre_age\":%u,"
                "\"last_lap_time\":%.3f,"
                "\"tyre_compound\":%u"
            "},"
            "\"num_opponents_ahead\":%u,"
            "\"num_opponents_behind\":%u"
        "}"
        "}",
        data.timestamp_ms,
        data.speed_kph,
        data.rpm,
        data.gear,
        data.throttle_percent,
        data.brake_percent,
        data.speed_delta,
        (float)data.rpm_delta,
        data.current_lap_time,
        data.last_lap_time,
        data.best_lap_time,
        data.position,
        data.current_lap_num,
        data.sector1_time_ms / 1000.0f,
        data.sector2_time_ms / 1000.0f,
        data.sector3_time_ms / 1000.0f,
        data.current_sector,
        data.pit_status,
        getTyreCompoundName(data.tyre_compound_visual),
        data.tyre_compound_actual,
        data.tyre_compound_visual,
        data.tyre_age_laps,
        data.tyre_surface_temp[0], data.tyre_surface_temp[1], 
        data.tyre_surface_temp[2], data.tyre_surface_temp[3],
        data.tyre_inner_temp[0], data.tyre_inner_temp[1],
        data.tyre_inner_temp[2], data.tyre_inner_temp[3],
        data.tyre_pressure[0], data.tyre_pressure[1],
        data.tyre_pressure[2], data.tyre_pressure[3],
        data.tyre_wear[0], data.tyre_wear[1],
        data.tyre_wear[2], data.tyre_wear[3],
        data.fuel_in_tank,
        data.fuel_remaining_laps,
        data.fuel_in_tank,
        data.maxFuel,
        data.fuel_mix,
        data.drs_allowed,
        data.drs_open,
        data.max_rpm,
        data.ers_deploy_mode,
        data.ers_store_energy,
        data.ers_deployed_this_lap,
        data.ers_harvested_this_lap_mguk,
        data.ers_harvested_this_lap_mguh,
        data.differential_on_throttle,
        data.front_wing_aero,
        data.rear_wing_aero,
        data.differential_off_throttle,
        data.front_camber,
        data.rear_camber,
        data.front_toe,
        data.rear_toe,
        data.front_suspension,
        data.rear_suspension,
        data.front_anti_roll_bar,
        data.rear_anti_roll_bar,
        data.front_ride_height,
        data.rear_ride_height,
        data.brake_pressure,
        data.f1_brake_bias,
        data.pit_window_ideal_lap,
        data.pit_window_latest_lap,
        data.pit_window_open,
        data.delta_time,
        data.delta_time_session,
        data.delta_time_last,
        data.estimated_lap_time,
        data.sector1_status,
        data.sector2_status,
        data.sector3_status,
        data.world_position_x,
        data.world_position_y,
        data.lap_distance,
        data.weather,
        data.track_temperature,
        data.air_temperature,
        data.total_laps,
        data.track_id,
        data.session_type,
        data.session_time_left,
        data.safety_car_status,
        data.brake_bias,
        marshal_flags_str.c_str(),
        data.forecast_accuracy,
        weather_forecast_json.c_str(),
        data.brake_temperature[0], data.brake_temperature[1],
        data.brake_temperature[2], data.brake_temperature[3],
        data.surface_type[0], data.surface_type[1],
        data.surface_type[2], data.surface_type[3],
        data.front_left_wing_damage,
        data.front_right_wing_damage,
        data.rear_wing_damage,
        data.floor_damage,
        data.diffuser_damage,
        data.sidepod_damage,
        data.engine_damage,
        data.gearbox_damage,
        data.tyres_damage[0], data.tyres_damage[1], data.tyres_damage[2], data.tyres_damage[3],
        data.tyre_blisters[0], data.tyre_blisters[1], data.tyre_blisters[2], data.tyre_blisters[3],
        data.game_name,
        data.car_name,
        data.track_name,
        // AC penalty fields at top level for mistake detection
        data.penalties_enabled,
        data.penalty_time,
        data.numberOfTyresOut,
        data.flag_type,
        data.is_in_pit,
        data.is_in_pitlane,
        data.mandatory_pit_done,
        data.lap_invalidated,
        data.penalties_time,
        data.num_penalties,
        data.lap_invalid,
        data.corner_cutting_warnings,
        data.last_event_code,
        data.tyre_sets_available,
        data.normalized_car_position,
        // AC Extended Telemetry Parameters
        data.tyre_temp_inner[0], data.tyre_temp_inner[1], data.tyre_temp_inner[2], data.tyre_temp_inner[3],
        data.tyre_temp_middle[0], data.tyre_temp_middle[1], data.tyre_temp_middle[2], data.tyre_temp_middle[3],
        data.tyre_temp_outer[0], data.tyre_temp_outer[1], data.tyre_temp_outer[2], data.tyre_temp_outer[3],
        data.tyre_core_temperature[0], data.tyre_core_temperature[1], data.tyre_core_temperature[2], data.tyre_core_temperature[3],
        data.tyre_wear_detailed[0], data.tyre_wear_detailed[1], data.tyre_wear_detailed[2], data.tyre_wear_detailed[3],
        data.suspension_travel[0], data.suspension_travel[1], data.suspension_travel[2], data.suspension_travel[3],
        data.performance_meter,
        data.surface_grip,
        data.wind_speed,
        data.wind_direction,
        data.maxFuel,
        data.aid_tire_rate,
        data.aid_fuel_rate,
        data.aid_mechanical_damage,
        data.aid_stability,
        data.aid_auto_clutch,
        data.aid_auto_blip,
        data.aid_allow_tyre_blankets,
        data.clutch_position,
        data.turbo_boost,
        data.ballast_kg,
        data.air_density,
        data.center_of_gravity_height,
        data.force_feedback,
        data.camber_angle[0], data.camber_angle[1], data.camber_angle[2], data.camber_angle[3],
        data.wheel_slip[0], data.wheel_slip[1], data.wheel_slip[2], data.wheel_slip[3],
        data.wheel_load[0], data.wheel_load[1], data.wheel_load[2], data.wheel_load[3],
        data.local_angular_velocity[0], data.local_angular_velocity[1], data.local_angular_velocity[2],
        data.local_velocity[0], data.local_velocity[1], data.local_velocity[2],
        data.acceleration_g[0], data.acceleration_g[1], data.acceleration_g[2],
        data.car_damage[0], data.car_damage[1], data.car_damage[2], data.car_damage[3], data.car_damage[4],
        data.is_ai_controlled,
        data.auto_shifter_enabled,
        data.pit_limiter_enabled,
        data.ideal_line_enabled,
        data.traction_control_setting,
        data.traction_control_setting_secondary,
        data.abs_setting,
        data.fuel_map_setting,
        data.fuel_map_max,
        data.engine_brake_setting,
        data.steering_angle,
        data.heading_angle,
        data.pitch_angle,
        data.roll_angle,
        data.brake_bias,
        data.track_spline_length,
        data.ride_height[0], data.ride_height[1],

        // === ATLAS AI: Strategic Telemetry Values ===
        data.fuel_per_lap_average,
        data.fuel_last_lap,
        data.fuel_laps_remaining_calculated,
        data.fuel_calc_ready,
        data.fuel_margin_laps,
        data.fuel_deficit_laps,
        data.fuel_target_save_per_lap,
        data.fuel_strategy_status,
        data.tyre_degradation_rate,
        data.tyre_life_remaining_laps,
        data.tyre_performance_index,
        data.tyre_critical_warning,
        data.tyre_stint_progress,
        data.tyre_strategy_status,
        data.pit_delta_time,
        data.pit_delta_with_wing,
        data.pit_advantage_available,
        data.pit_break_even_laps,
        data.pit_strategy_status,
        data.pit_recommended_lap,
        data.pit_net_time_delta,
        data.pit_time_loss_no_pit,
        data.pit_tire_time_gain,
        data.pit_fuel_time_gain,
        data.pit_rejoin_position,
        data.pit_rejoin_ahead.driver_name,
        data.pit_rejoin_ahead.position,
        data.pit_rejoin_ahead.gap_seconds,
        data.pit_rejoin_behind.driver_name,
        data.pit_rejoin_behind.position,
        data.pit_rejoin_behind.gap_seconds,
        data.pit_stops_completed,
        data.last_pit_stop_lap,
        data.pit_plan_count,
        data.pit_plan_selected,
        data.pit_cheap_stop_available,
        primary_plan_json.c_str(),
        alternate_plan_json.c_str(),
        third_plan_json.c_str(),
        data.ers_store_percent,
        data.ers_strategy_mode,
        data.ers_attack_gap,
        data.ers_defend_gap,
        data.ers_harvest_gap,
        // Opponent ahead 1
        data.opponent_ahead_1.driver_name,
        data.opponent_ahead_1.position,
        data.opponent_ahead_1.gap_seconds,
        data.opponent_ahead_1.tyre_age,
        data.opponent_ahead_1.last_lap_time,
        data.opponent_ahead_1.tyre_compound,
        // Opponent ahead 2
        data.opponent_ahead_2.driver_name,
        data.opponent_ahead_2.position,
        data.opponent_ahead_2.gap_seconds,
        data.opponent_ahead_2.tyre_age,
        data.opponent_ahead_2.last_lap_time,
        data.opponent_ahead_2.tyre_compound,
        // Opponent behind 1
        data.opponent_behind_1.driver_name,
        data.opponent_behind_1.position,
        data.opponent_behind_1.gap_seconds,
        data.opponent_behind_1.tyre_age,
        data.opponent_behind_1.last_lap_time,
        data.opponent_behind_1.tyre_compound,
        // Opponent behind 2
        data.opponent_behind_2.driver_name,
        data.opponent_behind_2.position,
        data.opponent_behind_2.gap_seconds,
        data.opponent_behind_2.tyre_age,
        data.opponent_behind_2.last_lap_time,
        data.opponent_behind_2.tyre_compound,
        // Opponent counts
        data.num_opponents_ahead,
        data.num_opponents_behind
    );

    return std::string(json_buffer);
}

void DataProcessor::logTelemetry(const ProcessedTelemetry& data) {
    std::cout << "Speed: " << data.speed_kph << " km/h, "
              << "RPM: " << data.rpm << ", "
              << "Gear: " << (int)data.gear << ", "
              << "Throttle: " << data.throttle_percent << "%, "
              << "Brake: " << data.brake_percent << "%, "
              << "Lap: " << (int)data.current_lap_num << ", "
              << "Pos: P" << (int)data.position << ", "
              << "Tires: " << (int)data.tyre_age_laps << " laps old" << std::endl;
}

// Multi-car processing methods for pit wall dashboard

void DataProcessor::updateMultiCarLapData(const PacketLapData& lap_packet) {
    current_multi_car_data.header = lap_packet.m_header;
    current_multi_car_data.timestamp_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::system_clock::now().time_since_epoch()).count();
    
    // Process all 22 cars
    for (int i = 0; i < 22; i++) {
        const LapData& lap_data = lap_packet.m_lapData[i];
        ProcessedTelemetry& car_data = current_multi_car_data.cars[i];
        
        // Update lap timing data
        car_data.current_lap_time = lap_data.currentLapTime();
        car_data.last_lap_time = lap_data.lastLapTime();
        car_data.position = lap_data.m_carPosition;
        car_data.current_lap_num = lap_data.m_currentLapNum;
        car_data.sector1_time_ms = lap_data.m_sector1TimeMSPart;
        car_data.sector2_time_ms = lap_data.m_sector2TimeMSPart;
        car_data.sector3_time_ms = 0; // Sector 3 comes from Session History packet
        car_data.current_sector = lap_data.m_sector;
        car_data.pit_status = lap_data.m_pitStatus;
        car_data.result_status = lap_data.m_resultStatus;
        car_data.lap_distance = lap_data.m_lapDistance;

        // F1 24 Penalties for all cars
        car_data.penalties_time = lap_data.m_penalties;
        car_data.num_penalties = lap_data.m_totalWarnings;
        car_data.lap_invalid = (lap_data.m_currentLapInvalid == 1) ? 1 : 0;
        car_data.corner_cutting_warnings = lap_data.m_cornerCuttingWarnings;
        
        // Track each car's personal best lap time
        if (lap_data.lastLapTime() > 0.0f) {
            if (car_data.best_lap_time == 0.0f || lap_data.lastLapTime() < car_data.best_lap_time) {
                car_data.best_lap_time = lap_data.lastLapTime();
            }
        }

        // Extract real F1 24 gap data (convert from milliseconds to seconds)
        car_data.gap_to_car_ahead = (lap_data.m_deltaToCarInFrontMinutesPart * 60.0f) + 
                                   (lap_data.m_deltaToCarInFrontMSPart / 1000.0f);
        car_data.gap_to_race_leader = (lap_data.m_deltaToRaceLeaderMinutesPart * 60.0f) + 
                                     (lap_data.m_deltaToRaceLeaderMSPart / 1000.0f);
        
        // Update session best times
        if (lap_data.m_sector1TimeMSPart > 0) {
            float sector1_time = lap_data.m_sector1TimeMSPart / 1000.0f;
            if (current_multi_car_data.best_sector1_time == 0.0f || sector1_time < current_multi_car_data.best_sector1_time) {
                current_multi_car_data.best_sector1_time = sector1_time;
            }
        }
        
        if (lap_data.m_sector2TimeMSPart > 0) {
            float sector2_time = lap_data.m_sector2TimeMSPart / 1000.0f;
            if (current_multi_car_data.best_sector2_time == 0.0f || sector2_time < current_multi_car_data.best_sector2_time) {
                current_multi_car_data.best_sector2_time = sector2_time;
            }
        }
        
        if (lap_data.lastLapTime() > 0.0f) {
            if (current_multi_car_data.best_lap_time == 0.0f || lap_data.lastLapTime() < current_multi_car_data.best_lap_time) {
                current_multi_car_data.best_lap_time = lap_data.lastLapTime();
            }
        }
    }
    
    has_multi_car_lap_data = true;
}

void DataProcessor::updateMultiCarTelemetryData(const PacketCarTelemetryData& telemetry_packet) {
    // Process all 22 cars telemetry data
    for (int i = 0; i < 22; i++) {
        const CarTelemetryData& telemetry_data = telemetry_packet.m_carTelemetryData[i];
        ProcessedTelemetry& car_data = current_multi_car_data.cars[i];
        
        // Core telemetry values
        car_data.speed_kph = telemetry_data.m_speed;
        car_data.rpm = telemetry_data.m_engineRPM;
        car_data.gear = telemetry_data.m_gear;
        car_data.throttle_percent = telemetry_data.m_throttle * 100.0f;
        car_data.brake_percent = telemetry_data.m_brake * 100.0f;
        
        // Tire data
        for (int j = 0; j < 4; j++) {
            car_data.tyre_surface_temp[j] = telemetry_data.m_tyresSurfaceTemperature[j];
            car_data.tyre_inner_temp[j] = telemetry_data.m_tyresInnerTemperature[j];
            car_data.tyre_pressure[j] = telemetry_data.m_tyresPressure[j];
            car_data.brake_temperature[j] = telemetry_data.m_brakesTemperature[j];
            car_data.surface_type[j] = telemetry_data.m_surfaceType[j];
        }
    }
    
    has_multi_car_telemetry_data = true;
}

void DataProcessor::updateMultiCarStatusData(const PacketCarStatusData& status_packet) {
    // Process all 22 cars status data
    for (int i = 0; i < 22; i++) {
        const CarStatusData& status_data = status_packet.m_carStatusData[i];
        ProcessedTelemetry& car_data = current_multi_car_data.cars[i];
        
        // Tire compound data
        car_data.tyre_compound_actual = status_data.m_actualTyreCompound;
        car_data.tyre_compound_visual = status_data.m_visualTyreCompound;
        car_data.tyre_age_laps = status_data.m_tyresAgeLaps;
        
        // Car status data
        car_data.fuel_in_tank = status_data.m_fuelInTank;
        car_data.fuel_remaining_laps = status_data.m_fuelRemainingLaps;
        car_data.drs_allowed = status_data.m_drsAllowed;
        car_data.drs_activation_distance = status_data.m_drsActivationDistance; // Phase 7B
        car_data.ers_deploy_mode = status_data.m_ersDeployMode;
        car_data.ers_store_energy = status_data.m_ersStoreEnergy / 1000000.0f; // Convert Joules to MJ
        car_data.ers_deployed_this_lap = status_data.m_ersDeployedThisLap / 1000000.0f; // Phase 7B
        car_data.ers_harvested_this_lap_mguk = status_data.m_ersHarvestedThisLapMGUK / 1000000.0f; // Phase 7B
        car_data.ers_harvested_this_lap_mguh = status_data.m_ersHarvestedThisLapMGUH / 1000000.0f; // Phase 7B
        car_data.actual_tyre_compound = status_data.m_actualTyreCompound; // Phase 7B
    }
    
    has_multi_car_status_data = true;
}

void DataProcessor::updateMultiCarSessionHistory(const PacketSessionHistoryData& history_packet) {
    // Update sector 3 times for the specific car from Session History
    if (history_packet.m_carIdx < 22 && history_packet.m_numLaps > 0) {
        const LapHistoryData& latest_lap = history_packet.m_lapHistoryData[history_packet.m_numLaps - 1];
        ProcessedTelemetry& car_data = current_multi_car_data.cars[history_packet.m_carIdx];
        
        // Update all sector times from Session History (more accurate)
        if (latest_lap.m_lapValidBitFlags & 0x02) { // Sector 1 valid
            car_data.sector1_time_ms = latest_lap.m_sector1TimeMSPart;
        }
        if (latest_lap.m_lapValidBitFlags & 0x04) { // Sector 2 valid
            car_data.sector2_time_ms = latest_lap.m_sector2TimeMSPart;
        }
        if (latest_lap.m_lapValidBitFlags & 0x08) { // Sector 3 valid
            car_data.sector3_time_ms = latest_lap.m_sector3TimeMSPart;
            
            // Update session best sector 3 time
            float sector3_time = latest_lap.m_sector3TimeMSPart / 1000.0f;
            if (current_multi_car_data.best_sector3_time == 0.0f || sector3_time < current_multi_car_data.best_sector3_time) {
                current_multi_car_data.best_sector3_time = sector3_time;
            }
        }
    }
}

void DataProcessor::updateParticipantsData(const PacketParticipantsData& participants_packet) {
    current_multi_car_data.header = participants_packet.m_header;
    current_multi_car_data.num_active_cars = std::min<uint8_t>(participants_packet.m_numActiveCars, 22);

    // Clear existing participant entries to prevent stale data when car count shrinks
    std::memset(current_multi_car_data.participants, 0, sizeof(current_multi_car_data.participants));

    int copy_count = std::min<int>(participants_packet.m_numActiveCars, 22);
    for (int i = 0; i < copy_count; i++) {
        current_multi_car_data.participants[i] = participants_packet.m_participants[i];
        current_multi_car_data.participants[i].m_name[sizeof(current_multi_car_data.participants[i].m_name) - 1] = '\0';
    }

    has_participants_data = true;
}

void DataProcessor::updateMultiCarMotionData(const PacketMotionData& motion_packet) {
    for (int i = 0; i < 22; i++) {
        const CarMotionData& motion = motion_packet.m_carMotionData[i];
        ProcessedTelemetry& car_data = current_multi_car_data.cars[i];
        const bool finite_x = std::isfinite(motion.m_worldPositionX);
        const bool finite_z = std::isfinite(motion.m_worldPositionZ);

        if (!finite_x || !finite_z) {
            continue;
        }

        const bool is_origin = std::abs(motion.m_worldPositionX) < 0.01f &&
                               std::abs(motion.m_worldPositionZ) < 0.01f;

        if (is_origin && (car_data.world_position_x != 0.0f || car_data.world_position_y != 0.0f)) {
            continue; // Skip zeroed packets to preserve last known positions
        }

        car_data.world_position_x = motion.m_worldPositionX;
        car_data.world_position_y = motion.m_worldPositionZ; // Use Z for in-game forward axis
    }
}

DataProcessor::MultiCarData DataProcessor::getMultiCarData() {
    return current_multi_car_data;
}

bool DataProcessor::hasCompleteMultiCarData() {
    return has_multi_car_lap_data && has_participants_data;
}

std::string DataProcessor::multiCarToJSON(const MultiCarData& data) {
    // Helper function to get tire compound name
    auto getTyreCompoundName = [](uint8_t compound) -> const char* {
        switch (compound) {
            case 16: return "Soft";
            case 17: return "Medium";
            case 18: return "Hard";
            case 7: return "Intermediate";
            case 8: return "Wet";
            default: return "Unknown";
        }
    };
    
    // Helper function to get team name from F1 24 team ID (Official F1 24 Specification)
    auto getTeamName = [](uint8_t teamId) -> const char* {
        switch (teamId) {
            // Official F1 24 Teams
            case 0: return "Mercedes";
            case 1: return "Ferrari";
            case 2: return "Red Bull Racing";
            case 3: return "Williams";
            case 4: return "Aston Martin";
            case 5: return "Alpine";
            case 6: return "RB";                    // Official F1 24 name (formerly VCARB/Alpha Tauri)
            case 7: return "Haas";
            case 8: return "McLaren";
            case 9: return "Sauber";
            case 41: return "F1 Generic";
            case 104: return "F1 Custom Team";
            // F2 2023 Teams
            case 143: return "Art GP '23";
            case 144: return "Campos '23";
            case 145: return "Carlin '23";
            case 146: return "PHM '23";
            case 147: return "Dams '23";
            case 148: return "Hitech '23";
            case 149: return "MP Motorsport '23";
            case 150: return "Prema '23";
            case 151: return "Trident '23";
            case 152: return "Van Amersfoort Racing '23";
            case 153: return "Virtuosi '23";
            default: return "Unknown";
        }
    };
    
    // Helper function to get driver name from F1 24 driver ID (Official F1 24 Specification)
    auto getDriverName = [](uint8_t driverId) -> const char* {
        switch (driverId) {
            case 0: return "Carlos Sainz";
            case 7: return "Lewis Hamilton";
            case 9: return "Max Verstappen";
            case 14: return "Sergio Perez";
            case 15: return "Valtteri Bottas";
            case 17: return "Esteban Ocon";
            case 19: return "Lance Stroll";
            case 32: return "Logan Sargeant";
            case 51: return "George Russell";
            case 54: return "Lando Norris";
            case 58: return "Charles Leclerc";
            case 59: return "Pierre Gasly";
            case 62: return "Alexander Albon";
            case 74: return "Antonio Giovinazzi";
            case 81: return "Zhou Guanyu";
            case 82: return "Mick Schumacher";
            case 112: return "Oscar Piastri";
            case 113: return "Liam Lawson";
            case 130: return "Frederik Vesti";
            case 131: return "Olli Caldwell";
            case 134: return "Ayumu Iwasa";
            case 135: return "Clement Novalak";
            case 136: return "Jack Doohan";
            case 137: return "Amaury Cordeel";
            case 138: return "Dennis Hauger";
            case 139: return "Calan Williams";
            case 140: return "Jamie Chadwick";
            case 147: return "Oliver Bearman";
            case 148: return "Jak Crawford";
            case 149: return "Isack Hadjar";
            case 150: return "Arthur Leclerc";
            default: return nullptr; // Use participant name instead
        }
    };
    
    // Helper function to escape JSON strings and remove control characters
    auto escapeJsonString = [](const char* str, size_t max_len = 48) -> std::string {
        std::string result;
        result.reserve(max_len + 10); // Reserve space for escaped characters
        
        for (size_t i = 0; i < max_len && str[i] != '\0'; i++) {
            char c = str[i];
            // Skip or replace control characters
            if (c < 32 && c != '\t' && c != '\n' && c != '\r') {
                continue; // Skip control characters
            }
            
            switch (c) {
                case '"': result += "\\\""; break;
                case '\\': result += "\\\\"; break;
                case '\t': result += "\\t"; break;
                case '\n': result += "\\n"; break;
                case '\r': result += "\\r"; break;
                default: result += c; break;
            }
        }
        return result;
    };
    
    // Start building JSON - allocate larger buffer for multi-car data
    // Find fastest lap driver
    uint8_t fastest_lap_driver = 255; // Invalid index means no fastest lap
    float fastest_lap_time = 999999.0f;

    for (int i = 0; i < data.num_active_cars && i < 22; i++) {
        const ProcessedTelemetry& car = data.cars[i];
        if (car.best_lap_time > 0 && car.best_lap_time < fastest_lap_time) {
            fastest_lap_time = car.best_lap_time;
            fastest_lap_driver = i;
        }
    }

    std::string json = "{";
    json += "\"type\":\"multicar\",";
    json += "\"timestamp\":" + std::to_string(data.timestamp_ms) + ",";
    json += "\"num_active_cars\":" + std::to_string(data.num_active_cars) + ",";
    json += "\"fastest_lap_driver\":" + std::to_string(fastest_lap_driver) + ",";
    json += "\"session_best_times\":{";
    json += "\"sector1\":" + std::to_string(data.best_sector1_time) + ",";
    json += "\"sector2\":" + std::to_string(data.best_sector2_time) + ",";
    json += "\"lap\":" + std::to_string(data.best_lap_time);
    json += "},";
    json += "\"cars\":[";

    // FIXED: Create a sorted index array - check ALL 22 slots to find player
    std::vector<int> sortedIndices;

    uint8_t player_idx = data.header.m_playerCarIndex;
    if (player_idx < 22) {
        static uint8_t last_logged_player_idx = 255;
        static std::string last_logged_player_name;

        std::string player_name = getParticipantName(player_idx);
        if (player_idx != last_logged_player_idx || player_name != last_logged_player_name) {
            std::cout << "[AtlasAI] Player car detected: index=" << static_cast<int>(player_idx)
                      << ", position=P" << static_cast<int>(data.cars[player_idx].position)
                      << ", name=" << player_name << std::endl;
            last_logged_player_idx = player_idx;
            last_logged_player_name = player_name;
        }
    }

    // Check ALL 22 slots, not just num_active_cars!
    for (int i = 0; i < 22; i++) {
        // Include car if it has valid position OR is the player
        if (data.cars[i].position > 0) {
            sortedIndices.push_back(i);
        } else if (i == player_idx && player_idx < 22) {
            // Force include player even if position is 0
            sortedIndices.push_back(i);
            static bool logged_forced_player = false;
            if (!logged_forced_player) {
                std::cout << "[AtlasAI] Player position missing, forcing inclusion in multicar feed"
                          << std::endl;
                logged_forced_player = true;
            }
        }
    }

    // Sort by position (P1 first, P2 second, etc.)
    std::sort(sortedIndices.begin(), sortedIndices.end(),
              [&data](int a, int b) {
                  return data.cars[a].position < data.cars[b].position;
              });

    for (size_t idx = 0; idx < sortedIndices.size(); idx++) {
        int i = sortedIndices[idx];
        if (idx > 0) json += ",";
        
        const ProcessedTelemetry& car = data.cars[i];
        const ParticipantData& participant = data.participants[i];
        
        // Debug logging for participant data
        static int debug_counter = 0;
        if (++debug_counter % 100 == 0 && i < 3) { // Log every 100 calls, first 3 cars only
            std::cout << "DEBUG Car " << i << ": teamId=" << (int)participant.m_teamId 
                      << ", driverId=" << (int)participant.m_driverId 
                      << ", aiControlled=" << (int)participant.m_aiControlled 
                      << ", name='" << std::string(participant.m_name, 0, 20) << "'"
                      << ", raceNum=" << (int)participant.m_raceNumber << std::endl;
        }
        
        // Get driver name using F1 24 logic - prioritize participant name over driver ID
        std::string safe_driver_name = escapeJsonString(participant.m_name);
        
        // If participant name is empty, try driver ID lookup for AI drivers
        if (safe_driver_name.empty() && participant.m_aiControlled && participant.m_driverId != 255) {
            const char* officialName = getDriverName(participant.m_driverId);
            if (officialName) {
                safe_driver_name = std::string(officialName);
            }
        }
        
        // Final fallback - use position or race number instead of array index
        if (safe_driver_name.empty()) {
            if (participant.m_raceNumber > 0) {
                safe_driver_name = "Car " + std::to_string(participant.m_raceNumber);
            } else {
                safe_driver_name = "P" + std::to_string(car.position > 0 ? car.position : i + 1);
            }
        }
        
        json += "{";
        json += "\"car_index\":" + std::to_string(i) + ",";
        json += "\"position\":" + std::to_string(car.position) + ",";
        json += "\"is_player\":" + std::to_string(i == data.header.m_playerCarIndex ? 1 : 0) + ",";  // FIXED: Identify player
        json += "\"driver_name\":\"" + safe_driver_name + "\",";
        json += "\"team_id\":" + std::to_string(participant.m_teamId) + ",";
        json += "\"team_name\":\"" + std::string(getTeamName(participant.m_teamId)) + "\",";
        json += "\"race_number\":" + std::to_string(participant.m_raceNumber) + ",";
        json += "\"current_lap_time\":" + std::to_string(car.current_lap_time) + ",";
        json += "\"last_lap_time\":" + std::to_string(car.last_lap_time) + ",";
        json += "\"sector1_time\":" + std::to_string(car.sector1_time_ms / 1000.0f) + ",";
        json += "\"sector2_time\":" + std::to_string(car.sector2_time_ms / 1000.0f) + ",";
        json += "\"sector3_time\":" + std::to_string(car.sector3_time_ms / 1000.0f) + ",";
        json += "\"current_sector\":" + std::to_string(car.current_sector) + ",";
        json += "\"pit_status\":" + std::to_string(car.pit_status) + ",";
        json += "\"tire_compound\":\"" + std::string(getTyreCompoundName(car.tyre_compound_visual)) + "\",";
        json += "\"tyre_compound_actual\":" + std::to_string(car.tyre_compound_actual) + ",";
        json += "\"tyre_compound_visual\":" + std::to_string(car.tyre_compound_visual) + ",";
        json += "\"tyre_age\":" + std::to_string(car.tyre_age_laps) + ",";
        json += "\"penalties_time\":" + std::to_string(car.penalties_time) + ",";
        json += "\"num_penalties\":" + std::to_string(car.num_penalties) + ",";

        // Add tire wear for other drivers (as percentages)
        json += "\"tyre_wear\":[" +
                std::to_string(car.tyre_wear[0]) + "," +
                std::to_string(car.tyre_wear[1]) + "," +
                std::to_string(car.tyre_wear[2]) + "," +
                std::to_string(car.tyre_wear[3]) + "],";

        // Add penalties
        json += "\"penalties_time\":" + std::to_string(car.penalties_time) + ",";
        json += "\"num_penalties\":" + std::to_string(car.num_penalties) + ",";
        json += "\"lap_invalid\":" + std::to_string(car.lap_invalid) + ",";

        json += "\"fuel_remaining_laps\":" + std::to_string(car.fuel_remaining_laps) + ",";
        json += "\"gap_to_leader\":" + std::to_string(car.gap_to_race_leader) + ",";
        json += "\"gap_to_car_ahead\":" + std::to_string(car.gap_to_car_ahead) + ",";
        json += "\"world_position_x\":" + std::to_string(car.world_position_x) + ",";
        json += "\"world_position_y\":" + std::to_string(car.world_position_y) + ",";
        json += "\"lap_distance\":" + std::to_string(car.lap_distance) + ",";
        json += "\"fuel_margin_laps\":" + std::to_string(car.fuel_margin_laps) + ",";
        json += "\"fuel_strategy_status\":" + std::to_string(car.fuel_strategy_status) + ",";
        json += "\"tyre_strategy_status\":" + std::to_string(car.tyre_strategy_status) + ",";
        json += "\"pit_strategy_status\":" + std::to_string(car.pit_strategy_status) + ",";
        json += "\"ers_store_percent\":" + std::to_string(car.ers_store_percent) + ",";
        json += "\"ers_strategy_mode\":" + std::to_string(car.ers_strategy_mode) + ",";
        json += "\"best_lap_time\":" + std::to_string(car.best_lap_time) + ",";
        json += "\"has_fastest_lap\":" + std::to_string(car.has_fastest_lap);  // FIXED: Use the flag we set
        json += "}";
    }
    
    json += "]}";
    return json;
}

std::string DataProcessor::getParticipantName(uint8_t vehicleIdx) {
    if (vehicleIdx >= 22 || !has_participants_data) {
        if (vehicleIdx < 22) {
            const ProcessedTelemetry& car = current_multi_car_data.cars[vehicleIdx];
            if (car.position > 0) {
                return "P" + std::to_string(car.position);
            }
        }
        return "Unknown Driver";
    }
    
    std::string name(current_multi_car_data.participants[vehicleIdx].m_name);
    if (!name.empty()) {
        return name;
    }

    const ProcessedTelemetry& car = current_multi_car_data.cars[vehicleIdx];
    if (car.position > 0) {
        return "P" + std::to_string(car.position);
    }

    return "Unknown Driver";
}

DataProcessor::FlagChange DataProcessor::checkForFlagChanges() {
    FlagChange change = {false, "", ""};
    
    if (!has_session_data) {
        return change;
    }
    
    // Check for safety car changes
    if (current_combined_data.safety_car_status != last_safety_car_status) {
        change.hasChange = true;
        
        switch (current_combined_data.safety_car_status) {
            case 0:
                change.eventType = "SCEND";
                change.message = "Safety car period ended";
                break;
            case 1:
                change.eventType = "SCFULL";
                change.message = "Full safety car deployed";
                break;
            case 2:
                change.eventType = "SCVIR"; 
                change.message = "Virtual safety car deployed";
                break;
            case 3:
                change.eventType = "SCFORM";
                change.message = "Formation lap safety car";
                break;
        }
        
        last_safety_car_status = current_combined_data.safety_car_status;
        return change;
    }
    
    // Check for yellow flags in marshal zones
    bool current_yellow_flags = false;
    for (int i = 0; i < current_combined_data.marshal_zones_count && i < 21; i++) {
        if (current_combined_data.marshal_zone_flags[i] == 3) { // 3 = yellow flag
            current_yellow_flags = true;
            break;
        }
    }
    
    if (current_yellow_flags != last_yellow_flag_state) {
        change.hasChange = true;
        if (current_yellow_flags) {
            change.eventType = "YFLAG";
            change.message = "Yellow flags deployed";
        } else {
            change.eventType = "YFEND";
            change.message = "Yellow flags cleared";
        }
        last_yellow_flag_state = current_yellow_flags;
        return change;
    }
    
    return change;
}

DataProcessor::RetirementChange DataProcessor::checkForPlayerRetirement() {
    RetirementChange change;
    change.hasRetirement = false;
    change.driverName = "";
    change.message = "";
    
    // Only check if we have lap data (which contains result status)
    if (!has_lap_data || player_retirement_detected) {
        return change;
    }
    
    // Get current player result status from lap data
    uint8_t current_status = current_combined_data.result_status;
    
    // Check if player has retired (status 7) or DNF (status 4) or DSQ (status 5)
    if ((current_status == 4 || current_status == 5 || current_status == 7) && 
        current_status != last_player_result_status && last_player_result_status <= 2) {
        
        change.hasRetirement = true;
        
        if (has_participants_data) {
            // Use player car index 0 as fallback - should get from packet header in real implementation
            change.driverName = getParticipantName(0);
        } else {
            change.driverName = "Player";
        }
        
        // Set appropriate message based on result status
        if (current_status == 4) {
            change.message = change.driverName + " did not finish";
        } else if (current_status == 5) {
            change.message = change.driverName + " disqualified";
        } else if (current_status == 7) {
            change.message = change.driverName + " retired";
        }
        
        player_retirement_detected = true;
    }
    
    last_player_result_status = current_status;
    return change;
}

// Session reset detection
bool DataProcessor::checkForSessionReset(uint64_t sessionUID) {
    // First time initialization
    if (!session_uid_initialized) {
        current_session_uid = sessionUID;
        session_uid_initialized = true;
        return false; // No reset on first initialization
    }

    // Check if session UID has changed
    if (sessionUID != current_session_uid) {
        std::cout << "🔄 Session reset detected!" << std::endl;
        std::cout << "   Previous UID: " << current_session_uid << std::endl;
        std::cout << "   New UID: " << sessionUID << std::endl;

        current_session_uid = sessionUID;
        resetSessionData();
        return true;
    }

    return false;
}

// Reset all session-dependent data
void DataProcessor::resetSessionData() {
    std::cout << "🧹 Resetting all session data..." << std::endl;

    // Reset session best times
    session_best_lap_time = 0.0f;

    // Reset personal bests
    personal_best_sector1 = 999.0f;
    personal_best_sector2 = 999.0f;
    personal_best_sector3 = 999.0f;

    // Reset sector timing state
    sector1_completed = false;
    sector2_completed = false;
    sector3_completed = false;
    last_lap_number = 0;
    saved_sector3_time_ms = 0;

    // Reset multi-car data BUT preserve participant names (they persist across red flag restarts)
    // Save participants before reset
    ParticipantData saved_participants[22];
    uint8_t saved_num_cars = current_multi_car_data.num_active_cars;
    bool had_participants = has_participants_data;
    if (had_participants) {
        memcpy(saved_participants, current_multi_car_data.participants, sizeof(saved_participants));
    }

    // Reset multi-car data
    memset(&current_multi_car_data, 0, sizeof(current_multi_car_data));

    // Restore participant data if we had it
    if (had_participants) {
        memcpy(current_multi_car_data.participants, saved_participants, sizeof(saved_participants));
        current_multi_car_data.num_active_cars = saved_num_cars;
        std::cout << "📋 Preserved " << (int)saved_num_cars << " participant names across session reset" << std::endl;
    }

    has_multi_car_lap_data = false;
    has_multi_car_telemetry_data = false;
    has_multi_car_status_data = false;
    // Keep has_participants_data if we had it - participants don't change during red flag
    // has_participants_data stays as-is

    // Reset current combined data
    memset(&current_combined_data, 0, sizeof(current_combined_data));
    has_previous_data = false;
    has_telemetry_data = false;
    has_lap_data = false;
    has_status_data = false;
    has_motion_data = false;
    has_session_data = false;
    game_identified = false;

    // Reset strategic tracking caches
    memset(&fuel_history, 0, sizeof(fuel_history));
    memset(&sector_history, 0, sizeof(sector_history));
    last_lap_fuel = 0.0f;
    fuel_tracking_active = false;
    fuel_tracking_reference_lap = 0;
    current_tire_stint_age = 0;
    personal_best_combined_sectors = 999.0f;
    pending_sector1_time = 0.0f;
    pending_sector2_time = 0.0f;
    pit_stops_completed_internal = 0;
    pit_stop_active = false;
    pit_entry_lap = 0;
    last_pit_stop_lap_internal = 0.0f;

    // Reset flag monitoring
    last_safety_car_status = 0;
    last_red_flag_periods = 0;
    has_yellow_flags = false;
    last_yellow_flag_state = false;

    // Reset player retirement tracking
    last_player_result_status = 0;
    player_retirement_detected = false;

    // Reset restart detection tracking
    last_session_time = 0.0f;
    last_frame_identifier = 0;
    last_player_lap_number = 0;
    restart_detection_initialized = false;

    std::cout << "✅ Session data reset complete!" << std::endl;
}

// Race restart detection (for same session restarts)
bool DataProcessor::checkForRaceRestart(float sessionTime, uint32_t frameIdentifier, uint8_t playerLapNumber) {
    // First time initialization
    if (!restart_detection_initialized) {
        last_session_time = sessionTime;
        last_frame_identifier = frameIdentifier;
        last_player_lap_number = playerLapNumber;
        restart_detection_initialized = true;
        return false; // No restart on first initialization
    }

    bool restartDetected = false;
    std::string restartReason = "";

    // Check for session time going backwards significantly (more than 30 seconds)
    if (sessionTime < (last_session_time - 30.0f) && last_session_time > 60.0f) {
        restartDetected = true;
        restartReason = "Session time went backwards";
    }

    // Check for lap number reset (went from lap 2+ back to lap 1)
    else if (playerLapNumber == 1 && last_player_lap_number >= 2) {
        restartDetected = true;
        restartReason = "Lap number reset to 1";
    }

    // Check for frame identifier reset (went from high number to low number)
    else if (frameIdentifier < 1000 && last_frame_identifier > 10000) {
        restartDetected = true;
        restartReason = "Frame identifier reset";
    }

    if (restartDetected) {
        std::cout << "🔄 Race restart detected!" << std::endl;
        std::cout << "   Reason: " << restartReason << std::endl;
        std::cout << "   Session time: " << last_session_time << "s → " << sessionTime << "s" << std::endl;
        std::cout << "   Player lap: " << (int)last_player_lap_number << " → " << (int)playerLapNumber << std::endl;
        std::cout << "   Frame ID: " << last_frame_identifier << " → " << frameIdentifier << std::endl;

        resetSessionData();

        // Update tracking values after reset
        last_session_time = sessionTime;
        last_frame_identifier = frameIdentifier;
        last_player_lap_number = playerLapNumber;

        return true;
    }

    // Update tracking values for next check
    last_session_time = sessionTime;
    last_frame_identifier = frameIdentifier;
    last_player_lap_number = playerLapNumber;

    return false;
}

// ============================================================================
// === ATLAS AI: STRATEGIC CALCULATION IMPLEMENTATION ===
// ============================================================================

void DataProcessor::updateStrategyInsights() {
    updateFuelTracking();
    updateTireDegradation();
    updateOpponentContext();
    updateErsStrategy();
    calculatePitStrategy();
    logStrategySnapshotIfNeeded();
}

void DataProcessor::updateFuelTracking() {
    const uint8_t current_lap = current_combined_data.current_lap_num;
    const float current_fuel = current_combined_data.fuel_in_tank;
    constexpr uint8_t kFuelHistoryCapacity = static_cast<uint8_t>(
        sizeof(fuel_history.fuel_values) / sizeof(fuel_history.fuel_values[0])
    );

    if (current_lap == 0 || !std::isfinite(current_fuel) || current_fuel <= 0.0f) {
        current_combined_data.fuel_calc_ready = (fuel_history.count >= 2) ? 1 : 0;
        return;
    }

    // Detect session reset or lap counter wrap
    if (fuel_tracking_reference_lap == 0 || current_lap < fuel_tracking_reference_lap) {
        fuel_tracking_reference_lap = current_lap;
        last_lap_fuel = current_fuel;
        fuel_tracking_active = true;
    }

    // Process completed laps
    if (fuel_tracking_active && current_lap != fuel_tracking_reference_lap) {
        const float fuel_used = last_lap_fuel - current_fuel;

        if (fuel_used > 0.01f && fuel_used < 5.0f) {
            fuel_history.fuel_values[fuel_history.write_index] = fuel_used;
            fuel_history.write_index = static_cast<uint8_t>((fuel_history.write_index + 1) % kFuelHistoryCapacity);
            if (fuel_history.count < kFuelHistoryCapacity) {
                fuel_history.count++;
            }
            current_combined_data.fuel_last_lap = fuel_used;
        }

        last_lap_fuel = current_fuel;
        fuel_tracking_reference_lap = current_lap;
    } else if (!fuel_tracking_active) {
        last_lap_fuel = current_fuel;
        fuel_tracking_active = true;
    }

    float average_burn = calculateAverageFuelPerLap();

    if (average_burn <= 0.0f && current_combined_data.fuel_last_lap > 0.01f) {
        average_burn = current_combined_data.fuel_last_lap;
    }

    if (average_burn <= 0.0f && current_combined_data.fuel_remaining_laps > 0.0f) {
        float inferred_burn = current_fuel / current_combined_data.fuel_remaining_laps;
        if (std::isfinite(inferred_burn) && inferred_burn > 0.01f) {
            average_burn = inferred_burn;
        }
    }

    current_combined_data.fuel_per_lap_average = std::max(0.0f, average_burn);

    if (current_combined_data.fuel_per_lap_average > 0.05f) {
        current_combined_data.fuel_laps_remaining_calculated = current_fuel / current_combined_data.fuel_per_lap_average;
    } else if (current_combined_data.fuel_remaining_laps > 0.0f) {
        current_combined_data.fuel_laps_remaining_calculated = current_combined_data.fuel_remaining_laps;
    } else {
        current_combined_data.fuel_laps_remaining_calculated = 0.0f;
    }

    current_combined_data.fuel_calc_ready = (fuel_history.count >= 2) ? 1 : 0;

    float computed_fuel_laps = current_combined_data.fuel_laps_remaining_calculated;
    if (computed_fuel_laps <= 0.0f && current_combined_data.fuel_remaining_laps > 0.0f) {
        computed_fuel_laps = current_combined_data.fuel_remaining_laps;
    }

    int laps_remaining = 0;
    if (current_combined_data.total_laps > 0 && current_combined_data.current_lap_num > 0) {
        laps_remaining = static_cast<int>(current_combined_data.total_laps) -
                         static_cast<int>(current_combined_data.current_lap_num);
        if (laps_remaining < 0) {
            laps_remaining = 0;
        }
    }

    const float fuel_margin = computed_fuel_laps - static_cast<float>(laps_remaining);
    current_combined_data.fuel_margin_laps = fuel_margin;
    current_combined_data.fuel_deficit_laps = (fuel_margin < 0.0f) ? std::abs(fuel_margin) : 0.0f;

    if (laps_remaining > 0 && fuel_margin < 0.0f) {
        current_combined_data.fuel_target_save_per_lap =
            std::abs(fuel_margin) / static_cast<float>(laps_remaining);
    } else {
        current_combined_data.fuel_target_save_per_lap = 0.0f;
    }

    const bool has_meaningful_history = fuel_history.count >= 2;
    const bool in_pit_lane = current_combined_data.pit_status == 2;
    if (in_pit_lane) {
        fuel_tracking_active = false;
    }

    if (!has_meaningful_history || laps_remaining == 0) {
        current_combined_data.fuel_strategy_status = 0;
        return;
    }

    const float caution_margin = std::max(0.25f, 0.015f * static_cast<float>(laps_remaining));
    const float critical_deficit = std::max(0.20f, 0.010f * static_cast<float>(laps_remaining));

    if (fuel_margin <= -critical_deficit) {
        current_combined_data.fuel_strategy_status = 2; // critical
    } else if (fuel_margin < caution_margin) {
        current_combined_data.fuel_strategy_status = 1; // monitor
    } else {
        current_combined_data.fuel_strategy_status = 0; // optimal
    }
}

float DataProcessor::calculateAverageFuelPerLap() {
    if (fuel_history.count == 0) return 0.0f;

    float sum = 0.0f;
    for (uint8_t i = 0; i < fuel_history.count; i++) {
        sum += fuel_history.fuel_values[i];
    }

    return sum / fuel_history.count;
}

void DataProcessor::updateTireDegradation() {
    const uint8_t tire_age = current_combined_data.tyre_age_laps;
    current_tire_stint_age = tire_age;

    if (sector1_completed && current_combined_data.sector1_time_ms > 0) {
        pending_sector1_time = current_combined_data.sector1_time_ms / 1000.0f;
        personal_best_sector1 = std::min(personal_best_sector1, pending_sector1_time);
    }

    if (sector2_completed && current_combined_data.sector2_time_ms > 0) {
        pending_sector2_time = current_combined_data.sector2_time_ms / 1000.0f;
        personal_best_sector2 = std::min(personal_best_sector2, pending_sector2_time);
    }

    const bool lap_completed = sector3_completed &&
                               saved_sector3_time_ms > 0 &&
                               pending_sector1_time > 0.0f &&
                               pending_sector2_time > 0.0f;

    if (lap_completed) {
        const float s3_time = saved_sector3_time_ms / 1000.0f;
        personal_best_sector3 = std::min(personal_best_sector3, s3_time);

        constexpr uint8_t kMaxHistory = static_cast<uint8_t>(
            sizeof(sector_history.sector1_times) / sizeof(sector_history.sector1_times[0])
        );

        const uint8_t write_index = sector_history.write_index;
        sector_history.sector1_times[write_index] = pending_sector1_time;
        sector_history.sector2_times[write_index] = pending_sector2_time;
        sector_history.sector3_times[write_index] = s3_time;

        sector_history.write_index = (write_index + 1) % kMaxHistory;
        if (sector_history.count < kMaxHistory) {
            sector_history.count++;
        }

        pending_sector1_time = 0.0f;
        pending_sector2_time = 0.0f;
    }

    if (personal_best_sector1 < 999.0f &&
        personal_best_sector2 < 999.0f &&
        personal_best_sector3 < 999.0f) {
        personal_best_combined_sectors =
            personal_best_sector1 + personal_best_sector2 + personal_best_sector3;
    }

    if (sector_history.count >= 3) {
        current_combined_data.tyre_degradation_rate = calculateTireDegradationRate();
        current_combined_data.tyre_life_remaining_laps = predictTireLifeRemaining();
    } else {
        current_combined_data.tyre_degradation_rate = 0.0f;
        current_combined_data.tyre_life_remaining_laps = 999.0f;
    }

    const float expected_stint_length =
        current_combined_data.tyre_life_remaining_laps + static_cast<float>(current_tire_stint_age);

    if (expected_stint_length > 0.5f) {
        current_combined_data.tyre_stint_progress = std::clamp(
            static_cast<float>(current_tire_stint_age) / expected_stint_length,
            0.0f,
            1.0f
        );
    } else {
        current_combined_data.tyre_stint_progress = 0.0f;
    }

    const float max_acceptable_deg = 2.0f;
    float performance = 100.0f;
    if (current_combined_data.tyre_degradation_rate > 0.0f) {
        performance -= (current_combined_data.tyre_degradation_rate / max_acceptable_deg) * 100.0f;
    }
    current_combined_data.tyre_performance_index = std::clamp(performance, 0.0f, 100.0f);

    current_combined_data.tyre_critical_warning =
        (current_combined_data.tyre_life_remaining_laps < 3.0f) ? 1 : 0;

    if (current_combined_data.tyre_life_remaining_laps <= 2.0f) {
        current_combined_data.tyre_strategy_status = 2;
    } else if (current_combined_data.tyre_life_remaining_laps <= 5.0f ||
               current_combined_data.tyre_degradation_rate >= 1.0f) {
        current_combined_data.tyre_strategy_status = 1;
    } else {
        current_combined_data.tyre_strategy_status = 0;
    }

    if (current_combined_data.pit_status == 2) {
        std::memset(&sector_history, 0, sizeof(sector_history));
        current_tire_stint_age = 0;
        personal_best_sector1 = 999.0f;
        personal_best_sector2 = 999.0f;
        personal_best_sector3 = 999.0f;
        personal_best_combined_sectors = 999.0f;
        pending_sector1_time = 0.0f;
        pending_sector2_time = 0.0f;
        current_combined_data.tyre_degradation_rate = 0.0f;
        current_combined_data.tyre_life_remaining_laps = 999.0f;
        current_combined_data.tyre_stint_progress = 0.0f;
        current_combined_data.tyre_performance_index = 100.0f;
        current_combined_data.tyre_strategy_status = 0;
        current_combined_data.tyre_critical_warning = 0;
        last_strategy_log_lap = 0;
        strategy_log_initialized = false;
    }
}

float DataProcessor::calculateTireDegradationRate() {
    const uint8_t sample_count = sector_history.count;
    if (sample_count < 3) {
        return 0.0f;
    }

    constexpr uint8_t kMaxHistory = static_cast<uint8_t>(
        sizeof(sector_history.sector1_times) / sizeof(sector_history.sector1_times[0])
    );

    std::vector<float> lap_totals(sample_count);
    for (uint8_t i = 0; i < sample_count; ++i) {
        const uint8_t index = (sector_history.write_index + kMaxHistory - sample_count + i) % kMaxHistory;
        lap_totals[i] = sector_history.sector1_times[index] +
                        sector_history.sector2_times[index] +
                        sector_history.sector3_times[index];
    }

    const int recent_window = std::min<int>(3, sample_count);
    float recent_sum = 0.0f;
    for (int i = sample_count - recent_window; i < sample_count; ++i) {
        recent_sum += lap_totals[i];
    }
    const float recent_avg = recent_sum / static_cast<float>(recent_window);

    std::vector<float> sorted_totals = lap_totals;
    const int best_window = std::min<int>(3, sample_count);
    std::nth_element(sorted_totals.begin(),
                     sorted_totals.begin() + best_window,
                     sorted_totals.end());

    float best_sum = 0.0f;
    for (int i = 0; i < best_window; ++i) {
        best_sum += sorted_totals[i];
    }
    const float best_avg = best_sum / static_cast<float>(best_window);

    const float degradation = recent_avg - best_avg;
    return degradation > 0.0f ? degradation : 0.0f;
}

float DataProcessor::predictTireLifeRemaining() {
    constexpr float CRITICAL_THRESHOLD = 2.0f;

    if (sector_history.count < 3 || current_tire_stint_age == 0) {
        return 999.0f;
    }

    const float deg_rate = current_combined_data.tyre_degradation_rate;
    if (deg_rate <= 0.05f) {
        return 999.0f;
    }

    const int history_span = std::max<int>(1, static_cast<int>(sector_history.count) - std::min<int>(3, sector_history.count));
    const float per_lap_increase = deg_rate / static_cast<float>(history_span);

    if (per_lap_increase <= 0.001f) {
        return 999.0f;
    }

    const float laps_until_critical = (CRITICAL_THRESHOLD - deg_rate) / per_lap_increase;
    return std::max(0.0f, laps_until_critical);
}

void DataProcessor::updateErsStrategy() {
    const float ERS_MAX_STORE_MJ = 4.0f;
    float store_energy = std::max(current_combined_data.ers_store_energy, 0.0f);
    float store_percent = 0.0f;

    if (ERS_MAX_STORE_MJ > 0.0f) {
        store_percent = std::clamp(store_energy / ERS_MAX_STORE_MJ, 0.0f, 1.0f) * 100.0f;
    }

    current_combined_data.ers_store_percent = store_percent;

    const float ATTACK_GAP_THRESHOLD = 1.4f;
    const float DEFEND_GAP_THRESHOLD = 1.0f;
    const float HARVEST_GAP_THRESHOLD = 2.8f;

    current_combined_data.ers_attack_gap = ATTACK_GAP_THRESHOLD;
    current_combined_data.ers_defend_gap = DEFEND_GAP_THRESHOLD;
    current_combined_data.ers_harvest_gap = HARVEST_GAP_THRESHOLD;

    float gap_ahead = current_combined_data.gap_to_car_ahead;
    if (gap_ahead <= 0.0f) {
        gap_ahead = 10.0f; // Treat empty data as a large gap
    }

    float gap_behind = 99.0f;
    if (current_combined_data.num_opponents_behind > 0 &&
        current_combined_data.opponent_behind_1.gap_seconds > 0.0f) {
        gap_behind = current_combined_data.opponent_behind_1.gap_seconds;
    }

    bool drs_available = (current_combined_data.drs_open != 0) || (current_combined_data.drs_allowed != 0);
    bool attack_window = gap_ahead > 0.0f &&
                         gap_ahead <= (drs_available ? ATTACK_GAP_THRESHOLD * 1.25f : ATTACK_GAP_THRESHOLD);
    bool defend_pressure = gap_behind > 0.0f && gap_behind <= DEFEND_GAP_THRESHOLD;

    uint8_t mode = 0; // Balanced default

    if (defend_pressure && store_percent >= 20.0f) {
        mode = 3; // Defend
    } else if (store_percent >= 55.0f && attack_window) {
        mode = 2; // Attack
    } else {
        bool safe_window = (gap_ahead >= HARVEST_GAP_THRESHOLD || gap_ahead <= 0.0f) &&
                           (gap_behind >= HARVEST_GAP_THRESHOLD || gap_behind <= 0.0f);

        if (store_percent <= 20.0f) {
            mode = 1; // Recharge
        } else if (store_percent >= 85.0f && safe_window) {
            mode = 1; // Top up before hitting the cap
        } else if (store_percent <= 35.0f && safe_window) {
            mode = 1; // Pre-emptive harvest when comfortable
        }
    }

    current_combined_data.ers_strategy_mode = mode;
}

void DataProcessor::calculatePitStrategy() {
    resetPitRejoinForecast();

    int8_t track_id = current_combined_data.track_id;
    uint8_t current_lap = current_combined_data.current_lap_num;
    uint8_t total_laps = current_combined_data.total_laps;
    float current_fuel = current_combined_data.fuel_in_tank;
    uint8_t tire_age = current_combined_data.tyre_age_laps;
    float max_tyre_wear = 0.0f;
    for (float wear_value : current_combined_data.tyre_wear) {
        if (wear_value > max_tyre_wear) {
            max_tyre_wear = wear_value;
        }
    }

    // Max wing damage
    float wing_damage = std::max(
        current_combined_data.front_left_wing_damage,
        current_combined_data.front_right_wing_damage
    );

    float current_pace = (current_combined_data.last_lap_time > 0.0f)
        ? current_combined_data.last_lap_time
        : current_combined_data.current_lap_time;
    float optimal_pace = current_combined_data.best_lap_time;

    const float previous_recommended_lap = current_combined_data.pit_recommended_lap;

    // Calculate using pit strategy module
    PitStrategy::PitStrategyResult result = PitStrategy::calculatePitStrategy(
        track_id,
        current_lap,
        total_laps,
        current_fuel,
        tire_age,
        wing_damage,
        current_pace,
        optimal_pace,
        current_combined_data.tyre_compound_visual,
        current_combined_data.tyre_degradation_rate,
        current_combined_data.tyre_life_remaining_laps,
        current_tire_stint_age,
        current_combined_data.fuel_margin_laps,
        pit_stops_completed_internal,
        last_pit_stop_lap_internal,
        current_combined_data.safety_car_status,
        max_tyre_wear
    );

    // Store results
    current_combined_data.pit_delta_time = result.base_pit_delta;
    current_combined_data.pit_delta_with_wing = result.base_pit_delta + result.wing_change_penalty;
    current_combined_data.pit_advantage_available = result.is_advantageous ? 1 : 0;
    current_combined_data.pit_break_even_laps = result.laps_to_break_even;
    current_combined_data.pit_net_time_delta = result.net_pit_delta;
    current_combined_data.pit_time_loss_no_pit = result.tire_advantage + result.fuel_advantage;
    current_combined_data.pit_tire_time_gain = result.tire_advantage;
    current_combined_data.pit_fuel_time_gain = result.fuel_advantage;

    // Recommended lap window
    float recommended_lap = 0.0f;
    if (result.is_advantageous) {
        recommended_lap = static_cast<float>(current_lap);
    } else if (result.laps_to_break_even > 0 && result.laps_to_break_even < 999) {
        recommended_lap = static_cast<float>(current_lap + result.laps_to_break_even);
    }

    if (total_laps > 0 && recommended_lap > static_cast<float>(total_laps)) {
        recommended_lap = static_cast<float>(total_laps);
    }

    if (recommended_lap == 0.0f && current_combined_data.pit_window_open) {
        recommended_lap = static_cast<float>(current_combined_data.current_lap_num);
    }

    const float stop_loss_seconds = std::max(
        0.0f,
        result.base_pit_delta + result.wing_change_penalty
    );
    estimatePitRejoin(stop_loss_seconds);

    std::memcpy(&current_combined_data.pit_plan_primary, &result.plan_primary, sizeof(result.plan_primary));
    std::memcpy(&current_combined_data.pit_plan_alternative, &result.plan_alternative, sizeof(result.plan_alternative));
    std::memcpy(&current_combined_data.pit_plan_third, &result.plan_third, sizeof(result.plan_third));
    current_combined_data.pit_plan_count = result.plan_count;
    current_combined_data.pit_cheap_stop_available = result.cheap_pit_available;
    if (result.plan_count == 0) {
        current_combined_data.pit_plan_selected = 0;
    } else if (current_combined_data.pit_plan_selected >= result.plan_count) {
        current_combined_data.pit_plan_selected = 0;
    }

    // Determine pit strategy status
    bool tire_critical = current_combined_data.tyre_strategy_status == 2;
    bool tire_warning = current_combined_data.tyre_strategy_status == 1;
    bool fuel_critical = current_combined_data.fuel_strategy_status == 2;
    bool fuel_warning = current_combined_data.fuel_strategy_status == 1;

    const bool strategy_confident =
        (sector_history.count >= 3) || (current_combined_data.fuel_calc_ready != 0);
    const bool allow_aggressive_call = strategy_confident && current_lap > 2;

    bool box_now = tire_critical || fuel_critical;
    if (!box_now && allow_aggressive_call) {
        if (result.is_advantageous || result.net_pit_delta < -1.0f) {
            box_now = true;
        }
    }

    bool plan_stop = false;
    if (!box_now) {
        plan_stop = strategy_confident &&
                    (tire_warning || fuel_warning ||
                     (result.laps_to_break_even > 0 && result.laps_to_break_even <= 5));
    }

    uint8_t pit_status = 0;
    if (box_now) {
        pit_status = 2;
    } else if (plan_stop) {
        pit_status = 1;
    }

    if (current_combined_data.pit_window_open && pit_status > 0) {
        pit_status = std::max<uint8_t>(pit_status, 1);
    }

    current_combined_data.pit_strategy_status = pit_status;

    float published_recommended_lap = recommended_lap;
    if (published_recommended_lap <= 0.0f &&
        previous_recommended_lap > 0.0f &&
        pit_status >= 1) {
        published_recommended_lap = previous_recommended_lap;
    }
    current_combined_data.pit_recommended_lap = published_recommended_lap;
}

void DataProcessor::resetPitRejoinForecast() {
    std::memset(&current_combined_data.pit_rejoin_ahead, 0, sizeof(current_combined_data.pit_rejoin_ahead));
    std::memset(&current_combined_data.pit_rejoin_behind, 0, sizeof(current_combined_data.pit_rejoin_behind));
    current_combined_data.pit_rejoin_position = 0;
    std::memset(&current_combined_data.pit_plan_primary, 0, sizeof(current_combined_data.pit_plan_primary));
    std::memset(&current_combined_data.pit_plan_alternative, 0, sizeof(current_combined_data.pit_plan_alternative));
    std::memset(&current_combined_data.pit_plan_third, 0, sizeof(current_combined_data.pit_plan_third));
    current_combined_data.pit_plan_count = 0;
    current_combined_data.pit_plan_selected = 0;
    current_combined_data.pit_cheap_stop_available = 0;
}

void DataProcessor::estimatePitRejoin(float stop_loss_seconds) {
    if (!has_multi_car_lap_data || stop_loss_seconds <= 0.0f) {
        return;
    }

    const int car_count = current_multi_car_data.num_active_cars > 0
                              ? std::min<int>(current_multi_car_data.num_active_cars, 22)
                              : 22;
    if (car_count <= 1) {
        return;
    }

    float player_gap_to_leader = current_combined_data.gap_to_race_leader;
    if (!std::isfinite(player_gap_to_leader) || player_gap_to_leader < 0.0f) {
        player_gap_to_leader = 0.0f;
    }
    if (current_combined_data.position == 1) {
        player_gap_to_leader = 0.0f;
    }

    const float projected_gap = player_gap_to_leader + stop_loss_seconds;

    struct RejoinEntry {
        const ProcessedTelemetry* car;
        float race_time;
    };
    std::vector<RejoinEntry> entries;
    entries.reserve(car_count - 1);

    for (int idx = 0; idx < car_count; ++idx) {
        const ProcessedTelemetry& car = current_multi_car_data.cars[idx];
        if (car.position == 0 || car.position == current_combined_data.position) {
            continue;
        }

        float race_time = (car.position == 1) ? 0.0f : car.gap_to_race_leader;
        if (!std::isfinite(race_time) || race_time < 0.0f) {
            continue;
        }

        entries.push_back({&car, race_time});
    }

    if (entries.empty()) {
        return;
    }

    std::sort(entries.begin(), entries.end(),
              [](const RejoinEntry& a, const RejoinEntry& b) {
                  return a.race_time < b.race_time;
              });

    const float tolerance = 0.25f; // seconds
    int ahead_count = 0;
    const ProcessedTelemetry* ahead_car = nullptr;
    const ProcessedTelemetry* behind_car = nullptr;

    for (const auto& entry : entries) {
        if (entry.race_time <= projected_gap - tolerance) {
            ++ahead_count;
            ahead_car = entry.car;
        } else {
            behind_car = entry.car;
            break;
        }
    }

    if (!behind_car) {
        for (const auto& entry : entries) {
            if (entry.race_time >= projected_gap) {
                behind_car = entry.car;
                break;
            }
        }
    }

    current_combined_data.pit_rejoin_position = static_cast<uint8_t>(ahead_count + 1);

    auto populateForecast = [&](ProcessedTelemetry::PitRejoinForecast& slot,
                                const ProcessedTelemetry* source,
                                float gap_seconds) {
        std::memset(&slot, 0, sizeof(slot));
        if (!source) {
            return;
        }

        ptrdiff_t offset = source - &current_multi_car_data.cars[0];
        const ParticipantData* participant = nullptr;
        if (offset >= 0 && offset < 22) {
            participant = &current_multi_car_data.participants[offset];
        }

        if (participant && participant->m_name[0] != '\0') {
            std::strncpy(slot.driver_name, participant->m_name, sizeof(slot.driver_name) - 1);
            slot.driver_name[sizeof(slot.driver_name) - 1] = '\0';
        } else {
            std::snprintf(slot.driver_name, sizeof(slot.driver_name), "P%u", source->position);
        }

        slot.position = source->position;
        slot.gap_seconds = std::max(0.0f, gap_seconds);
    };

    if (ahead_car) {
        float gap = projected_gap - ((ahead_car->position == 1) ? 0.0f : ahead_car->gap_to_race_leader);
        populateForecast(current_combined_data.pit_rejoin_ahead, ahead_car, gap);
    }

    if (behind_car) {
        float reference = (behind_car->position == 1) ? 0.0f : behind_car->gap_to_race_leader;
        float gap = reference - projected_gap;
        populateForecast(current_combined_data.pit_rejoin_behind, behind_car, gap);
    }
}
void DataProcessor::logStrategySnapshotIfNeeded() {
    if (!has_lap_data || !has_status_data) {
        return;
    }

    const uint8_t lap = current_combined_data.current_lap_num;
    if (lap == 0) {
        return;
    }

    if (strategy_log_initialized && lap == last_strategy_log_lap) {
        return;
    }

    const bool fuel_ready = current_combined_data.fuel_calc_ready != 0 &&
                            current_combined_data.fuel_per_lap_average > 0.0f;
    const bool tyre_ready = sector_history.count >= 2 ||
                            current_combined_data.tyre_life_remaining_laps < 998.0f;
    const bool pit_ready = current_combined_data.pit_delta_time > 0.0f ||
                           current_combined_data.pit_recommended_lap > 0.0f;

    if (!fuel_ready && !tyre_ready && !pit_ready) {
        return;
    }

    last_strategy_log_lap = lap;
    strategy_log_initialized = true;

    std::ostringstream ss;
    ss << std::fixed << std::setprecision(2);
    ss << "[AtlasAI] L" << static_cast<int>(lap)
       << " fuel(avg=" << current_combined_data.fuel_per_lap_average
       << "L, margin=" << current_combined_data.fuel_margin_laps
       << ", status=" << static_cast<int>(current_combined_data.fuel_strategy_status) << ')';

    ss << " tyre(deg=" << current_combined_data.tyre_degradation_rate
       << ", life=" << current_combined_data.tyre_life_remaining_laps
       << ", status=" << static_cast<int>(current_combined_data.tyre_strategy_status) << ')';

    ss << " pit(net=" << current_combined_data.pit_net_time_delta
       << ", rec=" << current_combined_data.pit_recommended_lap
       << ", status=" << static_cast<int>(current_combined_data.pit_strategy_status) << ')';

    if (current_combined_data.pit_rejoin_position > 0) {
        ss << " rejoin:P" << static_cast<int>(current_combined_data.pit_rejoin_position);
        if (current_combined_data.pit_rejoin_ahead.position > 0) {
            ss << " ahead " << current_combined_data.pit_rejoin_ahead.driver_name
               << " +" << current_combined_data.pit_rejoin_ahead.gap_seconds << "s";
        }
        if (current_combined_data.pit_rejoin_behind.position > 0) {
            ss << " behind " << current_combined_data.pit_rejoin_behind.driver_name
               << " -" << current_combined_data.pit_rejoin_behind.gap_seconds << "s";
        }
    }

    ss << " ers(" << current_combined_data.ers_store_percent
       << "%, mode=" << static_cast<int>(current_combined_data.ers_strategy_mode) << ')';

    if (current_combined_data.opponent_ahead_1.position > 0) {
        ss << " ahead: " << current_combined_data.opponent_ahead_1.driver_name
           << " +" << current_combined_data.opponent_ahead_1.gap_seconds << "s";
    }

    if (current_combined_data.opponent_behind_1.position > 0) {
        ss << " behind: " << current_combined_data.opponent_behind_1.driver_name
           << " -" << current_combined_data.opponent_behind_1.gap_seconds << "s";
    }

    std::cout << ss.str() << std::endl;
}

void DataProcessor::updateOpponentContext() {
    auto resetOpponent = [](ProcessedTelemetry::NearbyOpponent& opponent) {
        std::memset(&opponent, 0, sizeof(ProcessedTelemetry::NearbyOpponent));
    };

    resetOpponent(current_combined_data.opponent_ahead_1);
    resetOpponent(current_combined_data.opponent_ahead_2);
    resetOpponent(current_combined_data.opponent_behind_1);
    resetOpponent(current_combined_data.opponent_behind_2);
    current_combined_data.num_opponents_ahead = 0;
    current_combined_data.num_opponents_behind = 0;

    if (!has_participants_data || !has_multi_car_lap_data) {
        return;
    }

    uint8_t player_position = current_combined_data.position;
    if (player_position == 0) {
        return; // No valid classification yet
    }

    int car_count = current_multi_car_data.num_active_cars > 0
                        ? std::min<int>(current_multi_car_data.num_active_cars, 22)
                        : 22;

    auto findCarByPosition = [&](uint8_t target_position) -> ProcessedTelemetry* {
        if (target_position == 0) {
            return nullptr;
        }
        for (int idx = 0; idx < car_count; ++idx) {
            if (current_multi_car_data.cars[idx].position == target_position) {
                return &current_multi_car_data.cars[idx];
            }
        }
        return nullptr;
    };

    auto getParticipantForCar = [&](const ProcessedTelemetry* car_ptr) -> const ParticipantData* {
        if (!car_ptr) {
            return nullptr;
        }
        ptrdiff_t offset = car_ptr - &current_multi_car_data.cars[0];
        if (offset < 0 || offset >= 22) {
            return nullptr;
        }
        return &current_multi_car_data.participants[offset];
    };

    auto populateOpponent = [&](ProcessedTelemetry::NearbyOpponent& slot,
                                const ProcessedTelemetry* source,
                                float gap_seconds) {
        if (!source) {
            return;
        }

        const ParticipantData* participant = getParticipantForCar(source);
        if (participant && participant->m_name[0] != '\0') {
            std::strncpy(slot.driver_name, participant->m_name, sizeof(slot.driver_name) - 1);
            slot.driver_name[sizeof(slot.driver_name) - 1] = '\0';
        } else {
            std::snprintf(slot.driver_name, sizeof(slot.driver_name), "P%u", source->position);
        }

        slot.position = source->position;
        slot.gap_seconds = std::max(gap_seconds, 0.0f);
        slot.tyre_age = source->tyre_age_laps;
        slot.last_lap_time = source->last_lap_time;
        slot.tyre_compound = source->tyre_compound_visual;
    };

    ProcessedTelemetry* ahead_1 = nullptr;
    if (player_position > 1) {
        ahead_1 = findCarByPosition(static_cast<uint8_t>(player_position - 1));
        if (ahead_1) {
            float gap = current_combined_data.gap_to_car_ahead;
            if (gap <= 0.0f) {
                gap = ahead_1->gap_to_car_ahead;
            }
            populateOpponent(current_combined_data.opponent_ahead_1, ahead_1, gap);
            current_combined_data.num_opponents_ahead = 1;
        }
    }

    if (player_position > 2) {
        ProcessedTelemetry* ahead_2 = findCarByPosition(static_cast<uint8_t>(player_position - 2));
        if (ahead_2) {
            float cumulative_gap = 0.0f;
            if (current_combined_data.num_opponents_ahead > 0 &&
                current_combined_data.opponent_ahead_1.gap_seconds > 0.0f) {
                cumulative_gap = current_combined_data.opponent_ahead_1.gap_seconds;
            } else if (current_combined_data.gap_to_car_ahead > 0.0f) {
                cumulative_gap = current_combined_data.gap_to_car_ahead;
            }

            float link_gap = ahead_1 ? ahead_1->gap_to_car_ahead : ahead_2->gap_to_car_ahead;
            if (link_gap > 0.0f) {
                cumulative_gap += link_gap;
            }

            if (cumulative_gap <= 0.0f) {
                cumulative_gap = ahead_2->gap_to_car_ahead;
            }

            populateOpponent(current_combined_data.opponent_ahead_2, ahead_2, cumulative_gap);
            current_combined_data.num_opponents_ahead = std::max<uint8_t>(current_combined_data.num_opponents_ahead, 2);
        }
    }

    ProcessedTelemetry* behind_1 = findCarByPosition(static_cast<uint8_t>(player_position + 1));
    if (behind_1) {
        float gap = behind_1->gap_to_car_ahead;
        populateOpponent(current_combined_data.opponent_behind_1, behind_1, gap);
        current_combined_data.num_opponents_behind = 1;
    }

    ProcessedTelemetry* behind_2 = findCarByPosition(static_cast<uint8_t>(player_position + 2));
    if (behind_2) {
        float gap = behind_2->gap_to_car_ahead;
        if (behind_1 && behind_1->gap_to_car_ahead > 0.0f) {
            gap += behind_1->gap_to_car_ahead;
        }
        populateOpponent(current_combined_data.opponent_behind_2, behind_2, gap);
        current_combined_data.num_opponents_behind = std::max<uint8_t>(current_combined_data.num_opponents_behind, 2);
    }
}
