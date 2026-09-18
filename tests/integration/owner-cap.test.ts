// tests/integration/owner-cap.test.ts
// ROUTE-LEVEL proof of the owner agent cap. Sends a real POST /v1/agents
// through src/index.ts. No local CAP constant: the assertions are on the
// route's own status and message, so this file fails on a cap of 10 and
// passes on 11 WITHOUT being edited.
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

  it('ADMITS registration when the owner holds 10 rows', async () => {
    await seedRows(env, 10);
    const res = await register(env);
    const body: any = await res.json();
    expect(body?.error?.message ?? '').not.toMatch(/Maximum \d+ agents per owner_id/);
    expect(res.status).not.toBe(403);
  });

  it('REJECTS registration when the owner holds 11 rows', async () => {
    await seedRows(env, 11);
    const res = await register(env);
    const body: any = await res.json();
    expect(res.status).toBe(403);
    expect(body?.error?.message).toBe('Maximum 11 agents per owner_id');
  });
});
