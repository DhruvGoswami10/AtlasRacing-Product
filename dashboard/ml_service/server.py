"""
Atlas AI - ML Race Engineer Service
FastAPI + WebSocket server for real-time ML predictions
"""

import asyncio
import json
import logging
from datetime import datetime
from typing import Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from models.tire_degradation import TireDegradationModel
from models.pace_predictor import PacePredictor
from models.overtake_advisor import OvertakeAdvisor
from strategy.backup_generator import BackupStrategyGenerator
from strategy.unified_engine import UnifiedStrategyEngine
from adapters.telemetry_adapter import TelemetryAdapter

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class TelemetryInput(BaseModel):
    """Incoming telemetry data from frontend"""
    timestamp: float
    current_lap: int
    total_laps: int
    position: int

    # Tire data
    tire_wear: list[float]  # [FL, FR, RL, RR] 0-100%
    tire_temps: list[float]  # [FL, FR, RL, RR] Celsius
    tire_compound: str  # soft, medium, hard, inter, wet
    tire_age: int  # laps on current set

    # Performance
    last_lap_time: Optional[float] = None
    best_lap_time: Optional[float] = None
    current_lap_time: Optional[float] = None
    sector_times: list[float] = []

    # Fuel
    fuel_remaining: float
    fuel_per_lap: Optional[float] = None

    # Gaps
    gap_ahead: Optional[float] = None
    gap_behind: Optional[float] = None
    gap_to_leader: Optional[float] = None

    # Opponent info
    opponent_ahead_tire_age: Optional[int] = None
    opponent_behind_tire_age: Optional[int] = None

    # Session
    drs_available: bool = False
    weather: str = "dry"
    track_temp: Optional[float] = None
    air_temp: Optional[float] = None

    # Flags
    flag_status: str = "green"  # green, yellow, red, sc, vsc

    # Game source
    game: str = "f1_24"  # f1_24 or assetto_corsa


class MLPrediction(BaseModel):
    """ML predictions output"""
    tire_life: dict
    pace: dict
    overtake: dict
    strategy: dict
    triggers: list[dict]  # Events that should trigger LLM messages
    learning_status: dict


class ConnectionManager:
    """Manage WebSocket connections"""

    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"Client connected. Total connections: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        logger.info(f"Client disconnected. Total connections: {len(self.active_connections)}")

    async def broadcast(self, message: dict):
        """Send message to all connected clients"""
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.error(f"Error broadcasting: {e}")


# Global instances
manager = ConnectionManager()
tire_model: Optional[TireDegradationModel] = None
pace_predictor: Optional[PacePredictor] = None
overtake_advisor: Optional[OvertakeAdvisor] = None
backup_generator: Optional[BackupStrategyGenerator] = None
strategy_engine: Optional[UnifiedStrategyEngine] = None
telemetry_adapter: Optional[TelemetryAdapter] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize models on startup"""
    global tire_model, pace_predictor, overtake_advisor, backup_generator, strategy_engine, telemetry_adapter

    logger.info("Initializing ML models...")
    tire_model = TireDegradationModel()
    pace_predictor = PacePredictor()
    overtake_advisor = OvertakeAdvisor()
    backup_generator = BackupStrategyGenerator()
    strategy_engine = UnifiedStrategyEngine(tire_model, pace_predictor, overtake_advisor, backup_generator)
    telemetry_adapter = TelemetryAdapter()
    logger.info("ML models initialized successfully")

    yield

    logger.info("Shutting down ML service...")


app = FastAPI(
    title="Atlas AI ML Service",
    description="Real-time ML predictions for race strategy",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "models_loaded": all([tire_model, pace_predictor, overtake_advisor]),
        "connections": len(manager.active_connections),
        "timestamp": datetime.now().isoformat()
    }


@app.get("/status")
async def model_status():
    """Get detailed model status"""
    return {
        "tire_model": {
            "loaded": tire_model is not None,
            "learning_progress": tire_model.learning_progress if tire_model else 0,
            "is_calibrated": tire_model.is_calibrated if tire_model else False
        },
        "pace_predictor": {
            "loaded": pace_predictor is not None,
            "samples": pace_predictor.sample_count if pace_predictor else 0
        },
        "overtake_advisor": {
            "loaded": overtake_advisor is not None
        }
    }


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time predictions"""
    await manager.connect(websocket)

    try:
        while True:
            # Receive telemetry data
            data = await websocket.receive_json()

            try:
                # Parse and adapt telemetry
                telemetry = TelemetryInput(**data)
                adapted = telemetry_adapter.adapt(telemetry)

                # Debug log key data periodically
                if telemetry.current_lap % 1 == 0:  # Log each lap
                    logger.debug(
                        f"Lap {telemetry.current_lap}/{telemetry.total_laps} | "
                        f"Tire wear: {max(telemetry.tire_wear):.1f}% | "
                        f"Compound: {telemetry.tire_compound} | "
                        f"Age: {telemetry.tire_age} laps"
                    )

                # Get predictions from all models
                predictions = strategy_engine.predict(adapted)

                # Send predictions back
                await websocket.send_json({
                    "type": "prediction",
                    "data": predictions.dict(),
                    "timestamp": datetime.now().isoformat()
                })

            except Exception as e:
                logger.error(f"Error processing telemetry: {e}")
                await websocket.send_json({
                    "type": "error",
                    "message": str(e),
                    "timestamp": datetime.now().isoformat()
                })

    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(websocket)


@app.post("/predict")
async def predict_endpoint(telemetry: TelemetryInput):
    """HTTP endpoint for one-off predictions (for testing)"""
    try:
        adapted = telemetry_adapter.adapt(telemetry)
        predictions = strategy_engine.predict(adapted)
        return {
            "success": True,
            "predictions": predictions.dict(),
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"Prediction error: {e}")
        return {
            "success": False,
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }


@app.post("/reset")
async def reset_models():
    """Reset all models for a new session"""
    global tire_model, pace_predictor, overtake_advisor

    if tire_model:
        tire_model.reset()
    if pace_predictor:
        pace_predictor.reset()
    if overtake_advisor:
        overtake_advisor.reset()

    return {
        "success": True,
        "message": "All models reset for new session",
        "timestamp": datetime.now().isoformat()
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8081)
