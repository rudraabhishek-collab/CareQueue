-- CareQueue core schema (Phase 3).
--
-- Creates the business tables approved in the Phase 1 design review.
-- This phase is database infrastructure ONLY: no authentication, triage,
-- token, queue, dashboard, ABHA, or notification business logic.

-- ---------------------------------------------------------------------------
-- USERS
--   Roles: patient | doctor | staff | admin
--   password_hash is nullable until authentication lands (Phase 4).
--   phone has a UNIQUE constraint (indexed automatically by SQLite).
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  phone         TEXT    NOT NULL UNIQUE,
  password_hash TEXT,
  role          TEXT    NOT NULL DEFAULT 'patient'
                CHECK (role IN ('patient', 'doctor', 'staff', 'admin')),
  name          TEXT    NOT NULL,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- PATIENTS
--   users 1 -> 0..1 patients (user_id is UNIQUE).
--   No real medical records are stored.
-- ---------------------------------------------------------------------------
CREATE TABLE patients (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER UNIQUE REFERENCES users(id),
  name       TEXT    NOT NULL,
  age        INTEGER CHECK (age >= 0 AND age <= 120),
  gender     TEXT,
  phone      TEXT    NOT NULL,
  abha_id    TEXT,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- HOSPITALS
--   Types: tertiary | secondary | phc | trauma
--   slug has a UNIQUE constraint (indexed automatically by SQLite).
-- ---------------------------------------------------------------------------
CREATE TABLE hospitals (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  slug       TEXT    NOT NULL UNIQUE,
  city       TEXT    NOT NULL DEFAULT 'New Delhi',
  type       TEXT    NOT NULL CHECK (type IN ('tertiary', 'secondary', 'phc', 'trauma')),
  address    TEXT,
  lat        REAL,
  lng        REAL,
  active     INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- DEPARTMENTS
--   UNIQUE(hospital_id, name) indexed automatically by SQLite.
-- ---------------------------------------------------------------------------
CREATE TABLE departments (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  hospital_id        INTEGER NOT NULL REFERENCES hospitals(id),
  name               TEXT    NOT NULL,
  code               TEXT    NOT NULL,
  avg_consult_minutes INTEGER NOT NULL DEFAULT 10 CHECK (avg_consult_minutes > 0),
  active             INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at         TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (hospital_id, name)
);

-- ---------------------------------------------------------------------------
-- DOCTORS
-- ---------------------------------------------------------------------------
CREATE TABLE doctors (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  department_id   INTEGER NOT NULL REFERENCES departments(id),
  user_id         INTEGER REFERENCES users(id),
  name            TEXT    NOT NULL,
  registration_id TEXT,
  available       INTEGER NOT NULL DEFAULT 1 CHECK (available IN (0, 1)),
  created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- SYMPTOMS
--   Seed/reference data. base_score and care_level_hint are DEMO values only.
--   code has a UNIQUE constraint (indexed automatically by SQLite).
-- ---------------------------------------------------------------------------
CREATE TABLE symptoms (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  code           TEXT    NOT NULL UNIQUE,
  name_en        TEXT    NOT NULL,
  name_hi        TEXT,
  base_score     INTEGER NOT NULL CHECK (base_score >= 0 AND base_score <= 100),
  red_flag       INTEGER NOT NULL DEFAULT 0 CHECK (red_flag IN (0, 1)),
  care_level_hint TEXT,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- TRIAGE_ASSESSMENTS
--   symptom_codes and score_breakdown are JSON stored as TEXT.
--   Triage scoring logic is NOT implemented yet (later phase).
-- ---------------------------------------------------------------------------
CREATE TABLE triage_assessments (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id      INTEGER NOT NULL REFERENCES patients(id),
  symptom_codes   TEXT    NOT NULL,
  description     TEXT,
  severity        TEXT,
  priority        INTEGER,
  score           INTEGER,
  score_breakdown TEXT,
  is_emergency    INTEGER NOT NULL DEFAULT 0 CHECK (is_emergency IN (0, 1)),
  created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- TOKENS
--   Queue behavior and token generation are NOT implemented yet.
--   token_no has a UNIQUE constraint (indexed automatically by SQLite).
-- ---------------------------------------------------------------------------
CREATE TABLE tokens (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  token_no      TEXT    NOT NULL UNIQUE,
  hospital_id   INTEGER NOT NULL REFERENCES hospitals(id),
  department_id INTEGER NOT NULL REFERENCES departments(id),
  issue_date    TEXT    NOT NULL DEFAULT (date('now')),
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- QUEUE_ENTRIES
--   Queue logic (ordering, calling, etc.) is NOT implemented yet.
--   status is one of the approved lifecycle states.
-- ---------------------------------------------------------------------------
CREATE TABLE queue_entries (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  token_id          INTEGER NOT NULL UNIQUE REFERENCES tokens(id),
  hospital_id       INTEGER NOT NULL REFERENCES hospitals(id),
  department_id     INTEGER NOT NULL REFERENCES departments(id),
  doctor_id         INTEGER REFERENCES doctors(id),
  patient_id        INTEGER NOT NULL REFERENCES patients(id),
  priority          INTEGER NOT NULL DEFAULT 0,
  status            TEXT    NOT NULL DEFAULT 'WAITING'
                    CHECK (status IN ('WAITING', 'CALLED', 'IN_CONSULTATION', 'COMPLETED', 'CANCELLED', 'NO_SHOW')),
  arrived_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  called_at         TEXT,
  started_at        TEXT,
  completed_at      TEXT,
  position_snapshot INTEGER,
  created_at        TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- APPOINTMENTS
-- ---------------------------------------------------------------------------
CREATE TABLE appointments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id    INTEGER NOT NULL REFERENCES patients(id),
  doctor_id     INTEGER REFERENCES doctors(id),
  hospital_id   INTEGER NOT NULL REFERENCES hospitals(id),
  department_id INTEGER NOT NULL REFERENCES departments(id),
  scheduled_for TEXT    NOT NULL,
  status        TEXT    NOT NULL DEFAULT 'SCHEDULED',
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- NOTIFICATIONS
-- ---------------------------------------------------------------------------
CREATE TABLE notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  type       TEXT    NOT NULL,
  message    TEXT    NOT NULL,
  read_at    TEXT,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- AUDIT_LOGS
--   meta is JSON stored as TEXT.
-- ---------------------------------------------------------------------------
CREATE TABLE audit_logs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id INTEGER REFERENCES users(id),
  action        TEXT    NOT NULL,
  entity_type   TEXT    NOT NULL,
  entity_id     TEXT,
  meta          TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- INDEXES
--   Covered automatically by UNIQUE constraints (indexed by SQLite):
--     users(phone)                -> UNIQUE on users.phone
--     hospitals(slug)             -> UNIQUE on hospitals.slug
--     departments(hospital_id,name)-> UNIQUE on departments(hospital_id, name)
--     symptoms(code)              -> UNIQUE on symptoms.code
--     tokens(token_no)            -> UNIQUE on tokens.token_no
--   The indexes below support the query patterns already defined in the
--   Phase 1 design. No speculative indexes are added.
-- ---------------------------------------------------------------------------
CREATE INDEX idx_triage_patient_created_at
  ON triage_assessments (patient_id, created_at);

CREATE INDEX idx_tokens_hospital_department_issue
  ON tokens (hospital_id, department_id, issue_date);

CREATE INDEX idx_queue_hospital_department_status_priority
  ON queue_entries (hospital_id, department_id, status, priority, arrived_at);

CREATE INDEX idx_queue_status
  ON queue_entries (status);

CREATE INDEX idx_queue_doctor_status
  ON queue_entries (doctor_id, status);

CREATE INDEX idx_appointments_patient_scheduled
  ON appointments (patient_id, scheduled_for);

CREATE INDEX idx_notifications_user_read
  ON notifications (user_id, read_at);

CREATE INDEX idx_audit_entity
  ON audit_logs (entity_type, entity_id);
