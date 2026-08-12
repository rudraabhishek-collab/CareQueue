# CareQueue — Database

> Status: **Phase 3**. Schema, migrations, seed data and tests are in place.
> No authentication, triage, token, queue, or dashboard logic is implemented
> yet — this is database infrastructure only.

## 1. Choice

SQLite via `better-sqlite3` (synchronous, battle-tested, zero external
services). Perfect for the MVP modular monolith and for test hermeticity
(in-memory databases). WAL journal mode is enabled for concurrent readers.

## 2. Database layer

`backend/db/database.js` owns everything SQLite:

- `openDatabase({ databasePath })` — creates the parent directory if
  missing, opens the file (`:memory:` supported), sets
  `PRAGMA journal_mode = WAL` and `PRAGMA foreign_keys = ON`.
- `runMigrations(db, { migrationsDir })` — the migration runner.
- `closeDatabase(db)` — closes the connection safely (idempotent).

The connection is created once at startup and passed to the Express app
via dependency injection. **No raw SQL lives in route/controller files.**

The database path comes from `DATABASE_PATH` (default `./data/carequeue.db`,
resolved relative to the project root). Directory creation is automatic.

## 3. Migrations

### Runner

- Files in `backend/db/migrations/` named `NNN_description.sql`.
- Executed in **filename order** (deterministic).
- Each migration runs inside a **transaction** and is recorded in the
  `schema_migrations` table (`name` unique, `applied_at`).
- Already-applied migrations are skipped → safe to run repeatedly.
- A failed migration **throws**, rolls back, is not recorded, fails startup
  clearly, and the server exits instead of continuing with a broken DB.

### Files

| File                         | Contents                                   |
| ---------------------------- | ------------------------------------------ |
| `001_create_app_meta.sql`    | Baseline `app_meta` key/value table.       |
| `002_create_core_schema.sql` | All business tables, constraints, indexes. |

Run manually:

```bash
npm run db:migrate
```

Migrations also run automatically whenever the server starts.

## 4. Schema

```
users 1─┬─0..1 patients
        └─* doctors.user_id (0..1)
        └─* notifications
        └─* audit_logs.actor_user_id (0..1)

hospitals 1─* departments 1─* doctors
                        └─* tokens
                        └─* queue_entries
                        └─* appointments

patients 1─* triage_assessments
         └─* tokens (via queue_entries)
         └─* queue_entries
         └─* appointments

tokens 1─1 queue_entries  *─1 doctors
```

### Tables

- **users** — `phone` (UNIQUE), `password_hash` (nullable until auth),
  `role` (`patient|doctor|staff|admin`), `name`, `created_at`.
- **patients** — `user_id` (UNIQUE → 0..1 per user, nullable), `name`,
  `age` (`0..120`), `gender` (nullable), `phone`, `abha_id` (nullable),
  `created_at`. **No real medical records.**
- **hospitals** — `name`, `slug` (UNIQUE), `city`, `type`
  (`tertiary|secondary|phc|trauma`), `address`, `lat`, `lng`, `active`,
  `created_at`.
- **departments** — `hospital_id` FK, `name`, `code`, `avg_consult_minutes`,
  `active`, `UNIQUE(hospital_id, name)`.
- **doctors** — `department_id` FK, `user_id` FK (nullable), `name`,
  `registration_id`, `available`, `created_at`.
- **symptoms** — `code` (UNIQUE), `name_en`, `name_hi`, `base_score`
  (`0..100`), `red_flag`, `care_level_hint`, `created_at`. **Seed/reference
  data with DEMO values only.**
- **triage_assessments** — `patient_id` FK, `symptom_codes` (JSON TEXT),
  `description`, `severity`, `priority`, `score`, `score_breakdown`
  (JSON TEXT), `is_emergency`, `created_at`.
- **tokens** — `token_no` (UNIQUE), `hospital_id` FK, `department_id` FK,
  `issue_date`, `created_at`. No generation logic yet.
- **queue_entries** — `token_id` (UNIQUE FK), `hospital_id` FK,
  `department_id` FK, `doctor_id` FK (nullable), `patient_id` FK,
  `priority`, `status` (`WAITING|CALLED|IN_CONSULTATION|COMPLETED|CANCELLED|NO_SHOW`),
  `arrived_at`, `called_at`, `started_at`, `completed_at`,
  `position_snapshot`, `created_at`. No queue logic yet.
- **appointments** — `patient_id` FK, `doctor_id` FK (nullable),
  `hospital_id` FK, `department_id` FK, `scheduled_for`, `status`, `created_at`.
- **notifications** — `user_id` FK, `type`, `message`, `read_at`, `created_at`.
- **audit_logs** — `actor_user_id` FK (nullable), `action`, `entity_type`,
  `entity_id`, `meta` (JSON TEXT), `created_at`.

## 5. Constraints

- `NOT NULL` on identity + classification fields; nullable fields stay
  nullable where the design permits (e.g. `password_hash`, `gender`,
  `abha_id`, `doctor_id`, timestamps of lifecycle steps).
- `CHECK` constraints: `users.role`, `hospitals.type`,
  `queue_entries.status`, `patients.age` (0–120), `symptoms.base_score`
  (0–100), boolean-like flags (`active`, `red_flag`, `is_emergency`,
  `available`), `departments.avg_consult_minutes` (> 0).
- `UNIQUE`: `users.phone`, `hospitals.slug`, `departments(hospital_id,name)`,
  `symptoms.code`, `tokens.token_no`, `patients.user_id`,
  `queue_entries.token_id`.
- Foreign keys enforce referential integrity (validated by tests).

## 6. Indexes

Auto-created by `UNIQUE` constraints: `users(phone)`,
`hospitals(slug)`, `departments(hospital_id,name)`, `symptoms(code)`,
`tokens(token_no)`.

Explicit indexes (from the Phase 1 design — no speculative extras):

| Index                                           | Columns                                                                   |
| ----------------------------------------------- | ------------------------------------------------------------------------- |
| `idx_triage_patient_created_at`                 | `triage_assessments(patient_id, created_at)`                              |
| `idx_tokens_hospital_department_issue`          | `tokens(hospital_id, department_id, issue_date)`                          |
| `idx_queue_hospital_department_status_priority` | `queue_entries(hospital_id, department_id, status, priority, arrived_at)` |
| `idx_queue_status`                              | `queue_entries(status)`                                                   |
| `idx_queue_doctor_status`                       | `queue_entries(doctor_id, status)`                                        |
| `idx_appointments_patient_scheduled`            | `appointments(patient_id, scheduled_for)`                                 |
| `idx_notifications_user_read`                   | `notifications(user_id, read_at)`                                         |
| `idx_audit_entity`                              | `audit_logs(entity_type, entity_id)`                                      |

## 7. Seeds

`backend/db/seed.js` — idempotent demo/reference data using `INSERT OR IGNORE`
against the unique constraints. Running it repeatedly never duplicates rows
and never wipes existing data.

Contents:

- **5 demo hospitals** matching the CareQueue UI:
  `AIIMS New Delhi` (tertiary), `Safdarjung Hospital`, `RML Hospital`,
  `Lok Nayak Hospital` (secondary), `Shastri Nagar PHC` (phc).
  Addresses are generic area references; these are DEMO records, not a live
  integration.
- **3 departments per hospital**: General Medicine (GM),
  Orthopedics (ORTHO), Pediatrics (PED).
- **16 symptoms**: the 15 UI symptoms plus Anxiety/Stress (the orphan
  translation). Codes match the UI `sym_*` i18n keys so a later phase can
  map UI selections directly.

> **WARNING:** Symptom `base_score`, `red_flag` and `care_level_hint` values
> are **demonstration rules only and are not clinically validated.**

```bash
npm run db:seed
```

## 8. Development reset

`db:reset` deletes the local SQLite file (plus `-wal`/`-shm`) and rebuilds
it from scratch (migrations + seed).

```bash
npm run db:reset
```

**DEVELOPMENT-ONLY.** The script refuses to run when `NODE_ENV=production`.
Never run it against production data.

## 9. Test database behavior

- Tests use `:memory:` SQLite databases (temporary, per-test) — they
  **never touch `./data/carequeue.db`**.
- `tests/helpers/db.js` exposes `createTestDb()` (migrated) and
  `createSeededTestDb()` (migrated + seeded).
- Migration, constraint, and seed tests live in `tests/unit/`.
- Constraint tests prove: unique phone/slug/department-name, role/type/status
  CHECKs, age bounds, and foreign key enforcement.
- Seed tests prove idempotency, expected counts (5/15/16), exact values, and
  that seeding preserves manually inserted rows.

## 10. Health checks

- `GET /api/v1/health` → `{ "status": "ok", "service": "carequeue-api" }`
- `GET /api/v1/health/db` → `{ "data": { "status": "ok" } }` — runs a trivial
  `SELECT 1`; never exposes database internals.
