-- 0015 (2026-08-24, codex round 8): created_at-leading index so retention pruning is indexed, never a full scan.
CREATE INDEX IF NOT EXISTS idx_pop_audit_created ON pop_audit(created_at);
