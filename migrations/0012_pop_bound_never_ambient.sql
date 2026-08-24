-- 0012 (2026-08-24, codex round 3 H2): INSERT-time guard for unbound+non-ambient, and a bound key may never be ambient.
CREATE TRIGGER IF NOT EXISTS trg_agents_pop_mode_unbound_ins BEFORE INSERT ON agents
  WHEN NEW.pop_jkt IS NULL AND NEW.pop_mode != 'ambient' BEGIN SELECT RAISE(ABORT, 'an unbound agent must be ambient'); END;
CREATE TRIGGER IF NOT EXISTS trg_agents_pop_bound_ambient_ins BEFORE INSERT ON agents
  WHEN NEW.pop_jkt IS NOT NULL AND NEW.pop_mode = 'ambient' BEGIN SELECT RAISE(ABORT, 'a bound agent is never ambient'); END;
CREATE TRIGGER IF NOT EXISTS trg_agents_pop_bound_ambient_upd BEFORE UPDATE ON agents
  WHEN NEW.pop_jkt IS NOT NULL AND NEW.pop_mode = 'ambient' BEGIN SELECT RAISE(ABORT, 'a bound agent is never ambient'); END;
