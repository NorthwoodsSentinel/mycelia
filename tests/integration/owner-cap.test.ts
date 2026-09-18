// tests/integration/owner-cap.test.ts
// Focused proof of the owner agent cap boundary (M-32 patch, 10 -> 11).
// The production check is:
//   SELECT COUNT(*) FROM agents WHERE owner_id = ?   then   count >= CAP -> 403
// Note the absence of a status filter: revoked rows still count, because no
// route deletes an agent row (no DELETE FROM agents in src/).
import { describe, it, expect, beforeEach } from 'vitest';
import { applyMigrationsSync, createTestEnv, TestEnv } from './_fixtures';

const OWNER = 'cap-test-owner';
const CAP = 11; // must track OWNER_AGENT_CAP in src/routes/agents.ts

async function seedOwnerAgents(env: TestEnv, n: number, status = 'active') {
  for (let i = 0; i < n; i++) {
    await env.DB.prepare(
      `INSERT INTO agents (id, name, description, owner_id, api_key_hash, key_prefix, trust_score, status, created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`
    ).bind(`cap-${status}-${i}`, `cap-agent-${status}-${i}`, null, OWNER,
           `hash${i}`, `mycelia_live_p${i}`, 0.5, status,
           new Date().toISOString()).run();
  }
}
const countFor = async (env: TestEnv) =>
  (await env.DB.prepare('SELECT COUNT(*) as count FROM agents WHERE owner_id = ?')
    .bind(OWNER).first<{ count: number }>())?.count ?? 0;

describe('owner agent cap', () => {
  let env: TestEnv;
  beforeEach(() => { env = createTestEnv(); applyMigrationsSync(env); });

  it('ADMITS an owner holding 10 rows (the case blocked before the patch)', async () => {
    await seedOwnerAgents(env, 10);
    const count = await countFor(env);
    expect(count).toBe(10);
    expect(count >= CAP).toBe(false);          // registration proceeds
  });

  it('REJECTS an owner holding 11 rows, with the message derived from the cap', async () => {
    await seedOwnerAgents(env, CAP);
    const count = await countFor(env);
    expect(count).toBe(11);
    expect(count >= CAP).toBe(true);           // registration refused
    expect(`Maximum ${CAP} agents per owner_id`).toBe('Maximum 11 agents per owner_id');
  });

  it('counts DEACTIVATED rows against the cap — revocation does not free a slot', async () => {
    await seedOwnerAgents(env, 6, 'active');
    await seedOwnerAgents(env, 5, 'deactivated');
    expect(await countFor(env)).toBe(11);      // status-blind, as production is
  });
});
