"""Shared infrastructure: env, helpers, signed URLs, rate limiter, counters.

Migrated from the MongoDB implementation to Postgres/SQLAlchemy. This module holds
pure helpers only (no DB client) so it can be imported anywhere without cycles.
"""
import hashlib
import hmac
import os
import secrets
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

DATABASE_URL = os.environ["DATABASE_URL"]
SESSION_TTL_DAYS = int(os.environ.get("SESSION_TTL_DAYS", "7"))
DEV_OTP = os.environ.get("DEV_OTP", "123456")
SLOT_HOLD_MINUTES = int(os.environ.get("SLOT_HOLD_MINUTES", "5"))
FILE_URL_SECRET = os.environ.get("FILE_URL_SECRET", "sanjeevan-signed-url-secret")
PUBLIC_BASE_URL = os.environ.get("PUBLIC_BASE_URL", "http://localhost:8001").rstrip("/")
PLATFORM_FEE = int(os.environ.get("PLATFORM_FEE", "20"))

RAZORPAY_KEY_ID = os.environ.get("RAZORPAY_KEY_ID", "").strip()
RAZORPAY_KEY_SECRET = os.environ.get("RAZORPAY_KEY_SECRET", "").strip()
RAZORPAY_WEBHOOK_SECRET = os.environ.get("RAZORPAY_WEBHOOK_SECRET", "").strip()
RAZORPAY_LIVE = bool(RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET)

SUPER_ADMIN_NAME = os.environ.get("SUPER_ADMIN_NAME", "Vikram Shetty")
SUPER_ADMIN_PHONE = os.environ.get("SUPER_ADMIN_PHONE", "9000000001")
SUPER_ADMIN_EMAIL = os.environ.get("SUPER_ADMIN_EMAIL", "owner@sanjeevan.health")

ROLES = (
    "patient",
    "receptionist",
    "doctor",
    "lab_technician",
    "clinic_admin",
    "super_admin",
)


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def aware(dt: Any) -> datetime:
    if isinstance(dt, datetime):
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    return now_utc()


def iso(dt: Any) -> str | None:
    if dt is None:
        return None
    if isinstance(dt, datetime):
        return aware(dt).isoformat()
    return str(dt)


def token() -> str:
    return secrets.token_urlsafe(32)


def hold_expiry() -> datetime:
    return now_utc() + timedelta(minutes=SLOT_HOLD_MINUTES)


def session_expiry() -> datetime:
    return now_utc() + timedelta(days=SESSION_TTL_DAYS)


# ---------------- signed medical-file URLs ----------------
def sign_file_token(record_id: str, user_id: str, ttl_seconds: int = 600) -> str:
    exp = int(time.time()) + ttl_seconds
    msg = f"{record_id}:{user_id}:{exp}".encode()
    sig = hmac.new(FILE_URL_SECRET.encode(), msg, hashlib.sha256).hexdigest()[:32]
    return f"{exp}.{sig}"


def verify_file_token(record_id: str, user_id: str, tok: str) -> bool:
    try:
        exp_s, sig = tok.split(".", 1)
        exp = int(exp_s)
    except Exception:
        return False
    if exp < int(time.time()):
        return False
    msg = f"{record_id}:{user_id}:{exp}".encode()
    expected = hmac.new(FILE_URL_SECRET.encode(), msg, hashlib.sha256).hexdigest()[:32]
    return hmac.compare_digest(expected, sig)


def signed_file_url(record_id: str, user_id: str) -> str:
    return (
        f"{PUBLIC_BASE_URL}/api/files/{record_id}"
        f"?u={user_id}&t={sign_file_token(record_id, user_id)}"
    )


# ---------------- payment amount derivation ----------------
def derive_amount_paise(consultation_fee_rupees: int) -> dict:
    """Server-derived amount: fee + platform fee + 18% GST on the platform fee."""
    gst = round(PLATFORM_FEE * 0.18)  # ₹20 -> ₹4 (rounded)
    total_rupees = consultation_fee_rupees + PLATFORM_FEE + gst
    return {
        "consultation_fee": consultation_fee_rupees,
        "platform_fee": PLATFORM_FEE,
        "gst": gst,
        "total_rupees": total_rupees,
        "amount_paise": total_rupees * 100,
    }


# ---------------- simple in-memory rate limiter ----------------
_buckets: dict[str, list[float]] = {}


def rate_limit(key: str, limit: int, window_seconds: int) -> bool:
    """Returns True when the call is allowed."""
    now = time.time()
    bucket = [t for t in _buckets.get(key, []) if now - t < window_seconds]
    if len(bucket) >= limit:
        _buckets[key] = bucket
        return False
    bucket.append(now)
    _buckets[key] = bucket
    return True
