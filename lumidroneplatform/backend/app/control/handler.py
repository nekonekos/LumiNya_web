"""Command handlers for the reserved remote-control layer.

- ReadOnlyHandler (default): rejects every command with a clear reason.
- MavlinkHandler: future implementation that writes MAVLink commands back over
  the DTU connection. Kept as a stub so the switching point is explicit.
"""
from abc import ABC, abstractmethod
from typing import Tuple

from ..config import settings


class CommandHandler(ABC):
    @abstractmethod
    def handle(self, sysid: int, command: str, params: dict) -> Tuple[bool, str]:
        """Return (success, detail)."""


class ReadOnlyHandler(CommandHandler):
    def handle(self, sysid: int, command: str, params: dict) -> Tuple[bool, str]:
        return False, "commands_disabled"


class MavlinkHandler(CommandHandler):
    """Placeholder for future command delivery over the DTU socket.

    Not wired up while ALLOW_COMMANDS is false; the actual MAVLink command
    encoding (arm/disarm/takeoff/land/rtl/set_mode/goto) would be added here.
    """
    def handle(self, sysid: int, command: str, params: dict) -> Tuple[bool, str]:
        return False, "not_implemented"


def get_handler() -> CommandHandler:
    if settings.ALLOW_COMMANDS:
        return MavlinkHandler()
    return ReadOnlyHandler()
