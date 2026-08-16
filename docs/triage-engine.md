# Triage Engine Documentation

## 1. Purpose

The triage engine is a deterministic demonstration decision-support system that assists with clinical queue prioritization. It receives symptom inputs and returns severity, priority, and care level recommendations.

**This system does not diagnose medical conditions.** It is a demonstration prototype for decision-support purposes only.

The scoring rules are demonstration rules and are not clinically validated. This system must never be treated as a substitute for professional medical care.

## 2. Architecture

```
HTTP Request
    ↓
Express Controller (triage.controller.js)
    ↓
Zod Validation (triage.schema.js)
    ↓
Pure Triage Engine (triage.service.js) - deterministic scoring
    ↓
Database Repository (triage.repository.js) - persistence
    ↓
SQLite (better-sqlite3)
    ↓
Response
```

The core `assessTriage()` function is a pure function that:

- Receives input and symptom catalog as parameters
- Returns deterministic results based on identical inputs
- Has NO side effects (no database access, no HTTP, no randomness)
- Is fully unit-testable in isolation

## 3. Safety Disclaimer

Every triage result MUST include this disclaimer (or equivalent):

> "This is a demonstration triage system and is not a medical diagnosis. It does not replace professional medical care."

For emergency results, additionally include:

> "Seek immediate emergency medical care."

## 4. Non-Goals

- No clinical validation or medical accuracy claimed
- No AI/ML model usage
- No external LLM/API integration
- No medical diagnosis, treatment, or prescriptions
- No doctor replacement
- No guaranteed outcomes
- No WebSockets, real-time features
- No token generation or queue management (Phase 5 only)
- No frontend integration (frontend untouched)

## 5. Input Schema

```json
{
  "symptoms": ["fever"],
  "description": "Mild fever",
  "age": 21,
  "gender": "optional"
}
```

### Fields

| Field         | Type             | Validation                                          |
| ------------- | ---------------- | --------------------------------------------------- |
| `symptoms`    | array of strings | required, min 1, must be known codes, no duplicates |
| `description` | string           | optional, max 500 chars                             |
| `age`         | integer          | optional, min 0, max 120                            |
| `gender`      | string           | optional, follows project conventions               |

### Error: VALIDATION_ERROR (HTTP 400)

Invalid input format, missing required fields, out-of-range values.

### Error: UNKNOWN_SYMPTOM (HTTP 422)

One or more symptom codes are not in the known catalog.

## 6. Symptom Catalog

The engine uses 16 symptoms from the database seed. Each symptom has a `base_score` and `red_flag` indicator:

| Code     | Name           | base_score | red_flag | care_level_hint |
| -------- | -------------- | ---------- | -------- | --------------- |
| fever    | High Fever     | 20         | 0        | primary         |
| cough    | Cough/Cold     | 10         | 0        | primary         |
| chest    | Chest Pain     | 70         | 1        | emergency       |
| injury   | Injury         | 45         | 0        | secondary       |
| back     | Back Pain      | 25         | 0        | secondary       |
| dental   | Toothache      | 20         | 0        | secondary       |
| throat   | Sore Throat    | 10         | 0        | primary         |
| ear      | Ear Pain       | 20         | 0        | secondary       |
| diarrhea | Loose Motion   | 30         | 0        | primary         |
| fatigue  | Weakness       | 25         | 0        | primary         |
| vomit    | Vomiting       | 35         | 0        | secondary       |
| burn     | Burn           | 60         | 1        | emergency       |
| bite     | Animal Bite    | 55         | 1        | emergency       |
| acidity  | Acidity/Gas    | 15         | 0        | primary         |
| urine    | Urinary Issue  | 35         | 0        | secondary       |
| stress   | Anxiety/Stress | 20         | 0        | secondary       |

**Codes not in this list are considered unknown and must be rejected.**

## 7. Base Scores

Base scores are the values from the seeded `symptoms` table. The total score is the sum of selected symptom base scores.

```
total = sum(selected symptom base scores)
```

These values are demonstration-only and not clinically validated.

## 8. Scoring Formula

### 8.1 Red-Flag Rule (Priority)

If any selected symptom has `red_flag = 1` in the database (codes: `chest`, `burn`, `bite`):

- `isEmergency = true`
- `severity = EMERGENCY`
- `priority = 0`
- `careLevel = EMERGENCY`

Red flags override all normal scoring. No age modifiers are applied when an emergency is classified.

### 8.2 Normal Scoring (No Red Flags)

```
total = sum of selected symptom base scores
```

Then apply age modifiers (deterministic, after red-flag check):

- `age <= 3`: +10 score, modifier reason: "age_under_3"
- `age >= 65`: +10 score, modifier reason: "age_over_65"

Both modifiers can apply simultaneously if age is both <= 3 and >= 65 (impossible, but logic handles it).

### 8.3 Severity Thresholds (Non-Emergency)

After calculating the adjusted total score:

| Score Range | Severity  | Priority | Care Level |
| ----------- | --------- | -------- | ---------- |
| >= 80       | EMERGENCY | 0        | EMERGENCY  |
| >= 50       | URGENT    | 1        | TERTIARY   |
| >= 25       | MODERATE  | 2        | PHC        |
| < 25        | MILD      | 3        | PHC        |

### 8.4 Emergency from Description Keywords

Free-text description can also trigger emergency classification via case-insensitive keyword matching:

- `breathing difficulty`
- `difficulty breathing`
- `shortness of breath`
- `fainting`
- `unconscious`
- `severe bleeding`

Matching is case-insensitive and deterministic. If a keyword is found and the symptom red flags don't already classify as emergency, the result is upgraded to emergency.

## 9. Age Modifiers

Deterministic demonstration rules applied after red-flag check:

| Age Condition | Score Increase | Reason      |
| ------------- | -------------- | ----------- |
| age <= 3      | +10            | age_under_3 |
| age >= 65     | +10            | age_over_65 |

**Important:**

- Age modifiers are additive (both can apply if conditions met, though mutually exclusive in practice)
- Emergency classification always takes precedence over age modifiers
- Age must never convert an emergency into a non-emergency
- Age 0 is valid and receives the under-3 modifier
- Age 121+ is rejected at validation stage

## 10. Priority Mapping

| Severity  | Priority Number | Meaning          |
| --------- | --------------- | ---------------- |
| EMERGENCY | 0               | Highest urgency  |
| URGENT    | 1               | High urgency     |
| MODERATE  | 2               | Moderate urgency |
| MILD      | 3               | Lowest urgency   |

Lower number = higher urgency. This priority is consumed by the queue engine in later phases.

## 11. Care-Level Mapping

| Severity  | Care Level | Description              |
| --------- | ---------- | ------------------------ |
| EMERGENCY | EMERGENCY  | Immediate emergency care |
| URGENT    | TERTIARY   | Tertiary hospital care   |
| MODERATE  | PHC        | Primary health centre    |
| MILD      | PHC        | Primary health centre    |

**Note:** This is a demonstration recommendation only. Do not recommend a specific hospital as medically appropriate.

## 12. Score Breakdown Structure

Every result includes a breakdown explaining the scoring:

```json
{
  "symptoms": [{ "code": "fever", "baseScore": 20 }],
  "modifiers": [{ "reason": "age_under_3", "score": 10 }],
  "redFlags": [],
  "total": 30
}
```

The breakdown must include:

- Selected symptoms with individual base scores
- Applied modifiers (age, etc.)
- Detected red flags
- Total score (after modifiers)
- Final classification

## 13. Emergency Behavior

When `isEmergency = true`:

- `severity = "EMERGENCY"`
- `priority = 0`
- `careLevel = "EMERGENCY"`
- **Do NOT** generate an OPD token (token generation is outside Phase 5)
- Response must include: "Seek immediate emergency medical care."
- Emergency classification cannot be overridden by age modifiers

## 14. API Endpoints

### 14.1 POST /api/v1/triage/assess

**Authentication:** Bearer JWT, patient role

**Request:**

```json
{
  "symptoms": ["fever"],
  "description": "Mild fever",
  "age": 21
}
```

**Successful Response:**

```json
{
  "data": {
    "assessment": {
      "id": "...",
      "severity": "MILD",
      "priority": 3,
      "score": 2,
      "breakdown": {
        "symptoms": [{ "code": "fever", "baseScore": 20 }],
        "modifiers": [],
        "redFlags": [],
        "total": 20
      },
      "isEmergency": false,
      "careLevel": "PHC",
      "disclaimer": "This is a demonstration triage system and is not a medical diagnosis. It does not replace professional medical care."
    }
  }
}
```

**Error Responses:**

- 400 VALIDATION_ERROR - invalid input
- 422 UNKNOWN_SYMPTOM - unknown symptom code
- 401 UNAUTHORIZED - missing/invalid token
- 403 FORBIDDEN - wrong role

### 14.2 GET /api/v1/triage/assessments/me

**Authentication:** Bearer JWT, patient role

**Response:**

```json
{
  "data": {
    "assessments": [
      { id, severity, priority, score, isEmergency, careLevel, createdAt },
      ... (newest first)
    ]
  }
}
```

Only assessments belonging to the authenticated patient are returned. Patient ID from query params, URL params, or request body is rejected.

## 15. Authentication

- **POST /api/v1/triage/assess**: Requires Bearer JWT with role = `patient`
- **GET /api/v1/triage/assessments/me**: Requires Bearer JWT with role = `patient`
- **Doctor role**: 403 Forbidden
- **Staff role**: 403 Forbidden
- **Admin role**: 403 Forbidden

Patient ID is derived from the authenticated user's database record (patients table). The system must never accept patientId from the request body.

## 16. Database Persistence

Every successful triage assessment is persisted to the `triage_assessments` table:

| Column          | Type    | Description                                |
| --------------- | ------- | ------------------------------------------ |
| id              | UUID    | Primary key                                |
| patient_id      | INTEGER | FK → patients.id (from authenticated user) |
| symptom_codes   | TEXT    | JSON array of symptom codes                |
| description     | TEXT    | Free-text description                      |
| severity        | TEXT    | EMERGENCY/URGENT/MODERATE/MILD             |
| priority        | INTEGER | 0/1/2/3                                    |
| score           | INTEGER | Numeric score (after modifiers)            |
| score_breakdown | TEXT    | JSON breakdown object                      |
| is_emergency    | INTEGER | 0 or 1                                     |
| created_at      | TEXT    | ISO timestamp                              |

**Architecture:**

- HTTP → Controller → Validation → Triage Service → (load symptom catalog) → Pure scoring engine → Repository persistence
- Database persistence is OUTSIDE the pure scoring function

## 17. Audit Logging

Each triage assessment creation logs an entry in `audit_logs`:

- `entity_type`: `triage_assessment`
- `entity_id`: assessment ID
- `action`: `TRIAGE_ASSESSMENT_CREATED`
- `meta`: minimal metadata (assessment ID, symptom codes, severity, priority, isEmergency)
- Passwords, JWT tokens, and full free-text descriptions are NOT logged

## 18. Testing

### 18.1 Unit Tests (Pure Engine)

Test the `assessTriage()` function with dependency-injected catalog:

- **BASIC**: one symptom, multiple symptoms, empty symptoms, unknown symptom
- **EMERGENCY**: chest pain, burn, animal bite, breathing difficulty, difficulty breathing, shortness of breath, fainting, unconscious, severe bleeding
- **CASE HANDLING**: uppercase, lowercase, mixed case emergency text; irrelevant description
- **AGE**: age 0, 3, 4, 64, 65, 120; age 121 rejected; negative age rejected
- **DETERMINISM**: identical input produces identical result across runs
- **PRIORITY**: EMERGENCY=0, URGENT=1, MODERATE=2, MILD=3
- **BREAKDOWN**: symptom contribution, modifiers, red flags, total score
- **SAFETY**: every result contains disclaimer

### 18.2 API Tests

- POST /api/v1/triage/assess success (authenticated patient)
- POST /api/v1/triage/assess failures (unauthenticated → 401, doctor → 403, etc.)
- Unknown symptom → 422
- Missing symptoms → 400
- Description > 500 → 400
- Invalid age → 400
- Missing patient profile → error

### 18.3 Ownership Tests

- Patient A creates assessments, only sees own history
- Patient B creates assessments, only sees own history
- Patient A must NEVER access Patient B's triage history

### 18.4 Database Tests

- Assessment persisted with correct patient_id
- symptom_codes persisted correctly
- score_breakdown persisted correctly
- severity persisted correctly
- priority persisted correctly
- emergency flag persisted correctly
- Audit log created
- All existing Phase 3 tests must continue passing

## 19. Limitations

- Scoring rules are demonstration-only, not clinically validated
- No medical diagnosis or treatment provided
- Red-flag detection is limited to coded symptoms and keyword matching
- Age modifiers are arbitrary demonstration values
- Keyword-based emergency detection is not exhaustive (not NLP)
- System does not guarantee outcomes or replace professional care
- No integration with real hospital systems or emergency services

## 20. Future Improvements

- Evidence-based weight adjustments
- More sophisticated red-flag detection
- Multilingual symptom support
- Enhanced audit logging
- Integration with queue/token system (Phase 6+)
- Extended age-based risk modeling
- Additional care level recommendations

---

**Document generated for CareQueue Phase 5 Triage Engine implementation.**
