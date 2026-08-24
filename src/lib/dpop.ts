// src/lib/dpop.ts — RFC 9449 DPoP (Demonstrating Proof of Possession) verifier, Ed25519 only.
// WS1 2026-08-24. WebCrypto only; no dependencies.
//
// What a bearer proves: someone once received this string.
// What a DPoP proof proves: the holder of private key K, at time t, intended THIS method on THIS URL
// with THIS token. Only the second is bound to a moment and a target.
//
// Council doctrine applied: standard shape (RFC 9449), no dialect; the registered thumbprint is checked
// (the Clay Seal JS verifier defined readBoundKeys and never called it — that hole does not ship here);
// one-time jti via an atomic store where "store unreachable" is a refusal, never "assume unspent".

export type DpopErrorCode =
  | 'POP_MALFORMED'
  | 'POP_INVALID_TYP'
  | 'POP_INVALID_ALG'
  | 'POP_KEY_MISMATCH'
  | 'POP_BAD_SIGNATURE'
  | 'POP_HTM_MISMATCH'
  | 'POP_HTU_MISMATCH'
  | 'POP_IAT_WINDOW'
  | 'POP_ATH_MISMATCH'
  | 'POP_JTI_REPLAY'
  | 'POP_STORE_UNAVAILABLE';

export type DpopResult =
  | { ok: true; jkt: string; jti: string; iat: number; jwk: OkpJwk }
  | { ok: false; code: DpopErrorCode; message: string };

export interface OkpJwk { kty: 'OKP'; crv: 'Ed25519'; x: string; [k: string]: unknown }

/** One-time store contract. `spend` MUST be atomic: true only for the first spender of `jti`.
 *  Throwing means the store is unreachable → the verifier refuses (POP_STORE_UNAVAILABLE). */
export interface JtiStore {
  spend(jti: string, agentId: string, iat: number): Promise<boolean>;
}

export interface VerifyDpopOptions {
  htm: string;                 // expected HTTP method
  htu: string;                 // expected URL (query/fragment stripped by the verifier)
  ath: string | null;          // base64url(sha256(bearer)) or null to skip (bind-time only)
  expectedJkt: string | null;  // the agent's registered thumbprint; null = accept any key (bind-time only)
  now?: number;                // unix seconds; injectable for tests
  jtiStore: JtiStore;
  agentId: string;
  maxAgeSec?: number;          // default 300
  maxSkewSec?: number;         // default 30
}

// ---------- encoding helpers ----------

export function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
const te = new TextEncoder();
const td = new TextDecoder();

export async function sha256b64url(input: string | Uint8Array): Promise<string> {
  const data = (typeof input === 'string' ? te.encode(input) : input) as BufferSource;
  return b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', data)));
}

/** RFC 7638 JWK thumbprint for an OKP/Ed25519 key: sha256 of {"crv":..,"kty":..,"x":..} with keys in that lexical order. */
export async function jwkThumbprint(jwk: OkpJwk): Promise<string> {
  const canonical = `{"crv":${JSON.stringify(jwk.crv)},"kty":${JSON.stringify(jwk.kty)},"x":${JSON.stringify(jwk.x)}}`;
  return sha256b64url(canonical);
}

/** RFC 9449 §4.3: htu is scheme+host+path, no query, no fragment. */
export function normalizeHtu(u: string): string {
  try {
    const url = new URL(u);
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    return u;
  }
}

export function isOkpJwk(x: unknown): x is OkpJwk {
  return !!x && typeof x === 'object' && (x as any).kty === 'OKP' && (x as any).crv === 'Ed25519' && typeof (x as any).x === 'string' && (x as any).x.length > 0;
}

async function importPublic(jwk: OkpJwk): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', { kty: 'OKP', crv: 'Ed25519', x: jwk.x }, { name: 'Ed25519' }, true, ['verify']);
}

// ---------- the verifier ----------

export async function verifyDpop(proof: string | null | undefined, opts: VerifyDpopOptions): Promise<DpopResult> {
  const fail = (code: DpopErrorCode, message: string): DpopResult => ({ ok: false, code, message });
  if (typeof proof !== 'string' || proof.length === 0) return fail('POP_MALFORMED', 'DPoP header missing');
  const parts = proof.split('.');
  if (parts.length !== 3) return fail('POP_MALFORMED', 'DPoP proof must be a compact JWS (three segments)');
  if (!parts.every((p) => /^[A-Za-z0-9_-]+$/.test(p))) return fail('POP_MALFORMED', 'DPoP segments must be strict base64url (no padding, no +/)');

  let header: any, payload: any;
  try {
    header = JSON.parse(td.decode(b64urlDecode(parts[0])));
    payload = JSON.parse(td.decode(b64urlDecode(parts[1])));
  } catch {
    return fail('POP_MALFORMED', 'DPoP header/payload is not base64url JSON');
  }
  if (!header || typeof header !== 'object' || !payload || typeof payload !== 'object') return fail('POP_MALFORMED', 'DPoP segments are not objects');

  if (header.typ !== 'dpop+jwt') return fail('POP_INVALID_TYP', `typ must be dpop+jwt (got ${JSON.stringify(header.typ)})`);
  if (header.alg !== 'EdDSA') return fail('POP_INVALID_ALG', `alg must be EdDSA (got ${JSON.stringify(header.alg)})`);
  if (!isOkpJwk(header.jwk)) return fail('POP_MALFORMED', 'header.jwk must be an OKP/Ed25519 public JWK');
  if ('d' in header.jwk) return fail('POP_MALFORMED', 'header.jwk must not carry a private component');

  // Key binding FIRST — before signature — so a valid-but-foreign key is named as such.
  const jkt = await jwkThumbprint(header.jwk);
  if (opts.expectedJkt != null && jkt !== opts.expectedJkt) {
    return fail('POP_KEY_MISMATCH', 'proof key thumbprint does not match the agent\'s bound key');
  }

  // Signature over the JWS signing input.
  let sigOk = false;
  try {
    const key = await importPublic(header.jwk);
    sigOk = await crypto.subtle.verify({ name: 'Ed25519' }, key, b64urlDecode(parts[2]) as BufferSource, te.encode(`${parts[0]}.${parts[1]}`) as BufferSource);
  } catch {
    sigOk = false;
  }
  if (!sigOk) return fail('POP_BAD_SIGNATURE', 'DPoP signature did not verify under header.jwk');

  // Claims.
  if (typeof payload.jti !== 'string' || payload.jti.length < 8 || payload.jti.length > 128) return fail('POP_MALFORMED', 'jti must be a string of 8..128 chars');
  if (typeof payload.htm !== 'string' || payload.htm.toUpperCase() !== opts.htm.toUpperCase()) return fail('POP_HTM_MISMATCH', `htm ${JSON.stringify(payload.htm)} != ${opts.htm}`);
  if (typeof payload.htu !== 'string' || normalizeHtu(payload.htu) !== normalizeHtu(opts.htu)) return fail('POP_HTU_MISMATCH', `htu ${JSON.stringify(payload.htu)} != ${normalizeHtu(opts.htu)}`);
  if (typeof payload.iat !== 'number' || !Number.isFinite(payload.iat)) return fail('POP_MALFORMED', 'iat must be a number (unix seconds)');
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  const maxAge = opts.maxAgeSec ?? 300, maxSkew = opts.maxSkewSec ?? 30;
  if (now - payload.iat > maxAge || payload.iat - now > maxSkew) return fail('POP_IAT_WINDOW', `iat outside window (age ${now - payload.iat}s; allowed -${maxSkew}..${maxAge})`);
  if (opts.ath != null) {
    if (typeof payload.ath !== 'string' || payload.ath !== opts.ath) return fail('POP_ATH_MISMATCH', 'ath does not match the presented bearer');
  }

  // One-time spend, atomic, fail-closed on store failure.
  let fresh: boolean;
  try {
    fresh = await opts.jtiStore.spend(payload.jti, opts.agentId, payload.iat);
  } catch (e: any) {
    console.error('dpop jti store error', String(e?.message ?? e));
    return fail('POP_STORE_UNAVAILABLE', 'jti store unavailable; refusing rather than assuming unspent');
  }
  if (!fresh) return fail('POP_JTI_REPLAY', 'jti already spent');

  return { ok: true, jkt, jti: payload.jti, iat: payload.iat, jwk: { kty: 'OKP', crv: 'Ed25519', x: header.jwk.x } };
}

// ---------- D1-backed one-time store ----------

/** Atomic spend via PRIMARY KEY insert. A UNIQUE violation = already spent. Any other error = unreachable (throws). */
export function d1JtiStore(db: D1Database): JtiStore {
  return {
    async spend(jti, agentId, iat) {
      try {
        await db.prepare('INSERT INTO dpop_jti (jti, agent_id, iat, created_at) VALUES (?, ?, ?, ?)')
          .bind(jti, agentId, iat, new Date().toISOString()).run();
        return true;
      } catch (e: any) {
        const msg = String(e?.message ?? e);
        if (/UNIQUE|PRIMARY KEY|constraint/i.test(msg)) return false;
        throw e;
      }
    },
  };
}

// ---------- client-side helper (used by tests and by Bin/mycelia-pop.ts) ----------

export async function generateDpopKeypair(): Promise<{ privateKey: CryptoKey; publicJwk: OkpJwk; privateJwk: JsonWebKey; jkt: string }> {
  const kp = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const pub = (await crypto.subtle.exportKey('jwk', kp.publicKey)) as JsonWebKey;
  const priv = (await crypto.subtle.exportKey('jwk', kp.privateKey)) as JsonWebKey;
  const publicJwk: OkpJwk = { kty: 'OKP', crv: 'Ed25519', x: pub.x as string };
  return { privateKey: kp.privateKey, publicJwk, privateJwk: priv, jkt: await jwkThumbprint(publicJwk) };
}

export async function makeDpopProof(args: {
  privateKey: CryptoKey; publicJwk: OkpJwk; htm: string; htu: string; ath?: string | null; iat?: number; jti?: string;
}): Promise<string> {
  const header = { typ: 'dpop+jwt', alg: 'EdDSA', jwk: { kty: 'OKP', crv: 'Ed25519', x: args.publicJwk.x } };
  const payload: Record<string, unknown> = {
    jti: args.jti ?? crypto.randomUUID(),
    htm: args.htm.toUpperCase(),
    htu: normalizeHtu(args.htu),
    iat: args.iat ?? Math.floor(Date.now() / 1000),
  };
  if (args.ath) payload.ath = args.ath;
  const h = b64url(te.encode(JSON.stringify(header)));
  const p = b64url(te.encode(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, args.privateKey, te.encode(`${h}.${p}`)));
  return `${h}.${p}.${b64url(sig)}`;
}
