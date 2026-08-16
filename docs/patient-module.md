# Patient Module Documentation

## 1. Purpose

The patient module manages a patient's profile on the CareQueue platform. It
provides read and update access to the authenticated patient's own profile,
a create endpoint for users who lack a profile, and a compact list of the
patient's most recent triage assessments.

**Scope:** profile management only. No real medical records, ABHA integration,
or appointment history are implemented (see §10 Limitations).

## 2. Architecture

```
HTTP Request
    ↓
Express Router (patient.routes.js) - requireAuth + requireRole('patient')
    ↓
Express Controller (patient.controller.js) - schema.parse + response shaping
    ↓
Patient Service (patient.service.js) - business rules + audit logging
    ↓
Patient Repository (patient.repository.js) - parameterized SQLite access
    ↓
SQLite (better-sqlite3)
```

Ownership is always derived from the authenticated user (`req.user.id`).
A client can never address another patient by id, because no endpoint accepts
a patient id from the request body or query.

## 3. Endpoints

Base URL: `/api/v1/patients`

| Method | Path           | Auth            | Description                                          |
| ------ | -------------- | --------------- | ---------------------------------------------------- |
| GET    | `/patients/me` | Bearer, patient | Return the caller's profile + recent triage.         |
| POST   | `/patients`    | Bearer, patient | Create a profile for the caller (409 if one exists). |
| PATCH  | `/patients/me` | Bearer, patient | Partially update the caller's profile.               |

All responses use the standard envelope:

- Success: `{ "data": { ... } }`
- Error: `{ "error": { "code": "...", "message": "...", "details": [] } }`

### 3.1 GET /patients/me

Returns the caller's profile plus the five most recent triage assessments
(newest first). If the user has no profile a `404 PATIENT_NOT_FOUND` is
returned. Registered accounts always have a profile (created at sign-up).

```json
{
  "data": {
    "patient": {
      "id": 1,
      "userId": 1,
      "name": "Demo Patient",
      "age": null,
      "gender": null,
      "phone": "+919000000001",
      "abhaId": null,
      "createdAt": "2026-08-12 06:30:17",
      "updatedAt": "2026-08-12 06:30:17"
    },
    "recentTriage": [
      {
        "id": 3,
        "severity": "MILD",
        "priority": 3,
        "score": 20,
        "isEmergency": false,
        "careLevel": "PHC",
        "createdAt": "2026-08-16 10:00:00.000Z"
      }
    ]
  }
}
```

`recentTriage` deliberately exposes only the fields above. `description` and
`score_breakdown` are never included.

### 3.2 POST /patients

Creates a profile for the authenticated user. `phone` is optional; when
omitted the account's phone (from `users.phone`) is used. The stored phone is
always the normalized form.

```json
{
  "data": {
    "patient": {
      "id": 2,
      "userId": 2,
      "name": "New Patient",
      "age": 30,
      "gender": "female",
      "phone": "+919999999999",
      "abhaId": null,
      "createdAt": "2026-08-16 10:00:00",
      "updatedAt": "2026-08-16 10:00:00"
    }
  }
}
```

Returns `201 Created`. Because sign-up already creates a profile, this
endpoint returns `409 PATIENT_EXISTS` for normal registered users; it exists
so that users created through other flows can still get a profile.

### 3.3 PATCH /patients/me

Partially updates the caller's profile. Only the provided fields are changed;
`updatedAt` is bumped automatically. At least one field is required.

```json
{
  "data": {
    "patient": {
      "id": 1,
      "userId": 1,
      "name": "Updated Name",
      "age": 45,
      "gender": "male",
      "phone": "+919000000001",
      "abhaId": null,
      "createdAt": "2026-08-12 06:30:17",
      "updatedAt": "2026-08-16 10:05:00"
    }
  }
}
```

## 4. Request Validation

All schemas use Zod `.strict()`: unknown fields are rejected with
`400 VALIDATION_ERROR`, so a client can never smuggle in `role`, `id`,
`userId`, `passwordHash`, `abhaId`, `createdAt`, or `updatedAt`.

| Field    | Rules                                                                                                                                   |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `name`   | Required for create; trimmed, 2–100 characters.                                                                                         |
| `age`    | Optional; integer 0–120 (matches the DB CHECK constraint).                                                                              |
| `gender` | Optional; trimmed short string, 1–20 characters (no project-defined enum exists).                                                       |
| `phone`  | Optional; validated as an Indian mobile number via the shared `normalizePhone` util (same rules as auth). Stored normalized (`+91...`). |

## 5. Authorization

- Every route requires a valid `Bearer` JWT (`requireAuth`).
- Every route requires the `patient` role (`requireRole('patient')`).
- The role used for authorization always comes from the **database row**, not
  the token claim. A forged `role: "patient"` claim on a doctor's token still
  returns `403 FORBIDDEN`.
- Non-patient roles (`doctor`, `staff`, `admin`) receive `403 FORBIDDEN`.
- Missing/invalid/expired tokens receive the generic `401 UNAUTHORIZED`.

## 6. Ownership and Isolation

- The patient id is always resolved from `req.user.id` → `patients.user_id`.
- `users 1 -> 0..1 patients` (UNIQUE on `patients.user_id`).
- `recentTriage` is filtered by the caller's own `patients.id`, so one patient
  can never observe another patient's triage history.
- No endpoint accepts a patient id from the client.

## 7. Error Codes

| Status | Code                | Condition                                                                      |
| ------ | ------------------- | ------------------------------------------------------------------------------ |
| 400    | `VALIDATION_ERROR`  | Malformed payload, invalid age/gender/phone, unknown fields, empty PATCH body. |
| 401    | `UNAUTHORIZED`      | Missing, invalid, or expired token.                                            |
| 403    | `FORBIDDEN`         | Authenticated user is not a patient.                                           |
| 404    | `PATIENT_NOT_FOUND` | User has no patient profile.                                                   |
| 409    | `PATIENT_EXISTS`    | POST when a profile already exists.                                            |
| 409    | `PHONE_IN_USE`      | Create/update collides with another patient's phone.                           |

## 8. Database Changes (migration 004)

`backend/db/migrations/004_patient_module.sql`:

1. `ALTER TABLE patients ADD COLUMN updated_at TEXT` — every API patient
   response includes `updatedAt`.
2. Backfills `updated_at = created_at` for existing rows (no data loss).
3. `CREATE UNIQUE INDEX idx_patients_phone ON patients(phone)` — enforces
   unique patient phones. This is safe because sign-up creates one patient
   per user using the user's unique phone, and seed data uses distinct
   numbers.

## 9. Audit Events

Written via the shared `recordAudit` helper into `audit_logs`:

| Action            | entityType | Notes                                    |
| ----------------- | ---------- | ---------------------------------------- |
| `PATIENT_CREATED` | patient    | `meta` carries the created patient name. |
| `PATIENT_UPDATED` | patient    | `meta.changed` lists the updated fields. |

Passwords, JWTs, and full payloads are never written to the audit log.

## 10. Limitations

- Demo prototype: profile data is not linked to any real medical records.
- `abha_id` is stored but never populated or verified.
- No appointment or notification history is exposed through this module.
- `gender` is stored as a free-form short string (no controlled enum yet).
- Duplicate-phone protection relies on the new unique index in migration 004;
  existing deployments must run `npm run db:migrate`.
