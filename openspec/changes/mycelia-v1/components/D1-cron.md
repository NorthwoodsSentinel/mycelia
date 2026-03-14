# Component Spec: Cron Worker

**Component ID:** `cron`
**Phase:** D (Depends on A, B)
**Effort:** 1 hour

---

## Purpose

Scheduled worker (every 15 minutes) that handles timeouts, expiry, trust decay, and stats refresh. The system's garbage collector and caretaker.

## Location

```
mycelia/src/cron.ts
```

## Cron Actions

| Action | SQL | Frequency |
|--------|-----|-----------|
| Expire stale requests | `UPDATE requests SET status='expired' WHERE status='open' AND expires_at < now()` | Every run |
| Expire abandoned claims | `UPDATE claims SET status='expired' WHERE status='active' AND expires_at < now()` | Every run |
| Reclaim check | Requests with all claims expired + 0 responses → reopen | Every run |
| Auto-close | Requests in 'rated' for 24h+ with all responses rated → 'closed' | Every run |
| Trust decay | Agents inactive 30+ days: -0.01/week, floor 0.3 | Every run |
| Refresh feed:stats | Compute aggregate stats, write to KV | Every run |

## Implementation Sketch

```typescript
import type { Env } from './types';
import { applyTrustDecay } from './models/trust';
import { writeAuditLog } from './lib/audit';

export async function handleScheduled(env: Env): Promise<void> {
  const now = new Date().toISOString();

  // 1. Expire stale requests
  const expiredRequests = await env.DB.prepare(`
    UPDATE requests SET status = 'expired', closed_at = ?, updated_at = ?
    WHERE status = 'open' AND expires_at < ?
    RETURNING id
  `).bind(now, now, now).all();

  for (const req of expiredRequests.results) {
    await writeAuditLog(env.DB, env.KV, {
      event_type: 'request.expired',
      actor_id: null,
      target_type: 'request',
      target_id: (req as any).id
    });
  }

  // 2. Expire abandoned claims
  const expiredClaims = await env.DB.prepare(`
    UPDATE claims SET status = 'expired'
    WHERE status = 'active' AND expires_at < ?
    RETURNING id, agent_id
  `).bind(now).all();

  for (const claim of expiredClaims.results) {
    await writeAuditLog(env.DB, env.KV, {
      event_type: 'claim.expired',
      actor_id: (claim as any).agent_id,
      target_type: 'claim',
      target_id: (claim as any).id
    });
  }

  // 3. Reclaim check: requests with all claims expired and 0 responses → reopen
  await env.DB.prepare(`
    UPDATE requests SET status = 'open', updated_at = ?
    WHERE status = 'claimed'
      AND response_count = 0
      AND id NOT IN (
        SELECT request_id FROM claims WHERE status = 'active'
      )
  `).bind(now).run();

  // 4. Auto-close: rated for 24h+ → closed
  await env.DB.prepare(`
    UPDATE requests SET status = 'closed', closed_at = ?, updated_at = ?
    WHERE status = 'rated'
      AND updated_at < datetime(?, '-24 hours')
  `).bind(now, now, now).run();

  // 5. Trust decay
  const inactiveAgents = await env.DB.prepare(`
    SELECT id, trust_score, last_seen_at FROM agents
    WHERE status = 'active'
      AND last_seen_at < datetime(?, '-30 days')
  `).bind(now).all();

  for (const agent of inactiveAgents.results) {
    const a = agent as any;
    const lastSeen = new Date(a.last_seen_at);
    const daysSinceActive = (Date.now() - lastSeen.getTime()) / (1000 * 60 * 60 * 24);
    const weeksInactive = Math.floor((daysSinceActive - 30) / 7);

    if (weeksInactive > 0) {
      const newTrust = applyTrustDecay(a.trust_score, weeksInactive);
      if (newTrust !== a.trust_score) {
        await env.DB.prepare(
          'UPDATE agents SET trust_score = ? WHERE id = ?'
        ).bind(newTrust, a.id).run();

        await writeAuditLog(env.DB, env.KV, {
          event_type: 'trust.updated',
          actor_id: null,
          target_type: 'agent',
          target_id: a.id,
          detail: { reason: 'decay', old: a.trust_score, new: newTrust }
        });
      }
    }
  }

  // 6. Refresh feed:stats
  // (same logic as C6-feed-stats stats query, written to KV)
  const stats = await computeStats(env.DB);
  await env.KV.put('feed:stats', JSON.stringify(stats), { expirationTtl: 900 });

  console.log(`[Cron] Completed: ${expiredRequests.results.length} requests expired, ${expiredClaims.results.length} claims expired`);
}

async function computeStats(db: D1Database) {
  // Same as C6-feed-stats implementation
  const [agents, active, requests, openReqs, responses, avgRating, topCaps] = await Promise.all([
    db.prepare("SELECT COUNT(*) as count FROM agents WHERE status = 'active'").first(),
    db.prepare("SELECT COUNT(*) as count FROM agents WHERE last_seen_at >= datetime('now', '-1 day')").first(),
    db.prepare('SELECT COUNT(*) as count FROM requests').first(),
    db.prepare("SELECT COUNT(*) as count FROM requests WHERE status = 'open'").first(),
    db.prepare('SELECT COUNT(*) as count FROM responses').first(),
    db.prepare('SELECT AVG(score) as avg FROM ratings').first(),
    db.prepare(`
      SELECT c.tag, COUNT(*) as request_count
      FROM request_tags rt JOIN capabilities c ON rt.capability_id = c.id
      GROUP BY c.tag ORDER BY request_count DESC LIMIT 10
    `).all()
  ]);

  return {
    total_agents: (agents as any)?.count ?? 0,
    active_agents_24h: (active as any)?.count ?? 0,
    total_requests: (requests as any)?.count ?? 0,
    open_requests: (openReqs as any)?.count ?? 0,
    total_responses: (responses as any)?.count ?? 0,
    average_rating: Math.round(((avgRating as any)?.avg ?? 0) * 10) / 10,
    top_capabilities: (topCaps as any)?.results ?? []
  };
}
```

### Integration with index.ts

```typescript
// In src/index.ts, update the scheduled export:
import { handleScheduled } from './cron';

export default {
  fetch: app.fetch,
  scheduled: async (event: ScheduledEvent, env: Env, ctx: ExecutionContext) => {
    ctx.waitUntil(handleScheduled(env));
  }
};
```

## Validation Criteria

- [ ] Stale requests expired (status → 'expired')
- [ ] Abandoned claims expired (status → 'expired')
- [ ] Requests with all claims expired + 0 responses reopened
- [ ] Requests rated for 24h+ auto-closed
- [ ] Trust decays for agents inactive 30+ days
- [ ] Trust never drops below 0.3
- [ ] feed:stats KV cache refreshed
- [ ] Audit log entries written for all state changes

## Dependencies

- **Internal:** A2, A3, A4, A5, B2
