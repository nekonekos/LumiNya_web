"""Alert engine: evaluates telemetry rules and persists trigger/resolve events.

Rules are evaluated against the registry snapshot once per tick. Active alerts
are deduplicated in memory (keyed by sysid + rule) and mirrored to SQLite so
history survives restarts.
"""
import asyncio
import time
from datetime import datetime, timezone
from typing import Dict, List, Set, Tuple

from .. import db
from ..config import settings
from ..mavlink.registry import Registry, registry

FAILSAFE_MODES = {"RTL", "LAND", "AUTOROTATE", "BRAKE", "SMART_RTL"}


def _now() -> float:
    return datetime.now(timezone.utc).timestamp()


class AlertEngine:
    def __init__(self, registry: Registry):
        self.registry = registry
        # (sysid, rule) -> {"level", "message", "alert_id"}
        self.active: Dict[Tuple[int, str], dict] = {}

    # ---- rule evaluation -------------------------------------------
    @staticmethod
    def _rules(snap: dict) -> Dict[str, Tuple[str, str]]:
        """Return {rule: (level, message)} for currently active conditions."""
        rules: Dict[str, Tuple[str, str]] = {}

        if not snap["online"]:
            rules["link_lost"] = ("critical", "链路丢失 / 心跳超时")

        battery = snap["battery"]
        if battery >= 0:
            if battery <= settings.LOW_BATTERY_CRITICAL:
                rules["low_battery"] = ("critical", f"电量极低（{battery}%）")
            elif battery <= settings.LOW_BATTERY_WARN:
                rules["low_battery"] = ("warning", f"电量偏低（{battery}%）")

        if snap["armed"]:
            if snap["fix_type"] < 3:
                rules["gps_lost"] = ("warning", f"GPS 丢星（fix={snap['fix_type']}，卫星 {snap['satellites']}）")
            if snap["mode"] in FAILSAFE_MODES:
                rules["mode_failsafe"] = ("warning", f"进入 {snap['mode']} 保护模式")

        limit = settings.ATTITUDE_LIMIT_DEG
        if abs(snap["pitch"]) > limit or abs(snap["roll"]) > limit:
            rules["attitude_limit"] = ("critical", "姿态越限（俯仰/横滚超出安全范围）")

        return rules

    # ---- lifecycle ---------------------------------------------------
    def _drone_id(self, sysid: int) -> int:
        return self.registry.ensure_drone(sysid)["id"]

    def _trigger(self, sysid: int, rule: str, level: str, message: str) -> None:
        drone_id = self._drone_id(sysid)
        alert_id = db.execute(
            "INSERT INTO alerts (drone_id, rule, level, message, active, triggered_at)"
            " VALUES (?, ?, ?, ?, 1, ?)",
            (drone_id, rule, level, message, _now()),
        )
        self.active[(sysid, rule)] = {"level": level, "message": message, "alert_id": alert_id}

    def _resolve(self, sysid: int, rule: str) -> None:
        key = (sysid, rule)
        entry = self.active.pop(key, None)
        if entry is None:
            return
        db.execute(
            "UPDATE alerts SET active = 0, resolved_at = ? WHERE id = ?",
            (_now(), entry["alert_id"]),
        )

    async def tick(self) -> None:
        snapshots = self.registry.snapshot()
        seen: Set[Tuple[int, str]] = set()
        now = time.time()

        for snap in snapshots:
            sysid = snap["sysid"]
            state = self.registry.link_state(sysid)
            # Mark offline when heartbeat has timed out.
            if state is not None and snap["online"] and (now - state.last_seen) > settings.LINK_LOST_SECONDS:
                self.registry.touch_offline(sysid)
                snap["online"] = False

            current = self._rules(snap)
            for rule, (level, message) in current.items():
                seen.add((sysid, rule))
                existing = self.active.get((sysid, rule))
                if existing is None:
                    self._trigger(sysid, rule, level, message)
                elif existing["level"] != level:
                    self._resolve(sysid, rule)
                    self._trigger(sysid, rule, level, message)

            # Resolve alerts whose condition disappeared.
            for (s, rule) in list(self.active.keys()):
                if s == sysid and rule not in current:
                    self._resolve(s, rule)

        # Resolve alerts for drones that vanished entirely from the registry.
        live_sysids = {snap["sysid"] for snap in snapshots}
        for (s, rule) in list(self.active.keys()):
            if s not in live_sysids:
                self._resolve(s, rule)

    async def run_loop(self) -> None:
        while True:
            try:
                await self.tick()
            except Exception:
                # Never let the alert loop die.
                pass
            await asyncio.sleep(1.0)

    # ---- read API ----------------------------------------------------
    def active_alerts(self) -> List[dict]:
        out = []
        for (sysid, rule), entry in self.active.items():
            meta = self.registry.ensure_drone(sysid)
            out.append({
                "sysid": sysid,
                "drone_id": meta["id"],
                "name": meta["name"],
                "rule": rule,
                "level": entry["level"],
                "message": entry["message"],
            })
        return out


engine = AlertEngine(registry)
