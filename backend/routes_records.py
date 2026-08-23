"""Patient records: reports, prescriptions, lab tests, notifications, signed files."""
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from core import signed_file_url, verify_file_token
from db import get_session
from models import (
    Doctor,
    LabTest,
    MedicalRecord,
    Notification,
    Patient,
    Prescription,
)
from security import Principal, get_principal

router = APIRouter(prefix="/api", tags=["records"])

# minimal valid one-page PDF placeholder
_PLACEHOLDER_PDF = (
    b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
    b"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
    b"3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]>>endobj\n"
    b"trailer<</Root 1 0 R>>\n%%EOF"
)


@router.get("/records")
async def list_records(
    principal: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_session),
):
    if not principal.patient_id:
        return {"records": []}
    rows = (
        await session.execute(
            select(MedicalRecord)
            .where(MedicalRecord.patient_id == principal.patient_id)
            .order_by(MedicalRecord.created_at.desc())
        )
    ).scalars().all()
    return {
        "records": [
            {
                "id": r.id,
                "title": r.title,
                "type": r.type,
                "status": r.status,
                "created_at": r.created_at.isoformat(),
                "url": signed_file_url(r.id, principal.user.id),
            }
            for r in rows
        ]
    }


@router.get("/prescriptions")
async def list_prescriptions(
    principal: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_session),
):
    if not principal.patient_id:
        return {"prescriptions": []}
    rows = (
        await session.execute(
            select(Prescription)
            .where(Prescription.patient_id == principal.patient_id)
            .order_by(Prescription.created_at.desc())
        )
    ).scalars().all()
    out = []
    for p in rows:
        doc = (
            await session.execute(select(Doctor).where(Doctor.id == p.doctor_id))
        ).scalar_one_or_none()
        out.append(
            {
                "id": p.id,
                "diagnosis": p.diagnosis,
                "notes": p.notes,
                "instructions": p.instructions,
                "created_at": p.created_at.isoformat(),
                "doctor": doc.name if doc else "Doctor",
                "reason": p.diagnosis,
                "items": [
                    {
                        "name": it.name,
                        "dosage": it.dosage,
                        "frequency": it.frequency,
                        "duration": it.duration,
                        "instructions": it.instructions,
                    }
                    for it in p.items
                ],
            }
        )
    return {"prescriptions": out}


@router.get("/lab-tests")
async def list_lab_tests(
    principal: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_session),
):
    if not principal.patient_id:
        return {"lab_tests": []}
    rows = (
        await session.execute(
            select(LabTest)
            .where(LabTest.patient_id == principal.patient_id)
            .order_by(LabTest.created_at.desc())
        )
    ).scalars().all()
    return {
        "lab_tests": [
            {
                "id": t.id,
                "name": t.name,
                "status": t.status,
                "created_at": t.created_at.isoformat(),
                "url": signed_file_url(t.id, principal.user.id) if t.status == "published" else None,
            }
            for t in rows
        ]
    }


@router.get("/notifications")
async def list_notifications(
    principal: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_session),
):
    rows = (
        await session.execute(
            select(Notification)
            .where(Notification.user_id == principal.user.id)
            .order_by(Notification.created_at.desc())
            .limit(50)
        )
    ).scalars().all()
    return {
        "notifications": [
            {
                "id": n.id,
                "title": n.title,
                "message": n.message,
                "type": n.type,
                "read": n.read,
                "action_url": n.action_url,
                "created_at": n.created_at.isoformat(),
            }
            for n in rows
        ],
        "unread": sum(1 for n in rows if not n.read),
    }


@router.post("/notifications/{notification_id}/read")
async def mark_read(
    notification_id: str,
    principal: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_session),
):
    await session.execute(
        update(Notification)
        .where(Notification.id == notification_id, Notification.user_id == principal.user.id)
        .values(read=True)
    )
    await session.commit()
    return {"ok": True}


@router.get("/files/{record_id}")
async def get_file(
    record_id: str,
    u: str = Query(...),
    t: str = Query(...),
    session: AsyncSession = Depends(get_session),
):
    if not verify_file_token(record_id, u, t):
        raise HTTPException(403, "Invalid or expired file link")
    # confirm the requesting user owns the record (patient isolation)
    rec = (
        await session.execute(select(MedicalRecord).where(MedicalRecord.id == record_id))
    ).scalar_one_or_none()
    lab = None
    if not rec:
        lab = (
            await session.execute(select(LabTest).where(LabTest.id == record_id))
        ).scalar_one_or_none()
    patient_id = rec.patient_id if rec else (lab.patient_id if lab else None)
    if not patient_id:
        raise HTTPException(404, "File not found")
    pat = (await session.execute(select(Patient).where(Patient.id == patient_id))).scalar_one()
    if pat.user_id != u:
        raise HTTPException(403, "Not authorized for this file")
    return Response(content=_PLACEHOLDER_PDF, media_type="application/pdf")
