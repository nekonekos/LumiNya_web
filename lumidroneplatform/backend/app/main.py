"""FastAPI application: REST API + WebSocket + background services."""
import asyncio
import logging
from contextlib import asynccontextmanager
from typing import List, Optional

from fastapi import Depends, FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from . import db
from .alerts.engine import engine
from .auth import _current_user, create_access_token, hash_password, require_admin, verify_password
from .config import settings
from .control.commands import validate_params
from .control.handler import get_handler
from .dtu.server import start_dtu_server
from .mavlink.registry import registry
from .models import (
    CommandRequest,
    DroneCreate,
    DroneUpdate,
    LoginRequest,
    TokenResponse,
    UserCreate,
)
from .websocket import manager

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
logger = logging.getLogger("lumidrone")


async def _broadcaster_loop() -> None:
    while True:
        await asyncio.sleep(settings.BROADCAST_INTERVAL_SECONDS)
        try:
            await manager.broadcast({
                "type": "snapshot",
                "drones": registry.snapshot(),
                "alerts": engine.active_alerts(),
            })
        except Exception:
            logger.exception("broadcast failed")


async def _prune_loop() -> None:
    while True:
        try:
            db.prune_old()
        except Exception:
            logger.exception("prune failed")
        await asyncio.sleep(3600)


@asynccontextmanager
async def lifespan(app: FastAPI):
    dtu_server = await start_dtu_server()
    tasks = [
        asyncio.create_task(engine.run_loop()),
        asyncio.create_task(_broadcaster_loop()),
        asyncio.create_task(_prune_loop()),
    ]
    yield
    dtu_server.close()
    await dtu_server.wait_closed()
    for task in tasks:
        task.cancel()


app = FastAPI(title="LumiDrone Platform", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------------------------------------------------
# Fleet snapshot helpers
# --------------------------------------------------------------------------
def _offline_placeholder(meta: dict) -> dict:
    return {
        "id": meta["id"], "sysid": meta["sysid"],
        "name": meta["name"], "description": meta["description"],
        "enabled": bool(meta["enabled"]), "online": False, "armed": False,
        "mode": "", "custom_mode": 0, "system_status": "",
        "roll": 0, "pitch": 0, "yaw": 0, "heading": 0,
        "lat": None, "lon": None, "alt": None, "rel_alt": None,
        "groundspeed": 0, "airspeed": 0, "climb": 0, "throttle": 0,
        "battery": -1, "voltage": None, "current": None,
        "satellites": 0, "fix_type": 0, "gps_ok": False, "last_seen": None,
    }


def _fleet() -> List[dict]:
    live = {d["sysid"]: d for d in registry.snapshot()}
    result = []
    for meta in registry.known_drones():
        result.append(live.get(meta["sysid"], _offline_placeholder(meta)))
    return result


def _drone_or_404(sysid: int) -> dict:
    for item in _fleet():
        if item["sysid"] == sysid:
            return item
    raise HTTPException(status_code=404, detail="drone_not_found")


# --------------------------------------------------------------------------
# Auth
# --------------------------------------------------------------------------
@app.post("/api/auth/login", response_model=TokenResponse)
def login(req: LoginRequest):
    user = db.query_one("SELECT id, username, password_hash, role FROM users WHERE username = ?", (req.username,))
    if user is None or not verify_password(req.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="invalid_credentials")
    token = create_access_token(user["id"], user["username"], user["role"])
    db.add_log(user["username"], "login", "登录成功")
    return TokenResponse(
        access_token=token, username=user["username"], role=user["role"]
    )


@app.get("/api/me")
def me(user: dict = Depends(_current_user)):
    return user


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "commands_enabled": settings.ALLOW_COMMANDS,
        "drones_online": sum(1 for d in registry.snapshot() if d["online"]),
        "drones_known": len(registry.known_drones()),
    }


# --------------------------------------------------------------------------
# Drones (read-only)
# --------------------------------------------------------------------------
@app.get("/api/drones")
def list_drones(user: dict = Depends(_current_user)):
    return {"drones": _fleet(), "commands_enabled": settings.ALLOW_COMMANDS}


@app.get("/api/drones/{sysid}")
def get_drone(sysid: int, user: dict = Depends(_current_user)):
    return _drone_or_404(sysid)


@app.get("/api/drones/{sysid}/history")
def drone_history(
    sysid: int,
    limit: int = Query(default=500, ge=1, le=5000),
    since: Optional[float] = Query(default=None),
    user: dict = Depends(_current_user),
):
    meta = registry.ensure_drone(sysid)
    if since is not None:
        rows = db.query(
            "SELECT * FROM telemetry WHERE drone_id = ? AND ts >= ? ORDER BY ts ASC LIMIT ?",
            (meta["id"], since, limit),
        )
    else:
        rows = db.query(
            "SELECT * FROM telemetry WHERE drone_id = ? ORDER BY ts DESC LIMIT ?",
            (meta["id"], limit),
        )
    history = [dict(r) for r in rows]
    if since is None:
        history.reverse()
    return {"drone_id": meta["id"], "history": history}


@app.get("/api/drones/{sysid}/alerts")
def drone_alerts(
    sysid: int,
    active: Optional[int] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=1000),
    user: dict = Depends(_current_user),
):
    meta = registry.ensure_drone(sysid)
    if active is not None:
        rows = db.query(
            "SELECT * FROM alerts WHERE drone_id = ? AND active = ? ORDER BY triggered_at DESC LIMIT ?",
            (meta["id"], active, limit),
        )
    else:
        rows = db.query(
            "SELECT * FROM alerts WHERE drone_id = ? ORDER BY triggered_at DESC LIMIT ?",
            (meta["id"], limit),
        )
    return {"drone_id": meta["id"], "alerts": [dict(r) for r in rows]}


@app.post("/api/drones/{sysid}/command")
def drone_command(sysid: int, req: CommandRequest, user: dict = Depends(require_admin)):
    err = validate_params(req.command, req.params)
    if err:
        raise HTTPException(status_code=400, detail=err)
    _drone_or_404(sysid)
    ok, detail = get_handler().handle(sysid, req.command, req.params)
    if not ok:
        raise HTTPException(status_code=403, detail=detail)
    db.add_log(user["username"], "command", f"{req.command} -> sysid {sysid}")
    return {"ok": True, "command": req.command, "sysid": sysid}


# --------------------------------------------------------------------------
# Admin: users & drones & logs
# --------------------------------------------------------------------------
@app.get("/api/admin/users")
def admin_list_users(user: dict = Depends(require_admin)):
    rows = db.query("SELECT id, username, role, created_at FROM users ORDER BY id")
    return {"users": [dict(r) for r in rows]}


@app.post("/api/admin/users")
def admin_create_user(req: UserCreate, user: dict = Depends(require_admin)):
    existing = db.query_one("SELECT id FROM users WHERE username = ?", (req.username,))
    if existing is not None:
        raise HTTPException(status_code=409, detail="username_exists")
    db.execute(
        "INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, ?, datetime('now'))",
        (req.username, hash_password(req.password), req.role),
    )
    db.add_log(user["username"], "create_user", f"创建账号 {req.username}（{req.role}）")
    return {"ok": True, "username": req.username}


@app.delete("/api/admin/users/{username}")
def admin_delete_user(username: str, user: dict = Depends(require_admin)):
    if username == user["username"]:
        raise HTTPException(status_code=400, detail="cannot_delete_self")
    existing = db.query_one("SELECT id FROM users WHERE username = ?", (username,))
    if existing is None:
        raise HTTPException(status_code=404, detail="user_not_found")
    db.execute("DELETE FROM users WHERE username = ?", (username,))
    db.add_log(user["username"], "delete_user", f"删除账号 {username}")
    return {"ok": True}


@app.post("/api/admin/drones")
def admin_create_drone(req: DroneCreate, user: dict = Depends(require_admin)):
    existing = db.query_one("SELECT id FROM drones WHERE sysid = ?", (req.sysid,))
    if existing is not None:
        raise HTTPException(status_code=409, detail="sysid_exists")
    db.execute(
        "INSERT INTO drones (sysid, name, description, enabled, created_at) VALUES (?, ?, ?, 1, datetime('now'))",
        (req.sysid, req.name, req.description),
    )
    db.add_log(user["username"], "create_drone", f"登记无人机 sysid={req.sysid} {req.name}")
    return {"ok": True, "sysid": req.sysid}


@app.patch("/api/admin/drones/{sysid}")
def admin_update_drone(sysid: int, req: DroneUpdate, user: dict = Depends(require_admin)):
    registry.ensure_drone(sysid)
    if req.name is not None:
        db.execute("UPDATE drones SET name = ? WHERE sysid = ?", (req.name, sysid))
    if req.description is not None:
        db.execute("UPDATE drones SET description = ? WHERE sysid = ?", (req.description, sysid))
    if req.enabled is not None:
        db.execute("UPDATE drones SET enabled = ? WHERE sysid = ?", (1 if req.enabled else 0, sysid))
    registry.invalidate_drone(sysid)
    db.add_log(user["username"], "update_drone", f"更新无人机 sysid={sysid}")
    return {"ok": True, "sysid": sysid}


@app.delete("/api/admin/drones/{sysid}")
def admin_delete_drone(sysid: int, user: dict = Depends(require_admin)):
    existing = db.query_one("SELECT id FROM drones WHERE sysid = ?", (sysid,))
    if existing is None:
        raise HTTPException(status_code=404, detail="drone_not_found")
    db.execute("DELETE FROM drones WHERE sysid = ?", (sysid,))
    registry.invalidate_drone(sysid)
    db.add_log(user["username"], "delete_drone", f"删除无人机 sysid={sysid}")
    return {"ok": True}


@app.get("/api/admin/logs")
def admin_logs(limit: int = Query(default=200, ge=1, le=2000), user: dict = Depends(require_admin)):
    rows = db.query("SELECT * FROM logs ORDER BY ts DESC LIMIT ?", (limit,))
    return {"logs": [dict(r) for r in rows]}


# --------------------------------------------------------------------------
# WebSocket
# --------------------------------------------------------------------------
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str = Query(default="")):
    try:
        from .auth import decode_token  # local import to keep imports tidy
        payload = decode_token(token)
        user_row = db.query_one("SELECT id, username, role FROM users WHERE id = ?", (int(payload["sub"]),))
        if user_row is None:
            await websocket.close(code=4401)
            return
    except Exception:
        await websocket.close(code=4401)
        return

    await manager.connect(websocket)
    try:
        # Push an immediate snapshot so the UI renders instantly.
        await websocket.send_json({
            "type": "snapshot",
            "drones": registry.snapshot(),
            "alerts": engine.active_alerts(),
        })
        while True:
            # Ignore inbound messages; this is a read-only platform.
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(websocket)
