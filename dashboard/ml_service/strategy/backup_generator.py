"""
Backup Strategy Generator - Generates alternative strategies
Hybrid approach: Rule-based fallbacks + ML optimization
"""

from dataclasses import dataclass
from typing import Optional
import logging

logger = logging.getLogger(__name__)


@dataclass
class StrategyPlan:
    """Single strategy plan"""
    id: str
    title: str
    description: str
    pit_lap: Optional[int]
    compound: str
    status: str  # hold, prepare, box
    risk: str  # low, medium, high
    confidence: float
    reasoning: str
    trigger_condition: str  # When to activate this backup


@dataclass
class StrategySet:
    """Complete strategy with primary and backups"""
    primary: StrategyPlan
    backup_a: StrategyPlan
    backup_b: StrategyPlan
    backup_c: StrategyPlan


class BackupStrategyGenerator:
    """
    Generates backup strategies for every recommendation.

    Always provides 3 backups:
    - Backup A: Traffic/position-based alternative
    - Backup B: Safety car/caution alternative
    - Backup C: Defensive/undercut response
    """

    # Pit time loss estimates (seconds)
    PIT_DELTA = {
        "default": 22,
        "monaco": 20,
        "spa": 24,
        "monza": 23,
    }

    def __init__(self):
        self.track_name = "default"
        self.pit_delta = self.PIT_DELTA["default"]

    def set_track(self, track_name: str):
        """Set track for pit delta calculation"""
        self.track_name = track_name.lower()
        self.pit_delta = self.PIT_DELTA.get(self.track_name, self.PIT_DELTA["default"])

    def generate(
        self,
        telemetry,
        tire_prediction,
        pace_prediction,
        overtake_prediction,
    ) -> StrategySet:
        """
        Generate primary strategy with 3 backups.

        Args:
            telemetry: Current AdaptedTelemetry
            tire_prediction: TirePrediction from tire model
            pace_prediction: PacePrediction from pace model
            overtake_prediction: OvertakePrediction from overtake model

        Returns:
            StrategySet with primary and 3 backups
        """
        # Calculate optimal pit lap
        optimal_pit = self._calculate_optimal_pit(telemetry, tire_prediction)

        # Determine current status
        status = self._determine_status(telemetry, optimal_pit, tire_prediction)

        # Generate primary strategy
        primary = self._generate_primary(
            telemetry, optimal_pit, status, tire_prediction, pace_prediction
        )

        # Generate backups
        backup_a = self._generate_traffic_backup(
            telemetry, optimal_pit, tire_prediction
        )
        backup_b = self._generate_safety_car_backup(
            telemetry, optimal_pit, tire_prediction
        )
        backup_c = self._generate_defensive_backup(
            telemetry, optimal_pit, tire_prediction, overtake_prediction
        )

        return StrategySet(
            primary=primary,
            backup_a=backup_a,
            backup_b=backup_b,
            backup_c=backup_c,
        )

    def _calculate_optimal_pit(self, telemetry, tire_prediction) -> Optional[int]:
        """Calculate optimal pit lap based on tire life and race progress"""
        if tire_prediction is None:
            return None

        remaining_laps = telemetry.laps_remaining
        cliff_lap = tire_prediction.cliff_lap

        # Don't pit if race is almost over
        if remaining_laps <= 5:
            return None

        # Pit 2-3 laps before cliff
        optimal = cliff_lap - 2
        current_lap = telemetry.current_lap

        # Ensure pit lap is in the future
        if optimal <= current_lap:
            # Tires already degraded, pit soon
            optimal = current_lap + 1

        # Ensure enough laps for new tires to matter
        if telemetry.total_laps - optimal < 5:
            return None  # Not worth pitting

        return optimal

    def _determine_status(
        self, telemetry, optimal_pit: Optional[int], tire_prediction
    ) -> str:
        """Determine current strategy status"""
        if optimal_pit is None:
            return "hold"

        laps_to_pit = optimal_pit - telemetry.current_lap

        if laps_to_pit <= 0:
            return "box"
        elif laps_to_pit <= 2:
            return "prepare"
        else:
            return "hold"

    def _select_compound(self, telemetry, stint_length: int) -> str:
        """Select best compound for stint length"""
        current = telemetry.tire_compound.lower()

        if stint_length <= 15:
            return "soft"
        elif stint_length <= 30:
            return "medium"
        else:
            return "hard"

    def _generate_primary(
        self, telemetry, optimal_pit, status, tire_prediction, pace_prediction
    ) -> StrategyPlan:
        """Generate primary strategy"""
        remaining = telemetry.laps_remaining

        if optimal_pit is None:
            return StrategyPlan(
                id="primary",
                title="No Stop",
                description=f"Stay out on current tires to the end",
                pit_lap=None,
                compound=telemetry.tire_compound,
                status="hold",
                risk="low" if tire_prediction.wear_status == "healthy" else "medium",
                confidence=tire_prediction.confidence * 0.9,
                reasoning=f"Tires have {tire_prediction.remaining_laps} laps remaining, enough to finish",
                trigger_condition="Default plan",
            )

        stint_length = telemetry.total_laps - optimal_pit
        compound = self._select_compound(telemetry, stint_length)

        return StrategyPlan(
            id="primary",
            title=f"Pit Lap {optimal_pit}",
            description=f"Box on lap {optimal_pit} for {compound.title()}s",
            pit_lap=optimal_pit,
            compound=compound,
            status=status,
            risk=self._assess_strategy_risk(telemetry, optimal_pit, tire_prediction),
            confidence=tire_prediction.confidence * 0.85,
            reasoning=f"Optimal window based on tire degradation. Cliff at lap {tire_prediction.cliff_lap}",
            trigger_condition="Default plan",
        )

    def _generate_traffic_backup(
        self, telemetry, optimal_pit, tire_prediction
    ) -> StrategyPlan:
        """Backup A: Traffic/position-based alternative"""
        if optimal_pit is None:
            return StrategyPlan(
                id="backup_a",
                title="Stay Out (Traffic)",
                description="Continue to end avoiding traffic",
                pit_lap=None,
                compound=telemetry.tire_compound,
                status="hold",
                risk="medium",
                confidence=0.6,
                reasoning="No stop strategy if traffic makes pit dangerous",
                trigger_condition="If pit exit has heavy traffic",
            )

        # Delay pit by 2-3 laps to avoid traffic
        delayed_pit = optimal_pit + 2
        remaining = telemetry.laps_remaining
        stint_length = telemetry.total_laps - delayed_pit

        if delayed_pit >= telemetry.total_laps - 3:
            # Too late to pit, stay out
            return StrategyPlan(
                id="backup_a",
                title="Stay Out",
                description="Don't pit - manage tires to end",
                pit_lap=None,
                compound=telemetry.tire_compound,
                status="hold",
                risk="high",
                confidence=0.5,
                reasoning="Pit window closed due to traffic",
                trigger_condition="If pit window missed due to traffic",
            )

        compound = self._select_compound(telemetry, stint_length)

        return StrategyPlan(
            id="backup_a",
            title=f"Pit Lap {delayed_pit}",
            description=f"Delay to lap {delayed_pit} for {compound.title()}s",
            pit_lap=delayed_pit,
            compound=compound,
            status="hold",
            risk="medium",
            confidence=tire_prediction.confidence * 0.7,
            reasoning=f"Delayed pit to avoid traffic. Accept ~{(delayed_pit - optimal_pit) * 0.3:.1f}s loss",
            trigger_condition="If heavy traffic in pit window",
        )

    def _generate_safety_car_backup(
        self, telemetry, optimal_pit, tire_prediction
    ) -> StrategyPlan:
        """Backup B: Safety car/caution alternative"""
        if telemetry.flag_status in ["yellow", "sc", "vsc"]:
            # Currently under caution - pit immediately for free stop
            return StrategyPlan(
                id="backup_b",
                title="Box NOW (SC)",
                description="Free pit stop under safety car",
                pit_lap=telemetry.current_lap,
                compound="medium",  # Default safe choice
                status="box",
                risk="low",
                confidence=0.9,
                reasoning="Safety car active - minimal time loss for pit stop",
                trigger_condition="ACTIVE - Safety car deployed",
            )

        return StrategyPlan(
            id="backup_b",
            title="SC: Box Immediately",
            description="Pit immediately if safety car deployed",
            pit_lap=None,  # Reactive
            compound="medium",
            status="hold",
            risk="low",
            confidence=0.8,
            reasoning="Free pit stop opportunity if caution comes out",
            trigger_condition="If safety car or VSC deployed",
        )

    def _generate_defensive_backup(
        self, telemetry, optimal_pit, tire_prediction, overtake_prediction
    ) -> StrategyPlan:
        """Backup C: Defensive/undercut response"""
        # Check if opponent behind is threatening
        gap_behind = telemetry.gap_behind or 99
        tire_delta_behind = telemetry.tire_delta_behind or 0

        if gap_behind < 2.0 and tire_delta_behind > 3:
            # Opponent behind has fresher tires - undercut threat
            return StrategyPlan(
                id="backup_c",
                title="Box NOW (Undercut)",
                description="Immediate pit to cover undercut",
                pit_lap=telemetry.current_lap,
                compound="medium",
                status="box",
                risk="medium",
                confidence=0.75,
                reasoning=f"Car behind ({gap_behind:.1f}s) has {abs(tire_delta_behind)} lap fresher tires",
                trigger_condition="If car behind pits with fresh tire advantage",
            )

        # Default defensive backup
        early_pit = max(telemetry.current_lap + 1, (optimal_pit or telemetry.current_lap + 5) - 3)

        return StrategyPlan(
            id="backup_c",
            title=f"Early Pit L{early_pit}",
            description="Early stop to defend position",
            pit_lap=early_pit,
            compound="medium",
            status="hold",
            risk="medium",
            confidence=0.65,
            reasoning="Defensive strategy if undercut threat develops",
            trigger_condition="If opponent behind pits and threatens undercut",
        )

    def _assess_strategy_risk(
        self, telemetry, pit_lap: int, tire_prediction
    ) -> str:
        """Assess risk level of strategy"""
        # Close to cliff = higher risk
        laps_to_cliff = tire_prediction.cliff_lap - telemetry.current_lap

        if laps_to_cliff <= 2:
            return "high"
        elif laps_to_cliff <= 5:
            return "medium"
        else:
            return "low"
