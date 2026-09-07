"""In-memory drone registry keyed by MAVLink system ID.

State is updated from parsed messages and persisted to SQLite on a throttle.
Drone metadata (name/description/enabled) lives in the DB and is merged with
live state whenever a snapshot is produced.
"""
import threading
import time
from datetime import datetime, timezone
from typing import Dict, List, Optional

from .. import db
from ..config import settings


class DroneState:
    __slots__ = (
        "sysid", "last_seen", "online", "armed", "mode", "custom_mode",
        "system_status_label", "vehicle_type", "autopilot",
        "roll", "pitch", "yaw", "heading", "lat", "lon", "alt", "rel_alt",
        "groundspeed", "airspeed", "climb", "throttle", "battery", "voltage",
        "current", "satellites", "fix_type", "gps_ok",
        # Extended real-world telemetry (aligned with DTU capture messages)
        "local_x", "local_y", "local_z", "local_vx", "local_vy", "local_vz",
        "vibration_x", "vibration_y", "vibration_z",
        "range_m", "range_min_cm", "range_max_cm",
        "mcu_temp", "mcu_voltage",
        "wind_speed", "wind_direction",
        "rssi", "load", "drop_rate_comm", "errors_comm",
        "ekf_ok", "temperature",
        "ground_distance", "flow_quality",
        "boot_ms",
        "_last_persist",
    )

    def __init__(self, sysid: int):
        self.sysid = sysid
        self.last_seen = time.time()
        self.online = True
        self.armed = False
        self.mode = "UNKNOWN"
        self.custom_mode = 0
        self.system_status_label = "UNKNOWN"
        self.vehicle_type = 0
        self.autopilot = 0
        self.roll = 0.0
        self.pitch = 0.0
        self.yaw = 0.0
        self.heading = 0.0
        self.lat = None
        self.lon = None
        self.alt = None
        self.rel_alt = None
        self.groundspeed = 0.0
        self.airspeed = 0.0
        self.climb = 0.0
        self.throttle = 0
        self.battery = -1
        self.voltage = None
        self.current = None
        self.satellites = 0
        self.fix_type = 0
        self.gps_ok = False
        self.local_x = self.local_y = self.local_z = 0.0
        self.local_vx = self.local_vy = self.local_vz = 0.0
        self.vibration_x = self.vibration_y = self.vibration_z = 0.0
        self.range_m = None
        self.range_min_cm = 0
        self.range_max_cm = 0
        self.mcu_temp = None
        self.mcu_voltage = None
        self.wind_speed = 0.0
        self.wind_direction = 0.0
        self.rssi = None
        self.load = None
        self.drop_rate_comm = 0
        self.errors_comm = 0
        self.ekf_ok = None
        self.temperature = None
        self.ground_distance = None
        self.flow_quality = None
        self.boot_ms = None
        self._last_persist = 0.0

    def apply(self, msg: dict) -> None:
        self.last_seen = time.time()
        self.online = True
        t = msg["type"]
        if t == "HEARTBEAT":
            self.armed = msg.get("armed", self.armed)
            self.mode = msg.get("mode", self.mode)
            self.custom_mode = msg.get("custom_mode", self.custom_mode)
            self.system_status_label = msg.get("system_status_label", self.system_status_label)
            self.vehicle_type = msg.get("vehicle_type", self.vehicle_type)
            self.autopilot = msg.get("autopilot", self.autopilot)
        elif t == "ATTITUDE":
            self.roll = msg.get("roll", self.roll)
            self.pitch = msg.get("pitch", self.pitch)
            self.yaw = msg.get("yaw", self.yaw)
        elif t == "GLOBAL_POSITION_INT":
            # Indoor/no-GPS captures report lat/lon = 0; don't treat that as a
            # real position (the map should not jump to (0,0)).
            if msg.get("has_position", True):
                self.lat = msg.get("lat", self.lat)
                self.lon = msg.get("lon", self.lon)
            self.alt = msg.get("alt", self.alt)
            self.rel_alt = msg.get("rel_alt", self.rel_alt)
            self.heading = msg.get("heading", self.heading)
        elif t == "GPS_RAW_INT":
            self.fix_type = msg.get("fix_type", self.fix_type)
            self.satellites = msg.get("satellites", self.satellites)
            self.gps_ok = self.fix_type >= 3
            if msg.get("gps_lat", 0) != 0 or msg.get("gps_lon", 0) != 0:
                self.lat = msg.get("gps_lat", self.lat)
                self.lon = msg.get("gps_lon", self.lon)
        elif t == "VFR_HUD":
            self.groundspeed = msg.get("groundspeed", self.groundspeed)
            self.airspeed = msg.get("airspeed", self.airspeed)
            self.climb = msg.get("climb", self.climb)
            self.throttle = msg.get("throttle", self.throttle)
            if msg.get("heading", 0) != 0:
                self.heading = msg.get("heading", self.heading)
            if msg.get("hud_alt", 0) != 0:
                self.alt = msg.get("hud_alt", self.alt)
        elif t == "SYS_STATUS":
            if msg.get("battery", -1) >= 0:
                self.battery = msg.get("battery", self.battery)
            if msg.get("voltage") is not None:
                self.voltage = msg.get("voltage", self.voltage)
            if msg.get("current") is not None:
                self.current = msg.get("current", self.current)
            if msg.get("load") is not None:
                self.load = msg.get("load", self.load)
            if msg.get("drop_rate_comm") is not None:
                self.drop_rate_comm = msg.get("drop_rate_comm", self.drop_rate_comm)
            if msg.get("errors_comm") is not None:
                self.errors_comm = msg.get("errors_comm", self.errors_comm)
        elif t == "BATTERY_STATUS":
            if msg.get("battery", -1) >= 0:
                self.battery = msg.get("battery", self.battery)
            if msg.get("current") is not None:
                self.current = msg.get("current", self.current)
            if msg.get("temperature") is not None:
                self.temperature = msg.get("temperature", self.temperature)
        elif t == "LOCAL_POSITION_NED":
            self.local_x = msg.get("local_x", self.local_x)
            self.local_y = msg.get("local_y", self.local_y)
            self.local_z = msg.get("local_z", self.local_z)
            self.local_vx = msg.get("local_vx", self.local_vx)
            self.local_vy = msg.get("local_vy", self.local_vy)
            self.local_vz = msg.get("local_vz", self.local_vz)
        elif t == "VIBRATION":
            self.vibration_x = msg.get("vibration_x", self.vibration_x)
            self.vibration_y = msg.get("vibration_y", self.vibration_y)
            self.vibration_z = msg.get("vibration_z", self.vibration_z)
        elif t == "DISTANCE_SENSOR":
            if msg.get("range_m") is not None:
                self.range_m = msg.get("range_m", self.range_m)
            if msg.get("range_min_cm") is not None:
                self.range_min_cm = msg.get("range_min_cm", self.range_min_cm)
            if msg.get("range_max_cm") is not None:
                self.range_max_cm = msg.get("range_max_cm", self.range_max_cm)
        elif t == "MCU_STATUS":
            if msg.get("mcu_temp") is not None:
                self.mcu_temp = msg.get("mcu_temp", self.mcu_temp)
            if msg.get("mcu_voltage") is not None:
                self.mcu_voltage = msg.get("mcu_voltage", self.mcu_voltage)
        elif t == "WIND":
            self.wind_speed = msg.get("wind_speed", self.wind_speed)
            self.wind_direction = msg.get("wind_direction", self.wind_direction)
        elif t == "RC_CHANNELS":
            if msg.get("rssi") is not None:
                self.rssi = msg.get("rssi", self.rssi)
        elif t == "EKF_STATUS_REPORT":
            if msg.get("ekf_ok") is not None:
                self.ekf_ok = msg.get("ekf_ok", self.ekf_ok)
        elif t == "OPTICAL_FLOW":
            if msg.get("flow_ground_distance") is not None:
                self.ground_distance = msg.get("flow_ground_distance", self.ground_distance)
            if msg.get("flow_quality") is not None:
                self.flow_quality = msg.get("flow_quality", self.flow_quality)
        elif t == "SYSTEM_TIME":
            if msg.get("boot_ms") is not None:
                self.boot_ms = msg.get("boot_ms", self.boot_ms)

    def as_row(self) -> tuple:
        return (
            self.last_seen, self.lat, self.lon, self.alt, self.heading,
            self.pitch, self.roll, self.yaw, self.battery, self.voltage,
            self.current, self.mode, 1 if self.armed else 0, self.satellites,
            self.fix_type, 1 if self.gps_ok else 0, 1 if self.online else 0,
            self.range_m, self.vibration_x, self.vibration_y, self.vibration_z,
            self.mcu_temp, self.local_x, self.local_y, self.local_z,
            self.wind_speed, self.rssi, self.load,
            None if self.ekf_ok is None else (1 if self.ekf_ok else 0),
            self.temperature, self.ground_distance,
        )


class Registry:
    def __init__(self):
        self._states: Dict[int, DroneState] = {}
        self._drone_cache: Dict[int, dict] = {}
        self._lock = threading.Lock()

    # ---- live state -------------------------------------------------
    def update(self, msg: dict) -> None:
        sysid = msg["sysid"]
        with self._lock:
            state = self._states.get(sysid)
            if state is None:
                state = DroneState(sysid)
                self._states[sysid] = state
            state.apply(msg)
            should_persist = settings.TELEMETRY_ENABLED and (
                time.time() - state._last_persist >= settings.TELEMETRY_INTERVAL_SECONDS
            )
        if should_persist:
            state._last_persist = time.time()
            self._persist(state)

    def _persist(self, state: DroneState) -> None:
        drone = self.ensure_drone(state.sysid)
        row = state.as_row()
        db.execute(
            "INSERT INTO telemetry (drone_id, ts, lat, lon, alt, heading, pitch, roll, yaw,"
            " battery, voltage, current, mode, armed, satellites, fix_type, gps_ok, link_ok,"
            " range_m, vibration_x, vibration_y, vibration_z, mcu_temp,"
            " local_x, local_y, local_z, wind_speed, rssi, load, ekf_ok,"
            " temperature, ground_distance)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,"
            " ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (drone["id"], *row),
        )

    # ---- drone metadata ---------------------------------------------
    def ensure_drone(self, sysid: int) -> dict:
        cached = self._drone_cache.get(sysid)
        if cached is not None:
            return cached
        row = db.query_one("SELECT * FROM drones WHERE sysid = ?", (sysid,))
        if row is None:
            now = datetime.now(timezone.utc).isoformat()
            db.execute(
                "INSERT INTO drones (sysid, name, description, enabled, created_at)"
                " VALUES (?, ?, '', 1, ?)",
                (sysid, f"无人机 {sysid}", now),
            )
            row = db.query_one("SELECT * FROM drones WHERE sysid = ?", (sysid,))
        entry = dict(row)
        self._drone_cache[sysid] = entry
        return entry

    def invalidate_drone(self, sysid: int) -> None:
        self._drone_cache.pop(sysid, None)

    def known_drones(self) -> List[dict]:
        return [dict(r) for r in db.query("SELECT * FROM drones ORDER BY sysid")]

    # ---- snapshots ---------------------------------------------------
    def snapshot(self, sysid: Optional[int] = None) -> List[dict]:
        with self._lock:
            states = list(self._states.values())
        result = []
        for state in states:
            if sysid is not None and state.sysid != sysid:
                continue
            meta = self.ensure_drone(state.sysid)
            result.append({
                "id": meta["id"],
                "sysid": state.sysid,
                "name": meta["name"],
                "description": meta["description"],
                "enabled": bool(meta["enabled"]),
                "online": state.online,
                "armed": state.armed,
                "mode": state.mode,
                "custom_mode": state.custom_mode,
                "system_status": state.system_status_label,
                "roll": state.roll,
                "pitch": state.pitch,
                "yaw": state.yaw,
                "heading": state.heading,
                "lat": state.lat,
                "lon": state.lon,
                "alt": state.alt,
                "rel_alt": state.rel_alt,
                "groundspeed": state.groundspeed,
                "airspeed": state.airspeed,
                "climb": state.climb,
                "throttle": state.throttle,
                "battery": state.battery,
                "voltage": state.voltage,
                "current": state.current,
                "satellites": state.satellites,
                "fix_type": state.fix_type,
                "gps_ok": state.gps_ok,
                "local_x": state.local_x,
                "local_y": state.local_y,
                "local_z": state.local_z,
                "local_vx": state.local_vx,
                "local_vy": state.local_vy,
                "local_vz": state.local_vz,
                "vibration_x": state.vibration_x,
                "vibration_y": state.vibration_y,
                "vibration_z": state.vibration_z,
                "range_m": state.range_m,
                "range_min_cm": state.range_min_cm,
                "range_max_cm": state.range_max_cm,
                "mcu_temp": state.mcu_temp,
                "mcu_voltage": state.mcu_voltage,
                "wind_speed": state.wind_speed,
                "wind_direction": state.wind_direction,
                "rssi": state.rssi,
                "load": state.load,
                "drop_rate_comm": state.drop_rate_comm,
                "errors_comm": state.errors_comm,
                "ekf_ok": state.ekf_ok,
                "temperature": state.temperature,
                "ground_distance": state.ground_distance,
                "flow_quality": state.flow_quality,
                "boot_ms": state.boot_ms,
                "last_seen": state.last_seen,
            })
        return result

    def touch_offline(self, sysid: int) -> None:
        with self._lock:
            state = self._states.get(sysid)
        if state is not None:
            state.online = False

    def link_state(self, sysid: int) -> Optional[DroneState]:
        with self._lock:
            return self._states.get(sysid)


registry = Registry()
