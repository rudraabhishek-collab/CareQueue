# CareQueue — Requirements

> Status: **Phase 2**. Requirements below are derived from the existing
> `frontend/careQueue.html` (the UI source of truth) and the approved Phase 1
> audit. Implementation status is noted per item.

## 1. Scope statement

CareQueue is an intelligent OPD queue-management and triage system for
Indian hospitals. The MVP must make patient registration, symptom-based
triage (decision support), token issuance, queue tracking, and doctor-side
status updates work end-to-end while preserving the existing UI visually.

## 2. Product goals

- G1 — Reduce OPD waiting time by routing patients to the right facility.
- G2 — Provide a transparent, deterministic, testable queue.
- G3 — Keep the UI visually equivalent to the original `careQueue.html`.
- G4 — Remain a clearly-labeled decision-support/demo system (not a medical
  diagnosis tool) with a strong emergency escalation path.

## 3. User roles

- **Patient** — books OPD, submits symptoms, receives a token, tracks status.
- **Doctor** — views the queue, calls the next patient, updates status.
- **Staff/Admin** (future) — manages hospitals, departments, doctors, seeds.

## 4. Functional requirements

### 4.1 P0 — Must work (MVP)

| ID    | Requirement                                                        | Status                  |
| ----- | ------------------------------------------------------------------ | ----------------------- |
| P0-01 | Patient provides name, age, hospital, department                   | Not implemented         |
| P0-02 | Patient selects symptoms + free-text description                   | UI present; API pending |
| P0-03 | Triage assessment computes severity + priority transparently       | Not implemented         |
| P0-04 | Emergency cases get an escalation path (108 / ER), no normal token | Not implemented         |
| P0-05 | OPD token generated deterministically (unique, sequential)         | Not implemented         |
| P0-06 | Token placed in a priority + FIFO queue                            | Not implemented         |
| P0-07 | Patient tracks token status/position/wait estimate                 | UI present; API pending |
| P0-08 | Doctor views queue and calls next patient                          | Not implemented         |
| P0-09 | Status transitions WAITING → CALLED → IN_CONSULTATION → COMPLETED  | Not implemented         |
| P0-10 | Language switching (EN/HI) preserved                               | Working (UI only)       |

### 4.2 P1 — Important (post-MVP)

| ID    | Requirement                                                    |
| ----- | -------------------------------------------------------------- |
| P1-01 | In-app notifications (token called, status change) via polling |
| P1-02 | Hospital occupancy / wait-time overview from seeded data       |
| P1-03 | Appointment history for patients                               |
| P1-04 | Basic queue analytics (wait times, throughput)                 |

### 4.3 P2 — Future

| ID    | Requirement                                             |
| ----- | ------------------------------------------------------- |
| P2-01 | Real ABHA (Ayushman Bharat) integration                 |
| P2-02 | Real hospital/EMR integrations                          |
| P2-03 | SMS/WhatsApp notifications                              |
| P2-04 | Advanced AI triage (explicitly out of MVP scope)        |
| P2-05 | Production deployment hardening (Docker, observability) |

## 5. Non-functional requirements

- NFR-01 — Queue ordering is deterministic and race-free (priority, then FIFO).
- NFR-02 — Token numbers are unique and generated atomically in the DB.
- NFR-03 — All triage runs and state transitions are auditable.
- NFR-04 — API errors use a consistent envelope; no stack traces to clients.
- NFR-05 — Passwords/OTPs/sensitive data never logged.
- NFR-06 — MVP stores identity + symptom data only; no real health records,
  no real patient medical information.
- NFR-07 — The UI remains visually equivalent to the original design.

## 6. Out of scope (this phase / explicitly rejected)

- No medical diagnosis, prescriptions, or treatment advice.
- No real ABHA, real hospital, or payment integrations.
- No React, Next.js, Tailwind, Redis, WebSockets, Docker, microservices.

## 7. Safety requirements

- Every triage screen carries a "decision-support, not diagnosis" disclaimer.
- Emergency red-flag symptoms must produce an escalation path instead of a
  normal queue token.
- The system must never claim real functionality that is demo-only.

## 8. Implementation status

Implemented in Phase 2:

- Backend foundation (Express app, config, SQLite + migrations, error
  handling, logging, health endpoint, static serving).
- Frontend extracted to `frontend/{careQueue.html,styles.css,app.js}` with
  mock business logic removed and a clean API service layer added.

Not yet implemented: everything in 4.1 P0-01…P0-09 except the UI portions
noted above.
