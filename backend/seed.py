"""Idempotent seed: super admin, 3 Sanjeevan clinics, staff, doctors, a demo patient."""
from datetime import date, timedelta

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from core import SUPER_ADMIN_EMAIL, SUPER_ADMIN_NAME, SUPER_ADMIN_PHONE, new_id, now_utc
from models import (
    Appointment,
    Clinic,
    ClinicStaff,
    Counter,
    Doctor,
    LabTest,
    MedicalRecord,
    Patient,
    Prescription,
    PrescriptionItem,
    QueueEntry,
    User,
)


async def _user(session, phone, name, role, email=None) -> User:
    u = User(id=new_id("usr"), phone=phone, name=name, role=role, email=email)
    session.add(u)
    await session.flush()
    return u


async def seed_if_empty(session: AsyncSession) -> None:
    exists = (
        await session.execute(select(User).where(User.phone == SUPER_ADMIN_PHONE))
    ).scalar_one_or_none()
    if exists:
        return

    # Super admin
    await _user(session, SUPER_ADMIN_PHONE, SUPER_ADMIN_NAME, "super_admin", SUPER_ADMIN_EMAIL)

    # Clinics
    c1 = Clinic(id=new_id("cln"), name="Sanjeevan Multispeciality Clinic", city="Nashik",
                address="Gangapur Road, Nashik", contact_phone="0253-1234567",
                contact_email="nashik@sanjeevan.health", status="active", plan="growth")
    c2 = Clinic(id=new_id("cln"), name="Sanjeevan Clinic", city="Pune",
                address="FC Road, Pune", contact_phone="020-9876543",
                contact_email="pune@sanjeevan.health", status="active", plan="starter")
    c3 = Clinic(id=new_id("cln"), name="Sanjeevan Health Centre", city="Mumbai",
                address="Andheri West, Mumbai", contact_phone="022-5556677",
                contact_email="mumbai@sanjeevan.health", status="active", plan="scale")
    session.add_all([c1, c2, c3])
    await session.flush()

    # Clinic admin
    admin = await _user(session, "9000000002", "Rohit Kulkarni", "clinic_admin")
    session.add(ClinicStaff(id=new_id("stf"), clinic_id=c1.id, user_id=admin.id,
                            role="clinic_admin", shift="full-time", status="active"))

    # Doctors (users + staff + doctor rows)
    du1 = await _user(session, "9000000003", "Dr. Meera Raghavan", "doctor")
    du2 = await _user(session, "9000000006", "Dr. Arun Deshpande", "doctor")
    d1 = Doctor(id=new_id("doc"), clinic_id=c1.id, user_id=du1.id, name="Dr. Meera Raghavan",
                specialization="Cardiology", experience_years=12, consultation_fee=700, rating=4.8)
    d2 = Doctor(id=new_id("doc"), clinic_id=c1.id, user_id=du2.id, name="Dr. Arun Deshpande",
                specialization="General Medicine", experience_years=8, consultation_fee=450, rating=4.6)
    # a couple more specialties for filter richness
    du3 = await _user(session, "9000000007", "Dr. Kavita Nair", "doctor")
    d3 = Doctor(id=new_id("doc"), clinic_id=c1.id, user_id=du3.id, name="Dr. Kavita Nair",
                specialization="Dermatology", experience_years=6, consultation_fee=550, rating=4.7)
    session.add_all([d1, d2, d3])
    for du, d in ((du1, d1), (du2, d2), (du3, d3)):
        session.add(ClinicStaff(id=new_id("stf"), clinic_id=c1.id, user_id=du.id,
                                role="doctor", shift="morning", status="active"))
    await session.flush()

    # Reception + Lab
    rec = await _user(session, "9000000004", "Priya Joshi", "receptionist")
    lab = await _user(session, "9000000005", "Sunil Patil", "lab_technician")
    session.add(ClinicStaff(id=new_id("stf"), clinic_id=c1.id, user_id=rec.id,
                            role="receptionist", shift="morning", status="active"))
    session.add(ClinicStaff(id=new_id("stf"), clinic_id=c1.id, user_id=lab.id,
                            role="lab_technician", shift="day", status="active"))

    # Demo patient with a live appointment + records
    pu = await _user(session, "9876543210", "Ananya Sharma", "patient")
    pat = Patient(id=new_id("pat"), user_id=pu.id, name="Ananya Sharma", age=29,
                  gender="female", blood_group="O+")
    session.add(pat)
    await session.flush()

    today = date.today()

    # a separate walk-in patient for the tokens *ahead* of Ananya
    wu = await _user(session, "9800000099", "Clinic Walk-ins", "patient")
    wpat = Patient(id=new_id("pat"), user_id=wu.id, name="Walk-in")
    session.add(wpat)
    await session.flush()

    # a few ahead-of-her tokens (completed / in progress) so the live queue looks real
    def qwalk(tok, status, name):
        return QueueEntry(id=new_id("que"), clinic_id=c1.id, doctor_id=d1.id, patient_id=wpat.id,
                          appointment_id=None, date=today, token_number=tok, queue_position=tok,
                          status=status, patient_name=name)

    session.add(qwalk(21, "completed", "Rakesh M"))
    session.add(qwalk(22, "completed", "Sana K"))
    session.add(qwalk(23, "in_consultation", "Vivek R"))

    appt = Appointment(id=new_id("apt"), clinic_id=c1.id, doctor_id=d1.id, patient_id=pat.id,
                       appointment_date=today, appointment_time="11:40", status="confirmed",
                       source="online", token_number=24, consultation_fee=700,
                       reason="Follow-up · palpitations")
    session.add(appt)
    await session.flush()
    session.add(QueueEntry(id=new_id("que"), clinic_id=c1.id, doctor_id=d1.id, patient_id=pat.id,
                           appointment_id=appt.id, date=today, token_number=24, queue_position=24,
                           status="waiting", patient_name="Ananya Sharma"))
    session.add(Counter(key=f"token:{c1.id}:{d1.id}:{today.isoformat()}", seq=24))

    # records
    session.add(MedicalRecord(id=new_id("rec"), patient_id=pat.id, clinic_id=c1.id, doctor_id=d1.id,
                              title="ECG Report", type="report", status="reviewed"))
    session.add(MedicalRecord(id=new_id("rec"), patient_id=pat.id, clinic_id=c1.id, doctor_id=d1.id,
                              title="Blood Test — CBC", type="lab", status="new"))

    # prescription with items (previous visit)
    prx = Prescription(id=new_id("prx"), patient_id=pat.id, doctor_id=d1.id, clinic_id=c1.id,
                       diagnosis="Hypertension — stage 1", notes="BP 138/88. Continue lifestyle changes.",
                       instructions="Low-salt diet, review in 2 weeks",
                       created_at=now_utc() - timedelta(days=21))
    prx.items = [
        PrescriptionItem(id=new_id("pri"), name="Telmisartan", dosage="40mg",
                         frequency="Once daily", duration="30 days", instructions="Morning"),
        PrescriptionItem(id=new_id("pri"), name="Aspirin", dosage="75mg",
                         frequency="Once daily", duration="30 days", instructions="After food"),
    ]
    session.add(prx)

    # a pending lab test the lab console can process
    session.add(LabTest(id=new_id("lab"), clinic_id=c1.id, patient_id=pat.id, doctor_id=d1.id,
                        name="Lipid Profile", status="ordered"))

    await session.commit()
