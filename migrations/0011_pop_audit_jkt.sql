-- 0011_pop_audit_jkt.sql (2026-08-24, codex re-audit H2/H3)
ALTER TABLE pop_audit ADD COLUMN jkt TEXT;   -- the key a 'proven' row was proven under; promotion counts only rows matching the CURRENT pop_jkt
CREATE TRIGGER IF NOT EXISTS trg_agents_pop_pair_ins BEFORE INSERT ON agents
  WHEN (NEW.pop_jkt IS NULL) != (NEW.pop_jwk IS NULL) OR NEW.pop_jkt = '' OR NEW.pop_jwk = '' BEGIN SELECT RAISE(ABORT, 'pop_jkt and pop_jwk must be set together and non-empty'); END;
CREATE TRIGGER IF NOT EXISTS trg_agents_pop_empty_upd BEFORE UPDATE ON agents
  WHEN NEW.pop_jkt = '' OR NEW.pop_jwk = '' BEGIN SELECT RAISE(ABORT, 'pop key fields may not be empty strings'); END;
CREATE TRIGGER IF NOT EXISTS trg_agents_pop_mode_unbound_upd BEFORE UPDATE ON agents
  WHEN NEW.pop_jkt IS NULL AND NEW.pop_mode != 'ambient' BEGIN SELECT RAISE(ABORT, 'an unbound agent must be ambient'); END;
