#pragma once
#include <iostream>
#include <chrono>
#include <algorithm>
#include "../../src/f1_24/f1_24_types.h"

// Forward declaration to avoid circular includes
class AccurateLapPredictor;

class DataProcessor {
public:
    struct ProcessedTelemetry {
        // Core telemetry
        float speed_kph;
        uint16_t rpm;
        int8_t gear;
        float throttle_percent;
        float brake_percent;
        
        // Calculated values
        float speed_delta;
        float rpm_delta;
        uint64_t timestamp_ms;
        
        // Session/Lap data
        float current_lap_time;
        float last_lap_time;
        float best_lap_time;
        uint8_t position;
        uint8_t current_lap_num;
        uint32_t sector1_time_ms;
        uint32_t sector2_time_ms;
        uint32_t sector3_time_ms;
        uint8_t current_sector;
        uint8_t pit_status;
        uint8_t result_status;
        
        // F1 24 Gap data (real delta times from game)
        float gap_to_car_ahead;   // Gap to car directly ahead in seconds
        float gap_to_race_leader; // Gap to race leader in seconds
        
        // Tire data
        uint8_t tyre_compound_actual;
        uint8_t tyre_compound_visual;
        uint8_t tyre_age_laps;
        uint8_t tyre_surface_temp[4];  // FL, FR, RL, RR
        uint8_t tyre_inner_temp[4];
        float tyre_pressure[4];
        float tyre_wear[4];            // Tyre wear percentage (FL, FR, RL, RR)
        
        // Car status
        float fuel_in_tank;
        float fuel_remaining_laps;
        float maxFuel;                       // AC: Maximum fuel capacity
        uint8_t fuel_mix;                    // Fuel mix - 0 = lean, 1 = standard, 2 = rich, 3 = max
        uint8_t drs_allowed;
        uint16_t drs_activation_distance;    // Phase 7B: DRS activation distance
        uint8_t drs_open;                    // Current DRS state: 0 = off, 1 = on
        uint16_t max_rpm;                    // Maximum RPM for rev limiter
        uint8_t ers_deploy_mode;
        float ers_store_energy;
        float ers_deployed_this_lap;         // Phase 7B: ERS deployed this lap
        float ers_harvested_this_lap_mguk;   // Phase 7B: ERS harvested MGU-K
        float ers_harvested_this_lap_mguh;   // Phase 7B: ERS harvested MGU-H
        uint8_t actual_tyre_compound;        // Phase 7B: Actual tire compound
        float fuel_margin_laps;              // Positive = extra fuel, negative = deficit
        float fuel_deficit_laps;             // Laps we are short of fuel (0 when safe)
        float fuel_target_save_per_lap;      // Fractional laps to save per remaining lap
        uint8_t fuel_strategy_status;        // 0 = optimal, 1 = monitor, 2 = critical
        float tyre_stint_progress;           // 0-1, how far into current stint we are
        uint8_t tyre_strategy_status;        // 0 = healthy, 1 = caution, 2 = critical
        uint8_t pit_strategy_status;         // 0 = hold, 1 = plan, 2 = box now
        float pit_recommended_lap;           // Recommended lap number to pit
        float pit_net_time_delta;            // Net time delta if we pit now
        float pit_time_loss_no_pit;          // Estimated time loss if we stay out
        float pit_tire_time_gain;            // Time gained from fresh tyres
        float pit_fuel_time_gain;            // Time gained from lighter fuel
        uint8_t ers_strategy_mode;           // 0 = balanced, 1 = harvest, 2 = attack, 3 = defend
        float ers_store_percent;             // ERS store as percentage
        float ers_attack_gap;                // Gap to car ahead for ERS attack
        float ers_defend_gap;                // Gap to car behind for ERS defend
        float ers_harvest_gap;               // Gap threshold for safe harvest
        
        // Motion data
        float world_position_x;
        float world_position_y;
        float lap_distance;
        
        // Session data
        uint8_t weather;
        int8_t track_temperature;
        int8_t air_temperature;
        uint8_t total_laps;
        int8_t track_id;
        uint8_t session_type;
        uint16_t session_time_left;
        uint8_t safety_car_status;
        uint8_t marshal_zones_count;
        float marshal_zone_flags[21];
        uint8_t forecast_accuracy;
        uint8_t num_weather_forecast_samples;
        WeatherForecastSample weather_forecast_samples[64];

        // F1 24 Penalties (from Lap Data packet)
        uint8_t penalties_time;              // Total penalties accumulated in seconds
        uint8_t num_penalties;               // Number of penalties applied
        uint8_t lap_invalid;                 // Current lap invalid flag (for time trial)
        uint8_t corner_cutting_warnings;     // Corner cutting warnings counter

        // F1 24 Event Data (Packet 3) - for detection
        char last_event_code[5];             // Last event string code (4 chars + null terminator)

        // F1 24 Tyre Sets Data (Packet 12) - for detection
        uint8_t tyre_sets_available;         // Number of available tyre sets (indicates packet 12 received)

        // Enhanced tire data
        uint16_t brake_temperature[4];
        uint8_t surface_type[4];

        // F1 24 Car Damage Data (from Packet 10)
        float front_left_wing_damage;        // Front left wing damage (percentage)
        float front_right_wing_damage;       // Front right wing damage (percentage)
        float rear_wing_damage;              // Rear wing damage (percentage)
        float floor_damage;                  // Floor damage (percentage)
        float diffuser_damage;               // Diffuser damage (percentage)
        float sidepod_damage;                // Sidepod damage (percentage)
        float engine_damage;                 // Engine damage (percentage)
        float gearbox_damage;                // Gearbox damage (percentage)
        float tyres_damage[4];               // Tyre damage (percentage) FL, FR, RL, RR
        uint8_t tyre_blisters[4];            // F1 25: Tyre blisters (percentage) FL, FR, RL, RR

        // F1 Dashboard V4 Missing Fields
        uint8_t differential_on_throttle;    // Differential setting from CarSetupData

        // F1 24 Car Setup Data (from Packet 5)
        uint8_t front_wing_aero;             // Front wing aero
        uint8_t rear_wing_aero;              // Rear wing aero
        uint8_t differential_off_throttle;   // Differential off throttle
        float front_camber;                  // Front camber angle (suspension geometry)
        float rear_camber;                   // Rear camber angle (suspension geometry)
        float front_toe;                     // Front toe angle (suspension geometry)
        float rear_toe;                      // Rear toe angle (suspension geometry)
        uint8_t front_suspension;            // Front suspension
        uint8_t rear_suspension;             // Rear suspension
        uint8_t front_anti_roll_bar;         // Front anti-roll bar
        uint8_t rear_anti_roll_bar;          // Rear anti-roll bar
        // uint8_t engine_braking;              // Engine braking - NOT available in F1 24
        uint8_t front_ride_height;           // Front ride height
        uint8_t rear_ride_height;            // Rear ride height
        uint8_t brake_pressure;              // Brake pressure (percentage)
        uint8_t f1_brake_bias;               // F1 brake bias (percentage) - renamed to avoid AC conflict

        uint8_t pit_window_ideal_lap;        // Ideal lap to pit (from session data)
        uint8_t pit_window_latest_lap;       // Latest lap to pit (from session data)
        uint8_t pit_window_open;             // Calculated: is pit window currently open?
        float delta_time;                    // Real-time delta vs personal best
        float delta_time_session;            // Real-time delta vs session fastest
        float delta_time_last;               // Real-time delta vs last lap
        float estimated_lap_time;            // Predicted lap time from lap predictor
        uint8_t sector1_status;              // 0=none, 1=personal, 2=fastest
        uint8_t sector2_status;              // Sector status for timing colors
        uint8_t sector3_status;              // Sector status for timing colors
        uint8_t has_fastest_lap;             // 1 if this driver has the session fastest lap
        
        // AC-Specific Extended Telemetry Fields
        float tyre_temp_inner[4];         // AC: Inner tire temperature zones FL, FR, RL, RR
        float tyre_temp_middle[4];        // AC: Middle tire temperature zones FL, FR, RL, RR
        float tyre_temp_outer[4];         // AC: Outer tire temperature zones FL, FR, RL, RR
        float tyre_core_temperature[4];   // AC: Core tire temperature FL, FR, RL, RR
        float tyre_wear_detailed[4];      // AC: Detailed tire wear FL, FR, RL, RR
        float suspension_travel[4];       // AC: Suspension travel FL, FR, RL, RR
        float performance_meter;          // AC: Performance vs best lap meter
        float surface_grip;               // AC: Track surface grip level
        float wind_speed;                 // AC: Wind speed
        float wind_direction;             // AC: Wind direction (0-359 degrees)
        float clutch_position;            // AC: Clutch pedal position 0-1
        float turbo_boost;                // AC: Turbo boost pressure
        float ballast_kg;                 // AC: Ballast weight in kg
        float air_density;                // AC: Air density
        float center_of_gravity_height;   // AC: Center of gravity height
        float force_feedback;             // AC: Current force feedback value
        float camber_angle[4];            // AC: Camber angle for each wheel (radians)
        float wheel_slip[4];              // AC: Wheel slip for each tire
        float wheel_load[4];              // AC: Wheel load in Newtons FL, FR, RL, RR
        float local_angular_velocity[3];  // AC: Angular velocity x,y,z
        float local_velocity[3];          // AC: Local velocity vector x,y,z
        float acceleration_g[3];          // AC: G-forces x,y,z
        float car_damage[5];              // AC: Damage levels for car sections
        float brake_bias;                 // AC: Brake bias (0=rear, 1=front)
        uint8_t is_ai_controlled;         // AC: AI controlled car flag
        uint8_t auto_shifter_enabled;     // AC: Auto shifter enabled
        uint8_t pit_limiter_enabled;      // AC: Pit limiter enabled
        uint8_t ideal_line_enabled;       // AC: Ideal line display enabled
        uint8_t traction_control_setting;          // AC: TC setting
        uint8_t traction_control_setting_secondary; // AC: Secondary TC setting (TC2)
        uint8_t abs_setting;                        // AC: ABS setting
        uint8_t fuel_map_setting;                   // AC: Fuel/engine map (ERS power) setting
        uint8_t fuel_map_max;                       // AC: Maximum selectable fuel map
        uint8_t engine_brake_setting;               // AC: Engine brake setting
        float steering_angle;             // AC: Steering wheel angle
        float heading_angle;              // AC: Car heading angle
        float pitch_angle;                // AC: Car pitch angle
        float roll_angle;                 // AC: Car roll angle
        float normalized_car_position;    // AC: Position on track spline (0-1)
        float track_spline_length;        // AC: Total track spline length
        uint8_t penalties_enabled;        // AC: Cut penalties enabled
        float penalty_time;               // AC: Current penalty time
        uint8_t numberOfTyresOut;         // AC: Number of tires currently out of track bounds
        uint8_t flag_type;                // AC: Current flag type (0=none, 6=penalty)
        uint8_t is_in_pit;                // AC: If player's car is stopped in the pit
        uint8_t is_in_pitlane;            // AC: If player's car is in the pitlane
        uint8_t mandatory_pit_done;       // AC: If mandatory pit has been completed
        uint8_t lap_invalidated;          // AC: If current lap is invalidated due to track limits
        float ride_height[2];             // AC: Ride height front/rear
        
        // AC Advanced Contact Patch Data (144 total fields coverage)
        float tyre_contact_point[4][3];   // AC: Contact point coordinates FL,FR,RL,RR (x,y,z)
        float tyre_contact_normal[4][3];  // AC: Contact normal vectors FL,FR,RL,RR (x,y,z)
        float tyre_contact_heading[4][3]; // AC: Contact heading vectors FL,FR,RL,RR (x,y,z)
        float tyre_dirty_level[4];        // AC: Tire dirt level FL,FR,RL,RR
        float suspension_max_travel[4];   // AC: Maximum suspension travel FL,FR,RL,RR
        float tyre_radius[4];             // AC: Tire radius FL,FR,RL,RR

        // AC Aid/Rate settings from static data
        float aid_tire_rate;              // AC: Tire wear rate multiplier
        float aid_fuel_rate;              // AC: Fuel consumption rate multiplier
        float aid_mechanical_damage;      // AC: Mechanical damage rate multiplier
        float aid_stability;              // AC: Stability control (0.0 = off, 1.0 = full)
        uint8_t aid_auto_clutch;          // AC: Auto clutch enabled
        uint8_t aid_auto_blip;            // AC: Auto blip (heel-toe) enabled
        uint8_t aid_allow_tyre_blankets;  // AC: Tyre blankets allowed in session

        // Game identifier for frontend
        char game_name[16];               // "F1 24" or "Assetto Corsa"
        char car_name[64];                // AC: Car model name
        char track_name[64];              // AC: Track name

        // === ATLAS AI: STRATEGIC TELEMETRY ===

        // Fuel calculations
        float fuel_per_lap_average;           // Rolling 5-lap average kg/lap
        float fuel_last_lap;                  // Fuel used on previous lap
        float fuel_laps_remaining_calculated; // Our calculation (more accurate than game)
        uint8_t fuel_calc_ready;              // 1 when we have 3+ laps of data

        // Tire degradation calculations
        float tyre_degradation_rate;          // Seconds lost per lap vs optimal
        float tyre_life_remaining_laps;       // Predicted laps until critical (2s off pace)
        float tyre_performance_index;         // 0-100, current performance level
        uint8_t tyre_critical_warning;        // 1 if < 3 laps remaining

        // Pit strategy
        float pit_delta_time;                 // Track-specific pit time loss
        float pit_delta_with_wing;            // Pit time if wing change needed
        uint8_t pit_advantage_available;      // 1 if pitting is advantageous
        float pit_break_even_laps;            // Laps needed to recover pit loss

        // Nearby opponents (for strategic context)
        struct NearbyOpponent {
            char driver_name[48];
            uint8_t position;
            float gap_seconds;
            uint8_t tyre_age;
            float last_lap_time;
            uint8_t tyre_compound;
        };
        NearbyOpponent opponent_ahead_1;
        NearbyOpponent opponent_ahead_2;
        NearbyOpponent opponent_behind_1;
        NearbyOpponent opponent_behind_2;
        uint8_t num_opponents_ahead;
        uint8_t num_opponents_behind;

        struct PitRejoinForecast {
            char driver_name[48];
            uint8_t position;
            float gap_seconds;
        };
        PitRejoinForecast pit_rejoin_ahead;
        PitRejoinForecast pit_rejoin_behind;
        uint8_t pit_rejoin_position;
        struct PitStrategyStopDetail {
            float target_lap;
            float window_open;
            float window_close;
            uint8_t compound_visual;
            float expected_stint_length;
        };

        struct PitStrategyPlan {
            char label[16];
            uint8_t total_stops;
            uint8_t stops_completed;
            uint8_t risk_rating;
            float projected_total_time;
            float delta_vs_best;
            float confidence;
            uint8_t stop_count;
            PitStrategyStopDetail stops[3];
            uint8_t cheap_pit_opportunity;
        };
        PitStrategyPlan pit_plan_primary;
        PitStrategyPlan pit_plan_alternative;
        PitStrategyPlan pit_plan_third;
        uint8_t pit_plan_count;
        uint8_t pit_plan_selected;
        uint8_t pit_cheap_stop_available;
        uint8_t pit_stops_completed;
        float last_pit_stop_lap;
    };

    // Multi-car data structure for pit wall dashboard
    struct MultiCarData {
        PacketHeader header;
        uint8_t num_active_cars;
        ProcessedTelemetry cars[22];          // Telemetry data for all cars
        ParticipantData participants[22];     // Driver names, teams, etc.
        uint64_t timestamp_ms;
        
        // Session best times for comparison
        float best_sector1_time;
        float best_sector2_time;
        float best_sector3_time;
        float best_lap_time;
    };

private:    
    ProcessedTelemetry last_telemetry;
    ProcessedTelemetry current_combined_data;
    bool has_previous_data;
    bool has_telemetry_data;
    bool has_lap_data;
    bool has_status_data;
    bool has_motion_data;
    bool has_session_data;
    bool game_identified;
    float session_best_lap_time;
    
    // Multi-car data storage
    MultiCarData current_multi_car_data;
    bool has_multi_car_lap_data;
    bool has_multi_car_telemetry_data;
    bool has_multi_car_status_data;
    bool has_participants_data;
    
    // Sector timing protection flags
    bool sector1_completed;
    bool sector2_completed;
    bool sector3_completed;
    uint8_t last_lap_number;
    std::chrono::steady_clock::time_point sector3_display_until; // Keep S3 visible until this time
    uint16_t saved_sector3_time_ms; // Saved S3 from completed lap

    // Personal best sector times for status comparison
    float personal_best_sector1;
    float personal_best_sector2;
    float personal_best_sector3;
    
    // Flag monitoring for change detection
    uint8_t last_safety_car_status;
    uint8_t last_red_flag_periods;
    bool has_yellow_flags;
    bool last_yellow_flag_state;
    
    // Player retirement tracking
    uint8_t last_player_result_status;
    bool player_retirement_detected;

    // Session reset detection
    uint64_t current_session_uid;
    bool session_uid_initialized;

    // Race restart detection
    float last_session_time;
    uint32_t last_frame_identifier;
    uint8_t last_player_lap_number;
    bool restart_detection_initialized;

    // F1 Dashboard V4 - Lap prediction system
    AccurateLapPredictor* lap_predictor;

    // === ATLAS AI: Fuel & Tire Tracking ===

    // Fuel tracking
    struct FuelHistory {
        float fuel_values[5];  // Last 5 laps
        uint8_t count;
        uint8_t write_index;
    } fuel_history;
    float last_lap_fuel;
    bool fuel_tracking_active;
    uint8_t fuel_tracking_reference_lap;

    // Tire degradation tracking
    struct SectorTimeHistory {
        float sector1_times[10];
        float sector2_times[10];
        float sector3_times[10];
        uint8_t count;
        uint8_t write_index;
    } sector_history;
    uint8_t current_tire_stint_age;
    float personal_best_combined_sectors;
    uint8_t last_strategy_log_lap;
    bool strategy_log_initialized;
    float pending_sector1_time;
    float pending_sector2_time;

    // Pit stop tracking
    uint8_t pit_stops_completed_internal;
    bool pit_stop_active;
    uint8_t pit_entry_lap;
    float last_pit_stop_lap_internal;

public:
    DataProcessor();
    ~DataProcessor();
    
    // Single-car methods (existing)
    void updateTelemetryData(const CarTelemetryData& telemetry_data);
    void updateLapData(const LapData& lap_data);
    void updateStatusData(const CarStatusData& status_data);
    void updateMotionData(const CarMotionData& motion_data, float lap_distance);
    void updateSessionData(const SessionData& session_data);
    void updateSessionHistoryData(const PacketSessionHistoryData& history_packet);
    void updateCarDamageData(const CarDamageData& damage_data, uint16_t packet_format);
    void updateCarSetupData(const CarSetupData& setup_data);
    void updateSectorStatus(); // F1 Dashboard V4 - sector timing status
    void setGameIdentification(uint16_t packet_format, uint8_t game_year);
    void updateEventData(const char* event_code); // F1 24 Event packet (Packet 3)
    void updateTyreSetsData(uint8_t num_sets); // F1 24 Tyre Sets packet (Packet 12)
    void updateStrategyInsights();
    ProcessedTelemetry getCurrentData();
    std::string toJSON(const ProcessedTelemetry& data);
    void logTelemetry(const ProcessedTelemetry& data);
    
    // Multi-car methods for pit wall
    void updateMultiCarLapData(const PacketLapData& lap_packet);
    void updateMultiCarTelemetryData(const PacketCarTelemetryData& telemetry_packet);
    void updateMultiCarStatusData(const PacketCarStatusData& status_packet);
    void updateMultiCarSessionHistory(const PacketSessionHistoryData& history_packet);
    void updateMultiCarMotionData(const PacketMotionData& motion_packet);
    void updateParticipantsData(const PacketParticipantsData& participants_packet);
    MultiCarData getMultiCarData();
    std::string multiCarToJSON(const MultiCarData& data);
    bool hasCompleteMultiCarData();
    
    // Helper method to get participant name by index
    std::string getParticipantName(uint8_t vehicleIdx);
    
    // Flag change detection method
    struct FlagChange {
        bool hasChange;
        std::string eventType;    // "YFLAG", "RFLAG", "SCFULL", "SCVIR", "SCEND"
        std::string message;
    };
    FlagChange checkForFlagChanges();
    
    // Player retirement detection method
    struct RetirementChange {
        bool hasRetirement;
        std::string driverName;
        std::string message;
    };
    RetirementChange checkForPlayerRetirement();

    // Session reset detection and handling
    bool checkForSessionReset(uint64_t sessionUID);
    bool checkForRaceRestart(float sessionTime, uint32_t frameIdentifier, uint8_t playerLapNumber);
    void resetSessionData();

    // === ATLAS AI: Strategic Calculations ===

    // Fuel tracking
    void updateFuelTracking();
    float calculateAverageFuelPerLap();

    // Tire degradation tracking
    void updateTireDegradation();
    float calculateTireDegradationRate();
    float predictTireLifeRemaining();

    // Pit strategy calculation
    void calculatePitStrategy();

    // Opponent context
    void updateOpponentContext();
    void updateErsStrategy();
    void logStrategySnapshotIfNeeded();
    void estimatePitRejoin(float stop_loss_seconds);
    void resetPitRejoinForecast();
};
