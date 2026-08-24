import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { Env } from '../types';
import { generateApiKey } from '../middleware/auth';
import { writeAuditLog } from '../lib/audit';
import { success, error, now, generateId } from '../lib/utils';
import { verifyDpop, d1JtiStore, sha256b64url } from '../lib/dpop';

/**
 * Admin auth middleware — validates bearer token against ADMIN_API_KEY env var.
 * Bypasses agent auth entirely — no agent lookup, no last_seen update.
 */
/**
 * H5 (codex rounds 1–8, accepted exception until now): the admin bearer alone is a static reusable secret.
 * When ADMIN_POP_JKT is set, every admin request must ALSO carry a DPoP proof under that key (ath bound to the admin bearer,
 * one-time jti, htm/htu bound). A stolen ADMIN_API_KEY is then insufficient. Unset → bearer-only, logged once per request.
 */
const requireAdmin = createMiddleware<{ Bindings: Env }>(
  async (c, next) => {
    const adminKey = c.env.ADMIN_API_KEY;
    if (!adminKey) {
      return c.json(error('INTERNAL_ERROR', 'Admin API key not configured', 500).body, 500);
    }

    const authHeader = c.req.header('Authorization');
    if (authHeader && authHeader.length > 512) return c.json(error('UNAUTHORIZED', 'Authorization header exceeds 512 bytes', 401).body, 401);
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json(error('UNAUTHORIZED', 'Missing or invalid Authorization header', 401).body, 401);
    }

    const key = authHeader.slice(7);
    if (key !== adminKey) {
      return c.json(error('UNAUTHORIZED', 'Invalid admin API key', 401).body, 401);
    }
    if (c.env.ADMIN_POP_JKT) {
      const proof = c.req.header('DPoP');
      if (!proof || proof.length > 4096) { c.header('WWW-Authenticate', 'DPoP algs="EdDSA"'); return c.json(error('UNAUTHORIZED', 'Admin requests require a DPoP proof under the admin key (POP_REQUIRED)', 401).body, 401); }
      const r = await verifyDpop(proof, { htm: c.req.method, htu: c.req.url, ath: await sha256b64url(key), expectedJkt: c.env.ADMIN_POP_JKT, agentId: 'admin', jtiStore: d1JtiStore(c.env.DB) });
      if (!r.ok) { c.header('WWW-Authenticate', 'DPoP algs="EdDSA"'); return c.json({ ok: false, error: { code: r.code, message: `admin proof: ${r.message}` }, meta: { request_id: generateId(), timestamp: now() } }, r.code === 'POP_STORE_UNAVAILABLE' ? 503 : 401); }
    } else {
      console.warn('admin: bearer-only (ADMIN_POP_JKT unset) — H5 exception active');
    }

    await next();
  }
);

const admin = new Hono<{ Bindings: Env }>();

admin.use('*', requireAdmin);

// ─── WS1 (2026-08-24): proof-of-possession coverage + per-agent promotion ────
const POP_WINDOW_DAYS = 7;
const PROMOTE = { min_proven: 20, max_would_deny: 0 } as const;

async function popCoverage(db: D1Database, days = POP_WINDOW_DAYS) {
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  // Snapshot = MAX(rowid) BEFORE the evidence query. rowid is assigned at insert/commit, so a row that commits later is
  // strictly greater regardless of the timestamp its writer chose (round 5: timestamps are set before commit).
  const snap = await db.prepare('SELECT COALESCE(MAX(rowid), 0) AS r FROM pop_audit').first<{ r: number }>();
  const since_snapshot = new Date().toISOString();
  const snapshot_rowid = Number(snap?.r ?? 0);
  const agents = (await db.prepare('SELECT id, name, pop_jkt, pop_mode, pop_bound_at FROM agents WHERE status = ?').bind('active').all<{ id: string; name: string; pop_jkt: string | null; pop_mode: string; pop_bound_at: string | null }>()).results;
  // H3: evidence counts only rows written since the CURRENT binding, and only direct root proofs (acting_for IS NULL) count as proven.
  // H3: proven rows count only when written under the agent's CURRENT key (p.jkt = a.pop_jkt) and by the root itself (acting_for IS NULL).
  const rows = (await db.prepare('SELECT p.agent_id, p.outcome, p.reason, COUNT(*) AS n, MAX(p.created_at) AS last FROM pop_audit p JOIN agents a ON a.id = p.agent_id WHERE p.created_at >= ? AND (a.pop_bound_at IS NULL OR p.created_at >= a.pop_bound_at) AND p.acting_for IS NULL AND (p.outcome != ? OR p.jkt = a.pop_jkt) GROUP BY p.agent_id, p.outcome, p.reason').bind(since, 'proven').all<{ agent_id: string; outcome: string; reason: string | null; n: number; last: string }>()).results;
  // Delegated-path failures are shown separately and NEVER feed blockers (an unproven caller cannot poison promotion).
  const dd = (await db.prepare("SELECT agent_id, COUNT(*) AS n FROM pop_audit WHERE created_at >= ? AND outcome = 'deleg_denied' GROUP BY agent_id").bind(since).all<{ agent_id: string; n: number }>()).results;   // proven-then-denied rows only
  const by: Record<string, any> = {};
  for (const a of agents) by[a.id] = { agent_id: a.id, name: a.name, pop_mode: a.pop_mode, bound: !!a.pop_jkt, jkt: a.pop_jkt, bound_at: a.pop_bound_at, proven: 0, ambient: 0, would_deny: 0, denied: 0, deleg_denied: 0, last_reason: null as string | null, last_seen: null as string | null, population: 'ambient' };
  for (const r of rows) {
    const b = by[r.agent_id] ?? (by[r.agent_id] = { agent_id: r.agent_id, name: null, pop_mode: null, bound: false, proven: 0, ambient: 0, would_deny: 0, denied: 0, last_reason: null, last_seen: null, population: 'unknown' });
    b[r.outcome] = (b[r.outcome] ?? 0) + Number(r.n);
    if (r.reason && (r.outcome === 'would_deny' || r.outcome === 'denied')) b.last_reason = r.reason;
    if (!b.last_seen || r.last > b.last_seen) b.last_seen = r.last;
  }
  for (const d of dd) if (by[d.agent_id]) by[d.agent_id].deleg_denied = Number(d.n);
  // Population: the number that a global metric hides. `unobserved` = bound but no rows in the window.
  const totals = { proven: 0, ambient: 0, would_deny: 0, denied: 0, unobserved: 0, bound_agents: 0, agents: agents.length };
  for (const b of Object.values(by)) {
    if (b.bound) { totals.bound_agents++; b.population = (b.proven + b.would_deny + b.denied) === 0 ? 'unobserved' : (b.would_deny > 0 ? 'would_deny' : 'proven'); }
    totals.proven += b.proven; totals.ambient += b.ambient; totals.would_deny += b.would_deny; totals.denied += b.denied;
    if (b.population === 'unobserved') totals.unobserved++;
  }
  return { window_days: days, since, since_snapshot, snapshot_rowid, ...totals, by_agent: Object.values(by).sort((x: any, y: any) => (y.would_deny - x.would_deny) || (y.proven - x.proven)) };
}

function promotionBlockers(a: any): { code: string; observed: number | string; threshold: number | string }[] {
  const blockers = [];
  if (!a.bound) blockers.push({ code: 'NOT_BOUND', observed: 'ambient', threshold: 'bound key' });
  if (a.population === 'unobserved') blockers.push({ code: 'UNOBSERVED', observed: 0, threshold: '>0 rows in window' });
  if (a.proven < PROMOTE.min_proven) blockers.push({ code: 'MIN_PROVEN', observed: a.proven, threshold: PROMOTE.min_proven });
  if (a.bound && a.pop_mode !== 'shadow') blockers.push({ code: 'NOT_IN_SHADOW', observed: a.pop_mode, threshold: 'shadow' });
  if (a.would_deny > PROMOTE.max_would_deny) blockers.push({ code: 'WOULD_DENY_PRESENT', observed: a.would_deny, threshold: PROMOTE.max_would_deny });
  if (a.denied > 0) blockers.push({ code: 'DENIED_PRESENT', observed: a.denied, threshold: 0 });
  return blockers;
}

// GET /v1/admin/pop/coverage[?days=7] — proven / ambient / would_deny / unobserved, per agent
admin.get('/pop/coverage', async (c) => {
  const days = Math.min(Math.max(Number(c.req.query('days') ?? POP_WINDOW_DAYS), 1), 90);
  const cov = await popCoverage(c.env.DB, days);
  return c.json(success({ ...cov, ceiling: c.env.POP_CEILING ?? 'enforce', promotion: cov.by_agent.map((a: any) => ({ agent_id: a.agent_id, name: a.name, pop_mode: a.pop_mode, ready: promotionBlockers(a).length === 0, blockers: promotionBlockers(a) })) }));
});

// POST /v1/admin/pop/promote/:id — shadow → enforce for ONE agent, only when the blocker list is empty
admin.post('/pop/promote/:id', async (c) => {
  const id = c.req.param('id');
  const cov = await popCoverage(c.env.DB);
  const a = cov.by_agent.find((x: any) => x.agent_id === id);
  if (!a) return c.json(error('NOT_FOUND', 'Agent not found or inactive', 404).body, 404);
  const blockers = promotionBlockers(a);
  if (blockers.length) return c.json({ ok: false, error: { code: 'PROMOTION_BLOCKED', message: 'Blockers present; none may be waived', blockers }, meta: { request_id: generateId(), timestamp: now() } }, 409);
  // Intent is audited first (attempt), the success row is written only after the post-mutation check passes.
  await writeAuditLog(c.env.DB, c.env.KV, { event_type: 'agent.pop_promotion_attempt' as any, actor_id: null, target_type: 'agent', target_id: id, detail: { from: a.pop_mode, to: 'enforce', proven: a.proven, window_days: cov.window_days, jkt: a.jkt } });
  // Re-check adverse evidence written since the snapshot (would_deny/denied under the current key) — closes the snapshot→promote window.
  // Adverse evidence = bearer-path rows only (acting_for IS NULL): an unproven caller cannot poison promotion via the Delegated scheme.
  const lateQ = "SELECT COUNT(*) AS n FROM pop_audit WHERE agent_id = ? AND acting_for IS NULL AND outcome IN ('would_deny','denied') AND rowid > ?";
  const abort = async (reason: string, n: number) => {
    await writeAuditLog(c.env.DB, c.env.KV, { event_type: 'agent.pop_promotion_aborted' as any, actor_id: null, target_type: 'agent', target_id: id, detail: { reason, adverse_rows: n, jkt: a.jkt } });
    return c.json({ ok: false, error: { code: 'PROMOTION_BLOCKED', message: reason, blockers: [{ code: 'WOULD_DENY_PRESENT', observed: n, threshold: 0 }] }, meta: { request_id: generateId(), timestamp: now() } }, 409);
  };
  // ONE statement decides: the adverse-evidence check is inside the UPDATE's WHERE (NOT EXISTS over rowid > snapshot), and the
  // success audit rides in the same D1 batch, which D1 executes atomically. No window between check, mutation, and record.
  // The success audit is written by an AFTER UPDATE trigger guarded on the TRANSITION (OLD shadow → NEW enforce; migration 0014):
  // the store records what changed, never what the caller claims. One statement, one row, no false success possible.
  const up = await c.env.DB.prepare(
    "UPDATE agents SET pop_mode = 'enforce' WHERE id = ? AND pop_jkt = ? AND pop_bound_at = ? AND pop_mode = 'shadow' " +
    "AND NOT EXISTS (SELECT 1 FROM pop_audit WHERE agent_id = ? AND acting_for IS NULL AND outcome IN ('would_deny','denied') AND rowid > ?)"
  ).bind(id, a.jkt, a.bound_at, id, cov.snapshot_rowid).run();
  if (!up.meta.changes) {
    // Distinguish "adverse evidence arrived" from "epoch/transition changed" so the abort row names the cause.
    const late = await c.env.DB.prepare(lateQ).bind(id, cov.snapshot_rowid).first<{ n: number }>();
    if ((late?.n ?? 0) > 0) return abort('adverse evidence arrived during promotion', late!.n);
    await writeAuditLog(c.env.DB, c.env.KV, { event_type: 'agent.pop_promotion_aborted' as any, actor_id: null, target_type: 'agent', target_id: id, detail: { reason: 'key changed between evidence snapshot and promotion', jkt: a.jkt } });
    return c.json({ ok: false, error: { code: 'PROMOTION_CONFLICT', message: 'binding changed while promoting; re-evaluate' }, meta: { request_id: generateId(), timestamp: now() } }, 409);
  }
  return c.json(success({ agent_id: id, pop_mode: 'enforce', audited_by: 'trigger trg_agents_pop_promoted', evidence: { proven: a.proven, would_deny: a.would_deny, window_days: cov.window_days } }));
});

// POST /v1/admin/pop/demote/:id — enforce → shadow for ONE agent (never the fleet)
admin.post('/pop/demote/:id', async (c) => {
  const id = c.req.param('id');
  // Transition-predicated (enforce → shadow); the audit row is written by trigger trg_agents_pop_demoted (0014), never here.
  const r = await c.env.DB.prepare("UPDATE agents SET pop_mode = 'shadow' WHERE id = ? AND pop_jkt IS NOT NULL AND pop_mode = 'enforce'").bind(id).run();
  if (!r.meta.changes) return c.json(error('CONFLICT' as any, 'agent is not bound or not in enforce; nothing to demote', 409).body, 409);
  return c.json(success({ agent_id: id, pop_mode: 'shadow', audited_by: 'trigger trg_agents_pop_demoted' }));
});

// DELETE /v1/admin/pop/:id — recovery ceremony: clear the binding (lost key). Admin only, one agent.
admin.delete('/pop/:id', async (c) => {
  const id = c.req.param('id');
  const target = await c.env.DB.prepare('SELECT id FROM agents WHERE id = ?').bind(id).first<{ id: string }>();
  if (!target) return c.json(error('NOT_FOUND', 'Agent not found', 404).body, 404);
  await writeAuditLog(c.env.DB, c.env.KV, { event_type: 'agent.pop_key_cleared' as any, actor_id: null, target_type: 'agent', target_id: id, detail: { reason: 'admin recovery ceremony (single static admin key — dual control is a separate build)' } });
  const r = await c.env.DB.prepare('UPDATE agents SET pop_jwk = NULL, pop_jkt = NULL, pop_bound_at = NULL, pop_mode = ? WHERE id = ?').bind('ambient', id).run();
  if (!r.meta.changes) { await writeAuditLog(c.env.DB, c.env.KV, { event_type: 'agent.pop_clear_aborted' as any, actor_id: null, target_type: 'agent', target_id: id, detail: {} }); return c.json(error('CONFLICT' as any, 'agent vanished during recovery', 409).body, 409); }
  return c.json(success({ agent_id: id, pop_mode: 'ambient', pop_bound: false }));
});

// POST /v1/admin/agents/:id/rotate-key — Admin key rotation
admin.post('/agents/:id/rotate-key', async (c) => {
  const agentId = c.req.param('id');

  // Verify agent exists
  const agent = await c.env.DB.prepare(
    'SELECT id, key_prefix, status FROM agents WHERE id = ?'
  ).bind(agentId).first<{ id: string; key_prefix: string; status: string }>();

  if (!agent) {
    return c.json(error('NOT_FOUND', 'Agent not found', 404).body, 404);
  }

  const oldPrefix = agent.key_prefix;
  const { key, hash, prefix } = await generateApiKey('agent');

  await c.env.DB.prepare(
    'UPDATE agents SET api_key_hash = ?, key_prefix = ? WHERE id = ?'
  ).bind(hash, prefix, agentId).run();

  await writeAuditLog(c.env.DB, c.env.KV, {
    event_type: 'agent.key_rotated',
    actor_id: null,
    target_type: 'agent',
    target_id: agentId,
    detail: { old_key_prefix: oldPrefix, new_key_prefix: prefix, rotated_by: 'admin' }
  });

  return c.json(success({
    agent_id: agentId,
    api_key: key,
    key_prefix: prefix,
    rotated_at: now()
  }));
});

export default admin;
