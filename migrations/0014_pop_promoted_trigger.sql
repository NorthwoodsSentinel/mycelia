-- 0014 (2026-08-24, codex round 7): the promotion success audit is written by the STORE on the actual transition,
-- never by the caller. A repeat promote against an already-enforced agent cannot produce a success row.
CREATE TRIGGER IF NOT EXISTS trg_agents_pop_promoted AFTER UPDATE OF pop_mode ON agents
  WHEN OLD.pop_mode = 'shadow' AND NEW.pop_mode = 'enforce'
BEGIN
  INSERT INTO audit_log (event_type, actor_id, target_type, target_id, detail, created_at)
  VALUES ('agent.pop_promoted', NULL, 'agent', NEW.id, json_object('from','shadow','to','enforce','jkt',NEW.pop_jkt,'bound_at',NEW.pop_bound_at), strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;
CREATE TRIGGER IF NOT EXISTS trg_agents_pop_demoted AFTER UPDATE OF pop_mode ON agents
  WHEN OLD.pop_mode = 'enforce' AND NEW.pop_mode = 'shadow'
BEGIN
  INSERT INTO audit_log (event_type, actor_id, target_type, target_id, detail, created_at)
  VALUES ('agent.pop_demoted', NULL, 'agent', NEW.id, json_object('from','enforce','to','shadow','jkt',NEW.pop_jkt), strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;
