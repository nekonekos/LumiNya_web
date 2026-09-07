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
        "current", "satellites", "fix_type", "gps_ok", "_last_persist",
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
        elif t == "BATTERY_STATUS":
            if msg.get("battery", -1) >= 0:
                self.battery = msg.get("battery", self.battery)
            if msg.get("current") is not None:
                self.current = msg.get("current", self.current)

    def as_row(self) -> tuple:
        return (
            self.last_seen, self.lat, self.lon, self.alt, self.heading,
            self.pitch, self.roll, self.yaw, self.battery, self.voltage,
            self.current, self.mode, 1 if self.armed else 0, self.satellites,
            self.fix_type, 1 if self.gps_ok else 0, 1 if self.online else 0,
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
            " battery, voltage, current, mode, armed, satellites, fix_type, gps_ok, link_ok)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
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
