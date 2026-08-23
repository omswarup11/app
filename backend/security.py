"""Session auth + role authorization. (Supabase-JWT verification slots in here later.)"""
from dataclasses import dataclass, field

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core import now_utc
from db import get_session
from models import ClinicStaff, Doctor, Patient, User, UserSession


@dataclass
class Principal:
    user: User
    patient_id: str | None = None
    clinic_id: str | None = None
    doctor_id: str | None = None
    staff_roles: list[str] = field(default_factory=list)

    @property
    def role(self) -> str:
        return self.user.role

    @property
    def id(self) -> str:
        return self.user.id


def _bearer(authorization: str | None) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")
    return authorization.split(" ", 1)[1].strip()


async def get_principal(
    authorization: str | None = Header(default=None),
    session: AsyncSession = Depends(get_session),
) -> Principal:
    tok = _bearer(authorization)
    row = (
        await session.execute(
            select(UserSession, User)
            .join(User, User.id == UserSession.user_id)
            .where(UserSession.session_token == tok)
        )
    ).first()
    if not row:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid session")
    sess, user = row
    exp = sess.expires_at
    if exp.tzinfo is None:
        from datetime import timezone

        exp = exp.replace(tzinfo=timezone.utc)
    if exp < now_utc():
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired")

    p = Principal(user=user)
    if user.role == "patient":
        pat = (
            await session.execute(select(Patient).where(Patient.user_id == user.id))
        ).scalar_one_or_none()
        if pat:
            p.patient_id = pat.id
    else:
        staff = (
            await session.execute(
                select(ClinicStaff).where(
                    ClinicStaff.user_id == user.id, ClinicStaff.status == "active"
                )
            )
        ).scalars().all()
        if staff:
            p.clinic_id = staff[0].clinic_id
            p.staff_roles = [s.role for s in staff]
        if user.role == "doctor":
            doc = (
                await session.execute(select(Doctor).where(Doctor.user_id == user.id))
            ).scalar_one_or_none()
            if doc:
                p.doctor_id = doc.id
                p.clinic_id = doc.clinic_id
    return p


def require_roles(*roles: str):
    async def _dep(principal: Principal = Depends(get_principal)) -> Principal:
        if principal.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Forbidden for this role")
        return principal

    return _dep
