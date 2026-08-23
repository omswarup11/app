"""Clinic search, specialties, doctors, and computed availability (5 days)."""
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from core import now_utc
from db import get_session
from models import Appointment, Clinic, Doctor, SlotHold
from security import Principal, get_principal

router = APIRouter(prefix="/api", tags=["clinics"])

# Slot template — mornings + evenings, 20-min cadence.
_MORNING = [f"{h:02d}:{m:02d}" for h in range(9, 13) for m in (0, 20, 40)]
_EVENING = [f"{h:02d}:{m:02d}" for h in range(17, 20) for m in (0, 20, 40)]
SLOT_TEMPLATE = _MORNING + _EVENING


def _clinic_public(c: Clinic, doctor_count: int = 0) -> dict:
    return {
        "id": c.id,
        "name": c.name,
        "city": c.city,
        "address": c.address,
        "contact_phone": c.contact_phone,
        "status": c.status,
        "doctor_count": doctor_count,
    }


def _doctor_public(d: Doctor) -> dict:
    return {
        "id": d.id,
        "clinic_id": d.clinic_id,
        "name": d.name,
        "specialization": d.specialization,
        "experience_years": d.experience_years,
        "consultation_fee": d.consultation_fee,
        "rating": d.rating,
        "status": d.status,
    }


@router.get("/clinics")
async def search_clinics(
    q: str = Query(default=""),
    city: str = Query(default=""),
    session: AsyncSession = Depends(get_session),
    _p: Principal = Depends(get_principal),
):
    stmt = select(Clinic).where(Clinic.status != "suspended")
    if q:
        stmt = stmt.where(Clinic.name.ilike(f"%{q}%"))
    if city:
        stmt = stmt.where(Clinic.city.ilike(f"%{city}%"))
    clinics = (await session.execute(stmt.limit(30))).scalars().all()
    out = []
    for c in clinics:
        cnt = (
            await session.execute(
                select(func.count(Doctor.id)).where(
                    Doctor.clinic_id == c.id, Doctor.status == "active"
                )
            )
        ).scalar_one()
        out.append(_clinic_public(c, cnt))
    return {"clinics": out}


@router.get("/clinics/{clinic_id}/specialties")
async def clinic_specialties(
    clinic_id: str,
    session: AsyncSession = Depends(get_session),
    _p: Principal = Depends(get_principal),
):
    rows = (
        await session.execute(
            select(Doctor.specialization)
            .where(Doctor.clinic_id == clinic_id, Doctor.status == "active")
            .distinct()
        )
    ).scalars().all()
    return {"specialties": sorted(rows)}


@router.get("/clinics/{clinic_id}/doctors")
async def clinic_doctors(
    clinic_id: str,
    specialty: str = Query(default=""),
    session: AsyncSession = Depends(get_session),
    _p: Principal = Depends(get_principal),
):
    stmt = select(Doctor).where(Doctor.clinic_id == clinic_id, Doctor.status == "active")
    if specialty and specialty.lower() != "all":
        stmt = stmt.where(Doctor.specialization == specialty)
    docs = (await session.execute(stmt)).scalars().all()
    return {"doctors": [_doctor_public(d) for d in docs]}


@router.get("/doctors/{doctor_id}/availability")
async def doctor_availability(
    doctor_id: str,
    session: AsyncSession = Depends(get_session),
    _p: Principal = Depends(get_principal),
):
    doc = (
        await session.execute(select(Doctor).where(Doctor.id == doctor_id))
    ).scalar_one_or_none()
    if not doc:
        raise HTTPException(404, "Doctor not found")

    today = date.today()
    days = [today + timedelta(days=i) for i in range(5)]

    # booked live slots per date
    appts = (
        await session.execute(
            select(Appointment.appointment_date, Appointment.appointment_time).where(
                Appointment.doctor_id == doctor_id,
                Appointment.appointment_date.in_(days),
                Appointment.status.in_(["confirmed", "in_progress", "completed"]),
            )
        )
    ).all()
    booked = {(d, t) for d, t in appts}

    # active holds
    holds = (
        await session.execute(
            select(SlotHold.date, SlotHold.time).where(
                SlotHold.doctor_id == doctor_id,
                SlotHold.date.in_(days),
                SlotHold.expires_at > now_utc(),
            )
        )
    ).all()
    held = {(d, t) for d, t in holds}

    result = []
    for d in days:
        slots = []
        for t in SLOT_TEMPLATE:
            taken = (d, t) in booked or (d, t) in held
            slots.append({"time": t, "available": not taken})
        result.append(
            {
                "date": d.isoformat(),
                "label": d.strftime("%a"),
                "day": d.strftime("%d"),
                "slots": slots,
            }
        )
    return {"doctor": _doctor_public(doc), "days": result}
