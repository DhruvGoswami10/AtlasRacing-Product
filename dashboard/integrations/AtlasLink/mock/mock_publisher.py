"""
AtlasLink mock publisher
========================

Utility script that mimics the in-game Python app by emitting AtlasLink packets
over UDP.  Useful while developing the bridge without launching Assetto Corsa.

Usage:
    python mock_publisher.py --host 127.0.0.1 --port 28555
"""

from __future__ import annotations

import argparse
import json
import math
import random
import socket
import time
from typing import Any, Dict, List


def build_packet(tick: int) -> Dict[str, Any]:
    phase = tick / 20.0
    speed = 220 + math.sin(phase) * 14
    rpm = 7500 + math.sin(phase / 0.7) * 900
    throttle = 68 + math.sin(phase * 1.2) * 24
    brake = max(0, 12 + math.sin(phase * 1.4 + 0.9) * 18)
    tyre_wear = min(80, 20 + tick * 0.15)

    opponents: List[Dict[str, Any]] = []
    for position in range(1, 11):
        if position == 5:
            continue
        gap = (position - 5) * 1.3
        opponents.append(
            {
                "driver_name": f"Driver {position}",
                "car_model": random.choice(
                    [
                        "Ferrari 296 GT3",
                        "Audi R8 LMS GT3",
                        "Porsche 992 GT3R",
                        "Mercedes AMG GT3",
                    ]
                ),
                "car_class": "GT3",
                "position": position,
                "gap_to_player": round(abs(gap) + random.uniform(0.0, 0.2), 2),
                "gap_to_leader": round(position * 1.3 + random.uniform(0.0, 0.3), 2),
                "interval_ahead": round(random.uniform(1.0, 2.2), 2) if position > 1 else None,
                "tyre_compound": random.choice(["Slick", "Soft Slick", "Wet"]),
                "tyre_age_laps": int(3 + abs(position - 5) * 1.5),
                "in_pit": tick % 500 == 0 and position % 3 == 0,
                "last_lap_seconds": round(92.5 + random.uniform(-0.8, 0.8), 3),
                "best_lap_seconds": round(91.8 + random.uniform(-0.6, 0.6), 3),
            }
        )

    payload = {
        "session": {
            "game": "Assetto Corsa",
            "track": "Spa-Francorchamps",
            "layout": "GP",
            "session_type": "Race",
            "weather": "Light Cloud",
            "total_laps": 30,
            "completed_laps": 10 + tick // 180,
            "time_left_seconds": max(0, 3600 - tick * 2),
        },
        "player": {
            "driver_name": "Atlas Driver",
            "car_model": "Ferrari 296 GT3",
            "car_class": "GT3",
            "position": 5,
            "lap": 10 + tick // 180,
            "speed_kph": round(speed, 1),
            "throttle_percent": int(max(0, min(100, throttle))),
            "brake_percent": int(max(0, min(100, brake))),
            "gear": ["3", "4", "5", "6"][tick % 4],
            "rpm": int(rpm),
            "fuel_liters": round(max(0, 60 - tick * 0.12), 1),
            "fuel_laps_remaining": round(max(0, 12 - tick * 0.02), 1),
            "kers_percent": round(55 + math.sin(phase / 0.5) * 20, 1),
            "tyre_summary": {
                "compound": "Slick",
                "wear_percent": round(tyre_wear, 1),
                "age_laps": 10 + tick * 0.05,
            },
        },
        "opponents": opponents,
        "events": [],
        "meta": {
            "app_version": "0.0.0-dev",
            "bridge_version": "mock-publisher",
            "tick": tick,
        },
    }
    return {
        "schema": "atlaslink.v1",
        "timestamp_ms": int(time.time() * 1000),
        "payload": payload,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Send mock AtlasLink packets over UDP")
    parser.add_argument("--host", default="127.0.0.1", help="Bridge host")
    parser.add_argument("--port", type=int, default=28555, help="Bridge UDP port")
    parser.add_argument("--rate", type=float, default=20.0, help="Packets per second")
    args = parser.parse_args()

    interval = 1.0 / max(args.rate, 1.0)
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    destination = (args.host, args.port)

    print(f"[mock] streaming to {destination} at {args.rate:.1f} pkt/s. Ctrl+C to stop.")
    tick = 0
    try:
        while True:
            packet = build_packet(tick)
            sock.sendto(json.dumps(packet).encode("utf-8"), destination)
            tick += 1
            time.sleep(interval)
    except KeyboardInterrupt:
        print("\n[mock] stopped.")


if __name__ == "__main__":
    main()
