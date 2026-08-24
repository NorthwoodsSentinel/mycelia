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
  bearer: string;
  method: string;
  url: string;
  dpopHeader: string | undefined;
  delegationHeader: string | undefined;
  now?: number;
}): Promise<PopDecision> {
  const mode = effectiveMode(args.agent.pop_mode, args.ceiling);
  if (!args.agent.pop_jkt || !args.agent.pop_jwk) return { outcome: 'ambient', mode };
  const deny = (code: string, message: string): PopDecision => ({ outcome: mode === 'enforce' ? 'denied' : 'would_deny', mode, code, message });

  let rootJwk: OkpJwk;
  try { rootJwk = JSON.parse(args.agent.pop_jwk); if (!isOkpJwk(rootJwk)) throw new Error('bad jwk'); }
  catch { return deny('POP_KEY_MISMATCH', 'stored pop_jwk is unreadable; rebind required'); }

  let expectedJkt = args.agent.pop_jkt;
  let acting_for: string | undefined;
  let delegated_scope: string[] | undefined;

  if (args.delegationHeader) {
    let chain: unknown;
    try {
      const pad = args.delegationHeader.length % 4 === 0 ? '' : '='.repeat(4 - (args.delegationHeader.length % 4));
      chain = JSON.parse(atob(args.delegationHeader.replace(/-/g, '+').replace(/_/g, '/') + pad));
    } catch { return deny('DELEG_MALFORMED', 'Delegation header is not base64url JSON'); }
    const d = await verifyDelegation(chain, { rootJkt: args.agent.pop_jkt, rootJwk, now: args.now });
    if (!d.ok) return deny(d.code, d.message);
    expectedJkt = d.leafJkt;            // the presenter must prove possession of the LEAF key
    acting_for = args.agent.id;         // root pinned from the DB row, never from the chain
    delegated_scope = d.scope;
  }

  if (!args.dpopHeader) return deny('POP_REQUIRED', 'DPoP header missing');
  const ath = await sha256b64url(args.bearer);
  const r = await verifyDpop(args.dpopHeader, {
    htm: args.method, htu: args.url, ath, expectedJkt, now: args.now, agentId: args.agent.id, jtiStore: d1JtiStore(args.db),
  });
  if (!r.ok) {
    // Store-unavailable is a REFUSAL even in shadow: we cannot claim "would_deny" or "proven" without the store.
    if (r.code === 'POP_STORE_UNAVAILABLE') return { outcome: 'denied', mode, code: r.code, message: r.message };
    return deny(r.code, r.message);
  }
  return { outcome: 'proven', mode, jkt: r.jkt, acting_for, delegated_scope };
}

export async function writePopAudit(db: D1Database, row: {
  agent_id: string; outcome: string; reason?: string | null; htm: string; htu: string; arm: string; acting_for?: string | null;
}): Promise<void> {
  await db.prepare('INSERT INTO pop_audit (id, agent_id, outcome, reason, htm, htu, arm, acting_for, created_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .bind(crypto.randomUUID(), row.agent_id, row.outcome, row.reason ?? null, row.htm, row.htu.slice(0, 512), row.arm, row.acting_for ?? null, new Date().toISOString())
    .run();
}
