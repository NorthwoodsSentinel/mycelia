// tests/integration/owner-cap.test.ts
// ROUTE-LEVEL proof of the owner agent cap. Sends a real POST /v1/agents
// through src/index.ts. No local CAP constant: the assertions are on the
// route's own status and message, so this file fails on a cap of 11 and
// passes on 12 WITHOUT being edited (cap 11 -> 12, NOR-129).
import { describe, it, expect, beforeEach } from 'vitest';
import app from '../../src/index';
import { applyMigrationsSync, createTestEnv, TestEnv } from './_fixtures';

const OWNER = 'rob-cap-test';
const KEY = 'mycelia_live_' + 'c'.repeat(64);
const PREFIX = KEY.substring(0, 21);

async function sha256(s: string) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

async function seedRows(env: TestEnv, n: number) {
  const hash = await sha256(KEY);
  const ts = new Date().toISOString();
  for (let i = 0; i < n; i++) {
    await env.DB.prepare(
      `INSERT INTO agents (id, name, owner_id, api_key_hash, key_prefix, trust_score, status, created_at)
       VALUES (?,?,?,?,?,?,?,?)`
    ).bind(`cap-${i}`, `cap-agent-${i}`, OWNER, i === 0 ? hash : `h${i}`,
           i === 0 ? PREFIX : `mycelia_live_z${i}`, 0.7, 'active', ts).run();
  }
}

const register = (env: TestEnv) =>
  app.fetch(
    new Request('https://test.local/v1/agents', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'codex-cap-probe', owner_id: OWNER,
        capabilities: [{ tag: 'second-opinion', confidence: 0.8 }],
      }),
    }),
    env as any,
    { waitUntil() {}, passThroughOnException() {} } as any
  );

describe('POST /v1/agents — owner cap, via the route', () => {
  let env: TestEnv;
  beforeEach(() => {
    env = createTestEnv();
    (env as any).ADMIN_OWNER_ID = OWNER;
    (env as any).MODE = 'fleet';
    applyMigrationsSync(env);
  });

  const rowCount = async (env: TestEnv) =>
    (await env.DB.prepare('SELECT COUNT(*) as c FROM agents WHERE owner_id = ?')
      .bind(OWNER).first<{ c: number }>())?.c ?? -1;

  it('ADMITS registration when the owner holds 11 rows: 2xx, agent id, row count 12', async () => {
    await seedRows(env, 11);
    expect(await rowCount(env)).toBe(11);
    const res = await register(env);
    const body: any = await res.json();
    // positive assertions — "not 403" would pass on any unrelated failure
    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(300);
    expect(body?.ok).toBe(true);
    expect(typeof body?.data?.agent?.id).toBe('string');
    expect(body.data.agent.id.length).toBeGreaterThan(0);
    expect(body?.data?.agent?.name).toBe('codex-cap-probe');
    expect(await rowCount(env)).toBe(12);          // the row actually landed
  });

  it('REJECTS registration when the owner holds 12 rows', async () => {
    await seedRows(env, 12);
    const res = await register(env);
    const body: any = await res.json();
    expect(res.status).toBe(403);
    expect(body?.error?.message).toBe('Maximum 12 agents per owner_id');
    expect(await rowCount(env)).toBe(12);          // nothing was inserted
  });

  it('the cap holds under a race: a stale early count (11) with 12 rows already present still rejects, nothing inserted', async () => {
    await seedRows(env, 12);
    // A concurrent registration landed after this request's early COUNT: that COUNT is forced to report 11.
    const orig = env.DB.prepare.bind(env.DB);
    (env.DB as any).prepare = (sql: string) => sql === 'SELECT COUNT(*) as count FROM agents WHERE owner_id = ?'
      ? orig("SELECT 11 as count WHERE ? IS NOT NULL") : orig(sql);
    const res = await register(env);
    (env.DB as any).prepare = orig;
    const body: any = await res.json();
    expect(res.status).toBe(403);
    expect(body?.error?.message).toBe('Maximum 12 agents per owner_id');
    expect(await rowCount(env)).toBe(12);          // the conditional insert refused; still exactly 12
    expect((await env.DB.prepare("SELECT COUNT(*) as c FROM agent_capabilities WHERE agent_id NOT LIKE 'cap-%'").first<{ c: number }>())?.c).toBe(0);
  });

  it('a deactivated row still counts: 12 rows with one deactivated → still rejected (high-water mark)', async () => {
    await seedRows(env, 12);
    await env.DB.prepare("UPDATE agents SET status = 'deactivated' WHERE id = 'cap-11'").run();
    const res = await register(env);
    expect(res.status).toBe(403);                  // a retired row does not free a slot (high-water mark)
  });
});
