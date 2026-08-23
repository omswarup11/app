# Sanjeevan — Product Requirements & Build Log

## Original problem statement
Migrate the existing Sanjeevan clinic platform from MongoDB to **Supabase Postgres NOW**,
preserve all working functionality, then complete the remaining prototype workflows
(Patient, Receptionist, Doctor, Lab, Clinic Admin, Super Admin). Payments via Razorpay,
realtime queue, private medical file storage, notifications, audit logs, RLS + backend authz.

### Important context discovered
The uploaded `.emergent.zip` snapshot was **incomplete** — only `core.py` + `push.py` +
compiled bytecode survived; the frontend and most backend source were missing. The backend was
faithfully reconstructed on Postgres from the recovered data model (`core.py` schema/indexes) +
the documented regression behaviors, and the patient frontend was built from the high-fidelity
prototype handoff (`design_handoff_sanjeevan`).

## Architecture (current)
- **Mobile:** React Native + Expo (expo-router), TypeScript.
- **Backend:** Python FastAPI + SQLAlchemy async (asyncpg).
- **Database:** **Supabase Postgres** (session pooler) — DATABASE_URL in backend/.env.
- **Auth:** dev-OTP + session tokens today (Supabase Auth phone OTP + Google to be layered).
- **Realtime:** WebSocket hub (queue). Preview ingress blocks WS (403) → frontend polls 8s.
  Supabase Realtime is the intended final infra.
- **Payments:** Razorpay (live KEY_ID set; SECRET/WEBHOOK_SECRET pending → sandbox fulfilment).
- **Storage:** HMAC signed, expiring file URLs (Supabase private Storage to be wired).

## User personas
Patient · Receptionist · Doctor · Lab technician · Clinic admin · Super admin.

## Core requirements (static)
Clinic search by name/city (never expose IDs), booking with mandatory payment, live queue
tokens, records/prescriptions/lab reports, staff queue console, doctor consultation +
prescriptions + lab orders, lab report publishing, clinic-admin staff/support/billing,
super-admin clinic + admin management, RLS + backend authorization, audit logs.

## Implemented (with dates)
### 2026-06 (Phase 1)
- Mongo→**Supabase Postgres** migration: 22 collections → normalized tables with FKs, unique
  constraints, indexes, check constraints, timestamps. Auto-create + idempotent seed on boot.
- Auth: dev-OTP send/verify (rate-limited 5/300s), sessions, /me, logout, Google upsert.
- Clinic search (name/city, doctor_count), specialties, doctors, 5-day availability.
- Booking: slot holds (unique constraint), **double-booking prevention** (partial unique index
  → one 200 / one 409), payments order (server-derived ₹fee+20+4), confirm (idempotent fulfil,
  token minting via atomic counter, queue entry, notification), **Razorpay webhook** (HMAC over
  raw body + idempotency; live URL exposed).
- Queue: patient live view (token, now-serving, people-ahead, wait), staff next/skip/complete,
  add walk-in; WebSocket hub (polling fallback on web).
- Records/prescriptions/lab tests/notifications; signed medical-file URLs with patient isolation.
- Audit logs on login/book/queue/walk-in.
- Patient app (prototype-faithful): Login (3-step), Home (token hero + upcoming + quick actions
  + recent reports), Book (clinic search → doctor → date/slots), Payment (breakdown + methods),
  Confirmation (ticket), Queue (live + gray-dot offline fix), Records (reports + prescriptions).
- Staff placeholder screen routing non-patient roles by backend role.

### 2026-06 (Phase 2)
- Reception console: doctor selector, live now-serving + waiting list, Call next / Skip / Done,
  Add walk-in bottom sheet with token generation, activity feed. (app/reception.tsx)
- Doctor console: today's patients list + Call next; consultation screen with vitals, clinical
  notes (chief complaint/notes/diagnosis/instructions), medicine sheet (multi), lab-order chips,
  Save draft + Complete consultation. (app/doctor.tsx, app/consultation/[id].tsx)
- New `consultations` table; complete-consultation writes prescription+items+lab_tests+record,
  marks appointment/queue completed, notifies patient (verified propagation).
- Supabase Auth wired: real Google OAuth (expo-web-browser) + phone OTP (behind
  EXPO_PUBLIC_USE_SUPABASE_PHONE flag) → /api/auth/supabase token exchange. Needs dashboard
  provider config to go live; dev-OTP remains default so all seeded roles keep working.

## Backlog (prioritized)
### P0 (next)
- Supabase Auth (phone OTP via test numbers + Google browser OAuth), map auth.users → profiles.
- Supabase RLS policies per role; Supabase private Storage for medical files + signed URLs.
- Real Razorpay web checkout when SECRET provided; wire webhook secret.
- Staff/Reception console (queue controls UI, add walk-in, call again/skip/complete/next).
### P1
- Doctor consultation (clinical notes, add-medicine sheet, lab orders, complete consultation).
- Lab technician console (pending/collected/processing, upload + publish report).
- Supabase Realtime for the live queue (replace polling).
### P2
- Clinic Admin (staff mgmt + invite, support tickets, billing/subscription).
- Super Admin (clinics CRUD, assign admin + invite, admin pool, maintenance billing).
- Push notifications (FCM) — only on user request; needs deploy + build.

## Next tasks
1. Confirm Supabase Auth approach + configure test phone numbers / Google OAuth client.
2. Build Reception + Doctor consoles (highest prototype value after patient app).
3. Apply RLS + Storage SQL on the Supabase project; move signed URLs to Supabase Storage.
