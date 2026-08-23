"""Slot holds, Razorpay order/verify/webhook, and appointment fulfilment."""
import hashlib
import hmac
import json
import logging

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from core import (
    RAZORPAY_KEY_ID,
    RAZORPAY_KEY_SECRET,
    RAZORPAY_LIVE,
    RAZORPAY_WEBHOOK_SECRET,
    derive_amount_paise,
    hold_expiry,
    new_id,
    now_utc,
)
from db import get_session
from models import Appointment, Doctor, Payment, QueueEntry, SlotHold, WebhookEvent
from routes_clinics import SLOT_TEMPLATE
from security import Principal, get_principal
from services import audit, next_seq, notify

logger = logging.getLogger("sanjeevan.booking")
router = APIRouter(prefix="/api", tags=["booking"])

_SANDBOX_SECRET = b"sanjeevan-sandbox-secret"


class HoldIn(BaseModel):
    doctor_id: str
    date: str
    time: str


class OrderIn(BaseModel):
    hold_id: str


class ConfirmIn(BaseModel):
    payment_id: str
    razorpay_payment_id: str | None = None
    razorpay_signature: str | None = None


def _appt_public(a: Appointment) -> dict:
    return {
        "id": a.id,
        "clinic_id": a.clinic_id,
        "doctor_id": a.doctor_id,
        "patient_id": a.patient_id,
        "appointment_date": a.appointment_date.isoformat(),
        "appointment_time": a.appointment_time,
        "status": a.status,
        "reason": a.reason,
        "token_number": a.token_number,
        "consultation_fee": a.consultation_fee,
        "source": a.source,
    }


def _verify_payment_sig(order_id: str, payment_id: str, signature: str | None) -> bool:
    if not signature:
        return False
    secret = RAZORPAY_KEY_SECRET.encode() if RAZORPAY_LIVE else _SANDBOX_SECRET
    expected = hmac.new(secret, f"{order_id}|{payment_id}".encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


async def _create_rzp_order(amount_paise: int, receipt: str) -> dict:
    if not RAZORPAY_LIVE:
        return {"id": f"order_sbx_{new_id('o')[2:]}", "amount": amount_paise, "fallback": True}
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.post(
            "https://api.razorpay.com/v1/orders",
            auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET),
            json={"amount": amount_paise, "currency": "INR", "receipt": receipt},
        )
        r.raise_for_status()
        return r.json()


async def _fulfil(session: AsyncSession, payment: Payment) -> Appointment:
    """Idempotent, race-safe: creates the appointment, mints token, enqueues, notifies."""
    if payment.appointment_id:
        appt = (
            await session.execute(
                select(Appointment).where(Appointment.id == payment.appointment_id)
            )
        ).scalar_one_or_none()
        if appt:
            return appt

    doc = (
        await session.execute(select(Doctor).where(Doctor.id == payment.doctor_id))
    ).scalar_one()
    appt = Appointment(
        id=new_id("apt"),
        clinic_id=payment.clinic_id,
        doctor_id=payment.doctor_id,
        patient_id=payment.patient_id,
        appointment_date=payment.appointment_date,
        appointment_time=payment.appointment_time,
        status="confirmed",
        source="online",
        consultation_fee=doc.consultation_fee,
    )
    session.add(appt)
    try:
        await session.flush()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(409, "This slot was just booked by someone else.")

    key = f"token:{payment.clinic_id}:{payment.doctor_id}:{payment.appointment_date.isoformat()}"
    tok = await next_seq(session, key)
    appt.token_number = tok

    from models import Patient, User

    pat = (await session.execute(select(Patient).where(Patient.id == payment.patient_id))).scalar_one()
    session.add(
        QueueEntry(
            id=new_id("que"),
            clinic_id=payment.clinic_id,
            doctor_id=payment.doctor_id,
            patient_id=payment.patient_id,
            appointment_id=appt.id,
            date=payment.appointment_date,
            token_number=tok,
            queue_position=tok,
            status="waiting",
            patient_name=pat.name or "Patient",
        )
    )
    payment.appointment_id = appt.id
    payment.status = "captured"

    # release any hold on this slot
    if payment.hold_id:
        h = (await session.execute(select(SlotHold).where(SlotHold.id == payment.hold_id))).scalar_one_or_none()
        if h:
            await session.delete(h)

    user = (await session.execute(select(User).where(User.id == pat.user_id))).scalar_one()
    await notify(
        session,
        user.id,
        "Appointment confirmed",
        f"Your token is {tok} with {doc.name} on {appt.appointment_date.strftime('%d %b')} at {appt.appointment_time}.",
        kind="appointment",
        action_url="/queue",
    )
    await audit(session, user.id, "book", "appointment", appt.id, {"token": tok})
    return appt


@router.post("/appointments/hold")
async def hold_slot(
    body: HoldIn,
    principal: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_session),
):
    if not principal.patient_id:
        raise HTTPException(403, "Only patients can hold slots")
    if body.time not in SLOT_TEMPLATE:
        raise HTTPException(400, "Invalid slot")
    doc = (await session.execute(select(Doctor).where(Doctor.id == body.doctor_id))).scalar_one_or_none()
    if not doc:
        raise HTTPException(404, "Doctor not found")
    from datetime import date as _date

    d = _date.fromisoformat(body.date)

    # already booked?
    existing = (
        await session.execute(
            select(Appointment).where(
                Appointment.doctor_id == body.doctor_id,
                Appointment.appointment_date == d,
                Appointment.appointment_time == body.time,
                Appointment.status.in_(["confirmed", "in_progress", "completed"]),
            )
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(409, "Slot already booked")

    hold = SlotHold(
        id=new_id("hld"),
        doctor_id=body.doctor_id,
        clinic_id=doc.clinic_id,
        patient_id=principal.patient_id,
        date=d,
        time=body.time,
        expires_at=hold_expiry(),
    )
    session.add(hold)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(409, "Slot is currently held by another patient")
    return {"hold_id": hold.id, "expires_at": hold.expires_at.isoformat(), "seconds": 300}


@router.delete("/appointments/hold/{hold_id}")
async def release_hold(
    hold_id: str,
    principal: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_session),
):
    h = (await session.execute(select(SlotHold).where(SlotHold.id == hold_id))).scalar_one_or_none()
    if h and h.patient_id == principal.patient_id:
        await session.delete(h)
        await session.commit()
    return {"ok": True}


@router.post("/payments/order")
async def create_order(
    body: OrderIn,
    principal: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_session),
):
    hold = (await session.execute(select(SlotHold).where(SlotHold.id == body.hold_id))).scalar_one_or_none()
    if not hold or hold.patient_id != principal.patient_id:
        raise HTTPException(404, "Hold not found")
    if hold.expires_at.replace(tzinfo=hold.expires_at.tzinfo or now_utc().tzinfo) < now_utc():
        raise HTTPException(410, "Slot hold expired")
    doc = (await session.execute(select(Doctor).where(Doctor.id == hold.doctor_id))).scalar_one()
    breakdown = derive_amount_paise(doc.consultation_fee)
    order = await _create_rzp_order(breakdown["amount_paise"], f"apt_{hold.id}")
    pay = Payment(
        id=new_id("pay"),
        patient_id=principal.patient_id,
        clinic_id=hold.clinic_id,
        doctor_id=hold.doctor_id,
        hold_id=hold.id,
        appointment_date=hold.date,
        appointment_time=hold.time,
        amount=breakdown["amount_paise"],
        currency="INR",
        status="created",
        razorpay_order_id=order["id"],
    )
    session.add(pay)
    await session.commit()
    return {
        "payment_id": pay.id,
        "order_id": order["id"],
        "amount_paise": breakdown["amount_paise"],
        "amount_rupees": breakdown["total_rupees"],
        "currency": "INR",
        "key_id": RAZORPAY_KEY_ID or None,
        "breakdown": breakdown,
        "fallback": not RAZORPAY_LIVE,
        "doctor": {"id": doc.id, "name": doc.name, "specialization": doc.specialization},
    }


@router.post("/payments/confirm")
async def confirm_payment(
    body: ConfirmIn,
    principal: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_session),
):
    pay = (await session.execute(select(Payment).where(Payment.id == body.payment_id))).scalar_one_or_none()
    if not pay or pay.patient_id != principal.patient_id:
        raise HTTPException(404, "Payment not found")

    if pay.status in ("captured",) and pay.appointment_id:
        appt = (await session.execute(select(Appointment).where(Appointment.id == pay.appointment_id))).scalar_one()
        return {"ok": True, "appointment": _appt_public(appt), "payment_id": pay.id}

    payment_id = body.razorpay_payment_id or f"pay_sbx_{new_id('p')[2:]}"
    if RAZORPAY_LIVE:
        if not _verify_payment_sig(pay.razorpay_order_id, payment_id, body.razorpay_signature):
            raise HTTPException(400, "Invalid payment signature")
    pay.razorpay_payment_id = payment_id
    pay.razorpay_signature = body.razorpay_signature
    pay.status = "verified"
    pay.method = "upi"
    appt = await _fulfil(session, pay)
    await session.commit()
    return {"ok": True, "appointment": _appt_public(appt), "payment_id": pay.id,
            "reference": payment_id}


@router.post("/payments/webhook")
async def razorpay_webhook(
    request: Request,
    x_razorpay_signature: str = Header(default=""),
    x_razorpay_event_id: str = Header(default=""),
    session: AsyncSession = Depends(get_session),
):
    raw = await request.body()
    if not RAZORPAY_WEBHOOK_SECRET:
        raise HTTPException(400, "Webhook secret not configured")
    expected = hmac.new(RAZORPAY_WEBHOOK_SECRET.encode(), raw, hashlib.sha256).hexdigest()
    if not x_razorpay_signature or not hmac.compare_digest(expected, x_razorpay_signature):
        raise HTTPException(400, "Invalid webhook signature")
    if not x_razorpay_event_id:
        raise HTTPException(400, "Missing event id")

    # idempotency
    session.add(WebhookEvent(event_id=x_razorpay_event_id))
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        return {"ok": True, "duplicate": True}

    event = json.loads(raw)
    if event.get("event") not in ("payment.captured", "order.paid"):
        return {"ok": True}
    entity = (
        event.get("payload", {}).get("payment", event.get("payload", {}).get("order", {})).get("entity", {})
    )
    order_id = entity.get("order_id") or entity.get("id")
    pay = (await session.execute(select(Payment).where(Payment.razorpay_order_id == order_id))).scalar_one_or_none()
    if pay and not pay.appointment_id:
        pay.status = "verified"
        pay.razorpay_payment_id = entity.get("id") or pay.razorpay_payment_id
        await _fulfil(session, pay)
        await session.commit()
    return {"ok": True}


@router.get("/appointments")
async def list_appointments(
    principal: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_session),
):
    if not principal.patient_id:
        return {"appointments": []}
    rows = (
        await session.execute(
            select(Appointment)
            .where(Appointment.patient_id == principal.patient_id)
            .order_by(Appointment.appointment_date.desc())
        )
    ).scalars().all()
    out = []
    for a in rows:
        doc = (await session.execute(select(Doctor).where(Doctor.id == a.doctor_id))).scalar_one_or_none()
        d = _appt_public(a)
        d["doctor"] = {"name": doc.name, "specialization": doc.specialization} if doc else None
        out.append(d)
    return {"appointments": out}


@router.get("/appointments/{appointment_id}")
async def get_appointment(
    appointment_id: str,
    principal: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_session),
):
    a = (await session.execute(select(Appointment).where(Appointment.id == appointment_id))).scalar_one_or_none()
    if not a or (principal.patient_id and a.patient_id != principal.patient_id):
        raise HTTPException(404, "Appointment not found")
    return _appt_public(a)
