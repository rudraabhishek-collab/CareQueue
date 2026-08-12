# CareQueue — Authentication

> Status: **Phase 4**. MVP authentication is implemented: phone + password
> registration/login, JWT sessions, and role-based authorization. This is an
> MVP system only.
>
> **REAL OTP IS NOT IMPLEMENTED.** **ABHA AUTHENTICATION IS NOT
> IMPLEMENTED.** SMS/OTP and ABHA flows are planned for later phases.

## 1. Overview

Authentication is phone + password using **bcrypt** password hashing and
signed **JWT** access tokens. Roles are `patient`, `doctor`, `staff`,
`admin`. Authorization is enforced by reusable Express middleware that
always reads the user's role from the **database** (the JWT role claim is
never trusted as the source of truth).

```text
client ──POST /api/v1/auth/register──► register service
client ──POST /api/v1/auth/login──────► login service (rate-limited)
client ──GET  /api/v1/auth/me ──Bearer──► requireAuth → user row
protected routes ──requireAuth + requireRole('doctor', ...)──►
```

## 2. Registration flow

`POST /api/v1/auth/register`

```json
{ "name": "Demo Patient", "phone": "9999999999", "password": "StrongPassword123" }
```

- Validated with Zod (strict schema — **unknown fields are rejected**, so a
  client cannot smuggle in a `role`).
- Phone is normalized (see §7) and uniqueness-checked.
- Password hashed with bcrypt (cost 12).
- `users` row (role always `patient`) + `patients` row are created in
  **one SQLite transaction**; a failure anywhere rolls everything back.
- `AUTH_REGISTER` is written to `audit_logs`.
- Returns `{ user, token }` with HTTP 201. `password_hash` is never
  returned.

## 3. Login flow

`POST /api/v1/auth/login`

```json
{ "phone": "9999999999", "password": "StrongPassword123" }
```

- Validated, phone normalized, then checked against the login failure
  limiter (see §9).
- Unknown phone and wrong password both produce the same generic
  `401 INVALID_CREDENTIALS` — the response never reveals which. A dummy
  bcrypt compare equalizes timing for unknown phones.
- Success clears the failure counter, writes `AUTH_LOGIN_SUCCESS`, returns
  `{ user, token }`.
- Failures write `AUTH_LOGIN_FAILURE` with `{ reason: "invalid_credentials" }`
  (never the password).

## 4. Current user

`GET /api/v1/auth/me` — requires `Authorization: Bearer <JWT>`.

For a patient, the response includes the linked patient profile:

```json
{
  "data": {
    "user": { "id": 1, "name": "...", "phone": "+919999999999", "role": "patient" },
    "patient": {
      "id": 1,
      "name": "...",
      "age": null,
      "gender": null,
      "phone": "+919999999999",
      "abha_id": null
    }
  }
}
```

Other roles return only the `user` identity object.

## 5. JWT structure

Tokens are issued with **only the minimum claims**:

```
Header: { "alg": "HS256", "typ": "JWT" }
Payload: { "sub": "<user-id>", "role": "patient", "iat": ..., "exp": ... }
```

- `sub` = user id, `role` = role, plus standard `iat`/`exp`.
- **Never** in the JWT: password, symptoms, medical information, ABHA
  number, patient profile, tokens, queue information.
- Expiration: `JWT_EXPIRES_IN` (default `2h`).
- Secret: `JWT_SECRET` from environment — **required**; the server refuses
  to start without it and there is **no production fallback secret**.

`requireAuth` verifies signature + expiry, checks `sub`/`role` claims,
loads the user from the database (missing/deleted user → 401), and attaches
`req.user` derived from the **database row**. All failures return the same
generic `401 UNAUTHORIZED`; no verification internals are exposed.

## 6. Role model & authorization

| Role      | Demo account | Can access                                                |
| --------- | ------------ | --------------------------------------------------------- |
| `patient` | Demo Patient | own `/auth/me` (+ future own profile/triage/tokens/queue) |
| `doctor`  | Demo Doctor  | `/auth/me` (+ future assigned department queue)           |
| `staff`   | Demo Staff   | `/auth/me` (+ future hospital queue management)           |
| `admin`   | Demo Admin   | `/auth/me` (+ future system data management)              |

Middleware (all paths `backend/middleware/auth.js`):

- `requireAuth` — verifies the bearer token and loads the user.
- `requireRole(...roles)` — after `requireAuth`, e.g.
  `requireRole('doctor', 'staff')`. Denies with `403 FORBIDDEN`.

No doctor/staff/admin business endpoints exist yet — this phase establishes
the infrastructure. Dev-only endpoints (`/api/v1/_dev/roles/*`) exercise the
middleware and are mounted only when `NODE_ENV !== 'production'`.

## 7. Phone normalization

`backend/utils/phone.js` canonicalizes inputs to `+91` + 10-digit national
number. Accepted: `9999999999`, `+919999999999`, `919999999999`,
`09999999999`, and formats with spaces/dashes/dots. The canonical form is
stored, so equivalent spellings of the same number can never create
separate accounts. Invalid formats → `400 VALIDATION_ERROR`.

## 8. Demo credentials

Created by `npm run db:seed:auth` — **development only**. The seed refuses
to run when `NODE_ENV=production` and fails with a clear message if any
`DEMO_*_PASSWORD` env var is missing or shorter than 8 characters.

| Role    | Phone           | Password env var        |
| ------- | --------------- | ----------------------- |
| patient | `+919000000001` | `DEMO_PATIENT_PASSWORD` |
| doctor  | `+919000000002` | `DEMO_DOCTOR_PASSWORD`  |
| staff   | `+919000000003` | `DEMO_STAFF_PASSWORD`   |
| admin   | `+919000000004` | `DEMO_ADMIN_PASSWORD`   |

The demo doctor is linked to the seeded General Medicine department of
AIIMS New Delhi with registration id `DEMO-DOC-001` (clearly fictional).
Passwords come from `.env` (gitignored); placeholders live in
`.env.example`.

## 9. Rate limiting (MVP)

In-memory login-failure limiter (`backend/utils/login-limiter.js`): 5
failures per phone per 15-minute window, with a 60s cooldown between
retries once hit; successful login clears the counter. Returns
`429 TOO_MANY_ATTEMPTS`. This is **single-process, not distributed, not
IP-aware** — adequate MVP brute-force protection only. Production needs a
shared store (e.g. Redis).

## 10. Security decisions & limitations

- Passwords bcrypt-hashed (cost 12); never stored/logged/returned; never in
  audit metadata.
- JWT minimal claims; authorization role sourced from the database.
- Generic `INVALID_CREDENTIALS` / `UNAUTHORIZED` errors; no stack traces in
  responses; DB errors never leak.
- Rate limiting is MVP-only (see §9).
- No refresh tokens, no revocation, no password reset — JWT is valid until
  expiry (2h default).
- OTP and ABHA authentication are **not** implemented.
- Production deployment needs a properly generated secret, shared rate
  limiting, and secure cookie/transport hardening.

## 11. API reference

| Method | Path                       | Auth   | Success                            | Errors                                                                     |
| ------ | -------------------------- | ------ | ---------------------------------- | -------------------------------------------------------------------------- |
| POST   | `/api/v1/auth/register`    | none   | `201 { data: { user, token } }`    | `400 VALIDATION_ERROR`, `409 USER_EXISTS`                                  |
| POST   | `/api/v1/auth/login`       | none   | `200 { data: { user, token } }`    | `400 VALIDATION_ERROR`, `401 INVALID_CREDENTIALS`, `429 TOO_MANY_ATTEMPTS` |
| GET    | `/api/v1/auth/me`          | Bearer | `200 { data: { user, patient? } }` | `401 UNAUTHORIZED`                                                         |
| GET    | `/api/v1/_dev/roles/:role` | Bearer | `200`                              | `401`, `403 FORBIDDEN` (dev only)                                          |
