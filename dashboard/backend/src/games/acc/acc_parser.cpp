#include "acc_shared_memory.h"
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

class ACC_Parser {
private:
    ACC::SharedMemoryReader shared_memory;
    bool initialized;
    int consecutive_failures;
    std::chrono::steady_clock::time_point last_data_time;

    float previous_speed = 0.0f;
    uint16_t previous_rpm = 0;

    float previous_max_tyre_wear = 0.0f;
    int tyre_age_lap_counter = 0;
    int last_completed_laps_age = -1;
    bool last_in_pit_state = false;

public:
    ACC_Parser()
        : initialized(false)
        , consecutive_failures(0)
        , previous_speed(0.0f)
        , previous_rpm(0)
        , previous_max_tyre_wear(0.0f)
        , tyre_age_lap_counter(0)
        , last_completed_laps_age(-1)
        , last_in_pit_state(false) {}

    bool isGameRunning() {
        return shared_memory.isGameRunning();
    }

    bool initialize() {
        std::cout << "[ACC] Initializing ACC parser..." << std::endl;

        if (!isGameRunning()) {
            std::cout << "[ACC] ACC.exe not detected. Please start Assetto Corsa Competizione." << std::endl;
            return false;
        }

        for (int attempts = 0; attempts < 10; attempts++) {
            if (shared_memory.initialize()) {
                initialized = true;
                consecutive_failures = 0;
                std::cout << "[ACC] Connected to shared memory." << std::endl;

                auto static_data = shared_memory.getStatic();
                if (static_data) {
                    std::wcout << L"[ACC] Version: " << std::wstring(static_data->acVersion) << std::endl;
                    std::wcout << L"[ACC] Track: " << std::wstring(static_data->track) << std::endl;
                    std::wcout << L"[ACC] Car: " << std::wstring(static_data->carModel) << std::endl;
                    std::wcout << L"[ACC] Player: " << std::wstring(static_data->playerName)
                              << L" " << std::wstring(static_data->playerSurname) << std::endl;
                }

                return true;
            }

            std::cout << "[ACC] Shared memory not ready, attempt " << (attempts + 1) << "/10..." << std::endl;
            std::this_thread::sleep_for(std::chrono::milliseconds(500));
        }

        std::cout << "[ACC] Failed to connect to shared memory after 10 attempts." << std::endl;
        return false;
    }

    bool isConnected() {
        return initialized && shared_memory.isConnected();
    }

    bool hasValidData() {
        if (!isConnected()) {
            consecutive_failures++;
            if (consecutive_failures > 100) {
                std::cout << "[ACC] Lost connection, attempting reconnect..." << std::endl;
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

        auto physics = shared_memory.getPhysics();
        auto graphics = shared_memory.getGraphics();
        auto static_info = shared_memory.getStatic();

        if (!physics || !graphics || !static_info) {
            return data;
        }

        // --- Core telemetry ---
        data.speed_kph = physics->speedKmh;
        data.rpm = static_cast<uint16_t>(physics->rpms);

        if (physics->gear == 0) {
            data.gear = -1;
        } else if (physics->gear == 1) {
            data.gear = 0;
        } else {
            data.gear = static_cast<int8_t>(physics->gear - 1);
        }

        data.throttle_percent = physics->gas * 100.0f;
        data.brake_percent = physics->brake * 100.0f;

        data.speed_delta = data.speed_kph - previous_speed;
        data.rpm_delta = static_cast<float>(data.rpm) - static_cast<float>(previous_rpm);
        previous_speed = data.speed_kph;
        previous_rpm = data.rpm;

        // --- Timing ---
        data.current_lap_time = graphics->iCurrentTime / 1000.0f;
        data.last_lap_time = graphics->iLastTime / 1000.0f;
        data.best_lap_time = graphics->iBestTime / 1000.0f;

        int displayLap = static_cast<int>(graphics->completedLaps) + 1;
        if (displayLap < 0) displayLap = 0;
        const int totalLaps = static_cast<int>(graphics->numberOfLaps);
        if (totalLaps > 0 && displayLap > totalLaps) displayLap = totalLaps;
        data.current_lap_num = static_cast<uint8_t>(displayLap);

        // ACC provides delta and estimated lap time natively
        data.delta_time = graphics->iDeltaLapTime / 1000.0f;
        data.estimated_lap_time = graphics->iEstimatedLapTime / 1000.0f;
        data.delta_time_session = data.delta_time;
        data.delta_time_last = 0.0f;

        data.position = static_cast<uint8_t>(graphics->position);
        data.current_sector = static_cast<uint8_t>(graphics->currentSectorIndex);

        // --- Sector timing (same approach as AC) ---
        static uint32_t sector1_time = 0, sector2_time = 0, sector3_time = 0;
        static uint32_t s1_end_time = 0;
        static int last_sector = -1;
        static int last_lap = -1;
        static bool s3_completed = false;
        static std::chrono::steady_clock::time_point s3_display_until;
        static uint32_t saved_s3_time = 0;

        if (graphics->completedLaps != last_lap) {
            last_lap = graphics->completedLaps;
        }

        if (graphics->currentSectorIndex != last_sector) {
            if (last_sector == 0 && graphics->currentSectorIndex == 1) {
                sector1_time = graphics->iCurrentTime;
                s1_end_time = sector1_time;
            } else if (last_sector == 1 && graphics->currentSectorIndex == 2) {
                sector2_time = graphics->iCurrentTime - s1_end_time;
            } else if (last_sector == 2 && graphics->currentSectorIndex == 0) {
                if (graphics->iLastTime > 0) {
                    sector3_time = graphics->iLastTime - (s1_end_time + sector2_time);
                    saved_s3_time = sector3_time;
                    s3_completed = true;
                    s3_display_until = std::chrono::steady_clock::now() + std::chrono::seconds(4);
                    sector1_time = 0;
                    sector2_time = 0;
                    sector3_time = 0;
                    s1_end_time = 0;
                }
            }
            last_sector = graphics->currentSectorIndex;
        }

        if (s3_completed && std::chrono::steady_clock::now() > s3_display_until) {
            s3_completed = false;
            saved_s3_time = 0;
        }

        data.sector1_time_ms = sector1_time;
        data.sector2_time_ms = sector2_time;
        data.sector3_time_ms = (s3_completed && std::chrono::steady_clock::now() <= s3_display_until)
            ? saved_s3_time : sector3_time;

        // --- Pit status ---
        data.pit_status = graphics->isInPit ? 1 : 0;
        data.is_in_pit = static_cast<uint8_t>(graphics->isInPit);
        data.is_in_pitlane = static_cast<uint8_t>(graphics->isInPitLane);
        data.mandatory_pit_done = static_cast<uint8_t>(graphics->mandatoryPitDone);

        // --- Tyre data ---
        float max_tyre_wear_percent = 0.0f;
        for (int i = 0; i < 4; i++) {
            data.tyre_surface_temp[i] = static_cast<uint8_t>(std::min(255.0f, std::max(0.0f, physics->tyreTempO[i])));
            data.tyre_inner_temp[i] = static_cast<uint8_t>(std::min(255.0f, std::max(0.0f, physics->tyreTempI[i])));
            data.tyre_pressure[i] = physics->wheelsPressure[i];

            // ACC tyreWear: 0.0 = fresh, higher = more worn
            float wear_percent = std::clamp(physics->tyreWear[i] * 100.0f, 0.0f, 100.0f);
            data.tyre_wear[i] = wear_percent;
            if (wear_percent > max_tyre_wear_percent) {
                max_tyre_wear_percent = wear_percent;
            }

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

        // Tyre compound from ACC graphics
        std::wstring compound_wide(graphics->tyreCompound);
        std::string compound_str(compound_wide.begin(), compound_wide.end());
        if (compound_str.find("Wet") != std::string::npos || compound_str.find("WET") != std::string::npos) {
            data.tyre_compound_actual = 7;
            data.tyre_compound_visual = 8;
        } else {
            // ACC dry compound
            data.tyre_compound_actual = 17;
            data.tyre_compound_visual = 17;
        }

        // --- Tyre age estimation ---
        int completed_laps = std::max(0, graphics->completedLaps);
        if (last_completed_laps_age == -1) {
            last_completed_laps_age = completed_laps;
            tyre_age_lap_counter = 0;
            previous_max_tyre_wear = max_tyre_wear_percent;
        } else {
            if (completed_laps < last_completed_laps_age) {
                tyre_age_lap_counter = completed_laps;
                last_completed_laps_age = completed_laps;
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

        // --- Fuel ---
        data.fuel_in_tank = physics->fuel;
        data.maxFuel = static_info->maxFuel;

        // ACC provides fuelXLap (fuel used per lap) and fuelEstimatedLaps natively
        data.fuel_per_lap_average = graphics->fuelXLap;
        data.fuel_remaining_laps = graphics->fuelEstimatedLaps;
        data.fuel_last_lap = graphics->fuelXLap;
        data.fuel_calc_ready = (graphics->fuelXLap > 0.01f) ? 1 : 0;

        if (graphics->numberOfLaps > 0 && graphics->fuelXLap > 0.01f) {
            int laps_remaining = std::max(0, graphics->numberOfLaps - graphics->completedLaps);
            float fuel_margin = graphics->fuelEstimatedLaps - static_cast<float>(laps_remaining);
            data.fuel_margin_laps = fuel_margin;
            data.fuel_deficit_laps = fuel_margin < 0.0f ? -fuel_margin : 0.0f;
            data.fuel_target_save_per_lap = fuel_margin < 0.0f
                ? (-fuel_margin / static_cast<float>(std::max(1, laps_remaining)))
                : 0.0f;
            data.fuel_strategy_status = fuel_margin < -0.5f ? 2 : (fuel_margin < 0.5f ? 1 : 0);
        } else {
            data.fuel_margin_laps = 0.0f;
            data.fuel_deficit_laps = 0.0f;
            data.fuel_target_save_per_lap = 0.0f;
            data.fuel_strategy_status = 0;
        }

        data.fuel_mix = 1;

        // --- DRS / ERS (limited in ACC) ---
        data.drs_allowed = 0;
        data.drs_open = 0;
        data.drs_activation_distance = 0;
        data.ers_deploy_mode = 0;
        data.ers_store_energy = 0.0f;
        data.ers_deployed_this_lap = 0.0f;
        data.ers_harvested_this_lap_mguk = 0.0f;
        data.ers_harvested_this_lap_mguh = 0.0f;

        // --- Engine / RPM ---
        data.max_rpm = static_cast<uint16_t>(static_info->maxRpm);

        // --- Brake temps ---
        for (int i = 0; i < 4; i++) {
            data.brake_temperature[i] = static_cast<uint16_t>(std::min(65535.0f, std::max(0.0f, physics->brakeTemp[i])));
            data.surface_type[i] = 0;
        }

        // --- Session data ---
        data.weather = 0;
        data.track_temperature = static_cast<int8_t>(physics->roadTemp);
        data.air_temperature = static_cast<int8_t>(physics->airTemp);
        data.total_laps = static_cast<uint8_t>(graphics->numberOfLaps);
        data.track_id = -1;
        data.session_type = static_cast<uint8_t>(graphics->session);

        float session_time_left = std::clamp(graphics->sessionTimeLeft, 0.0f, 65535.0f);
        data.session_time_left = static_cast<uint16_t>(session_time_left);
        data.safety_car_status = 0;

        // --- ACC Gap data (native) ---
        data.gap_to_car_ahead = graphics->gapAhead / 1000.0f;
        data.gap_to_race_leader = 0.0f;

        // --- ACC-specific controls ---
        data.traction_control_setting = static_cast<uint8_t>(graphics->TC);
        data.traction_control_setting_secondary = static_cast<uint8_t>(graphics->TCCut);
        data.abs_setting = static_cast<uint8_t>(graphics->ABS);
        data.engine_brake_setting = static_cast<uint8_t>(physics->engineBrake);
        data.fuel_map_setting = static_cast<uint8_t>(graphics->EngineMap);
        data.fuel_map_max = 0;

        // --- Car dynamics ---
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
        data.performance_meter = physics->performanceMeter;
        data.surface_grip = graphics->surfaceGrip;
        data.wind_speed = graphics->windSpeed;
        data.wind_direction = graphics->windDirection;

        for (int i = 0; i < 3; i++) {
            data.local_angular_velocity[i] = physics->localAngularVel[i];
            data.local_velocity[i] = physics->localVelocity[i];
            data.acceleration_g[i] = physics->accG[i];
        }

        for (int i = 0; i < 5; i++) {
            data.car_damage[i] = physics->carDamage[i];
        }

        data.is_ai_controlled = static_cast<uint8_t>(physics->isAIControlled);
        data.auto_shifter_enabled = static_cast<uint8_t>(physics->autoShifterOn);
        data.pit_limiter_enabled = static_cast<uint8_t>(physics->pitLimiterOn);
        data.ideal_line_enabled = static_cast<uint8_t>(graphics->idealLineOn);

        data.ride_height[0] = physics->rideHeight[0];
        data.ride_height[1] = physics->rideHeight[1];

        // --- World position ---
        data.world_position_x = graphics->carCoordinates[graphics->playerCarID][0];
        data.world_position_y = graphics->carCoordinates[graphics->playerCarID][2];
        data.normalized_car_position = graphics->normalizedCarPosition;
        data.track_spline_length = static_info->trackSPlineLength;
        data.lap_distance = graphics->normalizedCarPosition * static_info->trackSPlineLength;

        // --- Contact patch and static data ---
        for (int i = 0; i < 4; i++) {
            for (int j = 0; j < 3; j++) {
                data.tyre_contact_point[i][j] = physics->tyreContactPoint[i][j];
                data.tyre_contact_normal[i][j] = physics->tyreContactNormal[i][j];
                data.tyre_contact_heading[i][j] = physics->tyreContactHeading[i][j];
            }
            data.tyre_dirty_level[i] = physics->tyreDirtyLevel[i];
            data.suspension_max_travel[i] = static_info->suspensionMaxTravel[i];
            data.tyre_radius[i] = static_info->tyreRadius[i];
        }

        // --- Flags and penalties ---
        data.penalties_enabled = static_cast<uint8_t>(static_info->penaltiesEnabled);
        data.penalty_time = graphics->penaltyTime;
        data.numberOfTyresOut = static_cast<uint8_t>(physics->numberOfTyresOut);
        data.flag_type = static_cast<uint8_t>(graphics->flag);
        data.lap_invalidated = graphics->isValidLap ? 0 : 1;

        // --- Aid settings ---
        data.aid_tire_rate = static_info->aidTireRate;
        data.aid_fuel_rate = static_info->aidFuelRate;
        data.aid_mechanical_damage = static_info->aidMechanicalDamage;
        data.aid_stability = static_info->aidStability;
        data.aid_auto_clutch = static_cast<uint8_t>(static_info->aidAutoClutch);
        data.aid_auto_blip = static_cast<uint8_t>(static_info->aidAutoBlip);
        data.aid_allow_tyre_blankets = static_cast<uint8_t>(static_info->aidAllowTyreBlankets);

        // --- Marshal zones (use ACC global flags) ---
        data.marshal_zones_count = 0;
        for (float& f : data.marshal_zone_flags) f = 0.0f;

        // --- Atlas AI derived fields ---
        data.fuel_laps_remaining_calculated = data.fuel_remaining_laps;

        float wear_per_lap = (data.tyre_age_laps > 0)
            ? (max_tyre_wear_percent / static_cast<float>(std::max<int>(data.tyre_age_laps, 1)))
            : (max_tyre_wear_percent > 0.1f ? max_tyre_wear_percent : 1.0f);
        wear_per_lap = std::max(wear_per_lap, 0.5f);

        data.tyre_degradation_rate = wear_per_lap * 0.02f;
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

        data.ers_store_percent = 0.0f;
        data.ers_strategy_mode = 0;
        data.ers_attack_gap = 1.2f;
        data.ers_defend_gap = 1.0f;
        data.ers_harvest_gap = 2.5f;

        // Pit strategy scaffolding
        const float lap_len_km = (data.track_spline_length > 1.0f)
            ? (data.track_spline_length / 1000.0f) : 5.0f;
        const float base_pit_loss = std::clamp(18.0f + lap_len_km * 0.9f, 18.0f, 32.0f);
        const float tyre_time_gain = max_tyre_wear_percent * 0.025f;
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

        float recommended_lap = static_cast<float>(data.current_lap_num) +
            (fuel_critical ? 1.0f : (data.tyre_critical_warning ? 1.0f : 3.0f));
        if (data.total_laps > 0) {
            recommended_lap = std::min(recommended_lap, static_cast<float>(data.total_laps));
        }
        data.pit_recommended_lap = recommended_lap;

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

        // Opponent data (ACC provides gap_ahead/behind but not full driver info via shared memory)
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

        // Populate gap from ACC native data
        if (graphics->gapAhead > 0) {
            data.opponent_ahead_1.gap_seconds = graphics->gapAhead / 1000.0f;
            data.num_opponents_ahead = 1;
        } else {
            data.num_opponents_ahead = 0;
        }
        if (graphics->gapBehind > 0) {
            data.opponent_behind_1.gap_seconds = graphics->gapBehind / 1000.0f;
            data.num_opponents_behind = 1;
        } else {
            data.num_opponents_behind = 0;
        }

        // --- Game identifier ---
        strncpy(data.game_name, "ACC", sizeof(data.game_name) - 1);
        data.game_name[sizeof(data.game_name) - 1] = '\0';

        WideCharToMultiByte(CP_UTF8, 0, static_info->carModel, -1, data.car_name, sizeof(data.car_name), NULL, NULL);
        WideCharToMultiByte(CP_UTF8, 0, static_info->track, -1, data.track_name, sizeof(data.track_name), NULL, NULL);

        // --- Timestamp ---
        data.timestamp_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
            std::chrono::steady_clock::now().time_since_epoch()
        ).count();

        last_data_time = std::chrono::steady_clock::now();

        return data;
    }

    std::string getGameName() {
        return "Assetto Corsa Competizione";
    }

    void cleanup() {
        std::cout << "[ACC] Cleaning up ACC parser..." << std::endl;
        initialized = false;
        shared_memory.cleanup();
    }

    void logConnectionInfo() {
        if (!isConnected()) {
            std::cout << "[ACC] Parser: Not connected" << std::endl;
            return;
        }

        auto static_data = shared_memory.getStatic();
        auto graphics = shared_memory.getGraphics();

        if (static_data && graphics) {
            std::cout << "[ACC] Connection Info:" << std::endl;
            std::wcout << L"  Track: " << std::wstring(static_data->track) << std::endl;
            std::wcout << L"  Car: " << std::wstring(static_data->carModel) << std::endl;
            std::cout << "  Session: " << graphics->session << std::endl;
            std::cout << "  Status: " << graphics->status << " (2=live)" << std::endl;
            std::cout << "  Completed Laps: " << graphics->completedLaps << std::endl;
            std::cout << "  Position: " << graphics->position << std::endl;
            std::cout << "  Rain Intensity: " << graphics->rainIntensity << std::endl;
            std::cout << "  Track Grip: " << graphics->trackGripStatus << std::endl;
        }
    }
};

#endif // _WIN32
