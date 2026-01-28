"""
Overtake Advisor - Assesses overtaking opportunities
Uses logistic-style scoring with multiple factors
"""

from dataclasses import dataclass
from typing import Optional
import logging

logger = logging.getLogger(__name__)


@dataclass
class OvertakePrediction:
    """Overtake assessment output"""
    probability: float  # 0-100%
    best_opportunity: str  # Description of best overtake spot
    risk: str  # low, medium, high
    recommendation: str  # go, wait, defend
    target_driver: Optional[str]
    factors: dict  # Breakdown of factors affecting probability
    confidence: float


class OvertakeAdvisor:
    """
    Overtake opportunity assessment.

    Factors considered:
    - Gap to car ahead (DRS range)
    - Tire age differential
    - DRS availability
    - Track position (approaching DRS zones)
    - Historical success rate
    """

    # DRS activation range (seconds)
    DRS_RANGE = 1.0

    # Base probabilities by gap
    GAP_PROBABILITIES = {
        0.3: 0.7,   # Very close
        0.5: 0.55,  # Close
        0.7: 0.4,   # Within range
        1.0: 0.25,  # At DRS limit
        1.5: 0.1,   # Outside DRS
        2.0: 0.05,  # Far
    }

    # Tire age advantage multipliers
    TIRE_ADVANTAGE = {
        -10: 1.4,   # 10 laps fresher
        -5: 1.25,   # 5 laps fresher
        -2: 1.1,    # 2 laps fresher
        0: 1.0,     # Equal
        2: 0.9,     # 2 laps older
        5: 0.75,    # 5 laps older
        10: 0.6,    # 10 laps older
    }

    def __init__(self):
        self.reset()

    def reset(self):
        """Reset for new session"""
        self.overtake_attempts = 0
        self.successful_overtakes = 0
        self.historical_success_rate = 0.5  # Default 50%

    def record_overtake(self, success: bool):
        """Record an overtake attempt"""
        self.overtake_attempts += 1
        if success:
            self.successful_overtakes += 1

        if self.overtake_attempts > 0:
            self.historical_success_rate = (
                self.successful_overtakes / self.overtake_attempts
            )

    def predict(self, telemetry, pace_prediction=None) -> OvertakePrediction:
        """
        Assess overtake opportunity.

        Args:
            telemetry: AdaptedTelemetry object
            pace_prediction: Optional PacePrediction for pace delta

        Returns:
            OvertakePrediction with probability and recommendation
        """
        factors = {}

        # Base probability from gap
        gap = telemetry.gap_ahead
        if gap is None or gap <= 0:
            return self._no_opportunity("No car ahead detected")

        base_prob = self._gap_probability(gap)
        factors["gap_factor"] = base_prob

        # DRS factor
        drs_factor = 1.3 if telemetry.drs_available else 0.8
        if gap <= self.DRS_RANGE:
            drs_factor *= 1.2  # In DRS range
        factors["drs_factor"] = drs_factor

        # Tire advantage factor
        tire_factor = 1.0
        if telemetry.tire_delta_ahead is not None:
            tire_factor = self._tire_factor(telemetry.tire_delta_ahead)
        factors["tire_factor"] = tire_factor

        # Pace factor (if we have pace predictions)
        pace_factor = 1.0
        if pace_prediction and pace_prediction.trend == "improving":
            pace_factor = 1.15
        elif pace_prediction and pace_prediction.trend == "degrading":
            pace_factor = 0.85
        factors["pace_factor"] = pace_factor

        # Weather factor
        weather_factor = 1.0
        if telemetry.weather in ["wet", "rain"]:
            weather_factor = 1.2  # More overtaking in wet
        factors["weather_factor"] = weather_factor

        # Calculate final probability
        probability = base_prob * drs_factor * tire_factor * pace_factor * weather_factor
        probability = min(95, max(5, probability * 100))  # Clamp 5-95%

        # Determine risk level
        risk = self._assess_risk(probability, gap, telemetry.flag_status)

        # Generate recommendation
        recommendation, opportunity = self._generate_recommendation(
            probability, gap, telemetry.drs_available, risk
        )

        # Calculate confidence
        confidence = self._calculate_confidence(gap, telemetry.tire_delta_ahead)

        return OvertakePrediction(
            probability=round(probability, 1),
            best_opportunity=opportunity,
            risk=risk,
            recommendation=recommendation,
            target_driver=None,  # Would need opponent name from telemetry
            factors=factors,
            confidence=confidence,
        )

    def _gap_probability(self, gap: float) -> float:
        """Get base probability from gap"""
        sorted_gaps = sorted(self.GAP_PROBABILITIES.keys())

        # Find the two nearest gap values
        for i, g in enumerate(sorted_gaps):
            if gap <= g:
                if i == 0:
                    return self.GAP_PROBABILITIES[g]
                # Linear interpolation
                prev_g = sorted_gaps[i - 1]
                prev_p = self.GAP_PROBABILITIES[prev_g]
                curr_p = self.GAP_PROBABILITIES[g]
                ratio = (gap - prev_g) / (g - prev_g)
                return prev_p + ratio * (curr_p - prev_p)

        return 0.05  # Very far

    def _tire_factor(self, tire_delta: int) -> float:
        """Get tire advantage multiplier"""
        sorted_deltas = sorted(self.TIRE_ADVANTAGE.keys())

        for i, d in enumerate(sorted_deltas):
            if tire_delta <= d:
                if i == 0:
                    return self.TIRE_ADVANTAGE[d]
                prev_d = sorted_deltas[i - 1]
                prev_f = self.TIRE_ADVANTAGE[prev_d]
                curr_f = self.TIRE_ADVANTAGE[d]
                ratio = (tire_delta - prev_d) / (d - prev_d)
                return prev_f + ratio * (curr_f - prev_f)

        return 0.5  # Much older tires

    def _assess_risk(self, probability: float, gap: float, flag: str) -> str:
        """Assess risk level of overtake attempt"""
        if flag in ["yellow", "sc", "vsc"]:
            return "high"  # No overtaking under yellow

        if probability > 70 and gap < 0.5:
            return "low"
        elif probability > 50 and gap < 0.8:
            return "medium"
        else:
            return "high"

    def _generate_recommendation(
        self, probability: float, gap: float, drs: bool, risk: str
    ) -> tuple[str, str]:
        """Generate recommendation and best opportunity description"""
        if risk == "high" and probability < 50:
            recommendation = "wait"
            opportunity = "Not recommended - maintain position and wait for better chance"
        elif probability > 65 and risk != "high":
            recommendation = "go"
            if drs and gap < self.DRS_RANGE:
                opportunity = "Strong opportunity with DRS - commit to the move"
            else:
                opportunity = "Good opportunity - look for braking zone or exit"
        elif probability > 45:
            recommendation = "wait"
            opportunity = "Marginal opportunity - stay close and wait for mistake"
        else:
            recommendation = "defend"
            opportunity = "Low probability - focus on maintaining gap"

        return recommendation, opportunity

    def _calculate_confidence(
        self, gap: Optional[float], tire_delta: Optional[int]
    ) -> float:
        """Calculate prediction confidence"""
        confidence = 0.5  # Base

        # Better confidence with accurate gap data
        if gap is not None and gap > 0:
            confidence += 0.2

        # Better confidence with tire data
        if tire_delta is not None:
            confidence += 0.15

        # Cap at 0.85 (never fully confident about overtakes)
        return min(0.85, confidence)

    def _no_opportunity(self, reason: str) -> OvertakePrediction:
        """Return prediction when no opportunity exists"""
        return OvertakePrediction(
            probability=0,
            best_opportunity=reason,
            risk="low",
            recommendation="wait",
            target_driver=None,
            factors={},
            confidence=0.5,
        )
