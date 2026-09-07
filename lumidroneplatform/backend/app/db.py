"""SQLite persistence layer.

A single shared connection guarded by a lock keeps the code simple and is
more than enough for a small fleet. WAL mode keeps writes cheap while the
broadcaster reads snapshots concurrently.
"""
import sqlite3
import threading
from datetime import datetime, timezone
from typing import List, Optional

from .config import settings

_conn: Optional[sqlite3.Connection] = None
_lock = threading.Lock()

_SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'viewer',  -- 'admin' | 'viewer'
    created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS drones (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    sysid       INTEGER NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    enabled     INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS telemetry (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    drone_id    INTEGER NOT NULL,
    ts          REAL NOT NULL,
    lat         REAL, lon REAL, alt REAL,
    heading     REAL, pitch REAL, roll REAL, yaw REAL,
    battery     REAL, voltage REAL, current REAL,
    mode        TEXT, armed INTEGER,
    satellites  INTEGER, fix_type INTEGER,
    gps_ok      INTEGER, link_ok INTEGER,
    range_m     REAL,
    vibration_x REAL, vibration_y REAL, vibration_z REAL,
    mcu_temp    REAL,
    local_x     REAL, local_y REAL, local_z REAL,
    wind_speed  REAL, rssi REAL, load REAL,
    ekf_ok      INTEGER, temperature REAL, ground_distance REAL
);
CREATE INDEX IF NOT EXISTS idx_telemetry_drone_ts ON telemetry (drone_id, ts);

CREATE TABLE IF NOT EXISTS alerts (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    drone_id     INTEGER,
    rule         TEXT NOT NULL,
    level        TEXT NOT NULL,  -- 'info' | 'warning' | 'critical'
    message      TEXT NOT NULL,
    active       INTEGER NOT NULL DEFAULT 1,
    triggered_at REAL NOT NULL,
    resolved_at  REAL
);
CREATE INDEX IF NOT EXISTS idx_alerts_drone ON alerts (drone_id, active);

CREATE TABLE IF NOT EXISTS logs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    ts         REAL NOT NULL,
    actor      TEXT NOT NULL,
    action     TEXT NOT NULL,
    detail     TEXT NOT NULL DEFAULT ''
);
"""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(settings.DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


# Columns added to the telemetry table after its initial release. Adding them
# here keeps databases created before the real-world alignment working without
# a manual rebuild.
_TELEMETRY_ADDED_COLUMNS = {
    "range_m": "REAL", "vibration_x": "REAL", "vibration_y": "REAL",
    "vibration_z": "REAL", "mcu_temp": "REAL", "local_x": "REAL",
    "local_y": "REAL", "local_z": "REAL", "wind_speed": "REAL",
    "rssi": "REAL", "load": "REAL", "ekf_ok": "INTEGER",
    "temperature": "REAL", "ground_distance": "REAL",
}


def _migrate(conn: sqlite3.Connection) -> None:
    """Idempotently add telemetry columns missing from older databases."""
    existing = {row[1] for row in conn.execute("PRAGMA table_info(telemetry)")}
    for name, coltype in _TELEMETRY_ADDED_COLUMNS.items():
        if name not in existing:
            conn.execute("ALTER TABLE telemetry ADD COLUMN %s %s" % (name, coltype))


def get_conn() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        _conn = _connect()
        _conn.executescript(_SCHEMA)
        _migrate(_conn)
        _conn.commit()
    return _conn


def query(sql: str, params: tuple = ()) -> List[sqlite3.Row]:
    with _lock:
        conn = get_conn()
        return conn.execute(sql, params).fetchall()


def query_one(sql: str, params: tuple = ()) -> Optional[sqlite3.Row]:
    rows = query(sql, params)
    return rows[0] if rows else None


def execute(sql: str, params: tuple = ()) -> int:
    with _lock:
        conn = get_conn()
        cur = conn.execute(sql, params)
        conn.commit()
        return cur.lastrowid


def prune_old() -> None:
    """Trim telemetry/alerts/logs beyond their retention windows."""
    now = datetime.now(timezone.utc).timestamp()
    execute(
        "DELETE FROM telemetry WHERE ts < ?",
        (now - settings.TELEMETRY_RETENTION_DAYS * 86400,),
    )
    execute(
        "DELETE FROM alerts WHERE resolved_at IS NOT NULL AND resolved_at < ?",
        (now - settings.ALERT_RETENTION_DAYS * 86400,),
    )
    execute(
        "DELETE FROM logs WHERE ts < ?",
        (now - settings.LOG_RETENTION_DAYS * 86400,),
    )


def add_log(actor: str, action: str, detail: str = "") -> None:
    execute(
        "INSERT INTO logs (ts, actor, action, detail) VALUES (?, ?, ?, ?)",
        (datetime.now(timezone.utc).timestamp(), actor, action, detail),
    )
