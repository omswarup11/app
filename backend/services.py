"""Cross-cutting DB services: atomic counters, audit log, notifications relay."""
import logging

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from core import new_id, now_utc
from models import AuditLog, Notification
from realtime import emit_user

logger = logging.getLogger("sanjeevan.services")


async def next_seq(session: AsyncSession, key: str) -> int:
    """Atomic, concurrency-safe sequence via INSERT ... ON CONFLICT ... RETURNING."""
    result = await session.execute(
        text(
            "INSERT INTO counters (key, seq) VALUES (:k, 1) "
            "ON CONFLICT (key) DO UPDATE SET seq = counters.seq + 1 "
            "RETURNING seq"
        ),
        {"k": key},
    )
    return int(result.scalar_one())


async def audit(
    session: AsyncSession,
    user_id: str | None,
    action: str,
    entity: str,
    entity_id: str,
    meta: dict | None = None,
) -> None:
    session.add(
        AuditLog(
            id=new_id("aud"),
            user_id=user_id,
            action=action,
            entity=entity,
            entity_id=entity_id,
            meta=meta or {},
        )
    )


async def notify(
    session: AsyncSession,
    user_id: str,
    title: str,
    message: str,
    kind: str = "general",
    action_url: str | None = None,
) -> dict:
    """Persist an in-app notification and stream it live over the websocket hub."""
    n = Notification(
        id=new_id("ntf"),
        user_id=user_id,
        title=title,
        message=message,
        type=kind,
        read=False,
        action_url=action_url,
        created_at=now_utc(),
    )
    session.add(n)
    payload = {
        "id": n.id,
        "user_id": user_id,
        "title": title,
        "message": message,
        "type": kind,
        "read": False,
        "action_url": action_url,
        "created_at": n.created_at.isoformat(),
    }
    try:
        await emit_user(user_id, "notification.new", payload)
    except Exception as exc:  # pragma: no cover
        logger.warning("realtime notify failed: %s", exc)
    return payload
