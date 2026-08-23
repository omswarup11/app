"""WebSocket fan-out for queue / appointment / notification events."""
import asyncio
import logging
from collections import defaultdict

from fastapi import WebSocket

logger = logging.getLogger("sanjeevan.realtime")


class Hub:
    def __init__(self):
        self._rooms: dict[str, set[WebSocket]] = defaultdict(set)
        self._sockets: dict[WebSocket, set[str]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def join(self, ws: WebSocket, rooms: list[str]) -> None:
        async with self._lock:
            for room in rooms:
                self._rooms[room].add(ws)
                self._sockets[ws].add(room)

    async def leave(self, ws: WebSocket) -> None:
        async with self._lock:
            for room in self._sockets.pop(ws, set()):
                self._rooms[room].discard(ws)
                if not self._rooms[room]:
                    self._rooms.pop(room, None)

    async def emit(self, room: str, event: str, payload: dict) -> None:
        async with self._lock:
            targets = list(self._rooms.get(room, ()))
        dead: list[WebSocket] = []
        for ws in targets:
            try:
                await ws.send_json({"event": event, "payload": payload})
            except Exception:
                dead.append(ws)
        for ws in dead:
            await self.leave(ws)


hub = Hub()


def clinic_room(clinic_id: str, doctor_id: str | None = None) -> str:
    return f"clinic:{clinic_id}:doctor:{doctor_id}" if doctor_id else f"clinic:{clinic_id}"


def user_room(user_id: str) -> str:
    return f"user:{user_id}"


async def emit_queue_update(clinic_id: str, doctor_id: str, payload: dict) -> None:
    await hub.emit(clinic_room(clinic_id, doctor_id), "queue.updated", payload)
    await hub.emit(clinic_room(clinic_id), "queue.updated", payload)


async def emit_user(user_id: str, event: str, payload: dict) -> None:
    await hub.emit(user_room(user_id), event, payload)
