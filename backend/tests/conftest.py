"""Shared fixtures for Sanjeevan backend tests."""
import os
import time
import uuid
from pathlib import Path

import pytest
import requests
from dotenv import load_dotenv

# Load frontend .env to pick up EXPO_PUBLIC_BACKEND_URL (public preview URL)
load_dotenv(Path(__file__).resolve().parents[2] / "frontend" / ".env")

BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "").rstrip("/")
if not BASE_URL:
    raise RuntimeError("EXPO_PUBLIC_BACKEND_URL not set; cannot run tests")

API = f"{BASE_URL}/api"
DEV_OTP = "123456"

# Seeded phones (from /app/memory/test_credentials.md)
PHONE_PATIENT = "9876543210"       # Ananya
PHONE_RECEPTIONIST = "9000000004"  # Priya (receptionist)
PHONE_DOCTOR = "9000000003"        # Dr. Meera (doctor)


def _client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _login(phone: str) -> dict:
    """Send OTP + verify to obtain a session token. Reuses across tests."""
    c = _client()
    r = c.post(f"{API}/auth/send-otp", json={"phone": phone}, timeout=20)
    # Rate-limit tolerant: if 429, we still try verify (there may be an existing pending OTP)
    if r.status_code not in (200, 429):
        raise RuntimeError(f"send-otp failed for {phone}: {r.status_code} {r.text}")
    r2 = c.post(f"{API}/auth/verify-otp", json={"phone": phone, "code": DEV_OTP}, timeout=20)
    r2.raise_for_status()
    data = r2.json()
    return {"token": data["token"], "user": data["user"], "role": data["role"]}


@pytest.fixture(scope="session")
def api_client():
    return _client()


@pytest.fixture(scope="session")
def base_url():
    return API


@pytest.fixture(scope="session")
def patient_session():
    """Reusable seeded patient session (Ananya)."""
    return _login(PHONE_PATIENT)


@pytest.fixture(scope="session")
def receptionist_session():
    return _login(PHONE_RECEPTIONIST)


@pytest.fixture(scope="session")
def new_patient_factory():
    """Create fresh 10-digit phone patients for concurrent tests."""
    def _make():
        # Random 10-digit phone starting with 7-9 to avoid clashing with seeded staff (9000000001..7)
        phone = "8" + uuid.uuid4().int.__str__()[:9]
        phone = phone[:10]
        # Ensure not colliding with seeded phones
        while phone in {PHONE_PATIENT, PHONE_RECEPTIONIST, PHONE_DOCTOR,
                        "9000000001", "9000000002", "9000000005",
                        "9000000006", "9000000007"}:
            phone = "8" + str(int(time.time() * 1000))[-9:]
        return _login(phone)
    return _make


@pytest.fixture(scope="session", autouse=True)
def _reset_ananya_queue_state():
    """
    Ensure Ananya has an active 'waiting' queue entry for today before running the
    queue endpoint tests. Previous E2E runs (via main-agent's curl and repeated
    staff /queue/next calls) can flip her seeded entry to 'completed'.
    """
    import asyncio
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from db import session_scope  # noqa: E402
    from models import Patient, QueueEntry, User  # noqa: E402
    from sqlalchemy import select  # noqa: E402
    from datetime import date  # noqa: E402

    async def reset():
        async with session_scope() as s:
            u = (await s.execute(select(User).where(User.phone == PHONE_PATIENT))).scalar_one_or_none()
            if not u:
                return
            pat = (await s.execute(select(Patient).where(Patient.user_id == u.id))).scalar_one_or_none()
            if not pat:
                return
            today = date.today()
            entries = (await s.execute(
                select(QueueEntry).where(
                    QueueEntry.patient_id == pat.id,
                    QueueEntry.date == today,
                )
            )).scalars().all()
            if not entries:
                return
            # Restore the smallest-token entry to 'waiting' so /queue/me responds
            entries.sort(key=lambda e: e.token_number or 0)
            entries[0].status = "waiting"
            await s.commit()

    try:
        asyncio.run(reset())
    except Exception as e:  # pragma: no cover
        print(f"[conftest] reset skipped: {e}")


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
