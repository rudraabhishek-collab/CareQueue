# CareQueue

An intelligent OPD queue-management and triage system for Indian hospitals.
CareQueue helps patients find the right care facility, skip unnecessary
queues, and track their OPD token — while helping hospitals balance load
across departments and facilities.

> **Status: Phase 4 (authentication & role-based authorization).**
> Phone+password registration/login (bcrypt + JWT), `/auth/me`, role
> enforcement (`patient|doctor|staff|admin`), dev demo accounts, and
> comprehensive auth tests are in place. Triage, queue/token management,
> doctor dashboards, ABHA, notifications, and live hospital data are
> **not implemented yet** — they are upcoming phases. This is an **MVP
> authentication system**: real OTP and ABHA authentication are **not
> implemented**.

---

## Problem statement

Government hospitals in India are often overcrowded while nearby Primary
Health Centers (PHCs) remain underused. Patients wait for hours without a
clear picture of queue position or wait time, and facilities have no simple
way to balance load across the network.

## Solution

CareQueue provides a single booking surface where a patient describes their
symptoms, receives a transparent decision-support triage recommendation,
gets an OPD token for the most appropriate facility/department, and then
tracks their position in a deterministic priority queue in real time.

## Current features (working)

- Single-page frontend (`frontend/careQueue.html`) served by the backend
- Clean separation of UI (`frontend/app.js`) from business logic (backend API)
- `GET /api/v1/health` and `GET /api/v1/health/db` health checks
- SQLite database layer with a versioned migration runner (WAL, FK on)
- Full Phase-1 schema: users, patients, hospitals, departments, doctors,
  symptoms, triage_assessments, tokens, queue_entries, appointments,
  notifications, audit_logs — with CHECK/UNIQUE/FK constraints + indexes
- Idempotent demo seed data: 5 hospitals, 15 departments, 16 symptoms
- **Authentication**: `POST /api/v1/auth/register`, `POST /api/v1/auth/login`,
  `GET /api/v1/auth/me` (phone + password, bcrypt, JWT, Zod validation,
  phone normalization, audit logging, MVP login rate limiting)
- **Authorization**: `requireAuth` + `requireRole(...)` middleware with
  roles `patient | doctor | staff | admin`; auth seed with 4 dev demo
  accounts (`npm run db:seed:auth`)
- DB CLI: `db:migrate`, `db:seed`, `db:seed:auth`, `db:reset` (development-only)
- Centralized, consistent error responses
- Structured request logging (request ID, method, path, status, duration)
- Static serving of `careQueue.html`, `styles.css`, `app.js`
- Automated unit/API tests, ESLint, Prettier

## Upcoming phases (NOT implemented yet)

- Transparent triage engine (decision support only, with emergency escalation)
- Deterministic queue/token engine (priority + FIFO)
- Hospital/doctor dashboards
- Token tracking against the real queue
- In-app notifications and live updates (polling)
- Real OTP (SMS), ABHA linking, multilingual polish, deployment

---

## Architecture

```text
Frontend (frontend/careQueue.html + app.js)
        │  fetch() → /api/v1/...
        ▼
REST API (Express)
        │
        ▼
Application services (auth, triage, queue, token, ...) — upcoming phases
        │
        ▼
SQLite (better-sqlite3) + migrations
```

A modular monolith: one Node.js process serves the static frontend and the
REST API, backed by a single SQLite database.

```
carequeue/
├── frontend/          # careQueue.html (UI source of truth), styles.css, app.js
├── backend/
│   ├── server.js      # entry point (starts the HTTP server)
│   ├── app.js         # Express app factory (routes, static, error handling)
│   ├── config/        # environment loading + validation
│   ├── controllers/   # HTTP handlers
│   ├── middleware/    # request logging, error handling
│   ├── routes/        # API route assembly
│   ├── services/      # business logic (upcoming phases)
│   ├── schemas/       # Zod validation schemas (upcoming phases)
│   ├── db/            # database.js, migrations/, seeds/
│   └── utils/         # logger, response helpers, HTTP errors
├── tests/             # unit/, integration/, api/, helpers/
└── docs/              # architecture, requirements
```

## Technology stack

| Layer         | Choice                                                     |
| ------------- | ---------------------------------------------------------- |
| Frontend      | Existing vanilla HTML/CSS/JS (no framework, no build step) |
| Backend       | Node.js + Express (ESM, JSDoc-annotated)                   |
| Database      | SQLite via `better-sqlite3`                                |
| Validation    | Zod                                                        |
| Auth (future) | bcrypt + JSON Web Tokens                                   |
| Logging       | pino                                                       |
| Testing       | `node:test` + Supertest (Playwright E2E in a later phase)  |
| Lint/format   | ESLint (flat config) + Prettier                            |

---

## Local setup

Prerequisites: **Node.js >= 20** (tested on Node 25), npm.

```bash
# 1. Install dependencies
npm install

# 2. Create your environment file
cp .env.example .env
#    Edit .env — set JWT_SECRET to any value for local development

# 3. Prepare the database (migrations + demo seed data)
npm run db:migrate
npm run db:seed

# 4. (Optional, development) create the 4 demo accounts
#    Set DEMO_*_PASSWORD in .env first (see .env.example)
npm run db:seed:auth

# 5. Run the server
npm run dev
#    or run without auto-restart:
npm start
```

Open http://localhost:3000 in your browser.

## Environment variables

| Variable          | Default               | Description                                                              |
| ----------------- | --------------------- | ------------------------------------------------------------------------ |
| `PORT`            | `3000`                | Port the server listens on                                               |
| `JWT_SECRET`      | _(required)_          | Secret used to sign auth tokens. The server refuses to start without it. |
| `JWT_EXPIRES_IN`  | `2h`                  | Access token lifetime (jsonwebtoken format)                              |
| `DATABASE_PATH`   | `./data/carequeue.db` | SQLite file location (directory is created automatically)                |
| `NODE_ENV`        | `development`         | Runtime environment                                                      |
| `LOG_LEVEL`       | `info`                | Pino log level (`silent` disables logging)                               |
| `DEMO_*_PASSWORD` | _(none)_              | DEVELOPMENT-ONLY passwords for the 4 demo accounts (`db:seed:auth`)      |

`.env` is gitignored. Never commit a real `.env`.

## Run commands

```bash
npm run dev        # start with auto-restart (runs migrations automatically)
npm start          # start normally (runs migrations automatically)
npm run db:migrate # apply pending migrations
npm run db:seed    # seed demo/reference data (idempotent — safe to repeat)
npm run db:seed:auth # DEVELOPMENT-ONLY: create demo patient/doctor/staff/admin accounts
npm run db:reset   # DEVELOPMENT-ONLY: wipe and rebuild the local database
npm test           # run all tests (node --test)
npm run lint       # ESLint
npm run format     # Prettier
```

> `db:reset` deletes the local database file and recreates it. It refuses to
> run when `NODE_ENV=production` — never use it against production data.
> `db:seed:auth` also refuses to run in production and fails with a clear
> message if the `DEMO_*_PASSWORD` variables are missing.

## Testing

Tests live in `tests/` and run with the built-in `node:test` runner:

- `tests/api/` — HTTP-level tests via Supertest (health, 404s, malformed
  JSON, error envelope, static asset serving)
- `tests/unit/` — database/migration/constraint/seed tests and the app
  layer; they use throwaway in-memory SQLite databases and never touch
  `./data/carequeue.db`
- `tests/helpers/` — shared in-memory test contexts (app factory, seeded DB)

```bash
npm test
```

## Database

SQLite + `better-sqlite3`. The full Phase-1 schema (users, patients,
hospitals, departments, doctors, symptoms, triage_assessments, tokens,
queue_entries, appointments, notifications, audit_logs) with CHECK/UNIQUE/FK
constraints and indexes, versioned migrations, and idempotent demo seeds.
See [docs/database.md](docs/database.md) for the complete design.

> Demo seed symptom scores are demonstration rules only and are **not
> clinically validated**.

## API

- `GET /api/v1/health` → `{ "status": "ok", "service": "carequeue-api" }`
- `GET /api/v1/health/db` → `{ "data": { "status": "ok" } }` (trivial DB
  reachability check; never exposes internals)
- `POST /api/v1/auth/register` → `201 { data: { user, token } }`
  (phone + password; role always `patient`; bcrypt hashed)
- `POST /api/v1/auth/login` → `200 { data: { user, token } }`
  (generic `401 INVALID_CREDENTIALS` for wrong phone or password)
- `GET /api/v1/auth/me` → `200 { data: { user, patient? } }`
  (requires `Authorization: Bearer <JWT>`)
- `GET /api/v1/_dev/roles/:role` → dev-only role-enforcement checks
  (mounted only when `NODE_ENV !== 'production'`)

See [docs/authentication.md](docs/authentication.md) for the full auth
design. Additional endpoints (triage, queue, tokens, doctors,
notifications) are specified for future phases in `docs/`.

### Response envelopes

```jsonc
// Success
{ "data": { } }

// Error
{ "error": { "code": "VALIDATION_ERROR", "message": "Invalid request", "details": [] } }
```

Error codes used: `VALIDATION_ERROR`, `INVALID_JSON`, `NOT_FOUND`,
`UNAUTHORIZED`, `FORBIDDEN`, `CONFLICT`, `UNPROCESSABLE`,
`INVALID_CREDENTIALS`, `USER_EXISTS`, `TOO_MANY_ATTEMPTS`,
`INTERNAL_ERROR` (400/401/403/404/409/422/429/500).

---

## Current limitations

- Authentication is an **MVP**: real OTP (SMS) and ABHA authentication are
  not implemented; no refresh tokens, revocation, or password reset; rate
  limiting is single-process/in-memory
- No triage, token, or queue engine yet — the booking wizard displays a
  clear "feature not connected yet" error when the backend API is missing
- Triage and queue functionality are **not implemented yet**; only the
  schema, demo seeds, and infrastructure exist
- Seeded symptoms/hospitals are DEMO data — not a live integration, and
  symptom scores are not clinically validated
- No real ABHA integration (planned, not fake)
- Hospital occupancy / wait times are placeholder UI content, not live data
- No production deployment setup yet

## Safety disclaimer

CareQueue is a **decision-support and demo system**. Symptom-based triage is
intended to help with queue prioritization and facility choice — it is **not
a medical diagnosis** and must never be treated as a substitute for
professional medical care. In an emergency, contact local emergency services
immediately.

---

## License

Private / hackathon project. No license granted for redistribution.
