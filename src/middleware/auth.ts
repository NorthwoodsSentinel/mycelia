import { createMiddleware } from 'hono/factory';
import type { Env, AuthContext } from '../types';
import { decidePop, writePopAudit } from '../lib/pop';
import { scopeAuthorizes } from '../lib/delegation';

/**
 * Generate a new API key.
 * Returns { key, hash, prefix } — key shown once, hash stored, prefix for lookup.
 */
export async function generateApiKey(type: 'agent' | 'observer'): Promise<{
  key: string;
  hash: string;
  prefix: string;
}> {
  const prefix = type === 'observer' ? 'mycelia_obs_' : 'mycelia_live_';
  const randomBytes = crypto.getRandomValues(new Uint8Array(32));
  const randomPart = Array.from(randomBytes, (b) => b.toString(16).padStart(2, '0')).join('');
  const key = `${prefix}${randomPart}`;

  const hash = await hashApiKey(key);
  const keyPrefix = key.substring(0, prefix.length + 8); // prefix + 8 chars

  return { key, hash, prefix: keyPrefix };
}

/**
 * Hash an API key using SHA-256.
 * (bcrypt not available in Workers runtime — SHA-256 is sufficient for API keys)
 */
export async function hashApiKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Auth middleware — validates Authorization: Bearer header.
 * Sets AuthContext on Hono context for downstream handlers.
 */
export const authMiddleware = createMiddleware<{ Bindings: Env; Variables: { auth: AuthContext } }>(
  async (c, next) => {
    // Idempotent per request: two routers share the /v1/requests prefix and both mount this middleware.
    // A second pass would re-spend the one-time DPoP jti and report a false POP_JTI_REPLAY (found live 2026-08-24).
    if ((c as any).get('auth')) { await next(); return; }
    const authHeader = c.req.header('Authorization');
    if (authHeader && authHeader.length > 512) {
      return c.json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Authorization header exceeds 512 bytes' }, meta: { request_id: crypto.randomUUID(), timestamp: new Date().toISOString() } }, 401);
    }
    // C1 (structural): `Authorization: Delegated <root_agent_id>` — the delegate holds NO bearer. Identity comes from the chain
    // (signed by the root's bound key, root pinned from the DB row) plus a DPoP proof of the leaf key. There is no legacy path:
    // without a valid chain AND leaf proof the request is refused in every mode.
    if (authHeader?.startsWith('Delegated ')) {
      const rootId = authHeader.slice(10).trim();
      if (!/^[A-Za-z0-9-]{8,64}$/.test(rootId)) return c.json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Delegated root id malformed' }, meta: { request_id: crypto.randomUUID(), timestamp: new Date().toISOString() } }, 401);
      const root = await c.env.DB.prepare('SELECT id, owner_id, status, pop_jkt, pop_jwk, pop_mode FROM agents WHERE id = ?').bind(rootId).first<{ id: string; owner_id: string; status: string; pop_jkt: string | null; pop_jwk: string | null; pop_mode: string | null }>();
      if (!root || root.status !== 'active') return c.json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Delegated root agent unknown or inactive' }, meta: { request_id: crypto.randomUUID(), timestamp: new Date().toISOString() } }, 401);
      const d = await decidePop({ db: c.env.DB, agent: root, ceiling: c.env.POP_CEILING, bearer: null, method: c.req.method, url: c.req.url, dpopHeader: c.req.header('DPoP'), delegationHeader: c.req.header('Delegation') });
      const htm = c.req.method, htu = c.req.url;
      if (d.outcome !== 'proven' || !d.acting_for) {
        const code = d.outcome === 'denied' || d.outcome === 'would_deny' ? d.code : 'DELEG_REQUIRED';
        // Evidence-poisoning guard: an UNPROVEN caller naming a root cannot write promotion-blocking evidence against it.
        // Failed delegated attempts are recorded as 'deleg_denied' — visible in coverage, never counted as would_deny/denied.
        try { await writePopAudit(c.env.DB, { agent_id: root.id, outcome: 'deleg_denied', reason: code, htm, htu, arm: d.mode, acting_for: root.id }); } catch (e) { console.error('pop_audit write failed', String(e)); }
        return c.json({ ok: false, error: { code, message: 'message' in d ? d.message : 'delegated request refused' }, meta: { request_id: crypto.randomUUID(), timestamp: new Date().toISOString() } }, code.startsWith('DELEG_') ? 403 : 401);
      }
      const declared = (c as any).get('delegable_scope') as string | undefined;
      const scopeOk = !!declared && scopeAuthorizes(d.delegated_scope ?? [], declared);
      if (!declared || !scopeOk) { try { await writePopAudit(c.env.DB, { agent_id: root.id, outcome: 'deleg_denied', reason: !declared ? 'DELEG_ROUTE_NOT_DELEGABLE' : 'DELEG_SCOPE_DENIED', htm, htu, arm: d.mode, acting_for: root.id, jkt: d.jkt }); } catch (e) { console.error('pop_audit write failed', String(e)); } }
      if (!declared) return c.json({ ok: false, error: { code: 'DELEG_ROUTE_NOT_DELEGABLE', message: 'This route does not accept delegated principals' }, meta: { request_id: crypto.randomUUID(), timestamp: new Date().toISOString() } }, 403);
      if (!scopeAuthorizes(d.delegated_scope ?? [], declared)) return c.json({ ok: false, error: { code: 'DELEG_SCOPE_DENIED', message: `Delegated scope does not cover ${declared}` }, meta: { request_id: crypto.randomUUID(), timestamp: new Date().toISOString() } }, 403);
      try { await writePopAudit(c.env.DB, { agent_id: root.id, outcome: 'proven', htm, htu, arm: d.mode, acting_for: root.id, jkt: d.jkt }); } catch (e) { console.error('pop_audit write failed', String(e)); }
      c.set('auth', { agent_id: root.id, key_type: 'agent', owner_id: root.owner_id, pop: 'proven', pop_mode: d.mode, acting_for: root.id, delegated_scope: d.delegated_scope });
      await next();
      return;
    }
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({
        ok: false,
        error: { code: 'UNAUTHORIZED', message: 'Missing or invalid Authorization header' },
        meta: { request_id: crypto.randomUUID(), timestamp: new Date().toISOString() }
      }, 401);
    }

    const key = authHeader.slice(7);
    const keyType = getKeyType(key);

    if (!keyType) {
      return c.json({
        ok: false,
        error: { code: 'UNAUTHORIZED', message: 'Invalid API key format' },
        meta: { request_id: crypto.randomUUID(), timestamp: new Date().toISOString() }
      }, 401);
    }

    const hash = await hashApiKey(key);
    const prefix = key.substring(0, key.indexOf('_', key.indexOf('_') + 1) + 1 + 8);

    // Look up agent by key prefix, then verify hash
    const agent = await c.env.DB.prepare(
      'SELECT id, owner_id, api_key_hash, status, pop_jkt, pop_jwk, pop_mode FROM agents WHERE key_prefix = ?'
    ).bind(prefix).first<{ id: string; owner_id: string; api_key_hash: string; status: string; pop_jkt: string | null; pop_jwk: string | null; pop_mode: string | null }>();

    if (!agent || agent.api_key_hash !== hash) {
      return c.json({
        ok: false,
        error: { code: 'UNAUTHORIZED', message: 'Invalid API key' },
        meta: { request_id: crypto.randomUUID(), timestamp: new Date().toISOString() }
      }, 401);
    }

    if (agent.status !== 'active') {
      return c.json({
        ok: false,
        error: { code: 'FORBIDDEN', message: 'Agent is suspended or deactivated' },
        meta: { request_id: crypto.randomUUID(), timestamp: new Date().toISOString() }
      }, 403);
    }

    // Update last_seen_at
    await c.env.DB.prepare(
      'UPDATE agents SET last_seen_at = ? WHERE id = ?'
    ).bind(new Date().toISOString(), agent.id).run();

    // ── WS1 (2026-08-24): proof of possession. The bearer identifies; the key proves. ──
    const pop = await decidePop({
      db: c.env.DB,
      agent: { id: agent.id, pop_jkt: agent.pop_jkt, pop_jwk: agent.pop_jwk, pop_mode: agent.pop_mode },
      ceiling: c.env.POP_CEILING,
      bearer: key,
      method: c.req.method,
      url: c.req.url,
      dpopHeader: c.req.header('DPoP'),
      delegationHeader: c.req.header('Delegation'),
    });
    const htm = c.req.method, htu = c.req.url;
    const audit = (outcome: string, reason?: string | null, acting_for?: string | null) =>
      writePopAudit(c.env.DB, { agent_id: agent.id, outcome, reason, htm, htu, arm: pop.mode, acting_for, jkt: pop.outcome === 'proven' ? pop.jkt : null }).catch((e) => console.error('pop_audit write failed', String(e)));
    // waitUntil when the runtime has an ExecutionContext (Workers); await inline otherwise (tests / non-Worker hosts).
    const defer = (p: Promise<void>) => { try { c.executionCtx.waitUntil(p); return Promise.resolve(); } catch { return p; } };

    if (pop.outcome === 'denied') {
      await defer(audit('denied', pop.code));
      const status = pop.code === 'POP_STORE_UNAVAILABLE' ? 503 : (pop.code.startsWith('DELEG_') ? 403 : 401);
      c.header('WWW-Authenticate', 'DPoP algs="EdDSA"');
      return c.json({
        ok: false,
        error: { code: pop.code, message: pop.message },
        meta: { request_id: crypto.randomUUID(), timestamp: new Date().toISOString() }
      }, status);
    }
    if (pop.outcome === 'would_deny') {
      // H4: the would_deny row IS the evidence the promotion gate reads. If it cannot be written, the request is refused —
      // otherwise an observability failure becomes a clean shadow record.
      try { await writePopAudit(c.env.DB, { agent_id: agent.id, outcome: 'would_deny', reason: pop.code, htm, htu, arm: pop.mode }); }
      catch (e) {
        console.error('pop_audit would_deny write failed; refusing', String(e));
        return c.json({ ok: false, error: { code: 'POP_AUDIT_UNAVAILABLE', message: 'shadow evidence store unavailable; request refused' }, meta: { request_id: crypto.randomUUID(), timestamp: new Date().toISOString() } }, 503);
      }
      // In-band signal: the keyless/invalid client sees its own future denial on every call.
      c.header('PoP-Shadow', `would_deny; reason=${c.req.header('DPoP') ? pop.code : 'POP_REQUIRED'}`);
    } else {
      await defer(audit(pop.outcome, null, pop.outcome === 'proven' ? pop.acting_for ?? null : null));
    }

    // Delegated principals are DEFAULT-DENY: a route must have declared itself delegable (see `delegable()`),
    // and the required scope must be covered by the leaf scope. Applies in every mode — delegation has no legacy.
    if (pop.outcome === 'proven' && pop.acting_for) {
      const declared = (c as any).get('delegable_scope') as string | undefined;
      if (!declared) {
        return c.json({ ok: false, error: { code: 'DELEG_ROUTE_NOT_DELEGABLE', message: 'This route does not accept delegated principals' }, meta: { request_id: crypto.randomUUID(), timestamp: new Date().toISOString() } }, 403);
      }
      if (!scopeAuthorizes(pop.delegated_scope ?? [], declared)) {
        return c.json({ ok: false, error: { code: 'DELEG_SCOPE_DENIED', message: `Delegated scope does not cover ${declared}` }, meta: { request_id: crypto.randomUUID(), timestamp: new Date().toISOString() } }, 403);
      }
    }

    c.set('auth', {
      agent_id: agent.id,
      key_type: keyType,
      owner_id: agent.owner_id,
      pop: pop.outcome,
      pop_mode: pop.mode,
      pop_reason: pop.outcome === 'would_deny' ? pop.code : undefined,
      pop_jkt: pop.outcome === 'proven' ? pop.jkt : undefined,
      acting_for: pop.outcome === 'proven' ? pop.acting_for : undefined,
      delegated_scope: pop.outcome === 'proven' ? pop.delegated_scope : undefined,
    });

    await next();
  }
);

/**
 * Declare a route group delegable for a required scope. MUST be registered BEFORE authMiddleware on that group.
 * Any route without this declaration refuses delegated principals (DELEG_ROUTE_NOT_DELEGABLE).
 */
export const delegable = (requiredScope: string) =>
  createMiddleware<{ Bindings: Env; Variables: { auth: AuthContext; delegable_scope: string } }>(async (c, next) => {
    c.set('delegable_scope', requiredScope);
    await next();
  });

/**
 * Middleware that requires agent key type (not observer).
 * Also enforces B8 kill-switch: revoked agents fail every action.
 *
 * KV fail behavior is mode-aware (see fleet-gate.ts):
 *  - fleet/company: KV error → 503 (fail-closed; revocation bypass is unacceptable).
 *  - community: KV error → pass (fail-open; KV outage does not take down the network).
 */
export const requireAgentKey = createMiddleware<{ Bindings: Env; Variables: { auth: AuthContext } }>(
  async (c, next) => {
    const auth = c.get('auth');
    if (auth.key_type === 'observer') {
      return c.json({
        ok: false,
        error: { code: 'FORBIDDEN', message: 'Observer keys cannot perform this action' },
        meta: { request_id: crypto.randomUUID(), timestamp: new Date().toISOString() }
      }, 403);
    }

    // B8 kill-switch (2026-05-18): revoked agents cannot act, period.
    // Self-revoke + admin-revoke handled in /routes/agents.ts.
    // Failure mode is now mode-aware via fleet-gate: fleet/company fail-closed, community fail-open.
    try {
      const { checkRevocationWithMode } = await import('./fleet-gate');
      const mode = (c.env.MODE ?? 'community') as import('./fleet-gate').NodeMode;
      const result = await checkRevocationWithMode(c.env.KV, auth.agent_id, mode);
      if ('revoked' in result && result.revoked === true) {
        const entry = (result as { revoked: true; entry: import('../lib/revocation').RevocationEntry }).entry;
        return c.json({
          ok: false,
          error: {
            code: 'AGENT_REVOKED',
            message: `Agent ${auth.agent_id} is revoked (${entry.reason}).${entry.revoke_until ? ` Auto-lift at ${entry.revoke_until}.` : ' Until admin lifts.'}`,
          },
          meta: { request_id: crypto.randomUUID(), timestamp: new Date().toISOString() }
        }, 403);
      }
      // kvError with revoked: false = community fail-open — fall through silently.
    } catch {
      // fleet/company: checkRevocationWithMode re-throws on KV error (fail-closed).
      // Return 503 so the request is rejected rather than silently bypassing revocation.
      return c.json({
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Revocation service unavailable. Request rejected to prevent revocation bypass.',
        },
        meta: { request_id: crypto.randomUUID(), timestamp: new Date().toISOString() }
      }, 503);
    }

    await next();
  }
);

function getKeyType(key: string): 'agent' | 'observer' | null {
  if (key.startsWith('mycelia_live_') || key.startsWith('mycelia_test_')) return 'agent';
  if (key.startsWith('mycelia_obs_')) return 'observer';
  return null;
}
