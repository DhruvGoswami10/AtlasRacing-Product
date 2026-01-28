#pragma once
#include <cstdint>

/**
 * Pit Strategy Calculator for ATLAS AI
 * Uses real F1 24 track data collected manually
 */

namespace PitStrategy {

// F1 24 Track IDs (from official UDP specification)
enum TrackID {
    BAHRAIN = 0,
    SAUDI = 1,
    AUSTRALIA = 2,
    JAPAN = 3,
    CHINA = 4,
    MIAMI = 5,
    IMOLA = 6,
    MONACO = 7,
    CANADA = 8,
    SPAIN = 9,
    AUSTRIA = 10,
    GREAT_BRITAIN = 11,
    HUNGARY = 12,
    BELGIUM = 13,
    NETHERLANDS = 14,
    MONZA = 15,
    AZERBAIJAN = 16,
    SINGAPORE = 17,
    TEXAS = 18,
    MEXICO = 19,
    BRAZIL = 20,
    LAS_VEGAS = 21,
    QATAR = 22,
    ABU_DHABI = 23,
    PORTUGAL = 24
};

// Pit delta times (TOTAL time from manual testing - optimal conditions)
// This is pit entry → pit stop → pit exit total time loss
const float PIT_DELTA_F1_24[25] = {
    24.8f,  // 0:  Bahrain
    18.8f,  // 1:  Saudi Arabia
    16.9f,  // 2:  Australia (FASTEST PIT LANE!)
    23.6f,  // 3:  Japan
    21.8f,  // 4:  China
    21.9f,  // 5:  Miami
    29.7f,  // 6:  Imola
    22.7f,  // 7:  Monaco
    23.2f,  // 8:  Canada
    21.1f,  // 9:  Spain
    19.1f,  // 10: Austria
    33.6f,  // 11: Great Britain (SLOWEST PIT LANE!)
    21.2f,  // 12: Hungary
    22.3f,  // 13: Belgium
    18.1f,  // 14: Netherlands
    24.6f,  // 15: Monza
    18.9f,  // 16: Azerbaijan
    26.0f,  // 17: Singapore
    22.4f,  // 18: Texas (COTA)
    22.9f,  // 19: Mexico
    21.9f,  // 20: Brazil
    20.8f,  // 21: Las Vegas
    27.9f,  // 22: Qatar
    20.5f,  // 23: Abu Dhabi
    26.3f   // 24: Portugal (legacy track)
};

// Pit delta with front wing change (TOTAL time loss)
const float PIT_DELTA_WING_F1_24[25] = {
    30.4f,  // 0:  Bahrain
    24.6f,  // 1:  Saudi Arabia
    22.7f,  // 2:  Australia
    29.4f,  // 3:  Japan
    27.6f,  // 4:  China
    27.7f,  // 5:  Miami
    35.5f,  // 6:  Imola
    28.5f,  // 7:  Monaco
    29.0f,  // 8:  Canada
    26.9f,  // 9:  Spain
    24.9f,  // 10: Austria
    39.4f,  // 11: Great Britain
    27.0f,  // 12: Hungary
    28.1f,  // 13: Belgium
    23.9f,  // 14: Netherlands
    30.4f,  // 15: Monza
    24.7f,  // 16: Azerbaijan
    31.8f,  // 17: Singapore
    28.2f,  // 18: Texas (COTA)
    28.7f,  // 19: Mexico
    27.7f,  // 20: Brazil
    26.6f,  // 21: Las Vegas
    33.7f,  // 22: Qatar
    26.3f,  // 23: Abu Dhabi
    32.1f   // 24: Portugal
};

// Default wing change penalty if track not recognized
const float DEFAULT_WING_CHANGE_PENALTY = 5.0f;

// Default pit delta if track not recognized
const float DEFAULT_PIT_DELTA = 22.0f;

struct StrategyStopDetail {
    float target_lap;
    float window_open;
    float window_close;
    uint8_t compound_visual;
    float expected_stint_length;
};

struct StrategyPlanOption {
    char label[16];
    uint8_t total_stops;
    uint8_t stops_completed;
    uint8_t risk_rating;
    float projected_total_time;
    float delta_vs_best;
    float confidence;
    StrategyStopDetail stops[3];
    uint8_t stop_count;
    uint8_t cheap_pit_opportunity; // 1 if safety car makes this stop cheap
};

struct PitStrategyResult {
    float base_pit_delta;           // Track-specific pit time
    float wing_change_penalty;      // +5s if wing damaged
    float tire_advantage;           // Time gained from fresh tires over stint
    float fuel_advantage;           // Time saved from lighter fuel
    float net_pit_delta;            // Final calculation (can be negative = advantageous)
    bool is_advantageous;           // Should we pit now?
    int laps_to_break_even;         // How many laps to recover pit loss
    StrategyPlanOption plan_primary;
    StrategyPlanOption plan_alternative;
    StrategyPlanOption plan_third;
    uint8_t plan_count;
    uint8_t cheap_pit_available;    // overall cheap stop recommendation (e.g. safety car)
};

/**
 * Calculate pit strategy for current race situation
 */
PitStrategyResult calculatePitStrategy(
    int8_t track_id,
    uint8_t current_lap,
    uint8_t total_laps,
    float current_fuel,
    uint8_t tire_age,
    float front_wing_damage_max,  // Max of left/right wing damage
    float current_pace,           // Current lap time
    float optimal_pace,           // Best lap time
    uint8_t current_compound_visual,
    float tyre_degradation_rate,
    float tyre_life_remaining_laps,
    uint8_t current_stint_age,
    float fuel_margin_laps,
    uint8_t pit_stops_completed,
    float last_pit_lap,
    uint8_t safety_car_status,
    float max_tyre_wear
);

/**
 * Get pit delta time for specific track
 */
float getPitDeltaForTrack(int8_t track_id);

/**
 * Calculate tire degradation rate based on age and pace
 */
float calculateTireDegradation(uint8_t tire_age, float current_pace, float optimal_pace);

} // namespace PitStrategy
