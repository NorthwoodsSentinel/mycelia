-- 0017: at most one response per claim, and the response cap enforced at insert time (NOR-129 audit a1 finding 2).
--
-- The response route reads the active claim, then commits claim-complete + INSERT response + count++ in one batch.
-- Two concurrent posts on the same claim both passed the read and both committed. These two constraints run INSIDE
-- that batch's transaction, so the loser aborts and the batch rolls back. Council follow-ups carry no claim_id and
-- are unaffected.
--
-- PRE-FLIGHT (production): the index cannot be created if duplicates already exist. Run first, expect zero rows:
--   SELECT claim_id, COUNT(*) FROM responses WHERE claim_id IS NOT NULL GROUP BY claim_id HAVING COUNT(*) > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_responses_one_per_claim
  ON responses(claim_id)
  WHERE claim_id IS NOT NULL;

CREATE TRIGGER IF NOT EXISTS trg_responses_cap BEFORE INSERT ON responses
  WHEN NEW.claim_id IS NOT NULL
   AND (SELECT response_count FROM requests WHERE id = NEW.request_id) >= (SELECT max_responses FROM requests WHERE id = NEW.request_id)
BEGIN SELECT RAISE(ABORT, 'RESPONSE_CAP_REACHED'); END;
