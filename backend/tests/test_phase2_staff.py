"""Phase-2 backend tests: Reception + Doctor console + role security + Supabase.

Focus areas (per iteration_2 review request):
- Reception: /api/staff/doctors, /api/queue/walk-in, /api/queue/next,
  /api/queue/{id}/skip, /api/queue/{id}/complete
- Doctor: /api/doctor/today, /api/doctor/consultation/{id}, save, complete
- Role security: patient forbidden on staff/doctor endpoints; non-owner doctor 404
- Supabase auth exchange: /api/auth/supabase with bogus token -> 401
"""
import uuid

import pytest
import requests

from conftest import API, DEV_OTP, PHONE_DOCTOR, PHONE_PATIENT, PHONE_RECEPTIONIST, auth_headers, _login


# -----------------------------------------------------------------------------
# Shared session-scoped fixtures (Phase-2)
# -----------------------------------------------------------------------------
@pytest.fixture(scope="module")
def doctor_session():
    return _login(PHONE_DOCTOR)


@pytest.fixture(scope="module")
def reception_session():
    return _login(PHONE_RECEPTIONIST)


@pytest.fixture(scope="module")
def patient_session_module():
    return _login(PHONE_PATIENT)


@pytest.fixture(scope="module")
def clinic_doctors(reception_session):
    r = requests.get(f"{API}/staff/doctors", headers=auth_headers(reception_session["token"]), timeout=20)
    assert r.status_code == 200, r.text
    docs = r.json()["doctors"]
    assert docs, "expected at least one doctor for receptionist's clinic"
    return docs


def _first_doctor_id_for_receptionist(clinic_doctors):
    # Pick Dr. Meera (Cardiology) if present so it aligns with the doctor login
    meera = next((d for d in clinic_doctors if "Meera" in d["name"]), None)
    return (meera or clinic_doctors[0])["id"]


# =============================================================================
# RECEPTION BACKEND
# =============================================================================
class TestReceptionStaffDoctors:
    def test_staff_doctors_returns_active_doctors(self, reception_session, clinic_doctors):
        # Every returned doctor must have id, name, specialization, consultation_fee
        for d in clinic_doctors:
            assert d["id"] and d["name"]
            assert "specialization" in d
            assert isinstance(d["consultation_fee"], int) and d["consultation_fee"] > 0

    def test_staff_doctors_patient_forbidden(self, patient_session_module):
        r = requests.get(
            f"{API}/staff/doctors",
            headers=auth_headers(patient_session_module["token"]),
            timeout=20,
        )
        assert r.status_code == 403, r.text


class TestReceptionWalkIn:
    def test_walk_in_new_patient_mints_incremented_token(self, reception_session, clinic_doctors):
        doc_id = _first_doctor_id_for_receptionist(clinic_doctors)
        # Fetch current snapshot to know the current max token
        snap = requests.get(
            f"{API}/queue?doctor_id={doc_id}",
            headers=auth_headers(reception_session["token"]),
            timeout=20,
        ).json()
        prev_tokens = [e["token_number"] for e in snap.get("waiting", [])]
        prev_now_serving = snap.get("now_serving") or 0
        prev_max = max(prev_tokens + [prev_now_serving, 0])

        # Add walk-in with a random name (no phone) — should auto-register
        uniq = uuid.uuid4().hex[:6]
        r = requests.post(
            f"{API}/queue/walk-in",
            json={
                "doctor_id": doc_id,
                "patient_name": f"TEST_Walkin_{uniq}",
                "reason": "Fever",
            },
            headers=auth_headers(reception_session["token"]),
            timeout=20,
        )
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["ok"] is True
        new_token = j["token_number"]
        assert isinstance(new_token, int) and new_token > prev_max, (
            f"walk-in token {new_token} did not exceed prev max {prev_max}"
        )

        # Snapshot must contain a matching waiting row
        new_snap = j["snapshot"]
        matches = [
            e for e in new_snap["waiting"]
            if e["patient_name"] == f"TEST_Walkin_{uniq}" and e["token_number"] == new_token
        ]
        assert matches, f"new walk-in not visible in snapshot: {new_snap}"
        assert matches[0]["status"] == "waiting"

    def test_walk_in_with_phone_reuses_existing_user(self, reception_session, clinic_doctors):
        doc_id = _first_doctor_id_for_receptionist(clinic_doctors)
        # Use the seeded Ananya's phone — she already has a Patient row
        r = requests.post(
            f"{API}/queue/walk-in",
            json={
                "doctor_id": doc_id,
                "patient_name": "Ananya Sharma",
                "phone": PHONE_PATIENT,
                "reason": "Follow-up",
            },
            headers=auth_headers(reception_session["token"]),
            timeout=20,
        )
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["ok"] is True
        assert isinstance(j["token_number"], int)

    def test_walk_in_bad_doctor_404(self, reception_session):
        r = requests.post(
            f"{API}/queue/walk-in",
            json={"doctor_id": "doc-not-real", "patient_name": "TEST_ghost"},
            headers=auth_headers(reception_session["token"]),
            timeout=20,
        )
        assert r.status_code == 404, r.text


class TestReceptionQueueControls:
    def test_next_skip_complete_cycle(self, reception_session, clinic_doctors):
        """Add a walk-in, call next, skip that entry, then complete it."""
        doc_id = _first_doctor_id_for_receptionist(clinic_doctors)
        uniq = uuid.uuid4().hex[:6]
        # Seed a controlled walk-in so we know the entry_id we manipulate
        w = requests.post(
            f"{API}/queue/walk-in",
            json={
                "doctor_id": doc_id,
                "patient_name": f"TEST_Cycle_{uniq}",
                "reason": "Cycle test",
            },
            headers=auth_headers(reception_session["token"]),
            timeout=20,
        ).json()
        target = next(
            e for e in w["snapshot"]["waiting"]
            if e["patient_name"] == f"TEST_Cycle_{uniq}"
        )
        target_id = target["id"]

        # --- Skip: entry should still be present as "waiting" and moved to tail
        s = requests.post(
            f"{API}/queue/{target_id}/skip",
            headers=auth_headers(reception_session["token"]),
            timeout=20,
        )
        assert s.status_code == 200, s.text
        sj = s.json()
        after = next((e for e in sj["snapshot"]["waiting"] if e["id"] == target_id), None)
        assert after is not None
        assert after["status"] == "waiting"

        # --- Complete: entry status becomes completed and disappears from waiting
        c = requests.post(
            f"{API}/queue/{target_id}/complete",
            headers=auth_headers(reception_session["token"]),
            timeout=20,
        )
        assert c.status_code == 200, c.text
        cj = c.json()
        assert all(e["id"] != target_id for e in cj["snapshot"]["waiting"])

    def test_call_next_advances_or_says_no_more(self, reception_session, clinic_doctors):
        doc_id = _first_doctor_id_for_receptionist(clinic_doctors)
        # Ensure there is at least one waiting entry
        uniq = uuid.uuid4().hex[:6]
        requests.post(
            f"{API}/queue/walk-in",
            json={
                "doctor_id": doc_id,
                "patient_name": f"TEST_Next_{uniq}",
                "reason": "Advance",
            },
            headers=auth_headers(reception_session["token"]),
            timeout=20,
        )
        r = requests.post(
            f"{API}/queue/next",
            json={"doctor_id": doc_id},
            headers=auth_headers(reception_session["token"]),
            timeout=20,
        )
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["ok"] is True
        # Either "called_token" (advanced) or a "message" (no more waiters)
        assert "snapshot" in j
        if "called_token" in j:
            assert isinstance(j["called_token"], int)
            # exactly one entry should be in_consultation now
            in_cons = [e for e in j["snapshot"]["waiting"] if e["status"] == "in_consultation"]
            assert len(in_cons) == 1, in_cons

    def test_skip_bad_entry_404(self, reception_session):
        r = requests.post(
            f"{API}/queue/nope-nope/skip",
            headers=auth_headers(reception_session["token"]),
            timeout=20,
        )
        assert r.status_code == 404, r.text


# =============================================================================
# DOCTOR BACKEND
# =============================================================================
class TestDoctorToday:
    def test_doctor_today_returns_patients_list(self, doctor_session):
        r = requests.get(
            f"{API}/doctor/today",
            headers=auth_headers(doctor_session["token"]),
            timeout=20,
        )
        assert r.status_code == 200, r.text
        j = r.json()
        assert "patients" in j and isinstance(j["patients"], list)
        assert "date" in j
        # each entry should have the expected shape
        for p in j["patients"]:
            for k in ("queue_id", "token", "status", "patient_name"):
                assert k in p, f"missing {k} in {p}"

    def test_doctor_today_patient_forbidden(self, patient_session_module):
        r = requests.get(
            f"{API}/doctor/today",
            headers=auth_headers(patient_session_module["token"]),
            timeout=20,
        )
        assert r.status_code == 403, r.text


class TestDoctorConsultationFlow:
    """Save + Complete flow verified from patient view (prescriptions + lab-tests)."""

    def _pick_active_appointment(self, doctor_session, reception_session, clinic_doctors):
        """Find an active appointment for the doctor; add a walk-in if needed."""
        # First check the doctor's today list
        r = requests.get(
            f"{API}/doctor/today",
            headers=auth_headers(doctor_session["token"]),
            timeout=20,
        ).json()
        active = [p for p in r["patients"] if p["status"] != "completed" and p["appointment_id"]]
        if active:
            return active[0]["appointment_id"]

        # otherwise: mint a walk-in for Meera via the receptionist so a fresh
        # appointment exists to consult on
        doc_id = _first_doctor_id_for_receptionist(clinic_doctors)
        uniq = uuid.uuid4().hex[:6]
        w = requests.post(
            f"{API}/queue/walk-in",
            json={
                "doctor_id": doc_id,
                "patient_name": f"TEST_Consult_{uniq}",
                "reason": "Chest pain",
            },
            headers=auth_headers(reception_session["token"]),
            timeout=20,
        ).json()
        # Re-fetch doctor/today so we pick up the new appointment_id
        r2 = requests.get(
            f"{API}/doctor/today",
            headers=auth_headers(doctor_session["token"]),
            timeout=20,
        ).json()
        active2 = [
            p for p in r2["patients"]
            if p["status"] != "completed" and p["appointment_id"]
            and p["patient_name"].startswith("TEST_Consult_")
        ]
        assert active2, f"walk-in was created but not visible on doctor/today; walk={w}"
        return active2[0]["appointment_id"]

    def test_get_consultation_returns_full_bundle(self, doctor_session, reception_session, clinic_doctors):
        appt_id = self._pick_active_appointment(doctor_session, reception_session, clinic_doctors)
        r = requests.get(
            f"{API}/doctor/consultation/{appt_id}",
            headers=auth_headers(doctor_session["token"]),
            timeout=20,
        )
        assert r.status_code == 200, r.text
        j = r.json()
        for k in ("appointment", "patient", "consultation", "medicines", "lab_orders"):
            assert k in j
        assert j["appointment"]["id"] == appt_id

    def test_save_draft_persists(self, doctor_session, reception_session, clinic_doctors):
        appt_id = self._pick_active_appointment(doctor_session, reception_session, clinic_doctors)
        payload = {
            "chief_complaint": "TEST cc",
            "clinical_notes": "TEST notes",
            "diagnosis": "TEST dx",
            "instructions": "TEST rx",
            "vitals": {"bp": "120/80", "temp": "98.6", "pulse": "72"},
        }
        s = requests.post(
            f"{API}/doctor/consultation/{appt_id}/save",
            json=payload,
            headers=auth_headers(doctor_session["token"]),
            timeout=20,
        )
        assert s.status_code == 200, s.text
        assert s.json()["status"] == "draft"

        # GET reflects the saved draft
        g = requests.get(
            f"{API}/doctor/consultation/{appt_id}",
            headers=auth_headers(doctor_session["token"]),
            timeout=20,
        ).json()
        assert g["consultation"]["chief_complaint"] == "TEST cc"
        assert g["consultation"]["diagnosis"] == "TEST dx"
        assert g["consultation"]["status"] == "draft"

    def test_complete_creates_prescription_and_lab_orders(
        self, doctor_session, reception_session, clinic_doctors,
    ):
        """Full complete flow: prescription + lab tests + queue/appointment completion,
        then verify the patient can see them via /prescriptions and /lab-tests."""
        # Create a dedicated walk-in bound to the seeded patient (Ananya) so that
        # after complete we can log in as that patient and verify the artefacts.
        doc_id = _first_doctor_id_for_receptionist(clinic_doctors)
        uniq = uuid.uuid4().hex[:6]
        w = requests.post(
            f"{API}/queue/walk-in",
            json={
                "doctor_id": doc_id,
                "patient_name": "Ananya Sharma",
                "phone": PHONE_PATIENT,
                "reason": f"E2E_{uniq}",
            },
            headers=auth_headers(reception_session["token"]),
            timeout=20,
        ).json()
        assert "snapshot" in w
        # Find corresponding appointment_id via doctor/today
        entry = next(
            e for e in w["snapshot"]["waiting"]
            if e["token_number"] == w["token_number"]
        )
        appt_id = entry["appointment_id"]
        assert appt_id

        med_name = f"TEST_MED_{uniq}"
        lab_name = f"TEST_LAB_{uniq}"
        payload = {
            "chief_complaint": "Chest pain",
            "clinical_notes": "Systolic murmur",
            "diagnosis": f"TEST_DX_{uniq}",
            "instructions": "Follow up in 1 week",
            "vitals": {"bp": "130/85", "temp": "98.7", "pulse": "78"},
            "medicines": [
                {"name": med_name, "dosage": "10mg", "frequency": "OD", "duration": "5d", "instructions": "after food"},
            ],
            "lab_orders": [lab_name],
        }
        c = requests.post(
            f"{API}/doctor/consultation/{appt_id}/complete",
            json=payload,
            headers=auth_headers(doctor_session["token"]),
            timeout=20,
        )
        assert c.status_code == 200, c.text
        assert c.json()["status"] == "completed"

        # Doctor GET returns completed state
        g = requests.get(
            f"{API}/doctor/consultation/{appt_id}",
            headers=auth_headers(doctor_session["token"]),
            timeout=20,
        ).json()
        assert g["consultation"]["status"] == "completed"
        assert any(m["name"] == med_name for m in g["medicines"])
        assert any(l["name"] == lab_name for l in g["lab_orders"])

        # Ananya (owner) now sees this in /prescriptions and /lab-tests
        pat_tok = _login(PHONE_PATIENT)["token"]
        prescriptions = requests.get(
            f"{API}/prescriptions",
            headers=auth_headers(pat_tok),
            timeout=20,
        )
        assert prescriptions.status_code == 200, prescriptions.text
        px = prescriptions.json().get("prescriptions", [])
        # find a prescription for THIS appointment_id
        mine = next((p for p in px if p.get("appointment_id") == appt_id), None)
        assert mine, f"patient could not see prescription for appt {appt_id}: {px}"
        assert any(item.get("name") == med_name for item in mine.get("items", []))

        labs = requests.get(
            f"{API}/lab-tests",
            headers=auth_headers(pat_tok),
            timeout=20,
        )
        assert labs.status_code == 200, labs.text
        lx = labs.json().get("lab_tests", [])
        my_lab = next(
            (l for l in lx if l.get("appointment_id") == appt_id and l.get("name") == lab_name),
            None,
        )
        assert my_lab, f"patient could not see lab-test for appt {appt_id}: {lx}"
        assert my_lab["status"] == "ordered"


# =============================================================================
# ROLE SECURITY (Phase-2 specific)
# =============================================================================
class TestPhase2RoleSecurity:
    def test_patient_forbidden_on_queue_next(self, patient_session_module):
        r = requests.post(
            f"{API}/queue/next",
            json={"doctor_id": "any"},
            headers=auth_headers(patient_session_module["token"]),
            timeout=20,
        )
        assert r.status_code == 403, r.text

    def test_patient_forbidden_on_walk_in(self, patient_session_module):
        r = requests.post(
            f"{API}/queue/walk-in",
            json={"doctor_id": "x", "patient_name": "TEST_forbid"},
            headers=auth_headers(patient_session_module["token"]),
            timeout=20,
        )
        assert r.status_code == 403, r.text

    def test_patient_forbidden_on_doctor_today(self, patient_session_module):
        r = requests.get(
            f"{API}/doctor/today",
            headers=auth_headers(patient_session_module["token"]),
            timeout=20,
        )
        assert r.status_code == 403, r.text

    def test_non_owner_doctor_cannot_open_consultation(
        self, doctor_session, reception_session, clinic_doctors,
    ):
        """Login as a *different* doctor (Arun, GM) and try to open Meera's appointment."""
        # Ensure there's an appointment on Meera to target
        # Login the second doctor from creds file (9000000006 = Arun)
        OTHER_DOC = "9000000006"
        try:
            other = _login(OTHER_DOC)
        except Exception:
            pytest.skip("secondary doctor account 9000000006 not seeded")

        # Get an appointment for Meera
        r = requests.get(
            f"{API}/doctor/today",
            headers=auth_headers(doctor_session["token"]),
            timeout=20,
        ).json()
        appts = [p for p in r["patients"] if p["appointment_id"]]
        if not appts:
            # create one via receptionist
            doc_id = _first_doctor_id_for_receptionist(clinic_doctors)
            uniq = uuid.uuid4().hex[:6]
            w = requests.post(
                f"{API}/queue/walk-in",
                json={
                    "doctor_id": doc_id,
                    "patient_name": f"TEST_Isolate_{uniq}",
                    "reason": "iso",
                },
                headers=auth_headers(reception_session["token"]),
                timeout=20,
            ).json()
            appt_id = next(
                e for e in w["snapshot"]["waiting"]
                if e["token_number"] == w["token_number"]
            )["appointment_id"]
        else:
            appt_id = appts[0]["appointment_id"]

        r2 = requests.get(
            f"{API}/doctor/consultation/{appt_id}",
            headers=auth_headers(other["token"]),
            timeout=20,
        )
        assert r2.status_code == 404, r2.text


# =============================================================================
# SUPABASE AUTH EXCHANGE
# =============================================================================
class TestSupabaseAuth:
    def test_bogus_supabase_token_401(self, api_client):
        r = api_client.post(
            f"{API}/auth/supabase",
            json={"access_token": "bogus-supabase-jwt"},
        )
        # If Supabase creds are missing on the backend, the endpoint returns 503.
        # We only assert 401 (the documented behaviour when creds ARE configured).
        assert r.status_code in (401, 503), r.text
        if r.status_code == 503:
            pytest.skip("Supabase not configured on backend (503)")
