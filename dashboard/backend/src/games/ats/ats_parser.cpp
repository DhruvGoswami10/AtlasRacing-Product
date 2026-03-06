#include "ats_shared_memory.h"
#include "../../../include/telemetry/data_processor.h"
#include <iostream>
#include <thread>
#include <chrono>
#include <cstring>
#include <cstdio>
#include <algorithm>
#include <cmath>
#include <array>

#ifdef _WIN32

class ATS_Parser {
private:
    ATS::SharedMemoryReader shared_memory;
    bool initialized;
    int consecutive_failures;
    std::chrono::steady_clock::time_point last_data_time;

    float previous_speed = 0.0f;
    uint16_t previous_rpm = 0;

    // Fuel tracking
    float last_fuel_sample = -1.0f;
    std::chrono::steady_clock::time_point last_fuel_time;
    std::array<float, 30> fuel_rate_samples = {0.0f};
    size_t fuel_rate_index = 0;
    size_t fuel_rate_count = 0;
    float fuel_rate_sum = 0.0f;
    bool fuel_tracking_initialized = false;

public:
    ATS_Parser()
        : initialized(false)
        , consecutive_failures(0)
        , previous_speed(0.0f)
        , previous_rpm(0)
        , last_fuel_sample(-1.0f)
        , fuel_rate_index(0)
        , fuel_rate_count(0)
        , fuel_rate_sum(0.0f)
        , fuel_tracking_initialized(false) {}

    bool isGameRunning() {
        return shared_memory.isGameRunning();
    }

    bool initialize() {
        std::cout << "[ATS] Initializing ATS parser..." << std::endl;

        if (!isGameRunning()) {
            std::cout << "[ATS] amtrucks.exe not detected. Please start American Truck Simulator." << std::endl;
            std::cout << "[ATS] Note: The SCS Telemetry SDK plugin must be installed." << std::endl;
            return false;
        }

        for (int attempts = 0; attempts < 10; attempts++) {
            if (shared_memory.initialize()) {
                initialized = true;
                consecutive_failures = 0;
                std::cout << "[ATS] Connected to shared memory." << std::endl;

                auto telemetry = shared_memory.getTelemetry();
                if (telemetry) {
                    std::cout << "[ATS] Truck: " << telemetry->truckBrand
                              << " " << telemetry->truckModel << std::endl;
                }

                return true;
            }

            std::cout << "[ATS] Shared memory not ready, attempt " << (attempts + 1) << "/10..." << std::endl;
            std::this_thread::sleep_for(std::chrono::milliseconds(500));
        }

        std::cout << "[ATS] Failed to connect to shared memory after 10 attempts." << std::endl;
        return false;
    }

    bool isConnected() {
        return initialized && shared_memory.isConnected();
    }

    bool hasValidData() {
        if (!isConnected()) {
            consecutive_failures++;
            if (consecutive_failures > 100) {
                std::cout << "[ATS] Lost connection, attempting reconnect..." << std::endl;
                initialized = false;
                consecutive_failures = 0;
            }
            return false;
        }

        if (!shared_memory.isDataValid()) {
            return false;
        }

        consecutive_failures = 0;
        return true;
    }

    DataProcessor::ProcessedTelemetry readTelemetry() {
        DataProcessor::ProcessedTelemetry data = {};

        if (!hasValidData()) {
            return data;
        }

        auto t = shared_memory.getTelemetry();
        if (!t) {
            return data;
        }

        // --- Core telemetry ---
        float speed_ms = t->speed;
        if (speed_ms < 0.0f) speed_ms = -speed_ms; // ATS uses negative for reverse
        data.speed_kph = speed_ms * 3.6f;
        data.rpm = static_cast<uint16_t>(std::max(0.0f, t->engineRpm));

        // ATS gear: -1=reverse, 0=neutral, 1+=forward (same as our convention)
        data.gear = static_cast<int8_t>(std::clamp(t->gear, -1, 127));

        data.throttle_percent = t->throttle * 100.0f;
        data.brake_percent = t->brake * 100.0f;

        data.speed_delta = data.speed_kph - previous_speed;
        data.rpm_delta = static_cast<float>(data.rpm) - static_cast<float>(previous_rpm);
        previous_speed = data.speed_kph;
        previous_rpm = data.rpm;

        // --- Max RPM ---
        data.max_rpm = static_cast<uint16_t>(std::max(0.0f, t->engineRpmMax));

        // --- Timing (trucks don't have lap times, but we fill what we can) ---
        data.current_lap_time = 0.0f;
        data.last_lap_time = 0.0f;
        data.best_lap_time = 0.0f;
        data.current_lap_num = 0;
        data.position = 0;
        data.current_sector = 0;
        data.sector1_time_ms = 0;
        data.sector2_time_ms = 0;
        data.sector3_time_ms = 0;
        data.delta_time = 0.0f;
        data.delta_time_session = 0.0f;
        data.delta_time_last = 0.0f;
        data.estimated_lap_time = 0.0f;

        // --- Fuel ---
        data.fuel_in_tank = t->fuel;
        data.maxFuel = t->fuelCapacity;
        data.fuel_remaining_laps = 0.0f;

        // Fuel consumption tracking (rate-based for trucks since there are no laps)
        auto now = std::chrono::steady_clock::now();
        if (!fuel_tracking_initialized) {
            last_fuel_sample = t->fuel;
            last_fuel_time = now;
            fuel_tracking_initialized = true;
        } else {
            double dt = std::chrono::duration<double>(now - last_fuel_time).count();
            float fuel_drop = last_fuel_sample - t->fuel;

            if (fuel_drop < -1.0f) {
                // Refuel detected, reset tracking
                fuel_rate_index = 0;
                fuel_rate_count = 0;
                fuel_rate_sum = 0.0f;
                fuel_rate_samples.fill(0.0f);
            } else if (dt > 1.0) {
                float new_sample = 0.0f;
                if (fuel_drop > 0.001f) {
                    new_sample = fuel_drop / static_cast<float>(dt); // L/s
                }
                fuel_rate_sum -= fuel_rate_samples[fuel_rate_index];
                fuel_rate_samples[fuel_rate_index] = new_sample;
                fuel_rate_sum += new_sample;
                fuel_rate_index = (fuel_rate_index + 1) % fuel_rate_samples.size();
                if (fuel_rate_count < fuel_rate_samples.size()) {
                    fuel_rate_count++;
                }
                last_fuel_sample = t->fuel;
                last_fuel_time = now;
            }
        }

        float avg_fuel_rate = (fuel_rate_count > 0)
            ? fuel_rate_sum / static_cast<float>(fuel_rate_count)
            : 0.0f;
        data.aid_fuel_rate = avg_fuel_rate;

        // Estimate remaining time from fuel
        if (avg_fuel_rate > 0.0001f) {
            float seconds_remaining = t->fuel / avg_fuel_rate;
            data.fuel_remaining_laps = seconds_remaining / 60.0f; // Store as "minutes remaining" for trucks
        }
        data.fuel_per_lap_average = (t->fuelAvgConsumption > 0.0f) ? t->fuelAvgConsumption : 0.0f;
        data.fuel_last_lap = 0.0f;
        data.fuel_calc_ready = (fuel_rate_count >= 5) ? 1 : 0;
        data.fuel_margin_laps = 0.0f;
        data.fuel_deficit_laps = 0.0f;
        data.fuel_target_save_per_lap = 0.0f;
        data.fuel_strategy_status = (t->fuel < t->fuelCapacity * 0.1f) ? 2 :
                                    (t->fuel < t->fuelCapacity * 0.25f) ? 1 : 0;
        data.fuel_mix = 1;

        // --- Truck damage mapped to car_damage array ---
        data.car_damage[0] = t->wearEngine;
        data.car_damage[1] = t->wearTransmission;
        data.car_damage[2] = t->wearCabin;
        data.car_damage[3] = t->wearChassis;
        data.car_damage[4] = t->wearWheels;

        // --- Temperature and environment ---
        data.track_temperature = 0;
        data.air_temperature = 0;
        data.weather = 0;

        // --- Truck-specific data mapped to available fields ---
        data.turbo_boost = 0.0f;
        data.clutch_position = t->clutch;
        data.steering_angle = t->steering;

        // Brake data
        data.brake_bias = 0.5f; // Trucks have even brake distribution
        for (int i = 0; i < 4; i++) {
            data.brake_temperature[i] = static_cast<uint16_t>(std::max(0.0f, t->brakeTemperature));
            data.surface_type[i] = 0;
            data.tyre_surface_temp[i] = 0;
            data.tyre_inner_temp[i] = 0;
            data.tyre_pressure[i] = 0.0f;
            data.tyre_wear[i] = 0.0f;
        }
        data.tyre_compound_actual = 0;
        data.tyre_compound_visual = 0;
        data.tyre_age_laps = 0;

        // --- World position ---
        data.world_position_x = static_cast<float>(t->worldX);
        data.world_position_y = static_cast<float>(t->worldZ); // Z is horizontal in SCS coordinate system
        data.lap_distance = t->navigationDistanceRemaining;
        data.heading_angle = t->heading;
        data.pitch_angle = t->pitch;
        data.roll_angle = t->roll;

        // Speed limit mapped to a visible field
        float speed_limit_kph = t->speedLimit * 3.6f;
        data.track_spline_length = speed_limit_kph; // Repurpose for truck speed limit display

        // --- Pit/Status (trucks don't have pits, but we set safe defaults) ---
        data.pit_status = 0;
        data.is_in_pit = 0;
        data.is_in_pitlane = 0;
        data.mandatory_pit_done = 0;
        data.result_status = 0;
        data.safety_car_status = 0;
        data.total_laps = 0;
        data.track_id = -1;
        data.session_type = 0;
        data.session_time_left = 0;

        // --- No DRS/ERS in trucks ---
        data.drs_allowed = 0;
        data.drs_open = 0;
        data.drs_activation_distance = 0;
        data.ers_deploy_mode = 0;
        data.ers_store_energy = 0.0f;
        data.ers_deployed_this_lap = 0.0f;
        data.ers_harvested_this_lap_mguk = 0.0f;
        data.ers_harvested_this_lap_mguh = 0.0f;

        // --- Controls ---
        data.pit_limiter_enabled = 0;
        data.auto_shifter_enabled = 0;
        data.is_ai_controlled = 0;
        data.ideal_line_enabled = 0;

        // Retarder level -> engine brake setting
        data.engine_brake_setting = static_cast<uint8_t>(std::max(0, t->retarderLevel));
        data.traction_control_setting = 0;
        data.traction_control_setting_secondary = std::numeric_limits<uint8_t>::max();
        data.abs_setting = 0;
        data.fuel_map_setting = 0;
        data.fuel_map_max = 0;

        // --- Flags/penalties (none in trucks) ---
        data.penalties_enabled = 0;
        data.penalty_time = 0.0f;
        data.numberOfTyresOut = 0;
        data.flag_type = 0;
        data.lap_invalidated = 0;

        // --- Marshal zones ---
        data.marshal_zones_count = 0;
        for (float& f : data.marshal_zone_flags) f = 0.0f;

        // --- Navigation as gap display (repurpose for truck context) ---
        data.gap_to_car_ahead = t->navigationDistanceRemaining / 1000.0f; // km remaining
        data.gap_to_race_leader = t->navigationTimeRemaining / 60.0f;     // minutes remaining

        // --- Strategy fields (minimal for trucks) ---
        data.fuel_laps_remaining_calculated = data.fuel_remaining_laps;
        data.tyre_degradation_rate = 0.0f;
        data.tyre_life_remaining_laps = 0.0f;
        data.tyre_performance_index = 100.0f;
        data.tyre_stint_progress = 0.0f;
        data.tyre_critical_warning = 0;
        data.tyre_strategy_status = 0;
        data.pit_delta_time = 0.0f;
        data.pit_delta_with_wing = 0.0f;
        data.pit_tire_time_gain = 0.0f;
        data.pit_fuel_time_gain = 0.0f;
        data.pit_net_time_delta = 0.0f;
        data.pit_time_loss_no_pit = 0.0f;
        data.pit_break_even_laps = 0.0f;
        data.pit_advantage_available = 0;
        data.pit_recommended_lap = 0.0f;
        data.ers_store_percent = 0.0f;
        data.ers_strategy_mode = 0;
        data.ers_attack_gap = 0.0f;
        data.ers_defend_gap = 0.0f;
        data.ers_harvest_gap = 0.0f;

        // --- Opponents (none in ATS) ---
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

        // Pit strategy plans (empty for trucks)
        data.pit_plan_count = 0;
        data.pit_plan_selected = 0;
        data.pit_cheap_stop_available = 0;

        // --- Game identifier ---
        strncpy(data.game_name, "ATS", sizeof(data.game_name) - 1);
        data.game_name[sizeof(data.game_name) - 1] = '\0';

        // Truck identity -> car_name / track_name
        std::snprintf(data.car_name, sizeof(data.car_name), "%s %s", t->truckBrand, t->truckModel);
        data.track_name[0] = '\0'; // ATS doesn't have a "track" concept

        // --- Timestamp ---
        data.timestamp_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
            std::chrono::steady_clock::now().time_since_epoch()
        ).count();

        last_data_time = std::chrono::steady_clock::now();

        return data;
    }

    std::string getGameName() {
        return "American Truck Simulator";
    }

    void cleanup() {
        std::cout << "[ATS] Cleaning up ATS parser..." << std::endl;
        initialized = false;
        shared_memory.cleanup();
    }

    void logConnectionInfo() {
        if (!isConnected()) {
            std::cout << "[ATS] Parser: Not connected" << std::endl;
            return;
        }

        auto t = shared_memory.getTelemetry();
        if (t) {
            std::cout << "[ATS] Connection Info:" << std::endl;
            std::cout << "  Truck: " << t->truckBrand << " " << t->truckModel << std::endl;
            std::cout << "  Speed: " << (t->speed * 3.6f) << " km/h" << std::endl;
            std::cout << "  RPM: " << t->engineRpm << "/" << t->engineRpmMax << std::endl;
            std::cout << "  Fuel: " << t->fuel << "/" << t->fuelCapacity << " L" << std::endl;
            std::cout << "  Gear: " << t->gear << std::endl;
            std::cout << "  Cargo: " << t->cargoWeight << " kg" << std::endl;
            std::cout << "  Nav remaining: " << (t->navigationDistanceRemaining / 1000.0f) << " km" << std::endl;
        }
    }
};

#endif // _WIN32
