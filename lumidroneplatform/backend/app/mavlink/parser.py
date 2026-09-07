"""MAVLink stream parser aligned to real 4G-DTU captures.

Each DTU connection owns one :class:`MavlinkParser`. Raw bytes are fed in and
complete messages come back as normalized dicts. MAVLink2 (0xFD) is the primary
protocol; MAVLink1 (0xFE) is tolerated for backwards compatibility.

Real-world alignment (from captures in ``Desktop/drone/``):

* A 4G DTU prepends a **registration/hello block** (non-MAVLink ASCII such as
  ``"L261701AA002329"``) before the MAVLink2 frame stream. It is skipped and
  exposed via :attr:`MavlinkParser.header_len` / :attr:`header_ascii`.
* DTU links can suffer **single-byte truncation** which introduces a bad frame.
  pymavlink self-resyncs in robust mode; every dropped/bad span is counted as an
  *anomaly* instead of being treated as a genuine message, so a corrupt frame
  never marks a drone "online" or writes junk telemetry.
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
    return ARDUPILOT_COPTER_MODES.get(custom_mode, "MODE_%d" % custom_mode)


def _deg(value: float) -> float:
    return round(value * 57.29577951308232, 3)


def _norm_battery_temp(raw) -> float:
    """BATTERY_STATUS temperature is degC; 32767 means 'not available'."""
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return None
    return None if value == 32767 else round(value * 0.01, 1)


def _norm_rssi(raw) -> float:
    """RC_CHANNELS.rssi: 0-255, values >= 255 mean unknown."""
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return None
    return None if value >= 255 else value


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
        status = int(data.get("system_status", 0))
        out.update({
            "armed": bool(base_mode & 0x80),
            "custom_mode": int(data.get("custom_mode", 0)),
            "mode": mode_label(int(data.get("custom_mode", 0))),
            "system_status": status,
            "system_status_label": SYSTEM_STATUS_LABELS.get(status, "UNKNOWN"),
            "autopilot": int(data.get("autopilot", 0)),
            "vehicle_type": int(data.get("type", 0)),
            "mavlink_version": int(data.get("mavlink_version", 0)),
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
        lat = round(data.get("lat", 0) / 1e7, 7)
        lon = round(data.get("lon", 0) / 1e7, 7)
        out.update({
            "lat": lat,
            "lon": lon,
            "alt": round(data.get("alt", 0) / 1000.0, 2),
            "rel_alt": round(data.get("relative_alt", 0) / 1000.0, 2),
            "heading": round(data.get("hdg", 0) / 100.0, 2),
            "vx": data.get("vx", 0),
            "vy": data.get("vy", 0),
            "vz": data.get("vz", 0),
            "has_position": bool(lat or lon),
        })
    elif msg_type == "GPS_RAW_INT":
        fix_type = int(data.get("fix_type", 0))
        out.update({
            "fix_type": fix_type,
            "gps_lat": round(data.get("lat", 0) / 1e7, 7),
            "gps_lon": round(data.get("lon", 0) / 1e7, 7),
            "gps_alt": round(data.get("alt", 0) / 1000.0, 2),
            "satellites": int(data.get("satellites_visible", 0)),
            "eph": data.get("eph", 0),
            "epv": data.get("epv", 0),
            "h_acc": data.get("h_acc", 0),
            "v_acc": data.get("v_acc", 0),
            "vel_acc": data.get("vel_acc", 0),
            "yaw": data.get("yaw", 0),
            "gps_ok": fix_type >= 3,
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
            "load": round(data.get("load", 0) / 10.0, 1),
            "drop_rate_comm": data.get("drop_rate_comm", 0),
            "errors_comm": data.get("errors_comm", 0),
        })
    elif msg_type == "BATTERY_STATUS":
        voltages = data.get("voltages", []) or []
        out.update({
            "battery": int(data.get("battery_remaining", -1)),
            "current": round(data.get("current_battery", 0) / 100.0, 2),
            "cell_min": round(min(voltages) / 1000.0, 3) if voltages else None,
            "cell_max": round(max(voltages) / 1000.0, 3) if voltages else None,
            "temperature": _norm_battery_temp(data.get("temperature", 32767)),
            "time_remaining": data.get("time_remaining", 0),
            "charge_state": int(data.get("charge_state", 0)),
            "fault_bitmask": data.get("fault_bitmask", 0),
        })
    elif msg_type == "AHRS":
        out.update({
            "omega_ix": data.get("omegaIx", 0.0),
            "omega_iy": data.get("omegaIy", 0.0),
            "omega_iz": data.get("omegaIz", 0.0),
            "accel_weight": data.get("accel_weight", 0.0),
            "renorm_val": data.get("renorm_val", 0.0),
            "error_rp": data.get("error_rp", 0.0),
            "error_yaw": data.get("error_yaw", 0.0),
        })
    elif msg_type == "AHRS2":
        out.update({
            "ahrs_roll": _deg(data.get("roll", 0.0)),
            "ahrs_pitch": _deg(data.get("pitch", 0.0)),
            "ahrs_yaw": _deg(data.get("yaw", 0.0)),
            "ahrs_alt": data.get("altitude", 0.0),
            "ahrs_lat": round(data.get("lat", 0) / 1e7, 7),
            "ahrs_lon": round(data.get("lng", 0) / 1e7, 7),
        })
    elif msg_type == "DISTANCE_SENSOR":
        distance_cm = data.get("current_distance", 0)
        out.update({
            "distance_cm": distance_cm,
            "range_m": round(distance_cm / 100.0, 2),
            "range_min_cm": data.get("min_distance", 0),
            "range_max_cm": data.get("max_distance", 0),
            "sensor_type": int(data.get("type", 0)),
            "sensor_orientation": int(data.get("orientation", 0)),
            "signal_quality": data.get("signal_quality", 0),
        })
    elif msg_type == "EKF_STATUS_REPORT":
        flags = int(data.get("flags", 0))
        out.update({
            "ekf_flags": flags,
            "ekf_ok": bool(flags & 0x01),
            "ekf_velocity_variance": data.get("velocity_variance", 0.0),
            "ekf_pos_horiz_variance": data.get("pos_horiz_variance", 0.0),
            "ekf_pos_vert_variance": data.get("pos_vert_variance", 0.0),
            "ekf_compass_variance": data.get("compass_variance", 0.0),
            "ekf_terrain_alt_variance": data.get("terrain_alt_variance", 0.0),
            "ekf_airspeed_variance": data.get("airspeed_variance", 0.0),
        })
    elif msg_type == "GIMBAL_DEVICE_ATTITUDE_STATUS":
        out.update({
            "gimbal_id": data.get("gimbal_device_id", 0),
            "gimbal_q": list(data.get("q", []) or []),
            "gimbal_flags": data.get("flags", 0),
            "gimbal_failure_flags": data.get("failure_flags", 0),
        })
    elif msg_type == "LOCAL_POSITION_NED":
        out.update({
            "local_x": data.get("x", 0.0),
            "local_y": data.get("y", 0.0),
            "local_z": data.get("z", 0.0),
            "local_vx": data.get("vx", 0.0),
            "local_vy": data.get("vy", 0.0),
            "local_vz": data.get("vz", 0.0),
        })
    elif msg_type == "MCU_STATUS":
        out.update({
            "mcu_temp": round(data.get("MCU_temperature", 0) / 100.0, 1),
            "mcu_voltage": round(data.get("MCU_voltage", 0) / 1000.0, 3),
            "mcu_voltage_min": round(data.get("MCU_voltage_min", 0) / 1000.0, 3),
            "mcu_voltage_max": round(data.get("MCU_voltage_max", 0) / 1000.0, 3),
        })
    elif msg_type == "MEMINFO":
        out.update({
            "mem_brkval": data.get("brkval", 0),
            "mem_freemem": data.get("freemem", 0),
            "mem_freemem32": data.get("freemem32", 0),
        })
    elif msg_type == "MISSION_CURRENT":
        out.update({
            "mission_seq": data.get("seq", 0),
            "mission_total": data.get("total", 0),
            "mission_state": data.get("mission_state", 0),
        })
    elif msg_type == "NAV_CONTROLLER_OUTPUT":
        out.update({
            "nav_roll": _deg(data.get("nav_roll", 0.0)),
            "nav_pitch": _deg(data.get("nav_pitch", 0.0)),
            "nav_bearing": data.get("nav_bearing", 0),
            "target_bearing": data.get("target_bearing", 0),
            "wp_dist": data.get("wp_dist", 0),
            "alt_error": data.get("alt_error", 0.0),
            "aspd_error": data.get("aspd_error", 0.0),
            "xtrack_error": data.get("xtrack_error", 0.0),
        })
    elif msg_type == "OPTICAL_FLOW":
        out.update({
            "flow_x": data.get("flow_x", 0),
            "flow_y": data.get("flow_y", 0),
            "flow_comp_m_x": round(data.get("flow_comp_m_x", 0.0), 3),
            "flow_comp_m_y": round(data.get("flow_comp_m_y", 0.0), 3),
            "flow_quality": data.get("quality", 0),
            "flow_ground_distance": data.get("ground_distance", 0.0),
            "flow_rate_x": data.get("flow_rate_x", 0.0),
            "flow_rate_y": data.get("flow_rate_y", 0.0),
        })
    elif msg_type == "POWER_STATUS":
        out.update({
            "vcc": round(data.get("Vcc", 0) / 1000.0, 3),
            "vservo": round(data.get("Vservo", 0) / 1000.0, 3),
            "power_flags": data.get("flags", 0),
        })
    elif msg_type == "RC_CHANNELS":
        out.update({
            "rssi": _norm_rssi(data.get("rssi", 255)),
            "chan_count": data.get("chancount", 0),
        })
    elif msg_type == "SERVO_OUTPUT_RAW":
        out.update({
            "servo_port": data.get("port", 0),
            "servo_raw": [data.get("servo%d_raw" % i, 0) for i in range(1, 5)],
        })
    elif msg_type == "SYSTEM_TIME":
        out.update({
            "unix_time": round(data.get("time_unix_usec", 0) / 1e6, 3),
            "boot_ms": data.get("time_boot_ms", 0),
        })
    elif msg_type == "TERRAIN_REPORT":
        out.update({
            "terrain_height": data.get("terrain_height", 0.0),
            "current_height": data.get("current_height", 0.0),
            "terrain_spacing": data.get("spacing", 0),
            "terrain_loaded": data.get("loaded", 0),
        })
    elif msg_type == "VIBRATION":
        out.update({
            "vibration_x": data.get("vibration_x", 0.0),
            "vibration_y": data.get("vibration_y", 0.0),
            "vibration_z": data.get("vibration_z", 0.0),
            "clipping_0": data.get("clipping_0", 0),
            "clipping_1": data.get("clipping_1", 0),
            "clipping_2": data.get("clipping_2", 0),
        })
    elif msg_type == "WIND":
        out.update({
            "wind_direction": data.get("direction", 0.0),
            "wind_speed": data.get("speed", 0.0),
            "wind_speed_z": data.get("speed_z", 0.0),
        })

    return out


class MavlinkParser:
    def __init__(self):
        self._v2 = mavlink2.MAVLink(None, srcSystem=255, srcComponent=190)
        self._v1 = mavlink1.MAVLink(None, srcSystem=255, srcComponent=190)
        # DTU links suffer byte truncation; let pymavlink self-resync and
        # report the bad spans rather than raising an error that drops the link.
        self._v2.robust_parsing = True
        self._v1.robust_parsing = True
        self._version = None  # 2 or 1 once the stream version is known
        # Real-world alignment metrics.
        self.header_len = 0       # bytes of DTU registration/hello skipped
        self.header_ascii = ""    # printable ASCII of the DTU id block
        self.frames = 0           # valid frames decoded
        self.anomalies = 0        # number of bad/dropped frame spans
        self.bytes_dropped = 0    # raw bytes lost to desync/truncation
        self.msg_counts = {}      # type -> total messages seen
        self._header = bytearray()

    def _printable_header(self) -> str:
        return "".join(chr(b) for b in self._header if 0x20 <= b < 0x7F)

    def feed(self, data: bytes) -> List[dict]:
        out = []
        for byte in data:
            if self._version is None:
                if byte in (0xFD, 0xFE):
                    self._version = 2 if byte == 0xFD else 1
                    self.header_ascii = self._printable_header()
                else:
                    self._header.append(byte)
                    self.header_len += 1
                    continue
            parser = self._v2 if self._version == 2 else self._v1
            msg = parser.parse_char(bytes([byte]))
            if msg is None:
                continue
            # A truncated/desynced frame shows up as BAD_DATA in robust mode.
            # Count it as an anomaly and discard it so it never marks the
            # drone online or writes junk telemetry.
            if msg.get_type() == "BAD_DATA":
                self.anomalies += 1
                self.bytes_dropped += len(getattr(msg, "data", b""))
                continue
            msg_type = msg.get_type()
            # pymavlink falls back to UNKNOWN_<id> for vendor/non-standard
            # message ids; they carry no telemetry, so skip them entirely.
            if msg_type.startswith("UNKNOWN_"):
                continue
            try:
                norm = _normalize(msg)
            except Exception:
                # A malformed payload should never take down the link.
                continue
            self.frames += 1
            self.msg_counts[msg_type] = self.msg_counts.get(msg_type, 0) + 1
            out.append(norm)
        return out
