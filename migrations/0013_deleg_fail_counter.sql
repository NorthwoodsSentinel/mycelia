-- 0013 (2026-08-24, codex round 6 LOW): atomic per-root-per-hour counter for UNPROVEN delegated failures; bounded (one row/hour), never promotion evidence.
CREATE TABLE IF NOT EXISTS deleg_fail (k TEXT PRIMARY KEY, agent_id TEXT NOT NULL, hour TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS idx_deleg_fail_hour ON deleg_fail(hour);
