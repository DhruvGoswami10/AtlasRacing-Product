"""
Tire Degradation Model - Predicts tire life and degradation curve
Uses polynomial regression with online learning, upgradeable to LSTM
"""

import math
from dataclasses import dataclass, field
from typing import Optional
import logging

logger = logging.getLogger(__name__)


@dataclass
class TirePrediction:
    """Tire degradation prediction output"""
    remaining_laps: int
    cliff_lap: int  # Lap when performance drops significantly
    confidence: float  # 0-1
    degradation_curve: list[float]  # Predicted wear % for next N laps
    degradation_rate: float  # % wear per lap
    current_performance: float  # 0-1, current tire grip level
    wear_status: str  # healthy, caution, critical


@dataclass
class LapSample:
    """Single lap data point for learning"""
    lap: int
    tire_age: int
    tire_wear: list[float]  # [FL, FR, RL, RR]
    lap_time: Optional[float]
    compound: str


class TireDegradationModel:
    """
    Tire degradation prediction with online learning.

    Starts with generic compound curves and adapts to actual conditions
    during the session.
    """

    # Default degradation rates per compound (% per lap)
    DEFAULT_DEGRADATION = {
        "soft": 3.5,
        "medium": 2.2,
        "hard": 1.5,
        "inter": 2.8,
        "wet": 2.0,
    }

    # Default cliff points (wear % where performance drops significantly)
    DEFAULT_CLIFF = {
        "soft": 65,
        "medium": 75,
        "hard": 85,
        "inter": 70,
        "wet": 75,
    }

    # Laps needed for model to be considered calibrated
    CALIBRATION_LAPS = 5

    def __init__(self):
        self.reset()

    def reset(self):
        """Reset model for new session"""
        self.samples: list[LapSample] = []
        self.learned_degradation: dict[str, float] = {}
        self.learned_cliff: dict[str, float] = {}
        self.is_calibrated = False
        self.learning_progress = 0.0
        self._last_prediction: Optional[TirePrediction] = None

    @property
    def sample_count(self) -> int:
        return len(self.samples)

    def add_sample(self, sample: LapSample):
        """Add a lap sample and update model"""
        self.samples.append(sample)
        self._update_learning()

    def _update_learning(self):
        """Update learned parameters from samples"""
        if len(self.samples) < 2:
            return

        # Group samples by compound
        by_compound: dict[str, list[LapSample]] = {}
        for sample in self.samples:
            compound = sample.compound.lower()
            if compound not in by_compound:
                by_compound[compound] = []
            by_compound[compound].append(sample)

        # Learn degradation rate for each compound with enough data
        for compound, samples in by_compound.items():
            if len(samples) >= 2:
                # Calculate average wear rate between consecutive samples
                wear_rates = []
                for i in range(1, len(samples)):
                    prev = samples[i - 1]
                    curr = samples[i]

                    # Use max wear across all tires
                    prev_wear = max(prev.tire_wear)
                    curr_wear = max(curr.tire_wear)

                    if curr.tire_age > prev.tire_age:
                        rate = (curr_wear - prev_wear) / (curr.tire_age - prev.tire_age)
                        if rate > 0:  # Only positive wear rates
                            wear_rates.append(rate)

                if wear_rates:
                    # Use exponential moving average for smooth learning
                    avg_rate = sum(wear_rates) / len(wear_rates)

                    if compound in self.learned_degradation:
                        # Blend with existing (EMA)
                        alpha = 0.3
                        self.learned_degradation[compound] = (
                            alpha * avg_rate + (1 - alpha) * self.learned_degradation[compound]
                        )
                    else:
                        self.learned_degradation[compound] = avg_rate

        # Update learning progress
        self.learning_progress = min(1.0, len(self.samples) / self.CALIBRATION_LAPS)
        self.is_calibrated = self.learning_progress >= 1.0

    def predict(self, telemetry) -> TirePrediction:
        """
        Predict tire degradation from current telemetry.

        Args:
            telemetry: AdaptedTelemetry object

        Returns:
            TirePrediction with remaining life, cliff point, and confidence
        """
        compound = telemetry.tire_compound.lower()
        current_wear = max(telemetry.tire_wear_normalized) * 100  # Convert to %
        tire_age = telemetry.tire_age
        laps_remaining_in_race = max(1, telemetry.laps_remaining)

        # Get degradation rate (learned or default)
        deg_rate = self.learned_degradation.get(
            compound, self.DEFAULT_DEGRADATION.get(compound, 2.5)
        )

        # Get cliff point (learned or default)
        cliff_point = self.learned_cliff.get(
            compound, self.DEFAULT_CLIFF.get(compound, 75)
        )

        # Calculate remaining laps before cliff
        wear_to_cliff = cliff_point - current_wear
        if deg_rate > 0:
            laps_to_cliff = max(0, int(wear_to_cliff / deg_rate))
        else:
            laps_to_cliff = laps_remaining_in_race

        # Calculate remaining laps before tires are done (90% wear)
        wear_to_done = 90 - current_wear
        if deg_rate > 0:
            remaining_laps = max(0, int(wear_to_done / deg_rate))
        else:
            remaining_laps = laps_remaining_in_race

        # Cap predictions at race remaining laps (can't have more tire life than race left)
        remaining_laps = min(remaining_laps, laps_remaining_in_race)
        laps_to_cliff = min(laps_to_cliff, laps_remaining_in_race)

        # Generate degradation curve for next 20 laps
        degradation_curve = []
        projected_wear = current_wear
        for i in range(20):
            projected_wear += deg_rate
            degradation_curve.append(min(100, projected_wear))

        # Calculate current performance (inverse of wear, with cliff effect)
        if current_wear < cliff_point:
            # Linear degradation before cliff
            performance = 1.0 - (current_wear / 100) * 0.3
        else:
            # Accelerated degradation after cliff
            base_perf = 1.0 - (cliff_point / 100) * 0.3
            cliff_penalty = ((current_wear - cliff_point) / 100) * 0.7
            performance = max(0.1, base_perf - cliff_penalty)

        # Determine wear status
        if current_wear < cliff_point - 15:
            wear_status = "healthy"
        elif current_wear < cliff_point:
            wear_status = "caution"
        else:
            wear_status = "critical"

        # Calculate confidence based on learning progress
        base_confidence = 0.5  # Default confidence
        if self.is_calibrated:
            base_confidence = 0.85
        elif self.learning_progress > 0:
            base_confidence = 0.5 + 0.35 * self.learning_progress

        # Adjust confidence based on data quality
        confidence = base_confidence

        # Record sample for learning
        self.add_sample(LapSample(
            lap=telemetry.current_lap,
            tire_age=tire_age,
            tire_wear=[w * 100 for w in telemetry.tire_wear_normalized],
            lap_time=telemetry.last_lap_time,
            compound=compound,
        ))

        prediction = TirePrediction(
            remaining_laps=remaining_laps,
            cliff_lap=telemetry.current_lap + laps_to_cliff,
            confidence=confidence,
            degradation_curve=degradation_curve,
            degradation_rate=deg_rate,
            current_performance=performance,
            wear_status=wear_status,
        )

        self._last_prediction = prediction
        return prediction

    def get_learning_status(self) -> dict:
        """Get current learning status for display"""
        return {
            "progress": self.learning_progress,
            "is_calibrated": self.is_calibrated,
            "samples": len(self.samples),
            "required_samples": self.CALIBRATION_LAPS,
            "learned_compounds": list(self.learned_degradation.keys()),
            "message": self._get_learning_message(),
        }

    def _get_learning_message(self) -> str:
        """Generate human-readable learning status"""
        if self.is_calibrated:
            return "Model calibrated to track conditions"
        elif self.learning_progress > 0.5:
            remaining = self.CALIBRATION_LAPS - len(self.samples)
            return f"Learning... {remaining} more laps needed"
        elif self.learning_progress > 0:
            return "Gathering initial data..."
        else:
            return "Waiting for telemetry data"
