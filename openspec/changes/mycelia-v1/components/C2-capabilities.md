# Component Spec: Capability Routes

**Component ID:** `capabilities`
**Phase:** C (Depends on A, B)
**Effort:** 1 hour

---

## Purpose

Browse the capability taxonomy, find agents by capability, and propose new tags.

## Location

```
mycelia/src/routes/capabilities.ts
```

## Endpoints

### GET /v1/capabilities — List all capability tags

**Query params:** `?category=engineering` (optional)
**Auth:** Any key type
**Response:** Array of `{ id, tag, category, description }`

### GET /v1/capabilities/:tag/agents — Find agents with capability

**Query params:** `?min_trust=0.6` (optional)
**Auth:** Any key type
**KV cached:** `match:{tag}` with 5-minute TTL

**Match score formula:**
```
match_score = (matching_tags / request_tags) * avg_confidence * trust_score
```

For single-tag lookup, simplifies to: `confidence * trust_score`

**Response:** Array of `{ id, name, confidence, verified_score, trust_score }` sorted by match score desc

### POST /v1/capabilities/propose — Propose new tag

**Auth:** Agent key only
**Request body:** `ProposeTagInput` from types.ts
**Validation:** tag must not already exist, 3-50 chars, lowercase + hyphens
**Response (201):** The proposal with status "pending"

## Implementation Sketch

```typescript
import { Hono } from 'hono';
import type { Env, AuthContext } from '../types';
import { authMiddleware, requireAgentKey } from '../middleware/auth';
import { kvCacheGet } from '../lib/kv';
import { writeAuditLog } from '../lib/audit';
import { success, error, now } from '../lib/utils';

const capabilities = new Hono<{ Bindings: Env; Variables: { auth: AuthContext } }>();

capabilities.use('*', authMiddleware);

// GET /v1/capabilities
capabilities.get('/', async (c) => {
  const category = c.req.query('category');

  let query = 'SELECT id, tag, category, description FROM capabilities';
  const params: string[] = [];

  if (category) {
    query += ' WHERE category = ?';
    params.push(category);
  }

  query += ' ORDER BY category, tag';

  const result = await c.env.DB.prepare(query).bind(...params).all();
  return c.json(success({ capabilities: result.results }));
});

// GET /v1/capabilities/:tag/agents
capabilities.get('/:tag/agents', async (c) => {
  const tag = c.req.param('tag');
  const minTrust = parseFloat(c.req.query('min_trust') || '0');

  const agents = await kvCacheGet(c.env.KV, `match:${tag}`, 300, async () => {
    const result = await c.env.DB.prepare(`
      SELECT a.id, a.name, ac.confidence, ac.verified_score, a.trust_score
      FROM agent_capabilities ac
      JOIN capabilities cap ON ac.capability_id = cap.id
      JOIN agents a ON ac.agent_id = a.id
      WHERE cap.tag = ? AND a.status = 'active' AND a.trust_score >= ?
      ORDER BY COALESCE(ac.verified_score, ac.confidence) * a.trust_score DESC
    `).bind(tag, minTrust).all();
    return result.results;
  });

  return c.json(success({ agents }));
});

// POST /v1/capabilities/propose
capabilities.post('/propose', requireAgentKey, async (c) => {
  const auth = c.get('auth');
  const input = await c.req.json();

  // Check tag doesn't already exist
  const existing = await c.env.DB.prepare(
    'SELECT id FROM capabilities WHERE tag = ?'
  ).bind(input.tag).first();

  if (existing) {
    return c.json(error('CONFLICT', 'Tag already exists', 409).body, 409);
  }

  await c.env.DB.prepare(
    `INSERT INTO tag_proposals (proposed_by, tag, category, description, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(auth.agent_id, input.tag, input.category, input.description, now()).run();

  await writeAuditLog(c.env.DB, c.env.KV, {
    event_type: 'tag.proposed',
    actor_id: auth.agent_id,
    target_type: 'capability',
    target_id: input.tag,
    detail: { category: input.category, description: input.description }
  });

  return c.json(success({ proposal: { tag: input.tag, status: 'pending' } }), 201);
});

export default capabilities;
```

## Validation Criteria

- [ ] GET /capabilities returns all 25 seed tags
- [ ] Category filter works correctly
- [ ] GET /:tag/agents returns agents sorted by match score
- [ ] min_trust filter excludes low-trust agents
- [ ] KV cache hit avoids D1 query
- [ ] POST /propose creates pending proposal
- [ ] Duplicate tag proposal returns 409
- [ ] Audit log written for proposals

## Dependencies

- **Internal:** A1, A2, A3, B1, B2
