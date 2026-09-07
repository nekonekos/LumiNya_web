"""MAVLink2 stream parser.

Each DTU connection owns one :class:`MavlinkParser`. Raw bytes are fed in and
complete messages come back as normalized dicts. MAVLink1 (0xFE) is tolerated
for backwards compatibility, but MAVLink2 (0xFD) is the primary protocol.
"""
from typing import List

from pymavlink.dialects.v10 import ardupilotmega as mavlink1
from pymavlink.dialects.v20 import ardupilotmega as mavlink2

# ArduCopter flight-mode enum (custom_mode). Plane/Rover use a different
# bitmask and fall back to "MODE_<n>".
ARDUPILOT_COPTER_MODES = {
    0: "STABILIZE", 1: "ACRO", 2: "ALT_HOLD", 3: "AUTO", 4: "GUIDED",
    5: "LOITER", 6: "RTL", 7: "CIRCLE", 9: "LAND", 11: "DRIFT",
    13: "SPORT", 14: "FLIP", 15: "AUTOTUNE", 16: "POSHOLD", 17: "BRAKE",
    18: "THROW", 19: "AVOID_ADSB", 20: "GUIDED_NOGPS", 21: "SMART_RTL",
    22: "FLOWHOLD", 23: "FOLLOW", 24: "ZIGZAG", 25: "SYSTEMID", 26: "AUTOROTATE",
}

SYSTEM_STATUS_LABELS = {
    0: "UNINIT", 1: "BOOT", 2: "CALIBRATING", 3: "STANDBY", 4: "ACTIVE",
    5: "CRITICAL", 6: "EMERGENCY", 7: "POWEROFF", 8: "FLIGHT_TERMINATION",
}


def mode_label(custom_mode: int) -> str:
    return ARDUPILOT_COPTER_MODES.get(custom_mode, f"MODE_{custom_mode}")


def _deg(value: float) -> float:
    return round(value * 57.29577951308232, 3)


def _normalize(msg) -> dict:
    msg_type = msg.get_type()
    data = msg.to_dict()
    out = {
        "type": msg_type,
        "sysid": msg.get_srcSystem(),
        "compid": msg.get_srcComponent(),
    }

    if msg_type == "HEARTBEAT":
        base_mode = int(data.get("base_mode", 0))
        out.update({
            "armed": bool(base_mode & 0x80),
            "custom_mode": int(data.get("custom_mode", 0)),
            "mode": mode_label(int(data.get("custom_mode", 0))),
            "system_status": int(data.get("system_status", 0)),
            "system_status_label": SYSTEM_STATUS_LABELS.get(int(data.get("system_status", 0)), "UNKNOWN"),
            "autopilot": int(data.get("autopilot", 0)),
            "vehicle_type": int(data.get("type", 0)),
        })
    elif msg_type == "ATTITUDE":
        out.update({
            "roll": _deg(data.get("roll", 0.0)),
            "pitch": _deg(data.get("pitch", 0.0)),
            "yaw": _deg(data.get("yaw", 0.0)),
            "rollspeed": data.get("rollspeed", 0.0),
            "pitchspeed": data.get("pitchspeed", 0.0),
            "yawspeed": data.get("yawspeed", 0.0),
        })
    elif msg_type == "GLOBAL_POSITION_INT":
        out.update({
            "lat": round(data.get("lat", 0) / 1e7, 7),
            "lon": round(data.get("lon", 0) / 1e7, 7),
            "alt": round(data.get("alt", 0) / 1000.0, 2),
            "rel_alt": round(data.get("relative_alt", 0) / 1000.0, 2),
            "heading": round(data.get("hdg", 0) / 100.0, 2),
            "vx": data.get("vx", 0),
            "vy": data.get("vy", 0),
            "vz": data.get("vz", 0),
        })
    elif msg_type == "GPS_RAW_INT":
        out.update({
            "fix_type": int(data.get("fix_type", 0)),
            "gps_lat": round(data.get("lat", 0) / 1e7, 7),
            "gps_lon": round(data.get("lon", 0) / 1e7, 7),
            "gps_alt": round(data.get("alt", 0) / 1000.0, 2),
            "satellites": int(data.get("satellites_visible", 0)),
            "eph": data.get("eph", 0),
            "epv": data.get("epv", 0),
        })
    elif msg_type == "VFR_HUD":
        out.update({
            "airspeed": data.get("airspeed", 0.0),
            "groundspeed": data.get("groundspeed", 0.0),
            "heading": data.get("heading", 0.0),
            "throttle": data.get("throttle", 0),
            "hud_alt": data.get("alt", 0.0),
            "climb": data.get("climb", 0.0),
        })
    elif msg_type == "SYS_STATUS":
        out.update({
            "voltage": round(data.get("voltage_battery", 0) / 1000.0, 3),
            "current": round(data.get("current_battery", 0) / 100.0, 2),
            "battery": int(data.get("battery_remaining", -1)),
        })
    elif msg_type == "BATTERY_STATUS":
        voltages = data.get("voltages", []) or []
        out.update({
            "battery": int(data.get("battery_remaining", -1)),
            "current": round(data.get("current_battery", 0) / 100.0, 2),
            "cell_min": round(min(voltages) / 1000.0, 3) if voltages else None,
            "cell_max": round(max(voltages) / 1000.0, 3) if voltages else None,
        })

    return out


class MavlinkParser:
    def __init__(self):
        self._v2 = mavlink2.MAVLink(None, srcSystem=255, srcComponent=190)
        self._v1 = mavlink1.MAVLink(None, srcSystem=255, srcComponent=190)
        self._version = None  # 2 or 1 once the stream version is known

    def feed(self, data: bytes) -> List[dict]:
        out = []
        for byte in data:
            if self._version is None:
                if byte == 0xFD:
                    self._version = 2
                elif byte == 0xFE:
                    self._version = 1
                else:
                    continue
            parser = self._v2 if self._version == 2 else self._v1
            msg = parser.parse_char(bytes([byte]))
            if msg is not None:
                try:
                    out.append(_normalize(msg))
                except Exception:
                    # A malformed payload should never take down the link.
                    continue
        return out
