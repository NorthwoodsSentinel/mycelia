// tests/integration/admin-pop.test.ts — H5: admin routes require a DPoP proof under ADMIN_POP_JKT (2026-08-24, codex round 9)
import { describe, it, expect, beforeAll } from 'vitest';
import { createTestEnv, applyMigrationsSync } from './_fixtures';
import admin from '../../src/routes/admin';
import { Hono } from 'hono';
import { generateDpopKeypair, makeDpopProof, sha256b64url } from '../../src/lib/dpop';

const ADMIN = 'admin-secret-for-tests';
let env: any; let app: Hono<any>; let kp: Awaited<ReturnType<typeof generateDpopKeypair>>;
const URL_ = 'http://mycelia.test/v1/admin/pop/coverage';

beforeAll(async () => {
  kp = await generateDpopKeypair();
  env = createTestEnv(); applyMigrationsSync(env);
  env.ADMIN_API_KEY = ADMIN; env.MODE = 'fleet'; env.ADMIN_POP_JKT = kp.jkt;
  app = new Hono(); app.route('/v1/admin', admin);
});
const call = (headers: Record<string, string>) => app.request(URL_, { headers }, env);

describe('admin DPoP (H5)', () => {
  it('bearer alone → 401 POP_REQUIRED', async () => {
    const r = await call({ Authorization: `Bearer ${ADMIN}` }); expect(r.status).toBe(401);
    expect(r.headers.get('WWW-Authenticate')).toContain('DPoP');
  });
  it('bearer + proof under the admin key → 200', async () => {
    const proof = await makeDpopProof({ privateKey: kp.privateKey, publicJwk: kp.publicJwk, htm: 'GET', htu: URL_, ath: await sha256b64url(ADMIN) });
    const r = await call({ Authorization: `Bearer ${ADMIN}`, DPoP: proof }); expect(r.status).toBe(200);
  });
  it('bearer + proof under a foreign key → 401 POP_KEY_MISMATCH', async () => {
    const other = await generateDpopKeypair();
    const proof = await makeDpopProof({ privateKey: other.privateKey, publicJwk: other.publicJwk, htm: 'GET', htu: URL_, ath: await sha256b64url(ADMIN) });
    const r = await call({ Authorization: `Bearer ${ADMIN}`, DPoP: proof }); expect(r.status).toBe(401);
    expect(((await r.json()) as any).error.code).toBe('POP_KEY_MISMATCH');
  });
  it('replayed proof → 401 POP_JTI_REPLAY', async () => {
    const proof = await makeDpopProof({ privateKey: kp.privateKey, publicJwk: kp.publicJwk, htm: 'GET', htu: URL_, ath: await sha256b64url(ADMIN) });
    expect((await call({ Authorization: `Bearer ${ADMIN}`, DPoP: proof })).status).toBe(200);
    const r = await call({ Authorization: `Bearer ${ADMIN}`, DPoP: proof }); expect(r.status).toBe(401);
    expect(((await r.json()) as any).error.code).toBe('POP_JTI_REPLAY');
  });
  it('fleet mode with ADMIN_POP_JKT unset → 503, never bearer-only', async () => {
    const e2 = { ...env, ADMIN_POP_JKT: undefined };
    const r = await app.request(URL_, { headers: { Authorization: `Bearer ${ADMIN}` } }, e2); expect(r.status).toBe(503);
  });
});
