"""WebSocket connection manager broadcasting live snapshots to clients."""
import asyncio
import json
from typing import Set

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        self.active: Set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self.active.add(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        self.active.discard(websocket)

    async def broadcast(self, message: dict) -> None:
        if not self.active:
            return
        text = json.dumps(message, ensure_ascii=False, default=str)
        dead = []
        for ws in list(self.active):
            try:
                await ws.send_text(text)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)


manager = ConnectionManager()
