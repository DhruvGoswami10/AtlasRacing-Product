"""
Unified Strategy Engine - Combines all ML models and generates triggers
"""

from dataclasses import dataclass, asdict
from typing import Optional
from datetime import datetime
import logging

from models.tire_degradation import TireDegradationModel, TirePrediction
from models.pace_predictor import PacePredictor, PacePrediction
from models.overtake_advisor import OvertakeAdvisor, OvertakePrediction
from strategy.backup_generator import BackupStrategyGenerator, StrategySet

logger = logging.getLogger(__name__)


@dataclass
class TriggerEvent:
    """Event that should trigger an LLM message"""
    type: str  # pit_window, box_now, tire_warning, overtake, undercut, weather, position
    priority: str  # high, medium, low
    context: dict  # Full context for LLM
    message_hint: str  # Brief hint for the type of message needed
    cooldown_key: str  # Key for deduplication


@dataclass
class MLPredictions:
    """Combined ML predictions output"""
    tire_life: dict
    pace: dict
    overtake: dict
    strategy: dict
    triggers: list[dict]
    learning_status: dict

    def dict(self):
        return asdict(self)


class UnifiedStrategyEngine:
    """
    Combines all ML predictions and generates triggers for LLM messages.
    """

    # Cooldown tracking to avoid spam
    TRIGGER_COOLDOWNS = {
        "pit_window": 30,      # 30 seconds between pit window alerts
        "tire_warning": 60,    # 1 minute between tire warnings
        "overtake": 20,        # 20 seconds between overtake opportunities
        "undercut": 45,        # 45 seconds between undercut alerts
        "box_now": 10,         # Can repeat box now frequently
        "position": 30,        # Position change alerts
    }

    def __init__(
        self,
        tire_model: TireDegradationModel,
        pace_predictor: PacePredictor,
        overtake_advisor: OvertakeAdvisor,
        backup_generator: BackupStrategyGenerator,
    ):
        self.tire_model = tire_model
        self.pace_predictor = pace_predictor
        self.overtake_advisor = overtake_advisor
        self.backup_generator = backup_generator

        # Track state for trigger generation
        self._last_triggers: dict[str, float] = {}
        self._last_position: Optional[int] = None
        self._pit_window_announced = False
        self._tire_warning_level: Optional[str] = None

    def predict(self, telemetry) -> MLPredictions:
        """
        Generate all predictions and triggers from telemetry.

        Args:
            telemetry: AdaptedTelemetry object

        Returns:
            MLPredictions with all model outputs and triggers
        """
        # Get individual model predictions
        tire_pred = self.tire_model.predict(telemetry)
        pace_pred = self.pace_predictor.predict(telemetry, tire_pred)
        overtake_pred = self.overtake_advisor.predict(telemetry, pace_pred)

        # Generate strategy with backups
        strategy_set = self.backup_generator.generate(
            telemetry, tire_pred, pace_pred, overtake_pred
        )

        # Generate triggers for LLM messages
        triggers = self._generate_triggers(
            telemetry, tire_pred, pace_pred, overtake_pred, strategy_set
        )

        # Get learning status
        learning_status = self.tire_model.get_learning_status()

        return MLPredictions(
            tire_life=self._tire_to_dict(tire_pred),
            pace=self._pace_to_dict(pace_pred),
            overtake=self._overtake_to_dict(overtake_pred),
            strategy=self._strategy_to_dict(strategy_set),
            triggers=[asdict(t) for t in triggers],
            learning_status=learning_status,
        )

    def _generate_triggers(
        self,
        telemetry,
        tire_pred: TirePrediction,
        pace_pred: PacePrediction,
        overtake_pred: OvertakePrediction,
        strategy: StrategySet,
    ) -> list[TriggerEvent]:
        """Generate trigger events for LLM messages"""
        triggers = []
        now = datetime.now().timestamp()

        # 1. Box Now trigger
        if strategy.primary.status == "box":
            if self._should_trigger("box_now", now):
                triggers.append(TriggerEvent(
                    type="box_now",
                    priority="high",
                    context={
                        "current_lap": telemetry.current_lap,
                        "total_laps": telemetry.total_laps,
                        "position": telemetry.position,
                        "pit_lap": strategy.primary.pit_lap,
                        "compound": strategy.primary.compound,
                        "tire_remaining": tire_pred.remaining_laps,
                        "gap_ahead": telemetry.gap_ahead,
                        "gap_behind": telemetry.gap_behind,
                    },
                    message_hint="Urgent pit call - box this lap",
                    cooldown_key="box_now",
                ))

        # 2. Pit window opening
        elif strategy.primary.status == "prepare" and not self._pit_window_announced:
            if self._should_trigger("pit_window", now):
                triggers.append(TriggerEvent(
                    type="pit_window",
                    priority="medium",
                    context={
                        "current_lap": telemetry.current_lap,
                        "pit_lap": strategy.primary.pit_lap,
                        "compound": strategy.primary.compound,
                        "laps_until_pit": strategy.primary.pit_lap - telemetry.current_lap if strategy.primary.pit_lap else 0,
                        "tire_status": tire_pred.wear_status,
                        "position": telemetry.position,
                    },
                    message_hint="Pit window opening soon",
                    cooldown_key="pit_window",
                ))
                self._pit_window_announced = True

        # 3. Tire warnings
        if tire_pred.wear_status != self._tire_warning_level:
            if tire_pred.wear_status == "caution" and self._should_trigger("tire_warning", now):
                triggers.append(TriggerEvent(
                    type="tire_warning",
                    priority="medium",
                    context={
                        "wear_status": tire_pred.wear_status,
                        "remaining_laps": tire_pred.remaining_laps,
                        "cliff_lap": tire_pred.cliff_lap,
                        "current_lap": telemetry.current_lap,
                        "degradation_rate": tire_pred.degradation_rate,
                    },
                    message_hint="Tire condition warning",
                    cooldown_key="tire_warning",
                ))
            elif tire_pred.wear_status == "critical" and self._should_trigger("tire_warning", now):
                triggers.append(TriggerEvent(
                    type="tire_critical",
                    priority="high",
                    context={
                        "wear_status": tire_pred.wear_status,
                        "remaining_laps": tire_pred.remaining_laps,
                        "cliff_lap": tire_pred.cliff_lap,
                        "current_lap": telemetry.current_lap,
                    },
                    message_hint="Tire condition critical",
                    cooldown_key="tire_warning",
                ))
            self._tire_warning_level = tire_pred.wear_status

        # 4. Overtake opportunity
        if (overtake_pred.probability > 60 and
            overtake_pred.recommendation == "go" and
            self._should_trigger("overtake", now)):
            triggers.append(TriggerEvent(
                type="overtake_opportunity",
                priority="medium",
                context={
                    "probability": overtake_pred.probability,
                    "risk": overtake_pred.risk,
                    "gap_ahead": telemetry.gap_ahead,
                    "drs_available": telemetry.drs_available,
                    "tire_advantage": telemetry.tire_delta_ahead,
                    "recommendation": overtake_pred.recommendation,
                    "best_opportunity": overtake_pred.best_opportunity,
                },
                message_hint="Overtake opportunity detected",
                cooldown_key="overtake",
            ))

        # 5. Undercut threat
        if (strategy.backup_c.status == "box" and
            "undercut" in strategy.backup_c.title.lower() and
            self._should_trigger("undercut", now)):
            triggers.append(TriggerEvent(
                type="undercut_threat",
                priority="high",
                context={
                    "gap_behind": telemetry.gap_behind,
                    "tire_delta_behind": telemetry.tire_delta_behind,
                    "backup_strategy": strategy.backup_c.description,
                },
                message_hint="Undercut threat from car behind",
                cooldown_key="undercut",
            ))

        # 6. Position change
        if self._last_position is not None and telemetry.position != self._last_position:
            if self._should_trigger("position", now):
                gained = self._last_position > telemetry.position
                triggers.append(TriggerEvent(
                    type="position_change",
                    priority="low",
                    context={
                        "old_position": self._last_position,
                        "new_position": telemetry.position,
                        "gained": gained,
                        "gap_ahead": telemetry.gap_ahead,
                        "gap_behind": telemetry.gap_behind,
                    },
                    message_hint="Position gained" if gained else "Position lost",
                    cooldown_key="position",
                ))
        self._last_position = telemetry.position

        # 7. Safety car (from flag status)
        if telemetry.flag_status in ["sc", "vsc", "yellow"]:
            if self._should_trigger("safety_car", now):
                triggers.append(TriggerEvent(
                    type="safety_car",
                    priority="high",
                    context={
                        "flag_type": telemetry.flag_status,
                        "current_lap": telemetry.current_lap,
                        "position": telemetry.position,
                        "should_pit": strategy.backup_b.status == "box",
                        "pit_recommendation": strategy.backup_b.description,
                    },
                    message_hint="Safety car/caution deployed",
                    cooldown_key="safety_car",
                ))

        return triggers

    def _should_trigger(self, trigger_type: str, now: float) -> bool:
        """Check if trigger should fire based on cooldown"""
        cooldown = self.TRIGGER_COOLDOWNS.get(trigger_type, 30)
        last_time = self._last_triggers.get(trigger_type, 0)

        if now - last_time >= cooldown:
            self._last_triggers[trigger_type] = now
            return True
        return False

    def _tire_to_dict(self, pred: TirePrediction) -> dict:
        return {
            "remaining_laps": pred.remaining_laps,
            "cliff_lap": pred.cliff_lap,
            "confidence": pred.confidence,
            "degradation_curve": pred.degradation_curve,
            "degradation_rate": pred.degradation_rate,
            "current_performance": pred.current_performance,
            "wear_status": pred.wear_status,
        }

    def _pace_to_dict(self, pred: PacePrediction) -> dict:
        return {
            "predicted_lap_times": pred.predicted_lap_times,
            "trend": pred.trend,
            "trend_delta": pred.trend_delta,
            "optimal_pace": pred.optimal_pace,
            "current_pace": pred.current_pace,
            "pace_delta": pred.pace_delta,
            "confidence": pred.confidence,
        }

    def _overtake_to_dict(self, pred: OvertakePrediction) -> dict:
        return {
            "probability": pred.probability,
            "best_opportunity": pred.best_opportunity,
            "risk": pred.risk,
            "recommendation": pred.recommendation,
            "target_driver": pred.target_driver,
            "factors": pred.factors,
            "confidence": pred.confidence,
        }

    def _strategy_to_dict(self, strategy: StrategySet) -> dict:
        def plan_to_dict(plan):
            return {
                "id": plan.id,
                "title": plan.title,
                "description": plan.description,
                "pit_lap": plan.pit_lap,
                "compound": plan.compound,
                "status": plan.status,
                "risk": plan.risk,
                "confidence": plan.confidence,
                "reasoning": plan.reasoning,
                "trigger_condition": plan.trigger_condition,
            }

        return {
            "primary": plan_to_dict(strategy.primary),
            "backup_a": plan_to_dict(strategy.backup_a),
            "backup_b": plan_to_dict(strategy.backup_b),
            "backup_c": plan_to_dict(strategy.backup_c),
        }
