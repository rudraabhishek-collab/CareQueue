-- One doctor profile per user.
--
-- The Phase 3 schema defined doctors.user_id -> users(id) but did not
-- enforce that a user has at most one doctor profile. This migration adds
-- a UNIQUE index so the doctor/user relationship is 1-to-1 and the
-- idempotent auth seed cannot create duplicate doctor rows.
CREATE UNIQUE INDEX IF NOT EXISTS idx_doctors_user_id_unique
  ON doctors (user_id);
