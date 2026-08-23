"""Auth: dev-mode phone OTP + Google upsert + sessions. (Supabase Auth layered later.)"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from core import DEV_OTP, new_id, now_utc, rate_limit, session_expiry, token
from db import get_session
from models import OtpRequest, Patient, User, UserSession
from security import Principal, get_principal
from services import audit

router = APIRouter(prefix="/api/auth", tags=["auth"])


class SendOtpIn(BaseModel):
    phone: str


class VerifyOtpIn(BaseModel):
    phone: str
    code: str


class GoogleIn(BaseModel):
    email: str
    name: str = ""


def _norm_phone(phone: str) -> str:
    return "".join(ch for ch in phone if ch.isdigit())[-10:]


async def _issue_session(session: AsyncSession, user: User) -> str:
    tok = token()
    session.add(
        UserSession(
            id=new_id("ses"),
            session_token=tok,
            user_id=user.id,
            expires_at=session_expiry(),
        )
    )
    return tok


def _user_public(user: User, principal: Principal | None = None) -> dict:
    return {
        "id": user.id,
        "name": user.name,
        "phone": user.phone,
        "email": user.email,
        "role": user.role,
    }


@router.post("/send-otp")
async def send_otp(body: SendOtpIn, session: AsyncSession = Depends(get_session)):
    phone = _norm_phone(body.phone)
    if len(phone) != 10:
        raise HTTPException(400, "Enter a valid 10-digit mobile number")
    if not rate_limit(f"otp:{phone}", limit=5, window_seconds=300):
        raise HTTPException(429, "Too many OTP requests. Try again in a few minutes.")
    from datetime import timedelta

    session.add(
        OtpRequest(
            id=new_id("otp"),
            phone=phone,
            code=DEV_OTP,
            expires_at=now_utc() + timedelta(minutes=5),
        )
    )
    await session.commit()
    return {"sent": True, "dev_otp": DEV_OTP, "message": "OTP sent"}


@router.post("/verify-otp")
async def verify_otp(body: VerifyOtpIn, session: AsyncSession = Depends(get_session)):
    phone = _norm_phone(body.phone)
    otp = (
        await session.execute(
            select(OtpRequest)
            .where(OtpRequest.phone == phone, OtpRequest.consumed == False)  # noqa: E712
            .order_by(OtpRequest.created_at.desc())
        )
    ).scalars().first()
    valid_code = body.code == DEV_OTP or (otp is not None and otp.code == body.code)
    if not otp or not valid_code:
        raise HTTPException(400, "Invalid or expired OTP")
    otp.consumed = True

    user = (
        await session.execute(select(User).where(User.phone == phone))
    ).scalar_one_or_none()
    if not user:
        user = User(id=new_id("usr"), phone=phone, name="", role="patient")
        session.add(user)
        await session.flush()
        session.add(Patient(id=new_id("pat"), user_id=user.id, name=""))
    tok = await _issue_session(session, user)
    await audit(session, user.id, "login", "user", user.id, {"method": "otp"})
    await session.commit()
    return {"token": tok, "user": _user_public(user), "role": user.role}


@router.post("/google")
async def google_login(body: GoogleIn, session: AsyncSession = Depends(get_session)):
    email = body.email.strip().lower()
    if not email:
        raise HTTPException(400, "Email required")
    user = (
        await session.execute(select(User).where(User.email == email))
    ).scalar_one_or_none()
    if not user:
        user = User(id=new_id("usr"), email=email, name=body.name, role="patient")
        session.add(user)
        await session.flush()
        session.add(Patient(id=new_id("pat"), user_id=user.id, name=body.name))
    tok = await _issue_session(session, user)
    await audit(session, user.id, "login", "user", user.id, {"method": "google"})
    await session.commit()
    return {"token": tok, "user": _user_public(user), "role": user.role}


@router.get("/me")
async def me(principal: Principal = Depends(get_principal)):
    return {
        "user": _user_public(principal.user),
        "role": principal.role,
        "patient_id": principal.patient_id,
        "clinic_id": principal.clinic_id,
        "doctor_id": principal.doctor_id,
        "staff_roles": principal.staff_roles,
    }


@router.post("/logout")
async def logout(
    principal: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_session),
):
    await session.execute(
        delete(UserSession).where(UserSession.user_id == principal.id)
    )
    await session.commit()
    return {"ok": True}
