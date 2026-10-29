// tests/integration/client-ref.test.ts
//
// NOR-129 design v4 §A1/A2: requester-scoped client_ref idempotency and requester-only claim history.
// Case ids MY-01..MY-16 are Codex's adversarial cases (CODEX-TESTS-t1.md), encoded unchanged in intent.
// Production handler via app.fetch(), real migrations through 0016 on better-sqlite3, MODE=fleet (scope_claim required).

import { describe, it, expect, beforeEach } from 'vitest';
import app from '../../src/index';
import { applyMigrationsSync, createTestEnv, TestEnv } from './_fixtures';

const ENV = { ENVIRONMENT: 'test', MODE: 'fleet' as const };
const REF = 'NOR-129-TEST-01';

type Agent = { id: string; key: string };

async function sha256(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function addAgent(env: TestEnv, name: string, ch: string): Promise<Agent> {
  const id = '00000000-0000-4000-8000-' + name.padStart(12, '0').slice(-12);
  const key = 'mycelia_live_' + ch.repeat(64);
  const ts = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO agents (id, name, owner_id, api_key_hash, key_prefix, trust_score, status, created_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, 'agent-' + name, 'owner-test', await sha256(key), key.substring(0, 21), 0.7, 'active', ts, ts).run();
  return { id, key };
}

function req(method: string, path: string, key: string | null, body?: unknown): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (key) headers.Authorization = `Bearer ${key}`;
  return new Request(`https://mycelia.test${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

function createBody(agent: Agent, target: Agent, extra: Record<string, unknown> = {}) {
  return {
    title: 'DISPATCH NOR-129-TEST-01 to margin',
    body: 'NOR129-DISPATCH v1\nID: NOR-129-TEST-01\nTO: margin\n\nPerform synthetic test.',
    request_type: 'second-opinion',
    tags: ['code-review'],
    max_responses: 1,
    target_agent_id: target.id,
    scope_claim: { requester: 'test', agent_id: agent.id, tier: 'public', ask_max_tier: 'public', ts: new Date().toISOString() },
    ...extra,
  };
}

let env: TestEnv;
let orch: Agent, margin: Agent, other: Agent;

async function call(r: Request) {
  const res = await app.fetch(r, { ...env, ...ENV } as any);
  let json: any = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, json };
}

async function create(agent: Agent, extra: Record<string, unknown> = {}) {
  return call(req('POST', '/v1/requests', agent.key, createBody(agent, margin, extra)));
}

async function count(sql: string, ...p: unknown[]): Promise<number> {
  const r = await env.DB.prepare(sql).bind(...p).first<{ n: number }>();
  return r?.n ?? 0;
}

beforeEach(async () => {
  env = createTestEnv();
  applyMigrationsSync(env);
  await env.DB.prepare("INSERT OR IGNORE INTO capabilities (tag, category, created_at) SELECT 'code-review', 'code', ? WHERE NOT EXISTS (SELECT 1 FROM capabilities WHERE tag = 'code-review')").bind(new Date().toISOString()).run();
  orch = await addAgent(env, '1', 'c');
  margin = await addAgent(env, '2', 'd');
  other = await addAgent(env, '4', 'e');
});

describe('client_ref idempotency (A1)', () => {
  it('MY-16: migration 0016 is applied and its unique index exists', async () => {
    const idx = await env.DB.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'index' AND name = 'idx_requests_requester_client_ref'").first<{ sql: string }>();
    expect(idx).not.toBeNull();
    expect(idx!.sql).toContain('WHERE client_ref IS NOT NULL');
  });

  it('MY-01: (requester, client_ref) uniqueness is enforced by the schema, and concurrent creates yield one row', async () => {
    const ins = (id: string) => env.DB.db.prepare(
      `INSERT INTO requests (id, requester_id, title, body, request_type, created_at, updated_at, client_ref)
       VALUES (?, ?, 'title is long enough', 'body is long enough for checks', 'second-opinion', 'x', 'x', ?)`).run(id, orch.id, REF);
    ins('r-a');
    expect(() => ins('r-b')).toThrow(/UNIQUE constraint failed/);
    expect(await count('SELECT COUNT(*) n FROM requests WHERE client_ref = ?', REF)).toBe(1);

    await env.DB.db.prepare('DELETE FROM requests').run();
    const [a, b] = await Promise.all([create(orch, { client_ref: REF }), create(orch, { client_ref: REF })]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(await count('SELECT COUNT(*) n FROM requests WHERE requester_id = ? AND client_ref = ?', orch.id, REF)).toBe(1);
  });

  it('MY-01b: the race path (pre-check passes, insert collides) still answers 409 with the winner', async () => {
    // Insert the winner AFTER the route's pre-check would run: a trigger-free way is to pre-insert via a second
    // connection-equivalent write between pre-check and batch. We simulate by inserting directly, then
    // removing the pre-check's view: the route must map the UNIQUE failure to 409, not 500.
    const first = await create(orch, { client_ref: REF });
    expect(first.status).toBe(201);
    const origPrepare = env.DB.prepare.bind(env.DB);
    let hidden = true;
    (env.DB as any).prepare = (sql: string) => {
      if (hidden && sql.startsWith('SELECT id, created_at, body FROM requests WHERE requester_id = ? AND client_ref = ?')) {
        hidden = false; // first lookup (the pre-check) sees nothing; the post-conflict lookup sees the winner
        return origPrepare("SELECT id, created_at, body FROM requests WHERE 0 AND requester_id = ? AND client_ref = ?");
      }
      return origPrepare(sql);
    };
    const second = await create(orch, { client_ref: REF });
    (env.DB as any).prepare = origPrepare;
    expect(second.status).toBe(409);
    expect(second.json.error.code).toBe('DUPLICATE_CLIENT_REF');
    expect(second.json.data.id).toBe(first.json.data.request.id);
  });

  it('MY-02: a different requester may reuse the same reference', async () => {
    expect((await create(orch, { client_ref: REF })).status).toBe(201);
    const o = await call(req('POST', '/v1/requests', other.key, createBody(other, margin, { client_ref: REF })));
    expect(o.status).toBe(201);
  });

  it('MY-03: requests without client_ref are unaffected', async () => {
    expect((await create(orch)).status).toBe(201);
    expect((await create(orch)).status).toBe(201);
    expect(await count('SELECT COUNT(*) n FROM requests WHERE requester_id = ? AND client_ref IS NULL', orch.id)).toBe(2);
  });

  it('MY-04: client_ref is validated exactly; rejected values write nothing', async () => {
    const valid64 = 'A' + 'B'.repeat(63);
    const bad = ['AB', 'abc', '-ABC', 'ABC_1', 'ABC/1', 'ABC\nX', 'A' + 'B'.repeat(64), '', 123, ['ABC']];
    for (const v of bad) {
      const r = await create(orch, { client_ref: v });
      expect(r.status, JSON.stringify(v)).toBe(400);
      expect(r.json.error.code).toBe('VALIDATION_ERROR');
    }
    expect(await count('SELECT COUNT(*) n FROM requests')).toBe(0);
    const ok = await create(orch, { client_ref: valid64 });
    expect(ok.status).toBe(201);
  });

  it('MY-05: a duplicate answers 409 with the original id, created_at and sha256 of the STORED body', async () => {
    const first = await create(orch, { client_ref: REF });
    const storedBody = createBody(orch, margin).body;
    const retry = await create(orch, { client_ref: REF, body: 'A completely different retry body, long enough.' });
    expect(retry.status).toBe(409);
    expect(retry.json.error.code).toBe('DUPLICATE_CLIENT_REF');
    expect(retry.json.data.id).toBe(first.json.data.request.id);
    expect(retry.json.data.created_at).toBe(first.json.data.request.created_at);
    expect(retry.json.data.body_sha256).toBe(await sha256(storedBody));
    expect(retry.json.data.body_sha256).not.toBe(await sha256('A completely different retry body, long enough.'));
    expect(await count('SELECT COUNT(*) n FROM requests')).toBe(1);
  });

  it('MY-06: a conflict lookup never crosses requester identity', async () => {
    await call(req('POST', '/v1/requests', other.key, createBody(other, margin, { client_ref: REF })));
    const mine = await create(orch, { client_ref: REF });
    expect(mine.status).toBe(201);
  });

  it('MY-07: a failed create batch leaves no client_ref row, and a retry succeeds', async () => {
    env.DB.db.exec(`CREATE TRIGGER t_fail BEFORE UPDATE OF request_count ON agents BEGIN SELECT RAISE(ABORT, 'injected'); END;`);
    const failed = await create(orch, { client_ref: REF });
    expect(failed.status).toBe(500);   // an unknown batch failure surfaces as 500, never as a created request
    expect(await count('SELECT COUNT(*) n FROM requests WHERE client_ref = ?', REF)).toBe(0);
    expect(await count('SELECT COUNT(*) n FROM request_tags')).toBe(0);
    env.DB.db.exec('DROP TRIGGER t_fail');
    expect((await create(orch, { client_ref: REF })).status).toBe(201);
  });

  it('MY-15: the client_ref lookup is bound to the caller and ignores other filters', async () => {
    const mine = await create(orch, { client_ref: REF });
    await call(req('POST', '/v1/requests', other.key, createBody(other, margin, { client_ref: REF })));
    await env.DB.prepare("UPDATE requests SET status = 'responded' WHERE id = ?").bind(mine.json.data.request.id).run();
    for (const q of ['', '&status=open&page=2&limit=1&sort=priority', `&requester=${other.id}`]) {
      const r = await call(req('GET', `/v1/requests?client_ref=${REF}${q}`, orch.key));
      expect(r.status).toBe(200);
      expect(r.json.data.requests).toHaveLength(1);
      expect(r.json.data.requests[0].id).toBe(mine.json.data.request.id);
      expect(r.json.data.requests[0].requester_id).toBe(orch.id);
    }
    const none = await call(req('GET', `/v1/requests?client_ref=NOR-129-NONE`, orch.key));
    expect(none.json.data.requests).toHaveLength(0);
    const badRef = await call(req('GET', `/v1/requests?client_ref=bad%20ref`, orch.key));
    expect(badRef.status).toBe(400);
  });
});

describe('claims and responses (A2 + native F1/F2/F4)', () => {
  async function seed() {
    const r = await create(orch, { client_ref: REF });
    return r.json.data.request.id as string;
  }
  const claim = (id: string, a: Agent) => call(req('POST', `/v1/requests/${id}/claims`, a.key, { estimated_minutes: 5 }));
  const respond = (id: string, a: Agent, extra: Record<string, unknown> = {}) =>
    call(req('POST', `/v1/requests/${id}/responses`, a.key, { body: 'NOR129-RESULT v1 synthetic response body', ...extra }));

  it('MY-08: only the requester receives the claims array; anonymous gets 401', async () => {
    const id = await seed();
    expect((await claim(id, margin)).status).toBe(201);
    const asOrch = await call(req('GET', `/v1/requests/${id}`, orch.key));
    expect(asOrch.json.data.request.claims).toHaveLength(1);
    expect(asOrch.json.data.request.claims[0].agent_id).toBe(margin.id);
    expect(typeof asOrch.json.data.request.claims[0].created_at).toBe('string');
    for (const a of [margin, other]) {
      const r = await call(req('GET', `/v1/requests/${id}`, a.key));
      expect(r.json.data.request.claims).toBeUndefined();
    }
    expect((await call(req('GET', `/v1/requests/${id}`, null))).status).toBe(401);
  });

  it('MY-09: response identity is server-set; forged body fields do not help a non-claimant', async () => {
    const id = await seed();
    expect((await claim(id, margin)).status).toBe(201);
    const r = await respond(id, other, { responder_id: margin.id, claim_id: 'forged' });
    expect(r.status).toBe(403);
    expect(await count('SELECT COUNT(*) n FROM responses WHERE request_id = ?', id)).toBe(0);
  });

  it('MY-10: a non-target cannot claim; nothing changes', async () => {
    const id = await seed();
    const r = await claim(id, other);
    expect(r.status).toBe(403);
    expect(await count('SELECT COUNT(*) n FROM claims WHERE request_id = ?', id)).toBe(0);
    const row = await env.DB.prepare('SELECT status, response_count FROM requests WHERE id = ?').bind(id).first<any>();
    expect(row.status).toBe('open');
    expect(row.response_count).toBe(0);
  });

  it('MY-11: the target needs an active claim to respond (403 before claim, 410 after expiry)', async () => {
    const id = await seed();
    expect((await respond(id, margin)).status).toBe(403);
    expect((await claim(id, margin)).status).toBe(201);
    await env.DB.prepare("UPDATE claims SET expires_at = '2000-01-01T00:00:00.000Z' WHERE request_id = ?").bind(id).run();
    expect((await respond(id, margin)).status).toBe(410);
    expect(await count('SELECT COUNT(*) n FROM responses WHERE request_id = ?', id)).toBe(0);
  });

  it('MY-12: an expired target may re-claim, but concurrent responses commit at most one', async () => {
    const id = await seed();
    expect((await claim(id, margin)).status).toBe(201);
    await env.DB.prepare("UPDATE claims SET status = 'expired', expires_at = '2000-01-01T00:00:00.000Z' WHERE request_id = ?").bind(id).run();
    await env.DB.prepare("UPDATE requests SET status = 'open' WHERE id = ?").bind(id).run();
    expect((await claim(id, margin)).status).toBe(201);
    const [a, b] = await Promise.all([respond(id, margin), respond(id, margin)]);
    expect([a.status, b.status].filter((s) => s === 201)).toHaveLength(1);
    expect(await count('SELECT COUNT(*) n FROM responses WHERE request_id = ?', id)).toBe(1);
    const row = await env.DB.prepare('SELECT response_count FROM requests WHERE id = ?').bind(id).first<any>();
    expect(row.response_count).toBe(1);
  });

  it('MY-13: a non-council follow-up cannot bypass the claim', async () => {
    const id = await seed();
    expect((await claim(id, margin)).status).toBe(201);
    const ok = await respond(id, margin);
    expect(ok.status).toBe(201);
    const parent = ok.json.data.response.id;
    const r = await respond(id, other, { parent_response_id: parent });
    expect(r.status).toBe(403);
    expect(await count('SELECT COUNT(*) n FROM responses WHERE request_id = ?', id)).toBe(1);
  });

  it('MY-14: claim history survives expiry and the claimed → open lifecycle step', async () => {
    const id = await seed();
    const c1 = await claim(id, margin);
    const claimedAt = (await env.DB.prepare('SELECT claimed_at FROM claims WHERE request_id = ?').bind(id).first<any>()).claimed_at;
    await env.DB.prepare("UPDATE claims SET status = 'expired' WHERE request_id = ?").bind(id).run();
    await env.DB.prepare("UPDATE requests SET status = 'open' WHERE id = ?").bind(id).run();
    expect(c1.status).toBe(201);
    const r = await call(req('GET', `/v1/requests/${id}`, orch.key));
    expect(r.json.data.request.claims).toHaveLength(1);
    expect(r.json.data.request.claims[0].created_at).toBe(claimedAt);
    expect(r.json.data.request.claims[0].status).toBe('expired');
  });
});
