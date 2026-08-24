// src/lib/delegation.ts — monotonic per-hop delegation chain, verified offline by the worker.
// WS1 2026-08-24. Pattern lifted from aeoess/agent-passport-system (Apache-2.0) `scopeCovers` + `subDelegate`
// narrowing rules, re-implemented on WebCrypto. No dependencies.
//
// A link says: "key A (delegated_by) lets key B (delegated_to) act with scope S until exp, at depth d."
// Each link is signed by the PREVIOUS link's key; link 0 by the root agent's bound key.
// Rules (all reject, never coerce):
//   scope can only narrow      (DELEG_SCOPE_WIDENS)
//   expiry can only shrink     (DELEG_EXPIRY_EXCEEDS_PARENT)
//   depth is bounded           (DELEG_TOO_DEEP)
//   the chain is contiguous    (DELEG_CHAIN_BREAK)
//   every signature verifies   (DELEG_BAD_SIGNATURE)
//   the leaf is not expired    (DELEG_EXPIRED)
// The ROOT thumbprint is pinned from the agent's DB row by the caller — never from a chain-supplied field.
// A chain is a NARROWING ENVELOPE, not an authentication proof: the presenter must still prove possession
// of the leaf key with DPoP, and delegated principals are DEFAULT-DENY on every route that has not declared itself delegable.

import { b64url, b64urlDecode, jwkThumbprint, isOkpJwk, type OkpJwk } from './dpop';

export interface DelegationLinkBody {
  delegated_by: string;   // jkt of the signer (root agent key for link 0)
  delegated_to: string;   // jkt of the receiving key
  to_jwk: OkpJwk;         // the receiving public key (so the next link / the DPoP check can verify)
  scope: string[];        // e.g. ["bus:respond:status-sync", "bus:claim:*"]
  exp: number;            // unix seconds, absolute
  nbf?: number;
  depth: number;          // 0 for the first link
  max_depth: number;      // carried from the root; must not grow
  nonce: string;
}
export interface DelegationLink { body: DelegationLinkBody; sig: string /* b64url Ed25519 over canonical body */ }

export type DelegationErrorCode =
  | 'DELEG_MALFORMED'
  | 'DELEG_SCOPE_WIDENS'
  | 'DELEG_EXPIRY_EXCEEDS_PARENT'
  | 'DELEG_TOO_DEEP'
  | 'DELEG_BAD_SIGNATURE'
  | 'DELEG_CHAIN_BREAK'
  | 'DELEG_EXPIRED'
  | 'DELEG_NOT_YET_VALID';

export type DelegationResult =
  | { ok: true; leafJkt: string; leafJwk: OkpJwk; scope: string[]; depth: number; rootJkt: string }
  | { ok: false; code: DelegationErrorCode; message: string };

/** Hierarchical scope cover: `a:*` covers `a:b` and `a:b:c`; `a:b` covers only `a:b`; `*` covers everything. */
export function scopeCovers(parent: string, child: string): boolean {
  if (parent === '*') return true;
  if (parent === child) return true;
  if (parent.endsWith(':*')) {
    const prefix = parent.slice(0, -1); // keep the trailing ':'
    return child.startsWith(prefix) && child.length > prefix.length;
  }
  return false;
}
/** Every child scope must be covered by at least one parent scope. */
export function scopesCovered(parentScopes: string[], childScopes: string[]): boolean {
  return childScopes.every((c) => parentScopes.some((p) => scopeCovers(p, c)));
}
/** Does the granted scope set authorize a concrete required scope? */
export function scopeAuthorizes(granted: string[], required: string): boolean {
  return granted.some((g) => scopeCovers(g, required));
}

const te = new TextEncoder();
/** Deterministic canonical form for signing: sorted keys, no whitespace; rejects non-primitive leaves. */
export function canonicalize(v: unknown): string {
  if (v === null) return 'null';
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number') { if (!Number.isFinite(v)) throw new Error('canonicalize: non-finite number'); return JSON.stringify(v); }
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) return `[${v.map(canonicalize).join(',')}]`;
  if (typeof v === 'object') {
    const keys = Object.keys(v as object).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize((v as any)[k])}`).join(',')}}`;
  }
  throw new Error(`canonicalize: unsupported leaf type ${typeof v}`);
}

async function importPublic(jwk: OkpJwk): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', { kty: 'OKP', crv: 'Ed25519', x: jwk.x }, { name: 'Ed25519' }, true, ['verify']);
}

function validLink(x: unknown): x is DelegationLink {
  const l = x as any;
  if (!l || typeof l !== 'object' || typeof l.sig !== 'string' || !l.body || typeof l.body !== 'object') return false;
  const b = l.body;
  return typeof b.delegated_by === 'string' && typeof b.delegated_to === 'string' && isOkpJwk(b.to_jwk)
    && Array.isArray(b.scope) && b.scope.every((s: unknown) => typeof s === 'string' && s.length > 0 && s.length <= 128)
    && typeof b.exp === 'number' && typeof b.depth === 'number' && typeof b.max_depth === 'number' && typeof b.nonce === 'string';
}

/**
 * Verify a chain. `rootJkt` + `rootJwk` come from the agent's DB row (pinned by the caller).
 * `rootScope` is the root's full authority (defaults to ['*']).
 */
export async function verifyDelegation(
  chain: unknown,
  opts: { rootJkt: string; rootJwk: OkpJwk; rootScope?: string[]; now?: number; hardMaxDepth?: number },
): Promise<DelegationResult> {
  const fail = (code: DelegationErrorCode, message: string): DelegationResult => ({ ok: false, code, message });
  if (!Array.isArray(chain) || chain.length === 0) return fail('DELEG_MALFORMED', 'delegation must be a non-empty array of links');
  if (chain.length > (opts.hardMaxDepth ?? 8)) return fail('DELEG_TOO_DEEP', `chain length ${chain.length} exceeds hard max`);
  const now = opts.now ?? Math.floor(Date.now() / 1000);

  let prevJkt = opts.rootJkt;
  let prevJwk = opts.rootJwk;
  let prevScope = opts.rootScope ?? ['*'];
  let prevExp = Number.POSITIVE_INFINITY;
  let maxDepth = Number.POSITIVE_INFINITY;

  for (let i = 0; i < chain.length; i++) {
    const link = chain[i];
    if (!validLink(link)) return fail('DELEG_MALFORMED', `link ${i} malformed`);
    const b = link.body;
    if (b.delegated_by !== prevJkt) return fail('DELEG_CHAIN_BREAK', `link ${i} delegated_by ${b.delegated_by.slice(0, 8)}… != previous key`);
    if (b.depth !== i) return fail('DELEG_CHAIN_BREAK', `link ${i} depth ${b.depth} != ${i}`);
    if (i === 0) maxDepth = b.max_depth; else if (b.max_depth > maxDepth) return fail('DELEG_TOO_DEEP', `link ${i} raised max_depth`);
    if (b.depth >= maxDepth) return fail('DELEG_TOO_DEEP', `link ${i} depth ${b.depth} >= max_depth ${maxDepth}`);
    if (!scopesCovered(prevScope, b.scope)) return fail('DELEG_SCOPE_WIDENS', `link ${i} scope not covered by parent scope`);
    if (b.exp > prevExp) return fail('DELEG_EXPIRY_EXCEEDS_PARENT', `link ${i} exp ${b.exp} > parent ${prevExp}`);
    if ((await jwkThumbprint(b.to_jwk)) !== b.delegated_to) return fail('DELEG_MALFORMED', `link ${i} to_jwk thumbprint != delegated_to`);

    let sigOk = false;
    try {
      const key = await importPublic(prevJwk);
      sigOk = await crypto.subtle.verify({ name: 'Ed25519' }, key, b64urlDecode(link.sig) as BufferSource, te.encode(canonicalize(b)) as BufferSource);
    } catch { sigOk = false; }
    if (!sigOk) return fail('DELEG_BAD_SIGNATURE', `link ${i} signature does not verify under the previous key`);

    prevJkt = b.delegated_to; prevJwk = b.to_jwk; prevScope = b.scope; prevExp = b.exp;
  }
  const leaf = (chain as DelegationLink[])[chain.length - 1].body;
  if (leaf.nbf != null && now < leaf.nbf) return fail('DELEG_NOT_YET_VALID', 'leaf nbf in the future');
  if (now >= leaf.exp) return fail('DELEG_EXPIRED', `leaf expired at ${leaf.exp} (now ${now})`);
  return { ok: true, leafJkt: prevJkt, leafJwk: prevJwk, scope: prevScope, depth: chain.length - 1, rootJkt: opts.rootJkt };
}

/** Parent-side: sign a link with the parent's private key. (Used by Bin/mycelia-pop.ts and tests.) */
export async function signLink(body: DelegationLinkBody, parentPrivateKey: CryptoKey): Promise<DelegationLink> {
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, parentPrivateKey, te.encode(canonicalize(body))));
  return { body, sig: b64url(sig) };
}
