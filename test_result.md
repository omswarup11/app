#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: >
  Sanjeevan clinic platform. Migrate the backend from MongoDB to Supabase Postgres NOW,
  preserve all working functionality, then complete the patient app end-to-end (Phase 1),
  followed by Staff/Doctor/Lab/Clinic-Admin/Super-Admin consoles in later phases.
  The uploaded snapshot was incomplete (only core.py + push.py + bytecode); the backend was
  faithfully rebuilt on Postgres from the recovered data model + documented behaviors, and the
  patient frontend was built from the high-fidelity prototype handoff.

backend:
  - task: "Postgres migration (SQLAlchemy async + asyncpg on Supabase pooler)"
    implemented: true
    working: true
    file: "db.py, models.py, server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "All 22 collections mapped to normalized Postgres tables with FKs, unique constraints, indexes, check constraints, created_at/updated_at. Connects to Supabase session pooler (statement_cache_size=0). Tables auto-created on boot; seed runs once."
  - task: "Auth: dev-OTP send/verify, sessions, /me, logout, rate limit"
    implemented: true
    working: true
    file: "routes_auth.py, security.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "Verified via curl + browser. send-otp returns dev_otp, rate limit 5/300s enforced (429 + UI error), verify issues session, /me returns role+context, logout clears sessions. Google upsert endpoint present."
  - task: "Clinic search by name/city (no IDs exposed), specialties, doctors, availability (5 days)"
    implemented: true
    working: true
    file: "routes_clinics.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "Search returns 3 Sanjeevan clinics with doctor_count. Availability computed from template minus booked+held slots."
  - task: "Slot hold + double-booking prevention + payments (server-derived amount, verify, webhook, idempotency)"
    implemented: true
    working: true
    file: "routes_booking.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "Concurrent hold -> exactly one 200 + one 409 (unique constraint). Amount fee+20+4 server-derived. Sandbox confirm fulfils idempotently; partial unique index on appointments prevents double-book. Webhook verifies HMAC over raw body + idempotent via webhook_events; returns 400 on bad/missing signature (verified externally)."
  - task: "Queue (patient view + staff next/skip/complete/walk-in) + websocket"
    implemented: true
    working: true
    file: "routes_queue.py, realtime.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "queue/me returns token, now_serving, people_ahead, wait, doctor. Staff controls implemented. WebSocket handshake returns 403 through the preview ingress (needs ingress WS support); frontend falls back to 8s polling which works."
  - task: "Records, prescriptions, lab tests, notifications, signed medical-file URLs"
    implemented: true
    working: true
    file: "routes_records.py, core.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "HMAC signed file tokens (user+record scoped, expiring). Patient isolation enforced on file access. Records/prescriptions/lab endpoints return seeded data."

frontend:
  - task: "Patient app — Login (3-step OTP + Google + rate-limit/error states)"
    implemented: true
    working: true
    file: "app/login.tsx, src/auth.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "Verified in browser: phone validation (green check), 6-cell OTP auto-verify, success step, rate-limit error surfaced."
  - task: "Patient app — Home / Book / Payment / Confirmation / Queue / Records"
    implemented: true
    working: true
    file: "app/(tabs)/*, app/payment.tsx, app/confirmation.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "Verified end-to-end in browser: Home token hero + upcoming + quick actions; Book clinic-search->doctor->slots; Payment ₹724 breakdown + methods; Confirmation ticket with minted token #25; Queue gray-dot offline state. Records path identical to verified endpoints."

metadata:
  created_by: "main_agent"
  version: "2.0"
  test_sequence: 0
  run_ui: false

test_plan:
  current_focus:
    - "Postgres migration regression (auth, rate-limit, role security, clinic search, availability, double-booking, slot holds/release, payment server-amount + idempotency + webhook bad-signature, cross-patient isolation, signed-file URL security)"
    - "Patient frontend flow login->home->book->pay->queue->records"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: >
      Phase 1 complete: MongoDB->Supabase Postgres migration done and the patient app built
      from the prototype. Please regression-test the backend on Postgres (all items in
      current_focus) and the patient frontend flow. NOTE: send-otp is rate-limited to 5/300s
      per phone (dev OTP 123456) — reuse tokens or use fresh phone numbers to avoid 429s.
      Razorpay runs in sandbox mode (KEY_SECRET/WEBHOOK_SECRET not yet provided). WebSocket over
      the preview ingress returns 403 (frontend polls every 8s as fallback) — test queue via polling.