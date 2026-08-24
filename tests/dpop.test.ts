// tests/dpop.test.ts — RFC 9449 DPoP verifier (WS1 2026-08-24)
import { describe, it, expect } from 'vitest';
import { verifyDpop, generateDpopKeypair, makeDpopProof, jwkThumbprint, sha256b64url, normalizeHtu, b64url, type JtiStore } from '../src/lib/dpop';

function memStore(): JtiStore & { seen: Set<string> } {
  const seen = new Set<string>();
  return { seen, async spend(jti) { if (seen.has(jti)) return false; seen.add(jti); return true; } };
}
const throwingStore: JtiStore = { async spend() { throw new Error('D1 down'); } };
const HTU = 'https://mycelia-api.robert-chuvala.workers.dev/v1/requests';
const BEARER = 'mycelia_live_' + 'a'.repeat(64);

async function setup() {
  const kp = await generateDpopKeypair();
  const ath = await sha256b64url(BEARER);
  const now = 1_800_000_000;
  const base = { htm: 'POST', htu: HTU, ath, expectedJkt: kp.jkt, now, agentId: 'agent-1' };
  return { kp, ath, now, base };
}

describe('verifyDpop', () => {
  it('ISC-16/19 POSITIVE CONTROL: accepts a fresh well-formed proof under the bound key', async () => {
    const { kp, ath, now, base } = await setup();
    const proof = await makeDpopProof({ privateKey: kp.privateKey, publicJwk: kp.publicJwk, htm: 'POST', htu: HTU, ath, iat: now });
    const r = await verifyDpop(proof, { ...base, jtiStore: memStore() });
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.jkt).toBe(kp.jkt); expect(r.jti.length).toBeGreaterThan(8); }
  });

  it('ISC-18 NEGATIVE CONTROL: a proof signed by a different key than the bound jkt is rejected (the Clay Seal JS hole)', async () => {
    const { ath, now, base } = await setup();
    const attacker = await generateDpopKeypair();
    const proof = await makeDpopProof({ privateKey: attacker.privateKey, publicJwk: attacker.publicJwk, htm: 'POST', htu: HTU, ath, iat: now });
    const r = await verifyDpop(proof, { ...base, jtiStore: memStore() });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('POP_KEY_MISMATCH');
  });

  it('ISC-6 rejects typ != dpop+jwt', async () => {
    const { kp, ath, now, base } = await setup();
    const proof = await makeDpopProof({ privateKey: kp.privateKey, publicJwk: kp.publicJwk, htm: 'POST', htu: HTU, ath, iat: now });
    const [h, p, s] = proof.split('.');
    const hdr = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(h.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - h.length % 4) % 4)), c => c.charCodeAt(0))));
    hdr.typ = 'JWT';
    const h2 = b64url(new TextEncoder().encode(JSON.stringify(hdr)));
    const r = await verifyDpop(`${h2}.${p}.${s}`, { ...base, jtiStore: memStore() });
    expect(r.ok).toBe(false); if (!r.ok) expect(r.code).toBe('POP_INVALID_TYP');
  });

  it('ISC-7 rejects alg != EdDSA', async () => {
    const { kp, now, base } = await setup();
    const hdr = { typ: 'dpop+jwt', alg: 'HS256', jwk: kp.publicJwk };
    const h = b64url(new TextEncoder().encode(JSON.stringify(hdr)));
    const p = b64url(new TextEncoder().encode(JSON.stringify({ jti: 'x'.repeat(12), htm: 'POST', htu: HTU, iat: now })));
    const r = await verifyDpop(`${h}.${p}.AAAA`, { ...base, jtiStore: memStore() });
    expect(r.ok).toBe(false); if (!r.ok) expect(r.code).toBe('POP_INVALID_ALG');
  });

  it('ISC-8 thumbprint is RFC 7638 (sorted crv,kty,x)', async () => {
    const kp = await generateDpopKeypair();
    const manual = await sha256b64url(`{"crv":"Ed25519","kty":"OKP","x":"${kp.publicJwk.x}"}`);
    expect(await jwkThumbprint(kp.publicJwk)).toBe(manual);
  });

  it('ISC-9 rejects a tampered signature', async () => {
    const { kp, ath, now, base } = await setup();
    const proof = await makeDpopProof({ privateKey: kp.privateKey, publicJwk: kp.publicJwk, htm: 'POST', htu: HTU, ath, iat: now });
    const [h, p, s] = proof.split('.');
    const flipped = s.slice(0, -2) + (s.endsWith('AA') ? 'BB' : 'AA');
    const r = await verifyDpop(`${h}.${p}.${flipped}`, { ...base, jtiStore: memStore() });
    expect(r.ok).toBe(false); if (!r.ok) expect(r.code).toBe('POP_BAD_SIGNATURE');
  });

  it('ISC-10 rejects htm mismatch', async () => {
    const { kp, ath, now, base } = await setup();
    const proof = await makeDpopProof({ privateKey: kp.privateKey, publicJwk: kp.publicJwk, htm: 'GET', htu: HTU, ath, iat: now });
    const r = await verifyDpop(proof, { ...base, jtiStore: memStore() });
    expect(r.ok).toBe(false); if (!r.ok) expect(r.code).toBe('POP_HTM_MISMATCH');
  });

  it('ISC-11 rejects htu mismatch but ignores query string', async () => {
    const { kp, ath, now, base } = await setup();
    const bad = await makeDpopProof({ privateKey: kp.privateKey, publicJwk: kp.publicJwk, htm: 'POST', htu: HTU + '/other', ath, iat: now });
    const r1 = await verifyDpop(bad, { ...base, jtiStore: memStore() });
    expect(r1.ok).toBe(false); if (!r1.ok) expect(r1.code).toBe('POP_HTU_MISMATCH');
    const ok = await makeDpopProof({ privateKey: kp.privateKey, publicJwk: kp.publicJwk, htm: 'POST', htu: HTU + '?limit=10', ath, iat: now });
    const r2 = await verifyDpop(ok, { ...base, htu: HTU + '?x=1', jtiStore: memStore() });
    expect(r2.ok).toBe(true);
    expect(normalizeHtu('https://a.b/c?d=1#e')).toBe('https://a.b/c');
  });

  it('ISC-12 rejects iat too old and too far in the future', async () => {
    const { kp, ath, now, base } = await setup();
    const old = await makeDpopProof({ privateKey: kp.privateKey, publicJwk: kp.publicJwk, htm: 'POST', htu: HTU, ath, iat: now - 301 });
    const r1 = await verifyDpop(old, { ...base, jtiStore: memStore() });
    expect(r1.ok).toBe(false); if (!r1.ok) expect(r1.code).toBe('POP_IAT_WINDOW');
    const future = await makeDpopProof({ privateKey: kp.privateKey, publicJwk: kp.publicJwk, htm: 'POST', htu: HTU, ath, iat: now + 31 });
    const r2 = await verifyDpop(future, { ...base, jtiStore: memStore() });
    expect(r2.ok).toBe(false); if (!r2.ok) expect(r2.code).toBe('POP_IAT_WINDOW');
  });

  it('ISC-13 rejects ath mismatch (proof bound to a different bearer)', async () => {
    const { kp, now, base } = await setup();
    const otherAth = await sha256b64url('mycelia_live_' + 'b'.repeat(64));
    const proof = await makeDpopProof({ privateKey: kp.privateKey, publicJwk: kp.publicJwk, htm: 'POST', htu: HTU, ath: otherAth, iat: now });
    const r = await verifyDpop(proof, { ...base, jtiStore: memStore() });
    expect(r.ok).toBe(false); if (!r.ok) expect(r.code).toBe('POP_ATH_MISMATCH');
  });

  it('ISC-14 rejects a replayed jti', async () => {
    const { kp, ath, now, base } = await setup();
    const store = memStore();
    const proof = await makeDpopProof({ privateKey: kp.privateKey, publicJwk: kp.publicJwk, htm: 'POST', htu: HTU, ath, iat: now });
    expect((await verifyDpop(proof, { ...base, jtiStore: store })).ok).toBe(true);
    const r = await verifyDpop(proof, { ...base, jtiStore: store });
    expect(r.ok).toBe(false); if (!r.ok) expect(r.code).toBe('POP_JTI_REPLAY');
  });

  it('ISC-15 refuses when the jti store is unreachable (never assumes unspent)', async () => {
    const { kp, ath, now, base } = await setup();
    const proof = await makeDpopProof({ privateKey: kp.privateKey, publicJwk: kp.publicJwk, htm: 'POST', htu: HTU, ath, iat: now });
    const r = await verifyDpop(proof, { ...base, jtiStore: throwingStore });
    expect(r.ok).toBe(false); if (!r.ok) expect(r.code).toBe('POP_STORE_UNAVAILABLE');
  });

  it('rejects a jwk carrying a private component', async () => {
    const { kp, now, base } = await setup();
    const hdr = { typ: 'dpop+jwt', alg: 'EdDSA', jwk: { ...kp.publicJwk, d: 'secret' } };
    const h = b64url(new TextEncoder().encode(JSON.stringify(hdr)));
    const p = b64url(new TextEncoder().encode(JSON.stringify({ jti: 'x'.repeat(12), htm: 'POST', htu: HTU, iat: now })));
    const r = await verifyDpop(`${h}.${p}.AAAA`, { ...base, jtiStore: memStore() });
    expect(r.ok).toBe(false); if (!r.ok) expect(r.code).toBe('POP_MALFORMED');
  });

  it('missing header → POP_MALFORMED', async () => {
    const { base } = await setup();
    const r = await verifyDpop(undefined, { ...base, jtiStore: memStore() });
    expect(r.ok).toBe(false); if (!r.ok) expect(r.code).toBe('POP_MALFORMED');
  });
});
