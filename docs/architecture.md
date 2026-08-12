# CareQueue — Architecture

> Status: **Phase 2**. This document describes the foundation in place now.
> Triage, queue, authentication and dashboard services are designed here but
> not yet implemented — they are marked `(future)`.

## 1. Overview

CareQueue is a modular monolith: a single Node.js process serves both the
static frontend and the REST API, backed by one SQLite database. A monolith
is chosen deliberately — no microservices, message brokers, or Redis are
needed for the MVP.

```text
Browser (careQueue.html)
   │  fetch()  →  /api/v1/...
   ▼
Express app
   ├─ request logging (request ID, method, path, status, duration)
   ├─ CORS + JSON body parsing
   ├─ /api/v1 router
   │     ├─ controllers  (HTTP concerns only)
   │     ├─ services     (business logic — future)
   │     └─ schemas      (Zod validation — future)
   ├─ static frontend serving (/, /styles.css, /app.js)
   └─ centralized error handler
   ▼
Service layer (future): auth, triage, queue, token, hospital, notification
   ▼
SQLite (better-sqlite3)
   ├─ migrations (versioned SQL files, applied in order)
   └─ seeds (future)
```

## 2. Layering rules

- **Frontend** (`frontend/`) renders UI, collects input, calls the API,
  shows loading/error states. It performs **no business calculations**
  (no triage scoring, no token math, no queue position math).
- **Controllers** parse requests, validate via schemas, call services, and
  return responses. No business logic.
- **Services** (future) contain pure, testable business rules (triage
  scoring, queue ordering, token issuance). No HTTP or DB coupling where
  possible.
- **Database layer** (`backend/db/database.js`) owns the connection,
  migrations, and (future) queries. Isolated from HTTP routes; callers
  receive the connection via dependency injection.

## 3. Request flow

1. `requestLogger` assigns `req.id` (or honors `X-Request-Id`) and logs
   method/path/status/duration on response finish.
2. `cors()` + `express.json()` parse the request.
3. The `/api/v1` router dispatches to controllers.
4. Unmatched `/api/*` and all other unmatched routes hit the 404 handler.
5. Any thrown error is normalized by the centralized error handler.

### Error envelope

```jsonc
{ "error": { "code": "NOT_FOUND", "message": "Route not found: GET /api/v1/x", "details": [] } }
```

- Zod validation errors → `400 VALIDATION_ERROR` with `details` per field.
- Malformed JSON → `400 INVALID_JSON`.
- `HttpError` (future) carries an explicit status/code.
- Unhandled errors → `500 INTERNAL_ERROR`; details and stack traces are
  never exposed to clients.

### Success envelope

```jsonc
{ "data": {} }
```

`GET /api/v1/health` is the documented exception and returns
`{ "status": "ok", "service": "carequeue-api" }` verbatim.

## 4. Configuration

`backend/config/env.js` loads `.env` (if present), validates required
variables, and freezes the config. `JWT_SECRET` is required at startup; the
server exits with a clear message if it is missing.

## 5. Database

- `openDatabase({ databasePath })` creates parent directories, opens the
  file (or `:memory:`), and enables WAL + foreign keys.
- `runMigrations(db, { migrationsDir })` applies `*.sql` files in filename
  order, each inside a transaction, recording applied files in a
  `schema_migrations` table (idempotent).
- The baseline migration `001_create_app_meta.sql` currently creates only
  the infra `app_meta` table. Business schema arrives in a later phase.

## 6. Static frontend serving

`createApp()` serves `frontend/` via `express.static` and maps `GET /` to
`careQueue.html`. No separate frontend dev server.

## 7. Logging

pino JSON logs with `reqId`, `method`, `path`, `status`, `durationMs`.
Request bodies are never logged to avoid capturing passwords, OTPs, or
sensitive patient data.

## 8. Testing

`npm test` runs `node --test` across `tests/`. The shared helper
`tests/helpers/context.js` builds an app with an in-memory SQLite database,
so API tests are hermetic and fast.

## 9. Non-goals (MVP)

- No microservices, Redis, Kafka, WebSockets, or Docker (for MVP).
- No real ABHA or hospital integrations (planned as future phases).
- No React/Vue/build step on the frontend.
