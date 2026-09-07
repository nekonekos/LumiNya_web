"""Central configuration loaded from environment variables.

Everything has a safe default so the backend can be started locally with
``python run.py`` and overridden in production via environment variables.
"""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent


def _as_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


class Settings:
    # HTTP API (frontend talks to this)
    API_HOST: str = os.getenv("LUMIDRONE_API_HOST", "0.0.0.0")
    API_PORT: int = int(os.getenv("LUMIDRONE_API_PORT", "8000"))

    # DTU TCP server (4G DTUs dial in to this)
    DTU_HOST: str = os.getenv("LUMIDRONE_DTU_HOST", "0.0.0.0")
    DTU_PORT: int = int(os.getenv("LUMIDRONE_DTU_PORT", "5760"))

    # Authentication
    JWT_SECRET: str = os.getenv("LUMIDRONE_JWT_SECRET", "dev-secret-change-me")
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = int(os.getenv("LUMIDRONE_JWT_EXPIRE_MINUTES", "1440"))

    # Database
    DB_PATH: str = os.getenv("LUMIDRONE_DB_PATH", str(BASE_DIR / "lumidrone.db"))

    # Read-only enforcement: commands are rejected unless this is explicitly enabled.
    ALLOW_COMMANDS: bool = _as_bool("LUMIDRONE_ALLOW_COMMANDS", False)

    # Telemetry history persistence
    TELEMETRY_ENABLED: bool = _as_bool("LUMIDRONE_TELEMETRY_ENABLED", True)
    TELEMETRY_INTERVAL_SECONDS: float = float(os.getenv("LUMIDRONE_TELEMETRY_INTERVAL", "5.0"))

    # Real-time snapshot broadcast cadence (seconds)
    BROADCAST_INTERVAL_SECONDS: float = float(os.getenv("LUMIDRONE_BROADCAST_INTERVAL", "0.25"))

    # Alert thresholds
    LINK_LOST_SECONDS: float = float(os.getenv("LUMIDRONE_LINK_LOST_SECONDS", "15"))
    LOW_BATTERY_WARN: float = float(os.getenv("LUMIDRONE_LOW_BATTERY_WARN", "20"))
    LOW_BATTERY_CRITICAL: float = float(os.getenv("LUMIDRONE_LOW_BATTERY_CRITICAL", "10"))
    ATTITUDE_LIMIT_DEG: float = float(os.getenv("LUMIDRONE_ATTITUDE_LIMIT", "60"))

    # Alert/log retention (days)
    ALERT_RETENTION_DAYS: int = int(os.getenv("LUMIDRONE_ALERT_RETENTION_DAYS", "30"))
    LOG_RETENTION_DAYS: int = int(os.getenv("LUMIDRONE_LOG_RETENTION_DAYS", "90"))
    TELEMETRY_RETENTION_DAYS: int = int(os.getenv("LUMIDRONE_TELEMETRY_RETENTION_DAYS", "7"))


settings = Settings()
