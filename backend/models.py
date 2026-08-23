"""Normalized Postgres schema for Sanjeevan (migrated from MongoDB collections)."""
from datetime import date, datetime

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core import new_id, now_utc
from db import Base


def _pk(prefix: str):
    return mapped_column(String(40), primary_key=True, default=lambda: new_id(prefix))


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=now_utc, onupdate=now_utc
    )


class User(Base, TimestampMixin):
    __tablename__ = "users"
    id: Mapped[str] = _pk("usr")
    phone: Mapped[str | None] = mapped_column(String(20), unique=True, index=True)
    email: Mapped[str | None] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120), default="")
    role: Mapped[str] = mapped_column(String(30), default="patient", index=True)
    supabase_uid: Mapped[str | None] = mapped_column(String(64), unique=True)
    __table_args__ = (
        CheckConstraint(
            "role in ('patient','receptionist','doctor','lab_technician','clinic_admin','super_admin')",
            name="ck_user_role",
        ),
    )


class UserSession(Base):
    __tablename__ = "user_sessions"
    id: Mapped[str] = _pk("ses")
    session_token: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class OtpRequest(Base):
    __tablename__ = "otp_requests"
    id: Mapped[str] = _pk("otp")
    phone: Mapped[str] = mapped_column(String(20), index=True)
    code: Mapped[str] = mapped_column(String(10))
    consumed: Mapped[bool] = mapped_column(Boolean, default=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class Clinic(Base, TimestampMixin):
    __tablename__ = "clinics"
    id: Mapped[str] = _pk("cln")
    name: Mapped[str] = mapped_column(String(160), index=True)
    city: Mapped[str] = mapped_column(String(80), index=True)
    address: Mapped[str] = mapped_column(Text, default="")
    contact_phone: Mapped[str] = mapped_column(String(20), default="")
    contact_email: Mapped[str] = mapped_column(String(255), default="")
    status: Mapped[str] = mapped_column(String(20), default="active", index=True)
    plan: Mapped[str] = mapped_column(String(20), default="trial")
    auto_renew: Mapped[bool] = mapped_column(Boolean, default=True)
    __table_args__ = (
        CheckConstraint("status in ('active','trial','suspended')", name="ck_clinic_status"),
        Index("ix_clinic_name_city", "name", "city"),
    )


class ClinicStaff(Base, TimestampMixin):
    __tablename__ = "clinic_staff"
    id: Mapped[str] = _pk("stf")
    clinic_id: Mapped[str] = mapped_column(ForeignKey("clinics.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(30))  # receptionist|doctor|lab_technician|clinic_admin
    shift: Mapped[str] = mapped_column(String(40), default="")
    status: Mapped[str] = mapped_column(String(20), default="active")
    __table_args__ = (
        UniqueConstraint("clinic_id", "user_id", name="uq_staff_clinic_user"),
        Index("ix_staff_clinic_role_status", "clinic_id", "role", "status"),
    )


class Doctor(Base, TimestampMixin):
    __tablename__ = "doctors"
    id: Mapped[str] = _pk("doc")
    clinic_id: Mapped[str] = mapped_column(ForeignKey("clinics.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    specialization: Mapped[str] = mapped_column(String(80), index=True)
    experience_years: Mapped[int] = mapped_column(Integer, default=0)
    consultation_fee: Mapped[int] = mapped_column(Integer, default=500)  # rupees
    rating: Mapped[float] = mapped_column(Float, default=4.5)
    status: Mapped[str] = mapped_column(String(20), default="active", index=True)
    __table_args__ = (
        Index("ix_doctor_clinic_spec_status", "clinic_id", "specialization", "status"),
    )


class Patient(Base, TimestampMixin):
    __tablename__ = "patients"
    id: Mapped[str] = _pk("pat")
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True
    )
    name: Mapped[str] = mapped_column(String(120), default="")
    age: Mapped[int | None] = mapped_column(Integer)
    gender: Mapped[str | None] = mapped_column(String(20))
    blood_group: Mapped[str | None] = mapped_column(String(6))


class DoctorAvailability(Base):
    __tablename__ = "doctor_availability"
    id: Mapped[str] = _pk("avl")
    doctor_id: Mapped[str] = mapped_column(ForeignKey("doctors.id", ondelete="CASCADE"), index=True)
    date: Mapped[date] = mapped_column(Date)
    slots: Mapped[list] = mapped_column(JSON, default=list)  # ["09:00", ...]
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    __table_args__ = (UniqueConstraint("doctor_id", "date", name="uq_avail_doctor_date"),)


class Appointment(Base, TimestampMixin):
    __tablename__ = "appointments"
    id: Mapped[str] = _pk("apt")
    clinic_id: Mapped[str] = mapped_column(ForeignKey("clinics.id", ondelete="CASCADE"), index=True)
    doctor_id: Mapped[str] = mapped_column(ForeignKey("doctors.id", ondelete="CASCADE"), index=True)
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id", ondelete="CASCADE"), index=True)
    appointment_date: Mapped[date] = mapped_column(Date, index=True)
    appointment_time: Mapped[str] = mapped_column(String(10))
    status: Mapped[str] = mapped_column(String(20), default="confirmed", index=True)
    reason: Mapped[str] = mapped_column(Text, default="")
    source: Mapped[str] = mapped_column(String(12), default="online")  # online|walk_in
    token_number: Mapped[int | None] = mapped_column(Integer)
    consultation_fee: Mapped[int] = mapped_column(Integer, default=0)
    __table_args__ = (
        CheckConstraint(
            "status in ('confirmed','in_progress','completed','cancelled','no_show')",
            name="ck_appt_status",
        ),
        Index("ix_appt_patient_date", "patient_id", "appointment_date"),
        Index("ix_appt_clinic_date_status", "clinic_id", "appointment_date", "status"),
        # No double-booking: only one live appointment per doctor/date/time.
        Index(
            "uq_appt_doctor_slot_live",
            "doctor_id",
            "appointment_date",
            "appointment_time",
            unique=True,
            postgresql_where=text("status in ('confirmed','in_progress','completed')"),
        ),
    )


class SlotHold(Base):
    __tablename__ = "slot_holds"
    id: Mapped[str] = _pk("hld")
    doctor_id: Mapped[str] = mapped_column(ForeignKey("doctors.id", ondelete="CASCADE"))
    clinic_id: Mapped[str] = mapped_column(ForeignKey("clinics.id", ondelete="CASCADE"))
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id", ondelete="CASCADE"))
    date: Mapped[date] = mapped_column(Date)
    time: Mapped[str] = mapped_column(String(10))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    __table_args__ = (
        UniqueConstraint("doctor_id", "date", "time", name="uq_hold_doctor_slot"),
    )


class QueueEntry(Base, TimestampMixin):
    __tablename__ = "queue"
    id: Mapped[str] = _pk("que")
    clinic_id: Mapped[str] = mapped_column(ForeignKey("clinics.id", ondelete="CASCADE"), index=True)
    doctor_id: Mapped[str] = mapped_column(ForeignKey("doctors.id", ondelete="CASCADE"), index=True)
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id", ondelete="CASCADE"))
    appointment_id: Mapped[str | None] = mapped_column(
        ForeignKey("appointments.id", ondelete="SET NULL"), unique=True
    )
    date: Mapped[date] = mapped_column(Date, index=True)
    token_number: Mapped[int] = mapped_column(Integer)
    queue_position: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(20), default="waiting", index=True)
    patient_name: Mapped[str] = mapped_column(String(120), default="")
    __table_args__ = (
        CheckConstraint(
            "status in ('waiting','called','in_consultation','completed','skipped')",
            name="ck_queue_status",
        ),
        Index("ix_queue_scope_pos", "clinic_id", "doctor_id", "date", "queue_position"),
    )


class QueueEvent(Base):
    __tablename__ = "queue_events"
    id: Mapped[str] = _pk("qev")
    clinic_id: Mapped[str] = mapped_column(ForeignKey("clinics.id", ondelete="CASCADE"))
    doctor_id: Mapped[str] = mapped_column(ForeignKey("doctors.id", ondelete="CASCADE"))
    date: Mapped[date] = mapped_column(Date)
    type: Mapped[str] = mapped_column(String(30))
    message: Mapped[str] = mapped_column(Text, default="")
    token_number: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    __table_args__ = (Index("ix_qevent_scope_time", "clinic_id", "doctor_id", "created_at"),)


class MedicalRecord(Base):
    __tablename__ = "medical_records"
    id: Mapped[str] = _pk("rec")
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id", ondelete="CASCADE"), index=True)
    clinic_id: Mapped[str | None] = mapped_column(ForeignKey("clinics.id", ondelete="SET NULL"))
    doctor_id: Mapped[str | None] = mapped_column(ForeignKey("doctors.id", ondelete="SET NULL"))
    appointment_id: Mapped[str | None] = mapped_column(ForeignKey("appointments.id", ondelete="SET NULL"))
    title: Mapped[str] = mapped_column(String(160))
    type: Mapped[str] = mapped_column(String(30), default="report")  # report|lab|scan
    status: Mapped[str] = mapped_column(String(20), default="new")  # new|reviewed|archived
    object_path: Mapped[str | None] = mapped_column(String(400))
    file_mime: Mapped[str] = mapped_column(String(80), default="application/pdf")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    __table_args__ = (Index("ix_record_patient_time", "patient_id", "created_at"),)


class Prescription(Base):
    __tablename__ = "prescriptions"
    id: Mapped[str] = _pk("prx")
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id", ondelete="CASCADE"), index=True)
    doctor_id: Mapped[str | None] = mapped_column(ForeignKey("doctors.id", ondelete="SET NULL"))
    clinic_id: Mapped[str | None] = mapped_column(ForeignKey("clinics.id", ondelete="SET NULL"))
    appointment_id: Mapped[str | None] = mapped_column(ForeignKey("appointments.id", ondelete="SET NULL"))
    diagnosis: Mapped[str] = mapped_column(Text, default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    instructions: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    items: Mapped[list["PrescriptionItem"]] = relationship(
        cascade="all, delete-orphan", lazy="selectin"
    )
    __table_args__ = (Index("ix_prx_patient_time", "patient_id", "created_at"),)


class PrescriptionItem(Base):
    __tablename__ = "prescription_items"
    id: Mapped[str] = _pk("pri")
    prescription_id: Mapped[str] = mapped_column(
        ForeignKey("prescriptions.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(160))
    dosage: Mapped[str] = mapped_column(String(80), default="")
    frequency: Mapped[str] = mapped_column(String(80), default="")
    duration: Mapped[str] = mapped_column(String(80), default="")
    instructions: Mapped[str] = mapped_column(String(200), default="")


class LabTest(Base, TimestampMixin):
    __tablename__ = "lab_tests"
    id: Mapped[str] = _pk("lab")
    clinic_id: Mapped[str] = mapped_column(ForeignKey("clinics.id", ondelete="CASCADE"), index=True)
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id", ondelete="CASCADE"), index=True)
    doctor_id: Mapped[str | None] = mapped_column(ForeignKey("doctors.id", ondelete="SET NULL"))
    appointment_id: Mapped[str | None] = mapped_column(ForeignKey("appointments.id", ondelete="SET NULL"))
    name: Mapped[str] = mapped_column(String(120))
    status: Mapped[str] = mapped_column(String(24), default="ordered", index=True)
    note: Mapped[str] = mapped_column(Text, default="")
    object_path: Mapped[str | None] = mapped_column(String(400))
    __table_args__ = (
        CheckConstraint(
            "status in ('ordered','awaiting_sample','collected','processing','completed','published')",
            name="ck_lab_status",
        ),
        Index("ix_lab_clinic_status", "clinic_id", "status"),
    )


class Payment(Base, TimestampMixin):
    __tablename__ = "payments"
    id: Mapped[str] = _pk("pay")
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id", ondelete="CASCADE"), index=True)
    clinic_id: Mapped[str] = mapped_column(ForeignKey("clinics.id", ondelete="CASCADE"))
    doctor_id: Mapped[str] = mapped_column(ForeignKey("doctors.id", ondelete="CASCADE"))
    hold_id: Mapped[str | None] = mapped_column(String(40))
    appointment_id: Mapped[str | None] = mapped_column(
        ForeignKey("appointments.id", ondelete="SET NULL")
    )
    appointment_date: Mapped[date] = mapped_column(Date)
    appointment_time: Mapped[str] = mapped_column(String(10))
    amount: Mapped[int] = mapped_column(Integer)  # paise
    currency: Mapped[str] = mapped_column(String(8), default="INR")
    status: Mapped[str] = mapped_column(String(20), default="created", index=True)
    method: Mapped[str] = mapped_column(String(20), default="")
    razorpay_order_id: Mapped[str | None] = mapped_column(String(80), unique=True)
    razorpay_payment_id: Mapped[str | None] = mapped_column(String(80), index=True)
    razorpay_signature: Mapped[str | None] = mapped_column(String(160))
    __table_args__ = (
        CheckConstraint(
            "status in ('created','verified','captured','failed')", name="ck_pay_status"
        ),
    )


class WebhookEvent(Base):
    __tablename__ = "webhook_events"
    event_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[str] = _pk("ntf")
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(160))
    message: Mapped[str] = mapped_column(Text, default="")
    type: Mapped[str] = mapped_column(String(30), default="general")
    read: Mapped[bool] = mapped_column(Boolean, default=False)
    action_url: Mapped[str | None] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    __table_args__ = (Index("ix_ntf_user_time", "user_id", "created_at"),)


class SupportTicket(Base, TimestampMixin):
    __tablename__ = "support_tickets"
    id: Mapped[str] = _pk("tkt")
    clinic_id: Mapped[str] = mapped_column(ForeignKey("clinics.id", ondelete="CASCADE"), index=True)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    subject: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    category: Mapped[str] = mapped_column(String(40), default="general")
    priority: Mapped[str] = mapped_column(String(12), default="normal")
    status: Mapped[str] = mapped_column(String(24), default="with_super_admin", index=True)
    reply: Mapped[str | None] = mapped_column(Text)
    __table_args__ = (Index("ix_ticket_clinic_status", "clinic_id", "status"),)


class Counter(Base):
    __tablename__ = "counters"
    key: Mapped[str] = mapped_column(String(120), primary_key=True)
    seq: Mapped[int] = mapped_column(Integer, default=0)


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[str] = _pk("aud")
    user_id: Mapped[str | None] = mapped_column(String(40), index=True)
    action: Mapped[str] = mapped_column(String(60))
    entity: Mapped[str] = mapped_column(String(40))
    entity_id: Mapped[str] = mapped_column(String(60))
    meta: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    __table_args__ = (Index("ix_audit_user_time", "user_id", "created_at"),)
