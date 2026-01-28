#include "../../include/telemetry/pit_strategy_calculator.h"
#include <algorithm>
#include <cmath>
#include <cstring>
#include <cstdio>
#include <limits>
#include <vector>

namespace PitStrategy {
namespace {
struct CompoundProfile {
    uint8_t visual_id;
    float base_offset;   // baseline pace delta vs soft (seconds)
    float degrade_rate;  // per-lap degradation in seconds
};

constexpr CompoundProfile SOFT_PROFILE{16, 0.0f, 0.090f};
constexpr CompoundProfile MEDIUM_PROFILE{17, 0.35f, 0.060f};
constexpr CompoundProfile HARD_PROFILE{18, 0.65f, 0.045f};

const CompoundProfile& getCompoundProfile(uint8_t visual_id) {
    switch (visual_id) {
        case 16:
        case 12:
        case 9:
            return SOFT_PROFILE;
        case 17:
        case 13:
            return MEDIUM_PROFILE;
        case 18:
        case 14:
            return HARD_PROFILE;
        default:
            return MEDIUM_PROFILE;
    }
}

uint8_t pickCompoundForStint(uint8_t laps) {
    if (laps <= 10) return SOFT_PROFILE.visual_id;
    if (laps <= 22) return MEDIUM_PROFILE.visual_id;
    return HARD_PROFILE.visual_id;
}

float computeStintTime(float base_lap_time, float degrade_rate, uint8_t laps) {
    if (laps == 0) return 0.0f;
    const float laps_f = static_cast<float>(laps);
    return (base_lap_time * laps_f) + (degrade_rate * (laps_f - 1.0f) * laps_f * 0.5f);
}

void initPlan(StrategyPlanOption& plan, const char* label) {
    std::memset(&plan, 0, sizeof(StrategyPlanOption));
    if (label && label[0] != '\0') {
        std::snprintf(plan.label, sizeof(plan.label), "%s", label);
    }
}

float estimateCurrentDegradePerLap(float tyre_degradation_rate, uint8_t current_stint_age) {
    if (tyre_degradation_rate <= 0.0f) {
        return 0.05f;
    }
    float age = static_cast<float>(std::max<uint8_t>(1, current_stint_age));
    float per_lap = tyre_degradation_rate / age;
    return std::clamp(per_lap, 0.03f, 0.18f);
}

uint8_t clampPitLap(uint8_t current_lap, uint8_t total_laps, int laps_until_stop) {
    int raw = static_cast<int>(current_lap) + std::max(0, laps_until_stop);
    raw = std::clamp(raw, static_cast<int>(current_lap), static_cast<int>(total_laps));
    return static_cast<uint8_t>(raw);
}
} // namespace

float getPitDeltaForTrack(int8_t track_id) {
    if (track_id >= 0 && track_id < 25) {
        return PIT_DELTA_F1_24[track_id];
    }
    return DEFAULT_PIT_DELTA;
}

float getWingPenaltyForTrack(int8_t track_id) {
    if (track_id >= 0 && track_id < 25) {
        return std::max(0.0f, PIT_DELTA_WING_F1_24[track_id] - PIT_DELTA_F1_24[track_id]);
    }
    return DEFAULT_WING_CHANGE_PENALTY;
}

float calculateTireDegradation(uint8_t tire_age, float current_pace, float optimal_pace) {
    if (optimal_pace <= 0 || current_pace <= 0) {
        if (tire_age > 20) return 2.0f;
        if (tire_age > 15) return 1.5f;
        if (tire_age > 10) return 1.0f;
        if (tire_age > 5)  return 0.5f;
        return 0.2f;
    }

    float pace_loss = current_pace - optimal_pace;
    float pace_based_deg = pace_loss / std::max(1.0f, static_cast<float>(tire_age));

    float age_factor = 1.0f;
    if (tire_age > 15) age_factor = 2.0f;
    else if (tire_age > 10) age_factor = 1.5f;
    else if (tire_age > 5)  age_factor = 1.2f;

    return std::max(0.1f, pace_based_deg * age_factor);
}

PitStrategyResult calculatePitStrategy(
    int8_t track_id,
    uint8_t current_lap,
    uint8_t total_laps,
    float current_fuel,
    uint8_t tire_age,
    float front_wing_damage_max,
    float current_pace,
    float optimal_pace,
    uint8_t current_compound_visual,
    float tyre_degradation_rate,
    float tyre_life_remaining_laps,
    uint8_t current_stint_age,
    float fuel_margin_laps,
    uint8_t pit_stops_completed,
    float last_pit_lap,
    uint8_t safety_car_status,
    float max_tyre_wear
) {
    PitStrategyResult result;
    initPlan(result.plan_primary, "Plan A");
    initPlan(result.plan_alternative, "Plan B");
    initPlan(result.plan_third, "Plan C");
    result.plan_count = 0;
    result.cheap_pit_available = 0;

    result.base_pit_delta = getPitDeltaForTrack(track_id);
    result.wing_change_penalty = (front_wing_damage_max > 80.0f) ? getWingPenaltyForTrack(track_id) : 0.0f;
    const float pit_loss = result.base_pit_delta + result.wing_change_penalty;

    const int laps_to_go = static_cast<int>(total_laps) - static_cast<int>(current_lap);
    if (laps_to_go <= 0) {
        result.tire_advantage = 0.0f;
        result.fuel_advantage = 0.0f;
        result.net_pit_delta = pit_loss;
        result.is_advantageous = false;
        result.laps_to_break_even = 999;
        return result;
    }

    const float base_lap_time = (optimal_pace > 0.0f)
        ? optimal_pace
        : (current_pace > 0.0f ? current_pace : 90.0f);

    const CompoundProfile& current_profile = getCompoundProfile(current_compound_visual);

    const float degrade_from_history = estimateCurrentDegradePerLap(tyre_degradation_rate, current_stint_age);
    const float degrade_from_pace = calculateTireDegradation(tire_age, current_pace, optimal_pace);
    float degrade_per_lap = std::max(degrade_from_history, degrade_from_pace);
    if (max_tyre_wear > 75.0f) {
        degrade_per_lap += 0.02f * ((max_tyre_wear - 75.0f) / 10.0f);
    }
    degrade_per_lap = std::clamp(degrade_per_lap, 0.04f, 0.22f);

    float effective_life_remaining = tyre_life_remaining_laps;
    if (effective_life_remaining > 200.0f) {
        if (max_tyre_wear > 0.0f && current_stint_age > 0) {
            float wear_rate = max_tyre_wear / std::max(1.0f, static_cast<float>(current_stint_age));
            if (wear_rate > 0.1f) {
                effective_life_remaining = std::max(3.0f, (100.0f - max_tyre_wear) / wear_rate);
            }
        }
        if (effective_life_remaining > 200.0f) {
            effective_life_remaining = static_cast<float>(laps_to_go);
        }
    }
    effective_life_remaining = std::clamp(effective_life_remaining, 3.0f, static_cast<float>(laps_to_go));

    const float laps_for_advantage = std::min(static_cast<float>(laps_to_go), effective_life_remaining);
    result.tire_advantage = std::max(0.0f, degrade_per_lap * laps_for_advantage);

    const float fuel_weight_effect = 0.028f;
    const float avg_fuel_saving = std::clamp(current_fuel * 0.45f, 0.0f, 9.0f);
    result.fuel_advantage = std::min(6.0f, avg_fuel_saving * fuel_weight_effect);

    result.net_pit_delta = pit_loss - (result.tire_advantage + result.fuel_advantage);
    result.is_advantageous = (result.net_pit_delta <= -0.5f) || (max_tyre_wear >= 80.0f);
    if (degrade_per_lap > 0.01f) {
        result.laps_to_break_even = static_cast<int>(std::ceil(pit_loss / degrade_per_lap));
    } else {
        result.laps_to_break_even = 999;
    }

    struct PlanCandidate {
        StrategyPlanOption plan;
        float total_time;
        bool valid;
        uint8_t type;
    };

    enum PlanType : uint8_t {
        StayOut = 0,
        OneStopBalanced,
        OneStopStretch,
        TwoStopBalanced,
        TwoStopAggressive
    };

    auto initCandidate = [&](PlanType type, const char* label) -> PlanCandidate {
        PlanCandidate candidate{};
        initPlan(candidate.plan, label);
        candidate.total_time = std::numeric_limits<float>::infinity();
        candidate.valid = false;
        candidate.type = static_cast<uint8_t>(type);
        candidate.plan.stops_completed = pit_stops_completed;
        candidate.plan.total_stops = pit_stops_completed;
        candidate.plan.stop_count = 0;
        candidate.plan.cheap_pit_opportunity = 0;
        candidate.plan.confidence = 60.0f;
        candidate.plan.risk_rating = 0;
        return candidate;
    };

    auto fillStopDetail = [&](StrategyPlanOption& plan,
                              uint8_t index,
                              float target_lap,
                              uint8_t compound_visual,
                              float window_radius,
                              float stint_length) {
        if (index >= 3) {
            return;
        }
        StrategyStopDetail& detail = plan.stops[index];
        detail.target_lap = target_lap;
        detail.window_open = std::max(target_lap - window_radius, static_cast<float>(current_lap + 1));
        detail.window_close = std::min(target_lap + window_radius, static_cast<float>(total_laps - 1));
        if (detail.window_open > detail.window_close) {
            detail.window_open = detail.window_close;
        }
        detail.compound_visual = compound_visual;
        detail.expected_stint_length = stint_length;
        plan.stop_count = std::max<uint8_t>(plan.stop_count, static_cast<uint8_t>(index + 1));
    };

    const uint8_t laps_remaining = static_cast<uint8_t>(std::max(0, laps_to_go));
    const float stay_out_time = computeStintTime(base_lap_time + current_profile.base_offset,
                                                 degrade_per_lap,
                                                 laps_remaining);

    std::vector<PlanCandidate> candidates;
    candidates.reserve(5);

    // Stay-out / hold candidate
    {
        auto candidate = initCandidate(StayOut, "Hold");
        candidate.valid = true;
        candidate.total_time = stay_out_time;
        candidate.plan.risk_rating = (max_tyre_wear >= 80.0f) ? 3 : (max_tyre_wear >= 70.0f ? 2 : 1);
        candidate.plan.confidence = (degrade_per_lap < 0.07f) ? 80.0f : 65.0f;
        candidates.push_back(candidate);
    }

    auto buildOneStop = [&](bool stretch) {
        auto candidate = initCandidate(stretch ? OneStopStretch : OneStopBalanced,
                                       stretch ? "Plan One (Stretch)" : "Plan One");
        if (laps_remaining < 4) {
            return candidate;
        }

        float base_segment = std::clamp(std::round(effective_life_remaining),
                                        4.0f,
                                        static_cast<float>(laps_remaining - 2));
        uint8_t seg1 = static_cast<uint8_t>(base_segment);
        if (stretch) {
            seg1 = static_cast<uint8_t>(std::min<float>(base_segment + 2.0f, laps_remaining - 2.0f));
        } else if (fuel_margin_laps < -0.3f) {
            seg1 = static_cast<uint8_t>(std::max<float>(4.0f, base_segment * 0.7f));
        } else if (!stretch && last_pit_lap > 0.0f && (static_cast<float>(current_lap) - last_pit_lap) < 5.0f) {
            seg1 = static_cast<uint8_t>(std::max<float>(3.0f, base_segment + 1.0f));
        }
        seg1 = std::clamp<uint8_t>(seg1, 3, static_cast<uint8_t>(std::max<int>(3, laps_remaining - 2)));

        if (seg1 >= laps_remaining) {
            return candidate;
        }

        uint8_t seg2 = static_cast<uint8_t>(std::max<int>(3, laps_remaining - seg1));
        uint8_t compound2_id = pickCompoundForStint(seg2);
        const CompoundProfile& profile2 = getCompoundProfile(compound2_id);

        float total_time = computeStintTime(base_lap_time + current_profile.base_offset,
                                            degrade_per_lap,
                                            seg1);
        total_time += pit_loss;
        total_time += computeStintTime(base_lap_time + profile2.base_offset,
                                       profile2.degrade_rate,
                                       seg2);

        candidate.total_time = total_time;
        candidate.valid = std::isfinite(total_time);
        candidate.plan.total_stops = pit_stops_completed + 1;
        candidate.plan.risk_rating = stretch ? 0 : 1;
        candidate.plan.confidence = (degrade_per_lap > 0.08f ? 83.0f : 74.0f);
        candidate.plan.stop_count = 0;

        float target_lap = static_cast<float>(clampPitLap(current_lap, total_laps, seg1 - 1));
        fillStopDetail(candidate.plan, 0, target_lap, compound2_id, 1.5f, static_cast<float>(seg2));

        if (safety_car_status > 0 && (target_lap - current_lap) <= 2.5f) {
            candidate.plan.cheap_pit_opportunity = 1;
        }
        return candidate;
    };

    auto buildTwoStop = [&](bool aggressive) {
        auto candidate = initCandidate(aggressive ? TwoStopAggressive : TwoStopBalanced,
                                       aggressive ? "Plan Two (Attack)" : "Plan Two");
        if (laps_remaining <= 10) {
            return candidate;
        }

        uint8_t seg1 = static_cast<uint8_t>(std::clamp(
            std::round(effective_life_remaining * (aggressive ? 0.6f : 0.8f)),
            3.0f,
            static_cast<float>(laps_remaining - 6)));
        if (aggressive) {
            seg1 = static_cast<uint8_t>(std::max<int>(3, seg1 - 2));
        }
        uint8_t remaining_after_seg1 = (seg1 < laps_remaining)
            ? static_cast<uint8_t>(laps_remaining - seg1)
            : 0;
        if (remaining_after_seg1 < 6) {
            return candidate;
        }

        uint8_t seg2 = static_cast<uint8_t>(std::max<int>(4, aggressive ? remaining_after_seg1 / 3 : remaining_after_seg1 / 2));
        if (seg2 >= remaining_after_seg1) {
            seg2 = static_cast<uint8_t>(std::max<int>(4, remaining_after_seg1 - 4));
        }
        uint8_t seg3 = static_cast<uint8_t>(std::max<int>(3, remaining_after_seg1 - seg2));
        if (seg3 < 3) {
            return candidate;
        }

        uint8_t compound2_id = pickCompoundForStint(seg2);
        uint8_t compound3_id = pickCompoundForStint(seg3);
        const CompoundProfile& profile2 = getCompoundProfile(compound2_id);
        const CompoundProfile& profile3 = getCompoundProfile(compound3_id);

        float total_time = 0.0f;
        total_time += computeStintTime(base_lap_time + current_profile.base_offset,
                                       degrade_per_lap,
                                       seg1);
        total_time += pit_loss;
        total_time += computeStintTime(base_lap_time + profile2.base_offset,
                                       profile2.degrade_rate,
                                       seg2);
        total_time += pit_loss;
        total_time += computeStintTime(base_lap_time + profile3.base_offset,
                                       profile3.degrade_rate,
                                       seg3);

        candidate.total_time = total_time;
        candidate.valid = std::isfinite(total_time);
        candidate.plan.total_stops = pit_stops_completed + 2;
        candidate.plan.risk_rating = aggressive ? 3 : 2;
        candidate.plan.confidence = aggressive ? 69.0f : 73.0f;
        candidate.plan.stop_count = 0;

        float first_target = static_cast<float>(clampPitLap(current_lap, total_laps, seg1 - 1));
        float second_target = static_cast<float>(clampPitLap(static_cast<uint8_t>(first_target), total_laps, seg2));

        fillStopDetail(candidate.plan, 0, first_target, compound2_id, aggressive ? 1.0f : 1.5f, static_cast<float>(seg2));
        fillStopDetail(candidate.plan, 1, second_target, compound3_id, 1.5f, static_cast<float>(seg3));

        if (safety_car_status > 0 && (first_target - current_lap) <= 2.5f) {
            candidate.plan.cheap_pit_opportunity = 1;
        }

        return candidate;
    };

    candidates.push_back(buildOneStop(false));
    candidates.push_back(buildOneStop(true));
    candidates.push_back(buildTwoStop(false));
    candidates.push_back(buildTwoStop(true));

    candidates.erase(
        std::remove_if(
            candidates.begin(),
            candidates.end(),
            [](const PlanCandidate& candidate) {
                return !candidate.valid || !std::isfinite(candidate.total_time);
            }),
        candidates.end());

    if (candidates.empty()) {
        auto fallback = initCandidate(StayOut, "Hold");
        fallback.valid = true;
        fallback.total_time = stay_out_time;
        candidates.push_back(fallback);
    }

    std::sort(
        candidates.begin(),
        candidates.end(),
        [](const PlanCandidate& lhs, const PlanCandidate& rhs) {
            return lhs.total_time < rhs.total_time;
        });

    const float best_time = candidates.front().total_time;

    auto assignPlan = [&](StrategyPlanOption& destination, const PlanCandidate& candidate, const char* label) {
        destination = candidate.plan;
        std::snprintf(destination.label, sizeof(destination.label), "%s", label);
        destination.projected_total_time = candidate.total_time;
        destination.delta_vs_best = candidate.total_time - best_time;
        destination.stop_count = std::min<uint8_t>(destination.stop_count, static_cast<uint8_t>(3));
    };

    const size_t plan_slots = std::min<size_t>(3, candidates.size());
    result.plan_count = static_cast<uint8_t>(plan_slots);

    if (plan_slots >= 1) {
        assignPlan(result.plan_primary, candidates[0], "Plan A");
    }
    if (plan_slots >= 2) {
        assignPlan(result.plan_alternative, candidates[1], "Plan B");
    }
    if (plan_slots >= 3) {
        assignPlan(result.plan_third, candidates[2], "Plan C");
    }

    bool cheap_available = false;
    auto checkCheap = [&](const StrategyPlanOption& plan) {
        if (plan.stop_count > 0 && plan.cheap_pit_opportunity) {
            cheap_available = true;
        }
    };

    if (plan_slots >= 1) checkCheap(result.plan_primary);
    if (plan_slots >= 2) checkCheap(result.plan_alternative);
    if (plan_slots >= 3) checkCheap(result.plan_third);
    result.cheap_pit_available = cheap_available ? 1 : 0;

    return result;
}

} // namespace PitStrategy
