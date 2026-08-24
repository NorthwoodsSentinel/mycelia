// tests/pop.test.ts — decidePop hard-deny semantics (codex audit C1/H2/H6, 2026-08-24)
import { describe, it, expect } from 'vitest';
import { decidePop, effectiveMode } from '../src/lib/pop';
import { generateDpopKeypair, makeDpopProof, sha256b64url } from '../src/lib/dpop';
import { signLink } from '../src/lib/delegation';

const fakeDb = { prepare: () => ({ bind: () => ({ run: async () => ({ meta: { changes: 1 } }) }) }) } as any;
const URL_ = 'https://mycelia-api.robert-chuvala.workers.dev/v1/requests/x/claims';
const BEARER = 'mycelia_live_' + 'c'.repeat(64);
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');

describe('effectiveMode', () => {
  it('ceiling only lowers', () => {
    expect(effectiveMode('enforce', 'shadow')).toBe('shadow');
    expect(effectiveMode('shadow', 'enforce')).toBe('shadow');
    expect(effectiveMode('ambient', undefined)).toBe('ambient');
  });
});

describe('decidePop', () => {
  it('H2: partial binding is a HARD deny even in shadow', async () => {
    const r = await decidePop({ db: fakeDb, agent: { id: 'a', pop_jkt: 'x', pop_jwk: null, pop_mode: 'shadow' }, ceiling: undefined, bearer: BEARER, method: 'POST', url: URL_, dpopHeader: undefined, delegationHeader: undefined });
    expect(r.outcome).toBe('denied'); if (r.outcome === 'denied') expect(r.code).toBe('POP_STATE_CORRUPT');
  });
  it('H2: unknown pop_mode is a HARD deny', async () => {
    const r = await decidePop({ db: fakeDb, agent: { id: 'a', pop_jkt: null, pop_jwk: null, pop_mode: 'weird' }, ceiling: undefined, bearer: BEARER, method: 'POST', url: URL_, dpopHeader: undefined, delegationHeader: undefined });
    expect(r.outcome).toBe('denied');
  });
  it('shadow: missing proof on a bound agent is would_deny POP_REQUIRED (not hard)', async () => {
    const kp = await generateDpopKeypair();
    const r = await decidePop({ db: fakeDb, agent: { id: 'a', pop_jkt: kp.jkt, pop_jwk: JSON.stringify(kp.publicJwk), pop_mode: 'shadow' }, ceiling: undefined, bearer: BEARER, method: 'POST', url: URL_, dpopHeader: undefined, delegationHeader: undefined });
    expect(r.outcome).toBe('would_deny'); if (r.outcome === 'would_deny') expect(r.code).toBe('POP_REQUIRED');
  });
  it('C1: a Delegation header on an unbound root is a HARD deny', async () => {
    const r = await decidePop({ db: fakeDb, agent: { id: 'a', pop_jkt: null, pop_jwk: null, pop_mode: 'ambient' }, ceiling: undefined, bearer: BEARER, method: 'POST', url: URL_, dpopHeader: undefined, delegationHeader: b64([]) });
    expect(r.outcome).toBe('denied'); if (r.outcome === 'denied') expect(r.code).toBe('DELEG_ROOT_UNBOUND');
  });
  it('C1: a failing chain is a HARD deny in shadow (delegation has no legacy)', async () => {
    const kp = await generateDpopKeypair();
    const r = await decidePop({ db: fakeDb, agent: { id: 'a', pop_jkt: kp.jkt, pop_jwk: JSON.stringify(kp.publicJwk), pop_mode: 'shadow' }, ceiling: undefined, bearer: BEARER, method: 'POST', url: URL_, dpopHeader: undefined, delegationHeader: b64([{ body: {}, sig: 'x' }]) });
    expect(r.outcome).toBe('denied'); if (r.outcome === 'denied') expect(r.code).toBe('DELEG_MALFORMED');
  });
  it('C1: a valid chain with a MISSING leaf proof is a HARD deny in shadow', async () => {
    const root = await generateDpopKeypair(); const leaf = await generateDpopKeypair(); const now = Math.floor(Date.now() / 1000);
    const l0 = await signLink({ delegated_by: root.jkt, delegated_to: leaf.jkt, to_jwk: leaf.publicJwk, scope: ['bus:respond'], exp: now + 600, depth: 0, max_depth: 2, nonce: 'n' }, root.privateKey);
    const r = await decidePop({ db: fakeDb, agent: { id: 'a', pop_jkt: root.jkt, pop_jwk: JSON.stringify(root.publicJwk), pop_mode: 'shadow' }, ceiling: undefined, bearer: BEARER, method: 'POST', url: URL_, dpopHeader: undefined, delegationHeader: b64([l0]) });
    expect(r.outcome).toBe('denied'); if (r.outcome === 'denied') expect(r.code).toBe('POP_REQUIRED');
  });
  it('C1: a valid chain with a leaf proof from the WRONG key is a HARD deny in shadow', async () => {
    const root = await generateDpopKeypair(); const leaf = await generateDpopKeypair(); const other = await generateDpopKeypair(); const now = Math.floor(Date.now() / 1000);
    const l0 = await signLink({ delegated_by: root.jkt, delegated_to: leaf.jkt, to_jwk: leaf.publicJwk, scope: ['bus:respond'], exp: now + 600, depth: 0, max_depth: 2, nonce: 'n' }, root.privateKey);
    const proof = await makeDpopProof({ privateKey: other.privateKey, publicJwk: other.publicJwk, htm: 'POST', htu: URL_, ath: await sha256b64url(BEARER) });
    const r = await decidePop({ db: fakeDb, agent: { id: 'a', pop_jkt: root.jkt, pop_jwk: JSON.stringify(root.publicJwk), pop_mode: 'shadow' }, ceiling: undefined, bearer: BEARER, method: 'POST', url: URL_, dpopHeader: proof, delegationHeader: b64([l0]) });
    expect(r.outcome).toBe('denied'); if (r.outcome === 'denied') expect(r.code).toBe('POP_KEY_MISMATCH');
  });
  it('valid chain + valid leaf proof → proven with acting_for and delegated_scope', async () => {
    const root = await generateDpopKeypair(); const leaf = await generateDpopKeypair(); const now = Math.floor(Date.now() / 1000);
    const l0 = await signLink({ delegated_by: root.jkt, delegated_to: leaf.jkt, to_jwk: leaf.publicJwk, scope: ['bus:respond'], exp: now + 600, depth: 0, max_depth: 2, nonce: 'n' }, root.privateKey);
    const proof = await makeDpopProof({ privateKey: leaf.privateKey, publicJwk: leaf.publicJwk, htm: 'POST', htu: URL_, ath: await sha256b64url(BEARER) });
    const r = await decidePop({ db: fakeDb, agent: { id: 'root-agent', pop_jkt: root.jkt, pop_jwk: JSON.stringify(root.publicJwk), pop_mode: 'shadow' }, ceiling: undefined, bearer: BEARER, method: 'POST', url: URL_, dpopHeader: proof, delegationHeader: b64([l0]) });
    expect(r.outcome).toBe('proven'); if (r.outcome === 'proven') { expect(r.acting_for).toBe('root-agent'); expect(r.delegated_scope).toEqual(['bus:respond']); }
  });
  it('H6: oversized headers are refused before parsing', async () => {
    const kp = await generateDpopKeypair();
    const r = await decidePop({ db: fakeDb, agent: { id: 'a', pop_jkt: kp.jkt, pop_jwk: JSON.stringify(kp.publicJwk), pop_mode: 'shadow' }, ceiling: undefined, bearer: BEARER, method: 'POST', url: URL_, dpopHeader: 'a'.repeat(5000), delegationHeader: undefined });
    expect(r.outcome).toBe('denied'); if (r.outcome === 'denied') expect(r.code).toBe('POP_MALFORMED');
  });
});
