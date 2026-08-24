// src/lib/pop.ts — proof-of-possession decision for the auth layer (WS1 2026-08-24).
// Pure decision + audit writer. The middleware calls `decidePop` and acts on the result.

import { verifyDpop, d1JtiStore, sha256b64url, isOkpJwk, type OkpJwk } from './dpop';
import { verifyDelegation } from './delegation';

export type PopMode = 'ambient' | 'shadow' | 'enforce';
const RANK: Record<PopMode, number> = { ambient: 0, shadow: 1, enforce: 2 };
export function effectiveMode(agentMode: string | null | undefined, ceiling: string | null | undefined): PopMode {
  const a = (agentMode && agentMode in RANK ? agentMode : 'ambient') as PopMode;
  const c = (ceiling && ceiling in RANK ? ceiling : 'enforce') as PopMode;
  return RANK[a] <= RANK[c] ? a : c;
}

export interface AgentPopRow { id: string; pop_jkt: string | null; pop_jwk: string | null; pop_mode: string | null }

export type PopDecision =
  | { outcome: 'ambient'; mode: PopMode }
  | { outcome: 'proven'; mode: PopMode; jkt: string; acting_for?: string; delegated_scope?: string[] }
  | { outcome: 'would_deny' | 'denied'; mode: PopMode; code: string; message: string };

/**
 * Decide the PoP outcome for one request.
 *  - no bound key → ambient (bearer only), regardless of mode
 *  - bound key + valid DPoP (optionally through a valid delegation chain) → proven
 *  - bound key + missing/invalid proof → would_deny in shadow, denied in enforce
 *  Delegation is verified here so that `acting_for`/`delegated_scope` are available to route gates;
 *  the route-level default-deny for delegated principals is applied by the middleware.
 */
export async function decidePop(args: {
  db: D1Database;
  agent: AgentPopRow;
  ceiling: string | undefined;
  bearer: string | null;        // null = `Authorization: Delegated <agent_id>` scheme: no bearer exists, the chain + leaf proof authenticate
  method: string;
  url: string;
  dpopHeader: string | undefined;
  delegationHeader: string | undefined;
  now?: number;
}): Promise<PopDecision> {
  const mode = effectiveMode(args.agent.pop_mode, args.ceiling);
  const hard = (code: string, message: string): PopDecision => ({ outcome: 'denied', mode, code, message });
  // H2: PoP state is all-or-nothing. A half-written row or an unknown mode is a refusal, never a downgrade to ambient.
  const present = (v: string | null | undefined) => v != null && v !== '';       // H2: empty string is CORRUPT, not absent
  const hasJkt = present(args.agent.pop_jkt), hasJwk = present(args.agent.pop_jwk);
  if (args.agent.pop_jkt === '' || args.agent.pop_jwk === '') return hard('POP_STATE_CORRUPT', 'pop binding has an empty key field; admin recovery required');
  if (hasJkt !== hasJwk) return hard('POP_STATE_CORRUPT', 'pop binding is partial; admin recovery required');
  if (args.agent.pop_mode != null && !(args.agent.pop_mode in RANK)) return hard('POP_STATE_CORRUPT', 'pop_mode is not a known value');
  if (!hasJkt && args.agent.pop_mode && args.agent.pop_mode !== 'ambient') return hard('POP_STATE_CORRUPT', 'unbound agent carries a non-ambient pop_mode; admin recovery required');
  if (hasJkt && (args.agent.pop_mode ?? 'ambient') === 'ambient') return hard('POP_STATE_CORRUPT', 'bound agent carries pop_mode=ambient; a bound key is never ambient');
  // C1 (structural): a bearer request may never carry a Delegation header, and a Delegated request never carries a bearer.
  if (args.bearer != null && args.delegationHeader) return hard('DELEG_WITH_BEARER', 'delegation is presented with Authorization: Delegated <root_agent_id>, never with a bearer');
  if (args.bearer == null && !args.delegationHeader) return hard('DELEG_REQUIRED', 'Authorization: Delegated requires a Delegation header');
  if (!hasJkt) {
    // C1: a Delegation header on an unbound agent can never be valid — refuse rather than fall through as the root.
    if (args.delegationHeader) return hard('DELEG_ROOT_UNBOUND', 'Delegation presented but the root agent has no bound key');
    return { outcome: 'ambient', mode };
  }
  // H6: bounded inputs before any parsing.
  if (args.dpopHeader && args.dpopHeader.length > 4096) return hard('POP_MALFORMED', 'DPoP header exceeds 4096 bytes');
  if (args.delegationHeader && args.delegationHeader.length > 16384) return hard('DELEG_MALFORMED', 'Delegation header exceeds 16384 bytes');
  const deny = (code: string, message: string): PopDecision => ({ outcome: mode === 'enforce' ? 'denied' : 'would_deny', mode, code, message });

  let rootJwk: OkpJwk;
  try { rootJwk = JSON.parse(args.agent.pop_jwk!); if (!isOkpJwk(rootJwk)) throw new Error('bad jwk'); }
  catch { return hard('POP_STATE_CORRUPT', 'stored pop_jwk is unreadable; admin recovery required'); }

  let expectedJkt: string = args.agent.pop_jkt!;
  let acting_for: string | undefined;
  let delegated_scope: string[] | undefined;

  if (args.delegationHeader) {
    let chain: unknown;
    try {
      const pad = args.delegationHeader.length % 4 === 0 ? '' : '='.repeat(4 - (args.delegationHeader.length % 4));
      chain = JSON.parse(atob(args.delegationHeader.replace(/-/g, '+').replace(/_/g, '/') + pad));
    } catch { return hard('DELEG_MALFORMED', 'Delegation header is not base64url JSON'); }
    // C1: delegation has no legacy — a presented chain that fails is a HARD deny in every mode.
    const d = await verifyDelegation(chain, { rootJkt: args.agent.pop_jkt!, rootJwk, now: args.now });
    if (!d.ok) return hard(d.code, d.message);
    expectedJkt = d.leafJkt;            // the presenter must prove possession of the LEAF key
    acting_for = args.agent.id;         // root pinned from the DB row, never from the chain
    delegated_scope = d.scope;
  }

  if (!args.dpopHeader) return acting_for ? hard('POP_REQUIRED', 'delegated requests must carry a DPoP proof of the leaf key') : deny('POP_REQUIRED', 'DPoP header missing');
  // ath binds the proof to the bearer. A Delegated request has no bearer: the proof is bound to the chain's leaf key instead.
  const ath = args.bearer != null ? await sha256b64url(args.bearer) : null;
  // A delegated proof is bound to THIS chain (dth = sha256 of the Delegation header) so it cannot be replayed under another chain to the same leaf.
  const dth = args.delegationHeader ? await sha256b64url(args.delegationHeader) : null;
  const r = await verifyDpop(args.dpopHeader, {
    htm: args.method, htu: args.url, ath, dth, expectedJkt, now: args.now, agentId: args.agent.id, jtiStore: d1JtiStore(args.db),
  });
  if (!r.ok) {
    // Store-unavailable is a REFUSAL even in shadow: we cannot claim "would_deny" or "proven" without the store.
    if (r.code === 'POP_STORE_UNAVAILABLE') return hard(r.code, 'proof store unavailable; request refused');
    // C1: a delegated presenter whose leaf proof fails is a HARD deny — it must never fall through as the root.
    return acting_for ? hard(r.code, r.message) : deny(r.code, r.message);
  }
  return { outcome: 'proven', mode, jkt: r.jkt, acting_for, delegated_scope };
}

export async function writePopAudit(db: D1Database, row: {
  agent_id: string; outcome: string; reason?: string | null; htm: string; htu: string; arm: string; acting_for?: string | null; jkt?: string | null;
}): Promise<void> {
  // H3: every row names the key it was proven under, so promotion can count only evidence for the CURRENT key.
  await db.prepare('INSERT INTO pop_audit (id, agent_id, outcome, reason, htm, htu, arm, acting_for, jkt, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .bind(crypto.randomUUID(), row.agent_id, row.outcome, row.reason ?? null, row.htm, row.htu.split('?')[0].split('#')[0].slice(0, 512), row.arm, row.acting_for ?? null, row.jkt ?? null, new Date().toISOString())
    .run();
}
