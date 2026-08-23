"""Live queue: patient view, staff controls, walk-ins, and the realtime websocket."""
from datetime import date as _date

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core import new_id
from db import get_session, session_scope
from models import (
    Appointment,
    ClinicStaff,
    Doctor,
    Patient,
    QueueEntry,
    QueueEvent,
    User,
    UserSession,
)
from realtime import clinic_room, emit_queue_update, hub, user_room
from security import Principal, get_principal, require_roles
from services import audit, next_seq, notify

router = APIRouter(prefix="/api", tags=["queue"])
AVG_MINUTES = 8

STAFF_QUEUE = require_roles("receptionist", "doctor", "clinic_admin")


class NextIn(BaseModel):
    doctor_id: str | None = None


class WalkInIn(BaseModel):
    doctor_id: str
    patient_name: str
    phone: str | None = None
    reason: str = ""


def _entry_public(e: QueueEntry) -> dict:
    return {
        "id": e.id,
        "token_number": e.token_number,
        "queue_position": e.queue_position,
        "status": e.status,
        "patient_name": e.patient_name,
        "patient_id": e.patient_id,
        "appointment_id": e.appointment_id,
    }


async def _snapshot(session: AsyncSession, clinic_id: str, doctor_id: str, day: _date) -> dict:
    entries = (
        await session.execute(
            select(QueueEntry)
            .where(
                QueueEntry.clinic_id == clinic_id,
                QueueEntry.doctor_id == doctor_id,
                QueueEntry.date == day,
            )
            .order_by(QueueEntry.queue_position)
        )
    ).scalars().all()
    serving = next((e for e in entries if e.status in ("in_consultation", "called")), None)
    completed = [e for e in entries if e.status == "completed"]
    now_serving = (
        serving.token_number
        if serving
        else (max((e.token_number for e in completed), default=0))
    )
    waiting = [e for e in entries if e.status in ("waiting", "called", "in_consultation")]
    events = (
        await session.execute(
            select(QueueEvent)
            .where(
                QueueEvent.clinic_id == clinic_id,
                QueueEvent.doctor_id == doctor_id,
                QueueEvent.date == day,
            )
            .order_by(QueueEvent.created_at.desc())
            .limit(6)
        )
    ).scalars().all()
    return {
        "clinic_id": clinic_id,
        "doctor_id": doctor_id,
        "date": day.isoformat(),
        "now_serving": now_serving,
        "doctor_status": "in_clinic",
        "waiting": [_entry_public(e) for e in waiting],
        "events": [
            {"type": ev.type, "message": ev.message, "token_number": ev.token_number,
             "created_at": ev.created_at.isoformat()}
            for ev in events
        ],
    }


@router.get("/queue/me")
async def my_queue(
    principal: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_session),
):
    if not principal.patient_id:
        raise HTTPException(403, "Patients only")
    today = _date.today()
    mine = (
        await session.execute(
            select(QueueEntry)
            .where(
                QueueEntry.patient_id == principal.patient_id,
                QueueEntry.date == today,
                QueueEntry.status.in_(["waiting", "called", "in_consultation"]),
            )
            .order_by(QueueEntry.queue_position)
        )
    ).scalars().first()
    if not mine:
        return {"in_queue": False}
    snap = await _snapshot(session, mine.clinic_id, mine.doctor_id, today)
    doc = (await session.execute(select(Doctor).where(Doctor.id == mine.doctor_id))).scalar_one()
    people_ahead = sum(
        1
        for e in snap["waiting"]
        if e["queue_position"] < mine.queue_position and e["status"] != "completed"
    )
    return {
        "in_queue": True,
        "my_token": mine.token_number,
        "status": mine.status,
        "now_serving": snap["now_serving"],
        "people_ahead": people_ahead,
        "estimated_wait_mins": people_ahead * AVG_MINUTES,
        "doctor": {"name": doc.name, "specialization": doc.specialization},
        "doctor_status": snap["doctor_status"],
        "events": snap["events"],
    }


async def _resolve_doctor(principal: Principal, doctor_id: str | None) -> tuple[str, str]:
    if principal.role == "doctor" and principal.doctor_id:
        return principal.clinic_id, principal.doctor_id
    if not doctor_id:
        raise HTTPException(400, "doctor_id required")
    return principal.clinic_id, doctor_id


@router.get("/queue")
async def staff_queue(
    doctor_id: str | None = None,
    principal: Principal = Depends(STAFF_QUEUE),
    session: AsyncSession = Depends(get_session),
):
    clinic_id, did = await _resolve_doctor(principal, doctor_id)
    return await _snapshot(session, clinic_id, did, _date.today())


async def _push(session: AsyncSession, clinic_id: str, doctor_id: str):
    snap = await _snapshot(session, clinic_id, doctor_id, _date.today())
    await emit_queue_update(clinic_id, doctor_id, snap)
    return snap


@router.post("/queue/next")
async def call_next(
    body: NextIn,
    principal: Principal = Depends(STAFF_QUEUE),
    session: AsyncSession = Depends(get_session),
):
    clinic_id, doctor_id = await _resolve_doctor(principal, body.doctor_id)
    today = _date.today()
    entries = (
        await session.execute(
            select(QueueEntry)
            .where(QueueEntry.clinic_id == clinic_id, QueueEntry.doctor_id == doctor_id,
                   QueueEntry.date == today)
            .order_by(QueueEntry.queue_position)
        )
    ).scalars().all()
    for e in entries:
        if e.status == "in_consultation":
            e.status = "completed"
    nxt = next((e for e in entries if e.status in ("waiting", "called")), None)
    if not nxt:
        await session.commit()
        return {"ok": True, "message": "No more patients", "snapshot": await _push(session, clinic_id, doctor_id)}
    nxt.status = "in_consultation"
    session.add(QueueEvent(id=new_id("qev"), clinic_id=clinic_id, doctor_id=doctor_id,
                           date=today, type="called", message=f"Token {nxt.token_number} called to Room",
                           token_number=nxt.token_number))
    # notify patient
    pat = (await session.execute(select(Patient).where(Patient.id == nxt.patient_id))).scalar_one_or_none()
    if pat:
        await notify(session, pat.user_id, "Your token was called",
                     f"Token {nxt.token_number} — please proceed to the consultation room.",
                     kind="queue", action_url="/queue")
    await audit(session, principal.id, "queue_next", "queue", nxt.id, {"token": nxt.token_number})
    await session.commit()
    snap = await _push(session, clinic_id, doctor_id)
    return {"ok": True, "called_token": nxt.token_number, "snapshot": snap}


@router.post("/queue/{entry_id}/skip")
async def skip_entry(
    entry_id: str,
    principal: Principal = Depends(STAFF_QUEUE),
    session: AsyncSession = Depends(get_session),
):
    e = (await session.execute(select(QueueEntry).where(QueueEntry.id == entry_id))).scalar_one_or_none()
    if not e:
        raise HTTPException(404, "Queue entry not found")
    # move to tail
    maxpos = (await session.execute(
        select(QueueEntry.queue_position).where(
            QueueEntry.clinic_id == e.clinic_id, QueueEntry.doctor_id == e.doctor_id,
            QueueEntry.date == e.date).order_by(QueueEntry.queue_position.desc())
    )).scalars().first() or 0
    e.queue_position = maxpos + 1
    e.status = "waiting"
    session.add(QueueEvent(id=new_id("qev"), clinic_id=e.clinic_id, doctor_id=e.doctor_id,
                           date=e.date, type="skipped", message=f"Token {e.token_number} skipped",
                           token_number=e.token_number))
    await session.commit()
    return {"ok": True, "snapshot": await _push(session, e.clinic_id, e.doctor_id)}


@router.post("/queue/{entry_id}/complete")
async def complete_entry(
    entry_id: str,
    principal: Principal = Depends(STAFF_QUEUE),
    session: AsyncSession = Depends(get_session),
):
    e = (await session.execute(select(QueueEntry).where(QueueEntry.id == entry_id))).scalar_one_or_none()
    if not e:
        raise HTTPException(404, "Queue entry not found")
    e.status = "completed"
    if e.appointment_id:
        a = (await session.execute(select(Appointment).where(Appointment.id == e.appointment_id))).scalar_one_or_none()
        if a:
            a.status = "completed"
    session.add(QueueEvent(id=new_id("qev"), clinic_id=e.clinic_id, doctor_id=e.doctor_id,
                           date=e.date, type="completed", message=f"Token {e.token_number} completed",
                           token_number=e.token_number))
    await session.commit()
    return {"ok": True, "snapshot": await _push(session, e.clinic_id, e.doctor_id)}


@router.post("/queue/walk-in")
async def add_walk_in(
    body: WalkInIn,
    principal: Principal = Depends(require_roles("receptionist", "clinic_admin")),
    session: AsyncSession = Depends(get_session),
):
    doc = (await session.execute(select(Doctor).where(Doctor.id == body.doctor_id))).scalar_one_or_none()
    if not doc:
        raise HTTPException(404, "Doctor not found")
    today = _date.today()
    # find or create a lightweight patient
    pat = None
    if body.phone:
        phone = "".join(c for c in body.phone if c.isdigit())[-10:]
        u = (await session.execute(select(User).where(User.phone == phone))).scalar_one_or_none()
        if u:
            pat = (await session.execute(select(Patient).where(Patient.user_id == u.id))).scalar_one_or_none()
        if not u:
            u = User(id=new_id("usr"), phone=phone, name=body.patient_name, role="patient")
            session.add(u)
            await session.flush()
            pat = Patient(id=new_id("pat"), user_id=u.id, name=body.patient_name)
            session.add(pat)
    if not pat:
        u = User(id=new_id("usr"), name=body.patient_name, role="patient")
        session.add(u)
        await session.flush()
        pat = Patient(id=new_id("pat"), user_id=u.id, name=body.patient_name)
        session.add(pat)
        await session.flush()

    key = f"token:{doc.clinic_id}:{doc.id}:{today.isoformat()}"
    tok = await next_seq(session, key)
    appt = Appointment(id=new_id("apt"), clinic_id=doc.clinic_id, doctor_id=doc.id,
                       patient_id=pat.id, appointment_date=today,
                       appointment_time="walk-in", status="confirmed", source="walk_in",
                       reason=body.reason, token_number=tok, consultation_fee=doc.consultation_fee)
    session.add(appt)
    await session.flush()
    session.add(QueueEntry(id=new_id("que"), clinic_id=doc.clinic_id, doctor_id=doc.id,
                           patient_id=pat.id, appointment_id=appt.id, date=today,
                           token_number=tok, queue_position=tok, status="waiting",
                           patient_name=body.patient_name))
    session.add(QueueEvent(id=new_id("qev"), clinic_id=doc.clinic_id, doctor_id=doc.id,
                           date=today, type="walk_in", message=f"Walk-in token {tok} added",
                           token_number=tok))
    await audit(session, principal.id, "walk_in", "appointment", appt.id, {"token": tok})
    await session.commit()
    return {"ok": True, "token_number": tok, "snapshot": await _push(session, doc.clinic_id, doc.id)}


@router.websocket("/api/ws")
async def websocket_endpoint(ws: WebSocket, token: str = ""):
    await ws.accept()
    rooms: list[str] = []
    async with session_scope() as session:
        sess = (await session.execute(select(UserSession).where(UserSession.session_token == token))).scalar_one_or_none()
        if not sess:
            await ws.send_json({"event": "error", "payload": {"message": "unauthorized"}})
            await ws.close()
            return
        user = (await session.execute(select(User).where(User.id == sess.user_id))).scalar_one()
        rooms.append(user_room(user.id))
        if user.role == "patient":
            pat = (await session.execute(select(Patient).where(Patient.user_id == user.id))).scalar_one_or_none()
            if pat:
                today = _date.today()
                appts = (await session.execute(
                    select(Appointment).where(
                        Appointment.patient_id == pat.id,
                        Appointment.appointment_date >= today,
                        Appointment.status.in_(["confirmed", "in_progress"]),
                    )
                )).scalars().all()
                for a in appts:
                    rooms.append(clinic_room(a.clinic_id, a.doctor_id))
        else:
            if user.role == "doctor":
                doc = (await session.execute(select(Doctor).where(Doctor.user_id == user.id))).scalar_one_or_none()
                if doc:
                    rooms.append(clinic_room(doc.clinic_id, doc.id))
                    rooms.append(clinic_room(doc.clinic_id))
            staff = (await session.execute(select(ClinicStaff).where(ClinicStaff.user_id == user.id))).scalars().all()
            for s in staff:
                rooms.append(clinic_room(s.clinic_id))

    await hub.join(ws, rooms)
    await ws.send_json({"event": "connected", "payload": {"rooms": rooms}})
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        await hub.leave(ws)
