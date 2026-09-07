"""Command definitions for the reserved remote-control layer.

Currently the platform is READ-ONLY: these commands exist so the interface is
stable and future-proof, but nothing is sent until ALLOW_COMMANDS is enabled.
"""
from enum import Enum
from typing import Optional


class Command(str, Enum):
    ARM = "arm"
    DISARM = "disarm"
    TAKEOFF = "takeoff"
    LAND = "land"
    RTL = "rtl"
    SET_MODE = "set_mode"
    GOTO = "goto"


# Human-readable labels for the frontend (shown on disabled control buttons).
COMMAND_LABELS = {
    Command.ARM: "解锁",
    Command.DISARM: "上锁",
    Command.TAKEOFF: "起飞",
    Command.LAND: "降落",
    Command.RTL: "返航",
    Command.SET_MODE: "切换模式",
    Command.GOTO: "飞往坐标",
}


def validate_params(command: Command, params: dict) -> Optional[str]:
    """Return an error message, or None when params are acceptable."""
    if command == Command.TAKEOFF and "altitude" not in params:
        return "起飞指令缺少 altitude 参数"
    if command == Command.GOTO:
        if "lat" not in params or "lon" not in params:
            return "飞往坐标指令缺少 lat/lon 参数"
        if "altitude" not in params:
            return "飞往坐标指令缺少 altitude 参数"
    if command == Command.SET_MODE and "mode" not in params:
        return "切换模式指令缺少 mode 参数"
    return None
