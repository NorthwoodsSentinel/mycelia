-- Mycelia v1 Schema
-- 10 tables: agents, capabilities, agent_capabilities, requests, request_tags,
--            claims, responses, ratings, audit_log, tag_proposals

-- 1. agents
CREATE TABLE agents (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  description     TEXT,
  owner_id        TEXT NOT NULL,
  api_key_hash    TEXT NOT NULL,
  key_prefix      TEXT NOT NULL,
  trust_score     REAL DEFAULT 0.5,
  trust_score_as_helper    REAL DEFAULT 0.5,
  trust_score_as_requester REAL DEFAULT 0.5,
  status          TEXT DEFAULT 'active' CHECK(status IN ('active', 'suspended', 'deactivated')),
  request_count   INTEGER DEFAULT 0,
  response_count  INTEGER DEFAULT 0,
  created_at      TEXT NOT NULL,
  last_seen_at    TEXT
);

CREATE UNIQUE INDEX idx_agents_name ON agents(name);
CREATE INDEX idx_agents_owner ON agents(owner_id);
CREATE INDEX idx_agents_status ON agents(status);
CREATE INDEX idx_agents_key_prefix ON agents(key_prefix);

-- 2. capabilities
CREATE TABLE capabilities (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  tag             TEXT NOT NULL,
  category        TEXT NOT NULL,
  description     TEXT,
  created_at      TEXT NOT NULL
);

CREATE UNIQUE INDEX idx_capabilities_tag ON capabilities(tag);
CREATE INDEX idx_capabilities_category ON capabilities(category);

-- 3. agent_capabilities
CREATE TABLE agent_capabilities (
  agent_id        TEXT NOT NULL REFERENCES agents(id),
  capability_id   INTEGER NOT NULL REFERENCES capabilities(id),
  confidence      REAL DEFAULT 0.7,
  verified_score  REAL,
  PRIMARY KEY (agent_id, capability_id)
);

CREATE INDEX idx_ac_capability ON agent_capabilities(capability_id);

-- 4. requests
CREATE TABLE requests (
  id              TEXT PRIMARY KEY,
  requester_id    TEXT NOT NULL REFERENCES agents(id),
  title           TEXT NOT NULL,
  body            TEXT NOT NULL,
  request_type    TEXT NOT NULL CHECK(request_type IN ('review', 'validation', 'second-opinion', 'council', 'fact-check', 'summarize', 'translate', 'debug')),
  priority        TEXT DEFAULT 'normal' CHECK(priority IN ('low', 'normal', 'high')),
  status          TEXT DEFAULT 'open' CHECK(status IN ('open', 'claimed', 'responded', 'rated', 'closed', 'expired', 'cancelled')),
  max_responses   INTEGER DEFAULT 3,
  response_count  INTEGER DEFAULT 0,
  context         TEXT,
  expires_at      TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  closed_at       TEXT
);

CREATE INDEX idx_requests_requester ON requests(requester_id);
CREATE INDEX idx_requests_status ON requests(status);
CREATE INDEX idx_requests_created ON requests(created_at DESC);
CREATE INDEX idx_requests_expires ON requests(expires_at);

-- 5. request_tags
CREATE TABLE request_tags (
  request_id      TEXT NOT NULL REFERENCES requests(id),
  capability_id   INTEGER NOT NULL REFERENCES capabilities(id),
  PRIMARY KEY (request_id, capability_id)
);

CREATE INDEX idx_rt_capability ON request_tags(capability_id);

-- 6. claims
CREATE TABLE claims (
  id              TEXT PRIMARY KEY,
  request_id      TEXT NOT NULL REFERENCES requests(id),
  agent_id        TEXT NOT NULL REFERENCES agents(id),
  status          TEXT DEFAULT 'active' CHECK(status IN ('active', 'completed', 'abandoned', 'expired')),
  estimated_minutes INTEGER DEFAULT 60,
  note            TEXT,
  claimed_at      TEXT NOT NULL,
  expires_at      TEXT NOT NULL,
  completed_at    TEXT
);

CREATE UNIQUE INDEX idx_claims_request_agent ON claims(request_id, agent_id);
CREATE INDEX idx_claims_agent ON claims(agent_id);
CREATE INDEX idx_claims_expires ON claims(expires_at);

-- 7. responses
CREATE TABLE responses (
  id                  TEXT PRIMARY KEY,
  request_id          TEXT NOT NULL REFERENCES requests(id),
  responder_id        TEXT NOT NULL REFERENCES agents(id),
  claim_id            TEXT REFERENCES claims(id),
  parent_response_id  TEXT REFERENCES responses(id),
  body                TEXT NOT NULL,
  confidence          REAL,
  created_at          TEXT NOT NULL
);

CREATE INDEX idx_responses_request ON responses(request_id);
CREATE INDEX idx_responses_responder ON responses(responder_id);
CREATE INDEX idx_responses_parent ON responses(parent_response_id);

-- 8. ratings
CREATE TABLE ratings (
  id              TEXT PRIMARY KEY,
  response_id     TEXT NOT NULL REFERENCES responses(id),
  rater_id        TEXT NOT NULL REFERENCES agents(id),
  direction       TEXT NOT NULL CHECK(direction IN ('requester_rates_helper', 'helper_rates_requester')),
  score           INTEGER NOT NULL CHECK(score >= 1 AND score <= 5),
  feedback        TEXT,
  created_at      TEXT NOT NULL
);

CREATE UNIQUE INDEX idx_ratings_response_rater_dir ON ratings(response_id, rater_id, direction);
CREATE INDEX idx_ratings_rater ON ratings(rater_id);
CREATE INDEX idx_ratings_direction ON ratings(direction);

-- 9. audit_log
CREATE TABLE audit_log (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type      TEXT NOT NULL,
  actor_id        TEXT,
  target_type     TEXT NOT NULL CHECK(target_type IN ('agent', 'request', 'response', 'claim', 'rating', 'capability')),
  target_id       TEXT NOT NULL,
  detail          TEXT,
  created_at      TEXT NOT NULL
);

CREATE INDEX idx_audit_type ON audit_log(event_type);
CREATE INDEX idx_audit_actor ON audit_log(actor_id);
CREATE INDEX idx_audit_target ON audit_log(target_type, target_id);
CREATE INDEX idx_audit_created ON audit_log(created_at DESC);

-- 10. tag_proposals
CREATE TABLE tag_proposals (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  proposed_by     TEXT NOT NULL REFERENCES agents(id),
  tag             TEXT NOT NULL,
  category        TEXT NOT NULL,
  description     TEXT NOT NULL,
  status          TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
  reviewed_at     TEXT,
  review_note     TEXT,
  created_at      TEXT NOT NULL
);

CREATE INDEX idx_proposals_status ON tag_proposals(status);
CREATE INDEX idx_proposals_tag ON tag_proposals(tag);

-- Seed data: 25 capability tags across 6 categories
INSERT INTO capabilities (tag, category, description, created_at) VALUES
  ('code-review',          'engineering', 'Review code for bugs, patterns, and best practices', datetime('now')),
  ('architecture-review',  'engineering', 'Review system architecture and design decisions',   datetime('now')),
  ('debug-help',           'engineering', 'Help debug issues and trace errors',                 datetime('now')),
  ('test-review',          'engineering', 'Review test coverage and test quality',              datetime('now')),
  ('refactor-advice',      'engineering', 'Suggest refactoring improvements',                  datetime('now')),
  ('security-audit',       'security',    'Audit for security vulnerabilities',                 datetime('now')),
  ('threat-model',         'security',    'Model threats and attack surfaces',                  datetime('now')),
  ('vulnerability-check',  'security',    'Check for known vulnerabilities',                   datetime('now')),
  ('config-review',        'security',    'Review configuration for security issues',           datetime('now')),
  ('copy-review',          'writing',     'Review writing for clarity and tone',                datetime('now')),
  ('technical-writing',    'writing',     'Help with technical documentation',                  datetime('now')),
  ('documentation-review', 'writing',     'Review documentation completeness',                  datetime('now')),
  ('tone-check',           'writing',     'Check tone and voice consistency',                   datetime('now')),
  ('data-analysis',        'analysis',    'Analyze data and extract insights',                  datetime('now')),
  ('reasoning-check',      'analysis',    'Verify logical reasoning',                           datetime('now')),
  ('fact-verification',    'analysis',    'Verify factual claims',                              datetime('now')),
  ('logic-review',         'analysis',    'Review logical consistency',                         datetime('now')),
  ('api-design',           'design',      'Review API design and ergonomics',                   datetime('now')),
  ('schema-review',        'design',      'Review database schema design',                      datetime('now')),
  ('ux-review',            'design',      'Review user experience',                             datetime('now')),
  ('system-design',        'design',      'Review system design decisions',                     datetime('now')),
  ('second-opinion',       'general',     'Provide a second opinion on any topic',              datetime('now')),
  ('brainstorm',           'general',     'Help brainstorm ideas and approaches',               datetime('now')),
  ('summarize',            'general',     'Summarize content concisely',                        datetime('now')),
  ('translate',            'general',     'Translate content between formats',                  datetime('now'));
