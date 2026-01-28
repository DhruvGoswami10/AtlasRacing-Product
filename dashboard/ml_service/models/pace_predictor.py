"""
Pace Predictor - Predicts lap times and pace trends
Uses rolling average with fuel and tire adjustments
"""

from dataclasses import dataclass
from typing import Optional
from collections import deque
import logging

logger = logging.getLogger(__name__)


@dataclass
class PacePrediction:
    """Pace prediction output"""
    predicted_lap_times: list[float]  # Next 5 predicted lap times
    trend: str  # improving, stable, degrading
    trend_delta: float  # seconds per lap change
    optimal_pace: float  # Best achievable pace on current tires
    current_pace: float  # Current rolling average
    pace_delta: float  # Difference from optimal (positive = slower)
    confidence: float


@dataclass
class LapTimeRecord:
    """Single lap time record"""
    lap: int
    lap_time: float
    tire_age: int
    fuel_load: float
    tire_wear: float


class PacePredictor:
    """
    Lap time prediction with fuel and tire adjustments.

    Models:
    - Fuel effect: ~0.035s per kg of fuel
    - Tire degradation: Learned from TireDegradationModel
    - Track evolution: Slight improvement over session
    """

    # Fuel effect (seconds per kg)
    FUEL_EFFECT = 0.035

    # Rolling window for pace calculation
    ROLLING_WINDOW = 5

    # Minimum laps for trend calculation
    MIN_LAPS_FOR_TREND = 3

    def __init__(self):
        self.reset()

    def reset(self):
        """Reset for new session"""
        self.lap_times: deque[LapTimeRecord] = deque(maxlen=50)
        self.best_lap_time: Optional[float] = None
        self.fuel_corrected_best: Optional[float] = None
        self.sample_count = 0

    def add_lap(self, record: LapTimeRecord):
        """Add a lap time record"""
        self.lap_times.append(record)
        self.sample_count += 1

        # Update best lap time
        if self.best_lap_time is None or record.lap_time < self.best_lap_time:
            self.best_lap_time = record.lap_time

    def predict(self, telemetry, tire_prediction=None) -> PacePrediction:
        """
        Predict pace from current telemetry.

        Args:
            telemetry: AdaptedTelemetry object
            tire_prediction: Optional TirePrediction for degradation info

        Returns:
            PacePrediction with predicted times and trend
        """
        # Record current lap if we have a valid lap time
        if telemetry.last_lap_time and telemetry.last_lap_time > 0:
            self.add_lap(LapTimeRecord(
                lap=telemetry.current_lap - 1,
                lap_time=telemetry.last_lap_time,
                tire_age=max(0, telemetry.tire_age - 1),
                fuel_load=telemetry.fuel_remaining + (telemetry.fuel_per_lap or 0),
                tire_wear=max(telemetry.tire_wear_normalized),
            ))

        # Calculate current pace (rolling average)
        if len(self.lap_times) == 0:
            current_pace = telemetry.best_lap_time or 90.0
        else:
            recent = list(self.lap_times)[-self.ROLLING_WINDOW:]
            current_pace = sum(r.lap_time for r in recent) / len(recent)

        # Calculate trend
        trend, trend_delta = self._calculate_trend()

        # Calculate optimal pace (fuel-corrected best)
        optimal_pace = self._calculate_optimal_pace(telemetry)

        # Predict next 5 lap times
        predicted = self._predict_future_laps(
            telemetry, current_pace, trend_delta, tire_prediction
        )

        # Calculate confidence
        confidence = self._calculate_confidence()

        return PacePrediction(
            predicted_lap_times=predicted,
            trend=trend,
            trend_delta=trend_delta,
            optimal_pace=optimal_pace,
            current_pace=current_pace,
            pace_delta=current_pace - optimal_pace,
            confidence=confidence,
        )

    def _calculate_trend(self) -> tuple[str, float]:
        """Calculate pace trend from recent laps"""
        if len(self.lap_times) < self.MIN_LAPS_FOR_TREND:
            return "stable", 0.0

        recent = list(self.lap_times)[-self.ROLLING_WINDOW:]

        # Simple linear regression on lap times
        n = len(recent)
        x_sum = sum(range(n))
        y_sum = sum(r.lap_time for r in recent)
        xy_sum = sum(i * r.lap_time for i, r in enumerate(recent))
        x2_sum = sum(i * i for i in range(n))

        denominator = n * x2_sum - x_sum * x_sum
        if denominator == 0:
            return "stable", 0.0

        slope = (n * xy_sum - x_sum * y_sum) / denominator

        # Classify trend
        if slope < -0.1:
            trend = "improving"
        elif slope > 0.1:
            trend = "degrading"
        else:
            trend = "stable"

        return trend, slope

    def _calculate_optimal_pace(self, telemetry) -> float:
        """Calculate optimal achievable pace considering fuel"""
        if self.best_lap_time is None:
            return telemetry.best_lap_time or 90.0

        # Estimate fuel at best lap (assume it was set early in stint)
        if telemetry.fuel_per_lap and telemetry.fuel_per_lap > 0:
            # Assume best lap was with ~20kg more fuel
            fuel_delta = 20 * self.FUEL_EFFECT
            return self.best_lap_time - fuel_delta
        else:
            return self.best_lap_time

    def _predict_future_laps(
        self,
        telemetry,
        current_pace: float,
        trend_delta: float,
        tire_prediction,
    ) -> list[float]:
        """Predict lap times for next 5 laps"""
        predictions = []
        base_pace = current_pace

        for i in range(5):
            # Apply trend
            lap_pace = base_pace + (i * trend_delta)

            # Apply fuel effect (lighter = faster)
            if telemetry.fuel_per_lap and telemetry.fuel_per_lap > 0:
                fuel_saved = (i + 1) * telemetry.fuel_per_lap
                lap_pace -= fuel_saved * self.FUEL_EFFECT

            # Apply tire degradation if we have predictions
            if tire_prediction and tire_prediction.degradation_rate > 0:
                # Estimate time loss from tire wear
                # Rough estimate: 0.02s per % wear
                wear_increase = tire_prediction.degradation_rate * (i + 1)
                lap_pace += wear_increase * 0.02

            predictions.append(max(0, lap_pace))

        return predictions

    def _calculate_confidence(self) -> float:
        """Calculate prediction confidence"""
        if len(self.lap_times) == 0:
            return 0.3  # Low confidence with no data

        if len(self.lap_times) < self.MIN_LAPS_FOR_TREND:
            return 0.5

        # Higher confidence with more consistent lap times
        recent = list(self.lap_times)[-self.ROLLING_WINDOW:]
        if len(recent) >= 2:
            times = [r.lap_time for r in recent]
            avg = sum(times) / len(times)
            variance = sum((t - avg) ** 2 for t in times) / len(times)
            std_dev = variance ** 0.5

            # Low variance = high confidence
            if std_dev < 0.5:
                return 0.9
            elif std_dev < 1.0:
                return 0.75
            elif std_dev < 2.0:
                return 0.6
            else:
                return 0.5

        return 0.6
