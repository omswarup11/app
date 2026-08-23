"""Staff endpoints: reception helpers + doctor consultation workflow."""
from datetime import date as _date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core import new_id
from db import get_session
from models import (
    Appointment,
    Consultation,
    Doctor,
    LabTest,
    MedicalRecord,
    Patient,
    Prescription,
    PrescriptionItem,
    QueueEntry,
    User,
)
from security import Principal, get_principal, require_roles
from services import audit, notify

router = APIRouter(prefix="/api", tags=["staff"])

DOCTOR = require_roles("doctor")
STAFF = require_roles("receptionist", "doctor", "clinic_admin")


class Medicine(BaseModel):
    name: str
    dosage: str = ""
    frequency: str = ""
    duration: str = ""
    instructions: str = ""


class SaveIn(BaseModel):
    chief_complaint: str = ""
    clinical_notes: str = ""
    diagnosis: str = ""
    instructions: str = ""
    vitals: dict = {}


class CompleteIn(SaveIn):
    medicines: list[Medicine] = []
    lab_orders: list[str] = []


@router.get("/staff/doctors")
async def staff_doctors(
    principal: Principal = Depends(STAFF),
    session: AsyncSession = Depends(get_session),
):
    if not principal.clinic_id:
        return {"doctors": []}
    docs = (
        await session.execute(
            select(Doctor).where(Doctor.clinic_id == principal.clinic_id, Doctor.status == "active")
        )
    ).scalars().all()
    return {
        "doctors": [
            {"id": d.id, "name": d.name, "specialization": d.specialization, "consultation_fee": d.consultation_fee}
            for d in docs
        ]
    }


async def _patient_brief(session: AsyncSession, patient_id: str) -> dict:
    p = (await session.execute(select(Patient).where(Patient.id == patient_id))).scalar_one_or_none()
    if not p:
        return {"name": "Patient", "age": None, "gender": None, "blood_group": None}
    return {"name": p.name, "age": p.age, "gender": p.gender, "blood_group": p.blood_group}


@router.get("/doctor/today")
async def doctor_today(
    principal: Principal = Depends(DOCTOR),
    session: AsyncSession = Depends(get_session),
):
    if not principal.doctor_id:
        raise HTTPException(400, "No doctor profile")
    today = _date.today()
    entries = (
        await session.execute(
            select(QueueEntry)
            .where(QueueEntry.doctor_id == principal.doctor_id, QueueEntry.date == today)
            .order_by(QueueEntry.queue_position)
        )
    ).scalars().all()
    out = []
    for e in entries:
        appt = None
        if e.appointment_id:
            appt = (await session.execute(select(Appointment).where(Appointment.id == e.appointment_id))).scalar_one_or_none()
        brief = await _patient_brief(session, e.patient_id)
        out.append({
            "queue_id": e.id,
            "appointment_id": e.appointment_id,
            "token": e.token_number,
            "status": e.status,
            "patient_name": brief["name"],
            "age": brief["age"],
            "gender": brief["gender"],
            "reason": appt.reason if appt else "",
        })
    return {"patients": out, "date": today.isoformat()}


async def _get_owned_appt(session, principal, appointment_id) -> Appointment:
    appt = (await session.execute(select(Appointment).where(Appointment.id == appointment_id))).scalar_one_or_none()
    if not appt or appt.doctor_id != principal.doctor_id:
        raise HTTPException(404, "Appointment not found")
    return appt


@router.get("/doctor/consultation/{appointment_id}")
async def get_consultation(
    appointment_id: str,
    principal: Principal = Depends(DOCTOR),
    session: AsyncSession = Depends(get_session),
):
    appt = await _get_owned_appt(session, principal, appointment_id)
    brief = await _patient_brief(session, appt.patient_id)
    con = (await session.execute(select(Consultation).where(Consultation.appointment_id == appointment_id))).scalar_one_or_none()
    prx = (await session.execute(select(Prescription).where(Prescription.appointment_id == appointment_id))).scalar_one_or_none()
    labs = (await session.execute(select(LabTest).where(LabTest.appointment_id == appointment_id))).scalars().all()
    past = (await session.execute(select(Prescription).where(Prescription.patient_id == appt.patient_id))).scalars().all()
    return {
        "appointment": {
            "id": appt.id, "date": appt.appointment_date.isoformat(), "time": appt.appointment_time,
            "status": appt.status, "reason": appt.reason, "token": appt.token_number, "source": appt.source,
        },
        "patient": brief,
        "consultation": None if not con else {
            "chief_complaint": con.chief_complaint, "clinical_notes": con.clinical_notes,
            "diagnosis": con.diagnosis, "instructions": con.instructions, "vitals": con.vitals,
            "status": con.status,
        },
        "medicines": [] if not prx else [
            {"name": it.name, "dosage": it.dosage, "frequency": it.frequency, "duration": it.duration, "instructions": it.instructions}
            for it in prx.items
        ],
        "lab_orders": [{"id": l.id, "name": l.name, "status": l.status} for l in labs],
        "past_visits": len(past),
    }


async def _upsert_consultation(session, appt, principal, body: SaveIn, status: str) -> Consultation:
    con = (await session.execute(select(Consultation).where(Consultation.appointment_id == appt.id))).scalar_one_or_none()
    if not con:
        con = Consultation(id=new_id("con"), appointment_id=appt.id, patient_id=appt.patient_id,
                           doctor_id=appt.doctor_id, clinic_id=appt.clinic_id)
        session.add(con)
    con.chief_complaint = body.chief_complaint
    con.clinical_notes = body.clinical_notes
    con.diagnosis = body.diagnosis
    con.instructions = body.instructions
    con.vitals = body.vitals or {}
    con.status = status
    return con


@router.post("/doctor/consultation/{appointment_id}/save")
async def save_consultation(
    appointment_id: str,
    body: SaveIn,
    principal: Principal = Depends(DOCTOR),
    session: AsyncSession = Depends(get_session),
):
    appt = await _get_owned_appt(session, principal, appointment_id)
    await _upsert_consultation(session, appt, principal, body, "draft")
    await session.commit()
    return {"ok": True, "status": "draft"}


@router.post("/doctor/consultation/{appointment_id}/complete")
async def complete_consultation(
    appointment_id: str,
    body: CompleteIn,
    principal: Principal = Depends(DOCTOR),
    session: AsyncSession = Depends(get_session),
):
    appt = await _get_owned_appt(session, principal, appointment_id)
    await _upsert_consultation(session, appt, principal, body, "completed")

    # prescription (replace items for this appointment)
    if body.medicines:
        prx = (await session.execute(select(Prescription).where(Prescription.appointment_id == appt.id))).scalar_one_or_none()
        if not prx:
            prx = Prescription(id=new_id("prx"), patient_id=appt.patient_id, doctor_id=appt.doctor_id,
                               clinic_id=appt.clinic_id, appointment_id=appt.id)
            session.add(prx)
        prx.diagnosis = body.diagnosis
        prx.notes = body.clinical_notes
        prx.instructions = body.instructions
        prx.items = [
            PrescriptionItem(id=new_id("pri"), name=m.name, dosage=m.dosage, frequency=m.frequency,
                             duration=m.duration, instructions=m.instructions)
            for m in body.medicines
        ]

    # lab orders
    for name in body.lab_orders:
        if name.strip():
            session.add(LabTest(id=new_id("lab"), clinic_id=appt.clinic_id, patient_id=appt.patient_id,
                                doctor_id=appt.doctor_id, appointment_id=appt.id, name=name.strip(), status="ordered"))

    # always store a visit record for the patient's history
    session.add(MedicalRecord(id=new_id("rec"), patient_id=appt.patient_id, clinic_id=appt.clinic_id,
                              doctor_id=appt.doctor_id, appointment_id=appt.id,
                              title="Prescription" if body.medicines else "Consultation summary",
                              type="report", status="reviewed"))

    # complete appointment + queue
    appt.status = "completed"
    q = (await session.execute(select(QueueEntry).where(QueueEntry.appointment_id == appt.id))).scalar_one_or_none()
    if q:
        q.status = "completed"

    pat = (await session.execute(select(Patient).where(Patient.id == appt.patient_id))).scalar_one_or_none()
    if pat:
        msg = "Your prescription is ready to view." if body.medicines else "Your consultation summary is ready."
        if body.lab_orders:
            msg += f" Lab tests ordered: {', '.join(body.lab_orders)}."
        await notify(session, pat.user_id, "Consultation complete", msg, kind="prescription", action_url="/records")
    await audit(session, principal.id, "complete_consultation", "appointment", appt.id,
                {"medicines": len(body.medicines), "labs": len(body.lab_orders)})
    await session.commit()
    return {"ok": True, "status": "completed"}
