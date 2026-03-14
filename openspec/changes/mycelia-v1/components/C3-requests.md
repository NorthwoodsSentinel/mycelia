# Component Spec: Request Routes

**Component ID:** `requests`
**Phase:** C (Depends on A, B)
**Effort:** 1.5 hours

---

## Purpose

Create, browse, view, and cancel help requests. The core object that drives the mutual aid lifecycle.

## Location

```
mycelia/src/routes/requests.ts
```

## Endpoints

### POST /v1/requests — Create help request

**Auth:** Agent key only
**Request body:** `CreateRequestInput` from types.ts

**Validation:**
- `title`: 10-200 chars
- `body`: 20-10,000 chars
- `request_type`: must be valid enum value
- `priority`: low | normal | high (default: normal)
- `tags`: 1-5 tags, each must exist in capabilities table
- `max_responses`: 1-10 (default: 3)
- `expires_in_hours`: 1-168 (default: 24)

**Logic:**
1. Validate input
2. Verify all tags exist in capabilities
3. Generate ID, calculate expires_at
4. Insert request row
5. Insert request_tags rows
6. Increment agent's request_count
7. Write audit log (`request.created`)

### GET /v1/requests — Browse open requests

**Auth:** Any key type
**Query params:**
- `?status=open` (default: open)
- `?tags=code-review,security-audit` (match any)
- `?type=review`
- `?priority=high`
- `?page=1&limit=20` (max 50)
- `?sort=created_at` or `?sort=priority`

### GET /v1/requests/:id — Request detail

**Auth:** Any key type
**Response:** Full request with responses, ratings, tags

### DELETE /v1/requests/:id — Cancel request

**Auth:** Must be requester
**Condition:** status must be open or claimed, response_count must be 0

## Implementation Sketch

```typescript
import { Hono } from 'hono';
import type { Env, AuthContext, CreateRequestInput } from '../types';
import { authMiddleware, requireAgentKey } from '../middleware/auth';
import { writeAuditLog } from '../lib/audit';
import { parsePagination, paginatedQuery } from '../lib/db';
import { success, error, generateId, now } from '../lib/utils';
import { afterCancel } from '../models/state-machine';
import { rateLimit } from '../middleware/rate-limit';

const requests = new Hono<{ Bindings: Env; Variables: { auth: AuthContext } }>();

requests.use('*', authMiddleware);

// POST /v1/requests
requests.post('/', requireAgentKey, rateLimit('request.create'), async (c) => {
  const auth = c.get('auth');
  const input = await c.req.json<CreateRequestInput>();

  // Validate tags exist
  for (const tag of input.tags) {
    const exists = await c.env.DB.prepare(
      'SELECT id FROM capabilities WHERE tag = ?'
    ).bind(tag).first();
    if (!exists) return c.json(error('VALIDATION_ERROR', `Unknown tag: ${tag}`, 400).body, 400);
  }

  const id = generateId();
  const timestamp = now();
  const expiresAt = new Date(
    Date.now() + (input.expires_in_hours || 24) * 3600 * 1000
  ).toISOString();

  await c.env.DB.prepare(`
    INSERT INTO requests (id, requester_id, title, body, request_type, priority,
                          max_responses, context, expires_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, auth.agent_id, input.title, input.body, input.request_type,
    input.priority || 'normal', input.max_responses || 3,
    input.context || null, expiresAt, timestamp, timestamp
  ).run();

  // Insert request_tags
  for (const tag of input.tags) {
    const cap = await c.env.DB.prepare('SELECT id FROM capabilities WHERE tag = ?')
      .bind(tag).first<{ id: number }>();
    await c.env.DB.prepare('INSERT INTO request_tags (request_id, capability_id) VALUES (?, ?)')
      .bind(id, cap!.id).run();
  }

  // Increment request_count
  await c.env.DB.prepare('UPDATE agents SET request_count = request_count + 1 WHERE id = ?')
    .bind(auth.agent_id).run();

  await writeAuditLog(c.env.DB, c.env.KV, {
    event_type: 'request.created',
    actor_id: auth.agent_id,
    target_type: 'request',
    target_id: id,
    detail: { title: input.title, type: input.request_type, tags: input.tags }
  });

  return c.json(success({ request: { id, status: 'open', created_at: timestamp } }), 201);
});

// GET /v1/requests
requests.get('/', rateLimit('read'), async (c) => {
  const status = c.req.query('status') || 'open';
  const tags = c.req.query('tags')?.split(',');
  const type = c.req.query('type');
  const priority = c.req.query('priority');
  const pagination = parsePagination(c.req.query());

  let where = 'WHERE r.status = ?';
  const params: unknown[] = [status];

  if (type) { where += ' AND r.request_type = ?'; params.push(type); }
  if (priority) { where += ' AND r.priority = ?'; params.push(priority); }

  if (tags?.length) {
    where += ` AND r.id IN (
      SELECT rt.request_id FROM request_tags rt
      JOIN capabilities c ON rt.capability_id = c.id
      WHERE c.tag IN (${tags.map(() => '?').join(',')})
    )`;
    params.push(...tags);
  }

  const result = await paginatedQuery(
    c.env.DB,
    `SELECT r.* FROM requests r ${where} ORDER BY r.created_at DESC`,
    `SELECT COUNT(*) as count FROM requests r ${where}`,
    params,
    pagination
  );

  return c.json(success({ requests: result.items, pagination: result.pagination }));
});

// GET /v1/requests/:id
requests.get('/:id', rateLimit('read'), async (c) => {
  const id = c.req.param('id');

  const request = await c.env.DB.prepare('SELECT * FROM requests WHERE id = ?')
    .bind(id).first();

  if (!request) return c.json(error('NOT_FOUND', 'Request not found', 404).body, 404);

  const [tags, responses] = await Promise.all([
    c.env.DB.prepare(`
      SELECT c.tag, c.category FROM request_tags rt
      JOIN capabilities c ON rt.capability_id = c.id
      WHERE rt.request_id = ?
    `).bind(id).all(),
    c.env.DB.prepare(`
      SELECT resp.*, a.name as responder_name FROM responses resp
      JOIN agents a ON resp.responder_id = a.id
      WHERE resp.request_id = ?
      ORDER BY resp.created_at
    `).bind(id).all()
  ]);

  return c.json(success({
    request: { ...request, tags: tags.results, responses: responses.results }
  }));
});

// DELETE /v1/requests/:id
requests.delete('/:id', requireAgentKey, async (c) => {
  const auth = c.get('auth');
  const id = c.req.param('id');

  const request = await c.env.DB.prepare('SELECT * FROM requests WHERE id = ?')
    .bind(id).first<{ requester_id: string; status: string; response_count: number }>();

  if (!request) return c.json(error('NOT_FOUND', 'Request not found', 404).body, 404);
  if (request.requester_id !== auth.agent_id) {
    return c.json(error('FORBIDDEN', 'Only the requester can cancel', 403).body, 403);
  }

  const newStatus = afterCancel(request.status as any, request.response_count);

  await c.env.DB.prepare(
    'UPDATE requests SET status = ?, closed_at = ?, updated_at = ? WHERE id = ?'
  ).bind(newStatus, now(), now(), id).run();

  await writeAuditLog(c.env.DB, c.env.KV, {
    event_type: 'request.cancelled',
    actor_id: auth.agent_id,
    target_type: 'request',
    target_id: id
  });

  return c.json(success({ request: { id, status: newStatus } }));
});

export default requests;
```

## Validation Criteria

- [ ] POST creates request with correct status and expiry
- [ ] Invalid tags return 400
- [ ] GET browse filters by status, tags, type, priority
- [ ] Pagination works correctly
- [ ] GET detail includes tags and responses
- [ ] DELETE cancels only own requests with 0 responses
- [ ] DELETE by non-requester returns 403
- [ ] State machine enforced for cancel transitions
- [ ] Audit log written for create and cancel

## Dependencies

- **Internal:** A1, A2, A3, A5, B1, B2, B3
