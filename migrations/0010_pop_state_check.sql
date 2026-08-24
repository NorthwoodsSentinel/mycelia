-- 0010_pop_state_check.sql (2026-08-24, codex audit H2): pop_mode is a closed set at the schema layer.
-- SQLite cannot ADD a CHECK to an existing column; enforce via a trigger pair instead.
CREATE TRIGGER IF NOT EXISTS trg_agents_pop_mode_ins BEFORE INSERT ON agents
  WHEN NEW.pop_mode NOT IN ('ambient','shadow','enforce') BEGIN SELECT RAISE(ABORT, 'pop_mode must be ambient|shadow|enforce'); END;
CREATE TRIGGER IF NOT EXISTS trg_agents_pop_mode_upd BEFORE UPDATE OF pop_mode ON agents
  WHEN NEW.pop_mode NOT IN ('ambient','shadow','enforce') BEGIN SELECT RAISE(ABORT, 'pop_mode must be ambient|shadow|enforce'); END;
-- A binding is all-or-nothing: jkt and jwk are set together or cleared together.
CREATE TRIGGER IF NOT EXISTS trg_agents_pop_pair_upd BEFORE UPDATE ON agents
  WHEN (NEW.pop_jkt IS NULL) != (NEW.pop_jwk IS NULL) BEGIN SELECT RAISE(ABORT, 'pop_jkt and pop_jwk must be set or cleared together'); END;
