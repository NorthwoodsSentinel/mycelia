-- 0009_pop_keys.sql — RFC 9449 DPoP proof-of-possession + monotonic delegation (2026-08-24, WS1)
-- A bearer alone is self-supplied metadata. A bound Ed25519 key makes the bearer insufficient:
-- every request must carry a proof only the live holder of the private key could make.
-- pop_mode is PER AGENT (bind → shadow; promote on evidence; demote one agent) — never a fleet-wide switch.

ALTER TABLE agents ADD COLUMN pop_jkt TEXT;          -- RFC 7638 JWK thumbprint (base64url sha256 of {"crv","kty","x"})
ALTER TABLE agents ADD COLUMN pop_jwk TEXT;          -- the public JWK as JSON (Ed25519 OKP)
ALTER TABLE agents ADD COLUMN pop_bound_at TEXT;
ALTER TABLE agents ADD COLUMN pop_mode TEXT NOT NULL DEFAULT 'ambient';   -- ambient | shadow | enforce

-- One-time proof identifiers. PRIMARY KEY makes the INSERT the atomic spend:
-- first inserter wins, second gets a constraint error = replay.
CREATE TABLE IF NOT EXISTS dpop_jti (
  jti        TEXT PRIMARY KEY,
  agent_id   TEXT NOT NULL,
  iat        INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dpop_jti_created ON dpop_jti(created_at);

-- Every auth decision about proof-of-possession, both arms. This is what coverage and promotion read.
CREATE TABLE IF NOT EXISTS pop_audit (
  id         TEXT PRIMARY KEY,
  agent_id   TEXT NOT NULL,
  outcome    TEXT NOT NULL,      -- proven | ambient | would_deny | denied
  reason     TEXT,               -- POP_* / DELEG_* code, null on proven/ambient
  htm        TEXT,
  htu        TEXT,
  arm        TEXT NOT NULL,      -- the agent's pop_mode at decision time
  acting_for TEXT,               -- root agent_id when a delegation chain was presented
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pop_audit_agent_created ON pop_audit(agent_id, created_at);
