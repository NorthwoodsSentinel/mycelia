// tests/integration/inbox-filter.test.ts
//
// Regression: GET /v1/requests?target_agent_id=... — the DIRECTED-INBOX filter.
//
// The MCP tool has always advertised "Filter to requests targeting this agent UUID.
// Use this to find requests addressed to you." The list handler never read the param,
// so every inbox query silently returned an unrelated set — a bogus agent id returned
// exactly the same rows as a valid one. Health signals all stayed green; the failure
// was invisible from the caller's side. Found 2026-09-05 by varying the id and getting
// identical results.
//
// The negative control below (bogus id -> zero rows) is the assertion that would have
// caught the original defect. A positive-only test passes against the broken handler.
//
// Exercises the production handler via app.fetch().

import { describe, it, expect, beforeEach } from 'vitest';
import app from '../../src/index';
import { applyMigrationsSync, createTestEnv, seedAgents, TestEnv, SeededAgents } from './_fixtures';

const ENV_EXTRAS = { ENVIRONMENT: 'test', MODE: 'community' as const };

function authGet(path: string, key: string): Request {
  return new Request(`https://mycelia.test${path}`, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${key}` },
  });
}

async function insertRequest(
  env: TestEnv,
  requesterId: string,
  targetAgentId: string | null,
  title: string
): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const expires = new Date(Date.now() + 86_400_000).toISOString();
  await env.DB.prepare(
    `INSERT INTO requests (id, requester_id, title, body, request_type, priority, status,
                           max_responses, response_count, target_agent_id, scope_claim_json,
                           action_required, created_at, updated_at, expires_at)
     VALUES (?, ?, ?, ?, 'second-opinion', 'normal', 'open', 3, 0, ?, ?, 'fyi', ?, ?, ?)`
  ).bind(
    id, requesterId, title, 'body text for the inbox filter regression test',
    targetAgentId,
    JSON.stringify({ requester: 'test', agent_id: requesterId, tier: 'public', ask_max_tier: 'public', ts: now }),
    now, now, expires
  ).run();
  return id;
}

describe('GET /v1/requests — directed-inbox filter (target_agent_id)', () => {
  let env: TestEnv;
  let agents: SeededAgents;
  let fullEnv: any;
  let directedId: string;
  let undirectedId: string;

  beforeEach(async () => {
    env = createTestEnv();
    applyMigrationsSync(env);
    agents = await seedAgents(env);
    fullEnv = { ...env, ...ENV_EXTRAS };

    directedId = await insertRequest(env, agents.requesterId, agents.responderId, 'directed at responder');
    undirectedId = await insertRequest(env, agents.requesterId, null, 'undirected broadcast');
  });

  it('returns ONLY requests targeted at the given agent', async () => {
    const res = await app.fetch(
      authGet(`/v1/requests?target_agent_id=${agents.responderId}`, agents.responderKey),
      fullEnv
    );
    expect(res.status).toBe(200);
    const json = await res.json() as any;
    const ids = json.data.requests.map((r: any) => r.id);

    expect(ids).toContain(directedId);
    // The original defect: undirected rows came back from an inbox query.
    expect(ids).not.toContain(undirectedId);
    for (const r of json.data.requests) {
      expect(r.target_agent_id).toBe(agents.responderId);
    }
  });

  it('NEGATIVE CONTROL — an agent id that matches nothing returns zero rows', async () => {
    // This is the assertion that fails against the pre-fix handler: it used to return
    // the same rows as any other id, because the param was never read.
    const res = await app.fetch(
      authGet('/v1/requests?target_agent_id=totally-bogus-agent-does-not-exist-9999', agents.responderKey),
      fullEnv
    );
    expect(res.status).toBe(200);
    const json = await res.json() as any;
    expect(json.data.requests).toHaveLength(0);
  });

  it('a bogus id and a valid id do NOT return the same set (the original symptom)', async () => {
    const valid = await app.fetch(
      authGet(`/v1/requests?target_agent_id=${agents.responderId}`, agents.responderKey),
      fullEnv
    );
    const bogus = await app.fetch(
      authGet('/v1/requests?target_agent_id=nobody-9999', agents.responderKey),
      fullEnv
    );
    const validIds = ((await valid.json()) as any).data.requests.map((r: any) => r.id);
    const bogusIds = ((await bogus.json()) as any).data.requests.map((r: any) => r.id);
    expect(validIds).not.toEqual(bogusIds);
    expect(validIds.length).toBeGreaterThan(0);
    expect(bogusIds.length).toBe(0);
  });

  it('omitting the param still returns both directed and undirected rows', async () => {
    const res = await app.fetch(authGet('/v1/requests', agents.responderKey), fullEnv);
    const json = await res.json() as any;
    const ids = json.data.requests.map((r: any) => r.id);
    expect(ids).toContain(directedId);
    expect(ids).toContain(undirectedId);
  });
});

describe('GET /v1/requests — the `none` sentinel (broadcast-only)', () => {
  let env: TestEnv;
  let agents: SeededAgents;
  let fullEnv: any;
  let directedId: string;
  let undirectedId: string;

  beforeEach(async () => {
    env = createTestEnv();
    applyMigrationsSync(env);
    agents = await seedAgents(env);
    fullEnv = { ...env, ...ENV_EXTRAS };
    directedId = await insertRequest(env, agents.requesterId, agents.responderId, 'directed at responder');
    undirectedId = await insertRequest(env, agents.requesterId, null, 'undirected broadcast');
  });

  it('selects broadcast-only with the `none` sentinel', async () => {
    const res = await app.fetch(authGet('/v1/requests?target_agent_id=none', agents.responderKey), fullEnv);
    const json = await res.json() as any;
    const ids = json.data.requests.map((r: any) => r.id);
    expect(ids).toContain(undirectedId);
    expect(ids).not.toContain(directedId);
    for (const r of json.data.requests) expect(r.target_agent_id).toBeNull();
  });

  it('distinguishes broadcast-only from directed', async () => {
    const bc = await app.fetch(authGet('/v1/requests?target_agent_id=none', agents.responderKey), fullEnv);
    const dir = await app.fetch(authGet(`/v1/requests?target_agent_id=${agents.responderId}`, agents.responderKey), fullEnv);
    const bcIds = ((await bc.json()) as any).data.requests.map((r: any) => r.id);
    const dirIds = ((await dir.json()) as any).data.requests.map((r: any) => r.id);
    expect(bcIds).not.toEqual(dirIds);
    expect(bcIds).toContain(undirectedId);
    expect(dirIds).toContain(directedId);
    expect(bcIds.some((i: string) => dirIds.includes(i))).toBe(false);
  });
});
