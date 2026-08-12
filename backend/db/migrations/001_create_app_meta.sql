-- Baseline infrastructure table.
-- Business schema (users, patients, tokens, queue, etc.) arrives in a later phase.
CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
