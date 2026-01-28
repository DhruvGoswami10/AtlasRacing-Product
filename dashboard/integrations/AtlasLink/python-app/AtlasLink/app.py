# -*- coding: utf-8 -*-
"""
AtlasLink AC Python App (Python 3.3 compatible)
"""

import json
import socket
import time
import os
import sys
import codecs
import traceback

try:
    import ac  # type: ignore
    import acsys  # type: ignore
except ImportError:
    class _MockAC(object):
        def __getattr__(self, name):
            raise RuntimeError("AtlasLink API \'%s\' accessed outside AC runtime" % name)

    ac = _MockAC()  # type: ignore
    acsys = _MockAC()  # type: ignore

MODULE_DIR = os.path.dirname(__file__)
if MODULE_DIR not in sys.path:
    sys.path.append(MODULE_DIR)

import protocol
try:
    codecs.lookup('idna')
except LookupError:
    class _SimpleIdnaCodec(codecs.Codec):
        def encode(self, input, errors='strict'):
            return input.encode('ascii', errors), len(input)

        def decode(self, input, errors='strict'):
            return input.decode('ascii', errors), len(input)

    class _SimpleIdnaIncrementalEncoder(codecs.IncrementalEncoder):
        def encode(self, input, final=False):
            return input.encode('ascii', self.errors)

    class _SimpleIdnaIncrementalDecoder(codecs.IncrementalDecoder):
        def decode(self, input, final=False):
            return input.decode('ascii', self.errors)

    class _SimpleIdnaStreamWriter(_SimpleIdnaCodec, codecs.StreamWriter):
        pass

    class _SimpleIdnaStreamReader(_SimpleIdnaCodec, codecs.StreamReader):
        pass

    def _simple_idna_search(name):
        if name.lower() == 'idna':
            return codecs.CodecInfo(
                name='idna',
                encode=_SimpleIdnaCodec().encode,
                decode=_SimpleIdnaCodec().decode,
                incrementalencoder=_SimpleIdnaIncrementalEncoder,
                incrementaldecoder=_SimpleIdnaIncrementalDecoder,
                streamwriter=_SimpleIdnaStreamWriter,
                streamreader=_SimpleIdnaStreamReader,
            )
        return None

    codecs.register(_simple_idna_search)

LOG_PATHS = (
    os.path.join(os.path.expanduser("~"), "Documents", "Assetto Corsa", "logs", "atlaslink_debug.log"),
    os.path.join(MODULE_DIR, "atlaslink_debug.log"),
)


def _log(message):
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    line = "[%s] %s\n" % (timestamp, message)
    for path in LOG_PATHS:
        try:
            dir_path = os.path.dirname(path)
            if dir_path and not os.path.isdir(dir_path):
                try:
                    os.makedirs(dir_path)
                except Exception:
                    pass
            with open(path, "a") as handle:
                handle.write(line)
            break
        except Exception:
            continue
    else:
        try:
            ac.consoleWrite("[AtlasLink] %s" % message)
        except Exception:
            pass


def _console(message):
    prefix = "[AtlasLink] %s" % message
    for attr in ("consoleWrite", "console", "log"):
        func = getattr(ac, attr, None)
        if callable(func):
            try:
                func(prefix)
                return
            except Exception:
                continue
    _log(message)
BRIDGE_HOST = "127.0.0.1"
BRIDGE_PORT = 28555
APP_TITLE = "AtlasLink"

SESSION_TYPE_NAMES = {
    0: "Practice",
    1: "Qualifying",
    2: "Race",
    3: "Hotlap",
    4: "Time Attack",
    5: "Drift",
    6: "Drag",
}


def _resolve_cs(name):
    try:
        return getattr(acsys.CS, name)
    except Exception:
        return None


CS_INDICES = {
    "SpeedKMH": _resolve_cs("SpeedKMH"),
    "LapCount": _resolve_cs("LapCount"),
    "Position": _resolve_cs("Position"),
    "LapTime": _resolve_cs("LapTime"),
    "LastLap": _resolve_cs("LastLap"),
    "BestLap": _resolve_cs("BestLap"),
    "RPM": _resolve_cs("RPM"),
    "Gear": _resolve_cs("Gear"),
    "Fuel": _resolve_cs("Fuel"),
    "FuelLap": _resolve_cs("FuelEstimatedLaps"),
    "NormalizedSpline": _resolve_cs("NormalizedSplinePosition"),
    "IsInPit": _resolve_cs("IsInPit"),
    "IsInPitLane": _resolve_cs("IsInPitLane"),
}

for _cs_key, _cs_value in CS_INDICES.items():
    if _cs_value is None:
        _log("Warning: acsys.CS.%s not available; using fallbacks" % _cs_key)


def _safe_call(func, default, *args):
    try:
        return func(*args)
    except Exception:
        return default


def _get_car_state(car_id, key, default=None):
    cs_index = CS_INDICES.get(key)
    if cs_index is None:
        return default
    try:
        return ac.getCarState(car_id, cs_index)
    except Exception:
        return default


class AtlasLinkApp(object):
    def __init__(self):
        self.window = None
        self.socket = None
        self.last_send_ts = 0.0
        self.tick = 0
        self._last_logged_car_count = None
        self._logged_opponent_ids = set()
        self._lap_length = None

    def _resolve_car_count(self):
        raw_count = _safe_call(getattr(ac, "getCarCount", None), None)
        if raw_count is None:
            raw_count = _safe_call(getattr(ac, "getCarsCount", None), None)
        try:
            return int(raw_count)
        except Exception:
            return 1

    @staticmethod
    def _convert_ms_to_seconds(value):
        if value in (None, 0):
            return None
        try:
            milliseconds = float(value)
        except Exception:
            return None
        if milliseconds <= 0:
            return None
        return milliseconds / 1000.0

    def _collect_car_snapshot(self, car_id):
        lap_raw = int(_get_car_state(car_id, "LapCount", 0) or 0)
        lap_display = lap_raw + 1 if lap_raw >= 0 else max(lap_raw, 0)
        normalized = float(_get_car_state(car_id, "NormalizedSpline", 0.0) or 0.0)
        lap_time_seconds = self._convert_ms_to_seconds(_get_car_state(car_id, "LapTime"))
        speed_kph = float(_get_car_state(car_id, "SpeedKMH", 0.0) or 0.0)
        speed_ms = speed_kph / 3.6 if speed_kph else 0.0

        leaderboard_pos = _safe_call(getattr(ac, "getCarLeaderboardPosition", lambda cid: -1), -1, car_id)
        if leaderboard_pos is not None and leaderboard_pos >= 0:
            position = int(leaderboard_pos) + 1
        else:
            position = int(_get_car_state(car_id, "Position", 0) or 0)
            if position <= 0:
                position = car_id + 1

        driver_name = _safe_call(getattr(ac, "getDriverName", lambda cid: "Driver"), "Driver", car_id)
        car_model = _safe_call(getattr(ac, "getCarName", lambda cid: "Unknown"), "Unknown", car_id)
        car_class = _safe_call(getattr(ac, "getCarClass", lambda cid: "Unknown"), "Unknown", car_id)

        best_lap_seconds = self._convert_ms_to_seconds(_get_car_state(car_id, "BestLap"))
        last_lap_seconds = self._convert_ms_to_seconds(_get_car_state(car_id, "LastLap"))

        tyre_compound = _safe_call(getattr(ac, "getCarTyreCompound", lambda cid: "Unknown"), "Unknown", car_id)
        is_in_pit = _get_car_state(car_id, "IsInPit", 0) or 0
        is_in_pit_lane = _get_car_state(car_id, "IsInPitLane", 0) or 0

        snapshot = {
            "car_id": car_id,
            "lap": lap_display,
            "lap_raw": lap_raw,
            "normalized": normalized,
            "lap_time_seconds": lap_time_seconds,
            "speed_kph": speed_kph,
            "speed_ms": speed_ms,
            "position": position,
            "driver_name": driver_name,
            "car_model": car_model,
            "car_class": car_class,
            "best_lap_seconds": best_lap_seconds,
            "last_lap_seconds": last_lap_seconds,
            "tyre_compound": tyre_compound,
            "in_pit": bool(is_in_pit or is_in_pit_lane),
            "tyre_age_laps": None,
        }
        return snapshot

    def acMain(self, *args):
        _log("acMain entry args=%s" % (args,))
        self.window = ac.newApp(APP_TITLE)
        try:
            ac.setTitle(self.window, APP_TITLE)
            ac.setSize(self.window, 280, 90)
        except Exception:
            pass
        _console("Python app initialised")
        _log("acMain initialised")

        self.socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.socket.setblocking(False)
        return APP_TITLE

    def acUpdate(self, delta_t):
        if self.socket is None:
            return

        now = time.time()
        if now - self.last_send_ts < 0.05:
            return

        packet = self.build_packet(now)
        envelope = protocol.build_envelope(int(now * 1000), packet)
        try:
            self.socket.sendto(json.dumps(envelope).encode("utf-8"), (BRIDGE_HOST, BRIDGE_PORT))
            if self.tick % 20 == 0:
                opponent_count = len(packet.get("opponents", ()))
                player = packet.get("player", {})
                _log(
                    "UDP packet sent tick=%s opponents=%s speed=%.1f gear=%s"
                    % (
                        self.tick,
                        opponent_count,
                        player.get("speed_kph", 0.0),
                        player.get("gear", "?"),
                    )
                )
        except Exception as exc:
            _log("Failed to send packet: %s" % exc)
            _console("Failed to send packet: %s" % exc)

        self.last_send_ts = now
        self.tick += 1

    def build_packet(self, now):
        packet = protocol.build_packet()
        session_payload = self._build_session_payload()
        packet["session"].update(session_payload)
        player = self._build_player_payload()
        if packet["session"].get("total_laps") is not None:
            player["total_laps"] = packet["session"]["total_laps"]
        packet["player"].update(player)
        if packet["session"].get("completed_laps") is None and player.get("lap") is not None:
            try:
                packet["session"]["completed_laps"] = max(int(player["lap"]) - 1, 0)
            except Exception:
                packet["session"]["completed_laps"] = None
        packet["opponents"] = self._build_opponents_payload(player)
        packet["meta"].update({
            "app_version": "0.0.0-dev",
            "bridge_version": "udp",
            "source": "ac-python-app",
            "tick": self.tick,
            "generated_at_ms": int(now * 1000),
        })
        return packet

    def _build_session_payload(self):
        payload = protocol.default_session_payload()
        track_name = _safe_call(getattr(ac, "getTrackName", lambda: "Unknown"), "Unknown")
        layout = _safe_call(getattr(ac, "getTrackConfiguration", lambda: ""), "")
        track_name_str = str(track_name).strip() if track_name is not None else ""
        if not track_name_str or track_name_str in {"-1", "0"}:
            track_name_str = "Unknown"
        layout_str = str(layout).strip() if layout is not None else ""
        if not layout_str or layout_str in {"-1", "0"}:
            layout_str = ""
        payload["track_name"] = track_name_str
        payload["layout"] = layout_str
        session_type = _safe_call(getattr(ac, "getSessionType", lambda: -1), -1)
        payload["session_type"] = SESSION_TYPE_NAMES.get(session_type, "Unknown")
        payload["time_left_seconds"] = _safe_call(getattr(ac, "getSessionTimeLeft", lambda: None), None)
        total_laps = _safe_call(getattr(ac, "getRaceNumLaps", lambda: None), None)
        if not total_laps or total_laps <= 0:
            total_laps = _safe_call(getattr(ac, "getNumberOfLaps", lambda: None), None)
        if total_laps and total_laps > 0:
            try:
                payload["total_laps"] = int(total_laps)
            except Exception:
                payload["total_laps"] = None
        else:
            payload["total_laps"] = None
        payload["completed_laps"] = None
        try:
            payload["lap_length_meters"] = acsys.getTrackLength()
            if payload["lap_length_meters"]:
                try:
                    self._lap_length = float(payload["lap_length_meters"])
                except Exception:
                    pass
        except Exception:
            payload["lap_length_meters"] = None
        return payload

    def _build_player_payload(self):
        payload = protocol.default_player_payload()
        car_id = 0
        snapshot = self._collect_car_snapshot(car_id)
        payload["driver_name"] = snapshot["driver_name"]
        payload["car_model"] = snapshot["car_model"]
        payload["car_class"] = snapshot["car_class"]
        payload["lap"] = snapshot["lap"]
        payload["position"] = snapshot["position"]
        payload["best_lap_seconds"] = snapshot["best_lap_seconds"]
        payload["last_lap_seconds"] = snapshot["last_lap_seconds"]
        payload["speed_kph"] = snapshot["speed_kph"]
        payload["rpm"] = int(_get_car_state(car_id, "RPM", 0) or 0)
        payload["gear"] = self._format_gear(_get_car_state(car_id, "Gear"))
        throttle = _safe_call(getattr(ac, "getCarThrottle", lambda cid: 0.0), 0.0, car_id)
        brake = _safe_call(getattr(ac, "getCarBrake", lambda cid: 0.0), 0.0, car_id)
        payload["throttle_percent"] = float(throttle or 0.0) * 100.0
        payload["brake_percent"] = float(brake or 0.0) * 100.0
        payload["fuel_liters"] = float(_get_car_state(car_id, "Fuel", 0.0) or 0.0)
        payload["fuel_laps_remaining"] = _get_car_state(car_id, "FuelLap")
        payload["tyre_summary"] = self._build_tyre_summary(car_id)
        payload["drs_available"] = False
        payload["drs_active"] = False
        payload["kers_percent"] = None
        return payload

    def _build_tyre_summary(self, car_id):
        summary = protocol.default_tyre_summary()
        summary["compound"] = _safe_call(getattr(ac, "getCarTyreCompound", lambda cid: "Unknown"), "Unknown", car_id)
        temps = []
        for key in ("TyreTempFL", "TyreTempFR", "TyreTempRL", "TyreTempRR"):
            value = _get_car_state(car_id, key)
            temps.append(float(value) if value is not None else 0.0)
        summary["temps_c"] = temps
        pressures = []
        get_pressure = getattr(ac, "getCarTyrePressure", None)
        if get_pressure is not None:
            for idx in range(4):
                pressures.append(float(_safe_call(get_pressure, 0.0, car_id, idx)))
        summary["pressures_psi"] = pressures
        return summary

    def _build_opponents_payload(self, player_payload):
        opponents = []
        car_count = self._resolve_car_count()
        if self._last_logged_car_count != car_count:
            self._last_logged_car_count = car_count
            _log("Reported car_count=%s" % car_count)

        if car_count <= 1:
            return opponents

        snapshots = [self._collect_car_snapshot(car_id) for car_id in range(car_count)]
        snapshots.sort(
            key=lambda snap: (-snap["lap"], -snap["normalized"], snap["position"], snap["car_id"])
        )
        for index, snap in enumerate(snapshots, start=1):
            snap["classified_position"] = index

        lap_length = self._lap_length if self._lap_length and self._lap_length > 0 else 1000.0

        def resolve_reference_speed(snap):
            lap_len = lap_length if lap_length and lap_length > 0 else None
            if lap_len:
                for candidate in (
                    snap.get("lap_time_seconds"),
                    snap.get("last_lap_seconds"),
                    snap.get("best_lap_seconds"),
                ):
                    if candidate and candidate > 0.25:
                        try:
                            return max(lap_len / candidate, 0.1)
                        except Exception:
                            continue
            base_speed = snap.get("speed_ms")
            try:
                base_speed = float(base_speed if base_speed is not None else 0.0)
            except Exception:
                base_speed = 0.0
            if base_speed > 0.1:
                return base_speed
            try:
                return max((snap.get("speed_kph") or 0.0) / 3.6, 0.1)
            except Exception:
                return 0.1

        for snap in snapshots:
            snap["distance"] = (snap["lap_raw"] * lap_length) + (snap["normalized"] * lap_length)
            try:
                snap["speed_ms"] = max(float(snap.get("speed_ms") or 0.0), 0.0)
            except Exception:
                snap["speed_ms"] = 0.0
            snap["speed_reference_ms"] = resolve_reference_speed(snap)

        leader = snapshots[0]
        player_snapshot = next(
            (snap for snap in snapshots if snap["car_id"] == 0), snapshots[0]
        )

        leader_distance = leader["distance"]
        player_distance = player_snapshot["distance"]
        leader_speed_ref = max(leader.get("speed_reference_ms", 0.1), 0.1)
        player_speed_ref = max(player_snapshot.get("speed_reference_ms", 0.1), 0.1)

        for snap in snapshots:
            speed_ref = max(snap.get("speed_reference_ms", 0.1), 0.1)

            if snap["car_id"] == leader["car_id"]:
                snap["gap_to_leader_seconds"] = 0.0
            else:
                distance_to_leader = leader_distance - snap["distance"]
                if distance_to_leader <= 0:
                    snap["gap_to_leader_seconds"] = 0.0
                else:
                    denom = (leader_speed_ref + speed_ref) * 0.5
                    if denom < 0.1:
                        denom = max(leader_speed_ref, speed_ref, 0.1)
                    snap["gap_to_leader_seconds"] = distance_to_leader / denom

            if snap["car_id"] == player_snapshot["car_id"]:
                snap["gap_to_player_seconds"] = 0.0
            else:
                distance_to_player = snap["distance"] - player_distance
                denom = (player_speed_ref + speed_ref) * 0.5
                if denom < 0.1:
                    denom = max(player_speed_ref, speed_ref, 0.1)
                snap["gap_to_player_seconds"] = distance_to_player / denom

        rows = sorted(snapshots, key=lambda snap: snap["classified_position"])

        previous_gap = None
        for snap in rows:
            if snap["car_id"] not in self._logged_opponent_ids:
                self._logged_opponent_ids.add(snap["car_id"])
                _log("Opponent car_id=%s name=%s" % (snap["car_id"], snap["driver_name"]))

            payload = protocol.default_opponent_payload()
            payload["driver_name"] = snap["driver_name"]
            payload["car_model"] = snap["car_model"]
            payload["car_class"] = snap["car_class"]
            payload["position"] = snap["classified_position"]
            payload["lap"] = snap["lap"]
            payload["speed_kph"] = snap["speed_kph"]
            payload["last_lap_seconds"] = snap["last_lap_seconds"]
            payload["best_lap_seconds"] = snap["best_lap_seconds"]
            payload["tyre_compound"] = snap["tyre_compound"]
            payload["tyre_age_laps"] = snap["tyre_age_laps"]
            payload["in_pit"] = snap["in_pit"]
            payload["gap_to_leader_seconds"] = snap["gap_to_leader_seconds"]
            payload["gap_to_player_seconds"] = snap["gap_to_player_seconds"]
            if previous_gap is None:
                payload["interval_ahead_seconds"] = None
            else:
                payload["interval_ahead_seconds"] = (
                    snap["gap_to_leader_seconds"] - previous_gap
                )
            previous_gap = snap["gap_to_leader_seconds"]
            payload["is_class_leader"] = payload["position"] == 1
            payload["is_player"] = snap["car_id"] == 0
            opponents.append(payload)

        return opponents

    def _format_gear(self, value):
        if value is None:
            return "N"
        try:
            gear_int = int(value)
        except Exception:
            return "N"
        if gear_int < 0:
            return "R"
        if gear_int == 0:
            return "N"
        return str(gear_int)


_app = AtlasLinkApp()


def acMain(ac_version):
    return _app.acMain(ac_version)


def acUpdate(delta_t):
    _app.acUpdate(delta_t)



