-- CareQueue patient module (Phase 6).
--
-- Extends the patients table with an updated_at column and enforces phone
-- uniqueness. Existing rows are backfilled from created_at so no data is lost.

ALTER TABLE patients ADD COLUMN updated_at TEXT;

UPDATE patients SET updated_at = created_at WHERE updated_at IS NULL;

-- A patient phone must be unique (mirrors users.phone). The register flow
-- creates one patient per user using the user's unique phone, so this index
-- holds for all profiles created through normal account registration.
CREATE UNIQUE INDEX idx_patients_phone ON patients(phone);
