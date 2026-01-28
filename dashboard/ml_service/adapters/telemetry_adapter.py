"""
Telemetry Adapter - Normalize F1 24 and Assetto Corsa data into unified format
"""

from dataclasses import dataclass
from typing import Optional


@dataclass
class AdaptedTelemetry:
    """Unified telemetry format for ML models"""
    timestamp: float
    current_lap: int
    total_laps: int
    position: int

    # Normalized tire data (0-1 scale)
    tire_wear_normalized: list[float]  # [FL, FR, RL, RR] 0-1
    tire_temps_normalized: list[float]  # [FL, FR, RL, RR] 0-1 (based on optimal range)
    tire_compound: str
    tire_age: int

    # Performance (seconds)
    last_lap_time: Optional[float]
    best_lap_time: Optional[float]
    current_lap_time: Optional[float]
    sector_times: list[float]

    # Fuel
    fuel_remaining: float
    fuel_per_lap: Optional[float]
    fuel_laps_remaining: Optional[float]

    # Gaps (seconds)
    gap_ahead: Optional[float]
    gap_behind: Optional[float]
    gap_to_leader: Optional[float]

    # Opponent data
    opponent_ahead_tire_age: Optional[int]
    opponent_behind_tire_age: Optional[int]
    tire_delta_ahead: Optional[int]  # negative = we have fresher tires
    tire_delta_behind: Optional[int]

    # Session context
    drs_available: bool
    weather: str
    track_temp: Optional[float]
    air_temp: Optional[float]
    flag_status: str

    # Race progress
    race_progress: float  # 0-1
    laps_remaining: int

    # Source game
    game: str


class TelemetryAdapter:
    """Adapts telemetry from different games to unified format"""

    # Optimal tire temp ranges by compound (Celsius)
    TIRE_TEMP_RANGES = {
        "soft": (85, 105),
        "medium": (90, 110),
        "hard": (95, 115),
        "inter": (75, 100),
        "wet": (65, 85),
    }

    def adapt(self, telemetry) -> AdaptedTelemetry:
        """Convert raw telemetry to adapted format"""

        # Normalize tire wear (already 0-100, convert to 0-1)
        tire_wear_normalized = [w / 100.0 for w in telemetry.tire_wear]

        # Normalize tire temps based on optimal range
        compound = telemetry.tire_compound.lower()
        temp_range = self.TIRE_TEMP_RANGES.get(compound, (85, 110))
        tire_temps_normalized = [
            self._normalize_temp(t, temp_range) for t in telemetry.tire_temps
        ]

        # Calculate fuel laps remaining
        fuel_laps = None
        if telemetry.fuel_per_lap and telemetry.fuel_per_lap > 0:
            fuel_laps = telemetry.fuel_remaining / telemetry.fuel_per_lap

        # Calculate tire age deltas
        tire_delta_ahead = None
        tire_delta_behind = None
        if telemetry.opponent_ahead_tire_age is not None:
            tire_delta_ahead = telemetry.tire_age - telemetry.opponent_ahead_tire_age
        if telemetry.opponent_behind_tire_age is not None:
            tire_delta_behind = telemetry.tire_age - telemetry.opponent_behind_tire_age

        # Race progress
        race_progress = telemetry.current_lap / max(telemetry.total_laps, 1)
        laps_remaining = max(0, telemetry.total_laps - telemetry.current_lap)

        return AdaptedTelemetry(
            timestamp=telemetry.timestamp,
            current_lap=telemetry.current_lap,
            total_laps=telemetry.total_laps,
            position=telemetry.position,
            tire_wear_normalized=tire_wear_normalized,
            tire_temps_normalized=tire_temps_normalized,
            tire_compound=compound,
            tire_age=telemetry.tire_age,
            last_lap_time=telemetry.last_lap_time,
            best_lap_time=telemetry.best_lap_time,
            current_lap_time=telemetry.current_lap_time,
            sector_times=telemetry.sector_times,
            fuel_remaining=telemetry.fuel_remaining,
            fuel_per_lap=telemetry.fuel_per_lap,
            fuel_laps_remaining=fuel_laps,
            gap_ahead=telemetry.gap_ahead,
            gap_behind=telemetry.gap_behind,
            gap_to_leader=telemetry.gap_to_leader,
            opponent_ahead_tire_age=telemetry.opponent_ahead_tire_age,
            opponent_behind_tire_age=telemetry.opponent_behind_tire_age,
            tire_delta_ahead=tire_delta_ahead,
            tire_delta_behind=tire_delta_behind,
            drs_available=telemetry.drs_available,
            weather=telemetry.weather,
            track_temp=telemetry.track_temp,
            air_temp=telemetry.air_temp,
            flag_status=telemetry.flag_status,
            race_progress=race_progress,
            laps_remaining=laps_remaining,
            game=telemetry.game,
        )

    def _normalize_temp(self, temp: float, optimal_range: tuple[float, float]) -> float:
        """
        Normalize temperature to 0-1 scale where:
        - 0.5 = optimal (middle of range)
        - 0 = too cold
        - 1 = too hot
        """
        min_temp, max_temp = optimal_range
        optimal = (min_temp + max_temp) / 2

        if temp < min_temp:
            # Too cold: 0 to 0.5
            return max(0, 0.5 * (temp / min_temp))
        elif temp > max_temp:
            # Too hot: 0.5 to 1
            overheat_margin = 30  # degrees above max before hitting 1.0
            excess = temp - max_temp
            return min(1.0, 0.5 + 0.5 * (excess / overheat_margin))
        else:
            # In range: around 0.5
            range_size = max_temp - min_temp
            position = (temp - min_temp) / range_size
            # Map to 0.3-0.7 for "optimal" band
            return 0.3 + position * 0.4
