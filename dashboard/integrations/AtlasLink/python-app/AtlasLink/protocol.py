"""
AtlasLink wire protocol helpers.

Assetto Corsa embeds Python 3.3, so this module deliberately avoids modern
syntax (dataclasses, type annotations) and sticks to classic dictionaries.
"""

SCHEMA_VERSION = "atlaslink.v1"


def default_tyre_summary():
    return {
        "compound": "Unknown",
        "wear_percent": 0.0,
        "age_laps": 0.0,
        "temps_c": [],
        "pressures_psi": [],
    }


def default_player_payload():
    payload = {
        "driver_name": "Driver",
        "car_model": "Unknown",
        "car_class": "Unknown",
        "position": 0,
        "lap": 0,
        "total_laps": None,
        "best_lap_seconds": None,
        "last_lap_seconds": None,
        "delta_to_leader": None,
        "speed_kph": 0.0,
        "throttle_percent": 0.0,
        "brake_percent": 0.0,
        "gear": "N",
        "rpm": 0,
        "fuel_liters": 0.0,
        "fuel_laps_remaining": None,
        "brake_bias_percent": None,
        "traction_control_setting": None,
        "abs_setting": None,
        "drs_available": False,
        "drs_active": False,
        "kers_percent": None,
        "tyre_summary": default_tyre_summary(),
    }
    return payload


def default_opponent_payload():
    return {
        "driver_name": "Driver",
        "car_model": "Unknown",
        "car_class": "Unknown",
        "position": 0,
        "gap_to_leader_seconds": None,
        "gap_to_player_seconds": None,
        "interval_ahead_seconds": None,
        "lap": None,
        "tyre_compound": "Unknown",
        "tyre_age_laps": None,
        "in_pit": False,
        "last_lap_seconds": None,
        "best_lap_seconds": None,
        "speed_kph": None,
        "is_class_leader": False,
    }


def default_session_payload():
    return {
        "game": "Assetto Corsa",
        "track_name": "Unknown",
        "layout": "",
        "session_type": "Unknown",
        "weather": "Unknown",
        "total_laps": None,
        "completed_laps": None,
        "time_left_seconds": None,
        "lap_length_meters": None,
    }


def default_meta_payload():
    return {
        "app_version": "0.0.0-dev",
        "bridge_version": "unknown",
        "source": "python-app",
        "tick": 0,
        "generated_at_ms": 0,
    }


def build_packet():
    return {
        "session": default_session_payload(),
        "player": default_player_payload(),
        "opponents": [],
        "events": [],
        "meta": default_meta_payload(),
    }


def build_envelope(timestamp_ms, packet):
    return {
        "schema": SCHEMA_VERSION,
        "timestamp_ms": int(timestamp_ms),
        "payload": packet,
    }
