// tests/delegation.test.ts — monotonic delegation chain (WS1 2026-08-24)
import { describe, it, expect } from 'vitest';
import { scopeCovers, scopesCovered, scopeAuthorizes, verifyDelegation, signLink, type DelegationLink, type DelegationLinkBody } from '../src/lib/delegation';
import { generateDpopKeypair } from '../src/lib/dpop';

const NOW = 1_800_000_000;

async function mkChain(spec: { scope: string[]; exp: number; maxDepth?: number }[], root = null as null | Awaited<ReturnType<typeof generateDpopKeypair>>) {
  const rootKp = root ?? (await generateDpopKeypair());
  const keys = [rootKp];
  const chain: DelegationLink[] = [];
  for (let i = 0; i < spec.length; i++) {
    const child = await generateDpopKeypair();
    const body: DelegationLinkBody = {
      delegated_by: keys[i].jkt, delegated_to: child.jkt, to_jwk: child.publicJwk,
      scope: spec[i].scope, exp: spec[i].exp, depth: i, max_depth: spec[i].maxDepth ?? spec[0].maxDepth ?? 3, nonce: crypto.randomUUID(),
    };
    chain.push(await signLink(body, keys[i].privateKey));
    keys.push(child);
  }
  return { rootKp, keys, chain };
}

describe('scopeCovers (ISC-34)', () => {
  it('hierarchical semantics', () => {
    expect(scopeCovers('a:*', 'a:b')).toBe(true);
    expect(scopeCovers('a:*', 'a:b:c')).toBe(true);
    expect(scopeCovers('a:b', 'a:b')).toBe(true);
    expect(scopeCovers('a:b', 'a:b:c')).toBe(false);
    expect(scopeCovers('a:b', 'a:c')).toBe(false);
    expect(scopeCovers('a:*', 'ab')).toBe(false);
    expect(scopeCovers('*', 'anything:at:all')).toBe(true);
    expect(scopesCovered(['bus:*'], ['bus:respond:x', 'bus:claim:y'])).toBe(true);
    expect(scopesCovered(['bus:respond:*'], ['bus:claim:y'])).toBe(false);
    expect(scopeAuthorizes(['bus:respond:*'], 'bus:respond:status-sync')).toBe(true);
  });
});

describe('verifyDelegation', () => {
  it('ISC-35 accepts a valid two-hop narrowing chain (POSITIVE CONTROL)', async () => {
    const { rootKp, keys, chain } = await mkChain([{ scope: ['bus:*'], exp: NOW + 3600, maxDepth: 3 }, { scope: ['bus:respond:*'], exp: NOW + 1800 }]);
    const r = await verifyDelegation(chain, { rootJkt: rootKp.jkt, rootJwk: rootKp.publicJwk, now: NOW });
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.leafJkt).toBe(keys[2].jkt); expect(r.scope).toEqual(['bus:respond:*']); expect(r.depth).toBe(1); }
  });
  it('ISC-36 rejects a widening scope', async () => {
    const { rootKp, chain } = await mkChain([{ scope: ['bus:respond:*'], exp: NOW + 3600 }, { scope: ['bus:*'], exp: NOW + 1800 }]);
    const r = await verifyDelegation(chain, { rootJkt: rootKp.jkt, rootJwk: rootKp.publicJwk, now: NOW });
    expect(r.ok).toBe(false); if (!r.ok) expect(r.code).toBe('DELEG_SCOPE_WIDENS');
  });
  it('ISC-37 rejects a child expiry beyond the parent', async () => {
    const { rootKp, chain } = await mkChain([{ scope: ['bus:*'], exp: NOW + 1800 }, { scope: ['bus:respond:*'], exp: NOW + 3600 }]);
    const r = await verifyDelegation(chain, { rootJkt: rootKp.jkt, rootJwk: rootKp.publicJwk, now: NOW });
    expect(r.ok).toBe(false); if (!r.ok) expect(r.code).toBe('DELEG_EXPIRY_EXCEEDS_PARENT');
  });
  it('ISC-38 rejects a chain deeper than max_depth', async () => {
    const { rootKp, chain } = await mkChain([{ scope: ['bus:*'], exp: NOW + 3600, maxDepth: 1 }, { scope: ['bus:respond:*'], exp: NOW + 1800 }]);
    const r = await verifyDelegation(chain, { rootJkt: rootKp.jkt, rootJwk: rootKp.publicJwk, now: NOW });
    expect(r.ok).toBe(false); if (!r.ok) expect(r.code).toBe('DELEG_TOO_DEEP');
  });
  it('ISC-39 rejects a link signed by the wrong key (NEGATIVE CONTROL)', async () => {
    const { rootKp, chain } = await mkChain([{ scope: ['bus:*'], exp: NOW + 3600 }]);
    const impostor = await generateDpopKeypair();
    const forged = await signLink(chain[0].body, impostor.privateKey);
    const r = await verifyDelegation([forged], { rootJkt: rootKp.jkt, rootJwk: rootKp.publicJwk, now: NOW });
    expect(r.ok).toBe(false); if (!r.ok) expect(r.code).toBe('DELEG_BAD_SIGNATURE');
  });
  it('ISC-39b rejects when root jkt is pinned to a different agent (chain cannot name its own root)', async () => {
    const { chain } = await mkChain([{ scope: ['bus:*'], exp: NOW + 3600 }]);
    const other = await generateDpopKeypair();
    const r = await verifyDelegation(chain, { rootJkt: other.jkt, rootJwk: other.publicJwk, now: NOW });
    expect(r.ok).toBe(false); if (!r.ok) expect(r.code).toBe('DELEG_CHAIN_BREAK');
  });
  it('ISC-40 rejects a chain break (delegated_by != previous delegated_to)', async () => {
    const { rootKp, keys, chain } = await mkChain([{ scope: ['bus:*'], exp: NOW + 3600 }, { scope: ['bus:respond:*'], exp: NOW + 1800 }]);
    const bad = { ...chain[1], body: { ...chain[1].body, delegated_by: rootKp.jkt } };
    const resigned = await signLink(bad.body, keys[0].privateKey);
    const r = await verifyDelegation([chain[0], resigned], { rootJkt: rootKp.jkt, rootJwk: rootKp.publicJwk, now: NOW });
    expect(r.ok).toBe(false); if (!r.ok) expect(r.code).toBe('DELEG_CHAIN_BREAK');
  });
  it('ISC-41 rejects an expired leaf', async () => {
    const { rootKp, chain } = await mkChain([{ scope: ['bus:*'], exp: NOW - 1 }]);
    const r = await verifyDelegation(chain, { rootJkt: rootKp.jkt, rootJwk: rootKp.publicJwk, now: NOW });
    expect(r.ok).toBe(false); if (!r.ok) expect(r.code).toBe('DELEG_EXPIRED');
  });
  it('rejects a tampered body (scope edited after signing)', async () => {
    const { rootKp, chain } = await mkChain([{ scope: ['bus:respond:x'], exp: NOW + 3600 }]);
    const tampered = [{ ...chain[0], body: { ...chain[0].body, scope: ['*'] } }];
    const r = await verifyDelegation(tampered, { rootJkt: rootKp.jkt, rootJwk: rootKp.publicJwk, now: NOW });
    expect(r.ok).toBe(false); if (!r.ok) expect(['DELEG_SCOPE_WIDENS', 'DELEG_BAD_SIGNATURE']).toContain(r.code);
  });

  it('ISC-43 property loop: over 50 random chains, accepted chains never widen scope or grow expiry', async () => {
    const scopes = ['*', 'bus:*', 'bus:respond:*', 'bus:respond:status-sync', 'bus:claim:*', 'admin:*'];
    let accepted = 0;
    for (let n = 0; n < 50; n++) {
      const len = 1 + Math.floor(Math.random() * 3);
      const spec = Array.from({ length: len }, () => ({
        scope: [scopes[Math.floor(Math.random() * scopes.length)]],
        exp: NOW + Math.floor(Math.random() * 7200),
        maxDepth: 3,
      }));
      const { rootKp, chain } = await mkChain(spec);
      const r = await verifyDelegation(chain, { rootJkt: rootKp.jkt, rootJwk: rootKp.publicJwk, now: NOW });
      if (r.ok) {
        accepted++;
        let ps = ['*'], pe = Number.POSITIVE_INFINITY;
        for (const l of chain) {
          expect(scopesCovered(ps, l.body.scope)).toBe(true);
          expect(l.body.exp <= pe).toBe(true);
          ps = l.body.scope; pe = l.body.exp;
        }
      }
    }
    expect(accepted).toBeGreaterThan(0);
  });
});
