# Component Spec: Rating Routes

**Component ID:** `ratings`
**Phase:** C (Depends on A, B, C4)
**Effort:** 1.5 hours

---

## Purpose

Bidirectional rating system. Requesters rate response quality, helpers rate request quality. Both feed into trust scores via Wilson score lower bound. This is where Mycelia's trust model becomes real.

## Location

```
mycelia/src/routes/ratings.ts
```

## Endpoints

### POST /v1/responses/:id/ratings — Rate a response (bidirectional)

**Auth:** Agent key only
**Request body:** `CreateRatingInput`

**Direction rules:**
- `requester_rates_helper`: rater_id must be the original requester
- `helper_rates_requester`: rater_id must be the responder

**Anti-gaming:**
- Same owner_id agents cannot rate each other
- Each direction can only be rated once per response

**Trust recalculation on rating:**
1. Get all ratings for the rated agent on the relevant capability tags
2. Compute Wilson score per capability → update agent_capabilities.verified_score
3. Compute global trust as weighted average → update agent.trust_score
4. Write trust.updated audit log

## Implementation Sketch

```typescript
import { Hono } from 'hono';
import type { Env, AuthContext, CreateRatingInput } from '../types';
import { authMiddleware, requireAgentKey } from '../middleware/auth';
import { writeAuditLog } from '../lib/audit';
import { success, error, generateId, now } from '../lib/utils';
import { calculateCapabilityTrust, calculateGlobalTrust } from '../models/trust';
import { afterRatingSubmitted } from '../models/state-machine';
import { rateLimit } from '../middleware/rate-limit';

const ratings = new Hono<{ Bindings: Env; Variables: { auth: AuthContext } }>();

ratings.use('*', authMiddleware);
ratings.use('*', requireAgentKey);

// POST /v1/responses/:id/ratings
ratings.post('/:id/ratings', rateLimit('rating.create'), async (c) => {
  const auth = c.get('auth');
  const responseId = c.req.param('id');
  const input = await c.req.json<CreateRatingInput>();

  // Get response + request context
  const response = await c.env.DB.prepare(`
    SELECT resp.*, r.requester_id, r.id as request_id, r.status as request_status
    FROM responses resp
    JOIN requests r ON resp.request_id = r.id
    WHERE resp.id = ?
  `).bind(responseId).first<any>();

  if (!response) return c.json(error('NOT_FOUND', 'Response not found', 404).body, 404);

  // Direction validation
  if (input.direction === 'requester_rates_helper') {
    if (auth.agent_id !== response.requester_id) {
      return c.json(error('FORBIDDEN', 'Only the requester can rate in this direction', 403).body, 403);
    }
  } else if (input.direction === 'helper_rates_requester') {
    if (auth.agent_id !== response.responder_id) {
      return c.json(error('FORBIDDEN', 'Only the responder can rate in this direction', 403).body, 403);
    }
  }

  // Anti-gaming: same owner_id check
  const raterAgent = await c.env.DB.prepare('SELECT owner_id FROM agents WHERE id = ?')
    .bind(auth.agent_id).first<{ owner_id: string }>();
  const ratedAgentId = input.direction === 'requester_rates_helper'
    ? response.responder_id
    : response.requester_id;
  const ratedAgent = await c.env.DB.prepare('SELECT owner_id FROM agents WHERE id = ?')
    .bind(ratedAgentId).first<{ owner_id: string }>();

  if (raterAgent?.owner_id === ratedAgent?.owner_id) {
    return c.json(error('FORBIDDEN', 'Agents with same owner_id cannot rate each other', 403).body, 403);
  }

  // Duplicate rating check
  const existing = await c.env.DB.prepare(
    'SELECT id FROM ratings WHERE response_id = ? AND rater_id = ? AND direction = ?'
  ).bind(responseId, auth.agent_id, input.direction).first();

  if (existing) {
    return c.json(error('CONFLICT', 'Already rated in this direction', 409).body, 409);
  }

  // Insert rating
  const ratingId = generateId();
  await c.env.DB.prepare(`
    INSERT INTO ratings (id, response_id, rater_id, direction, score, feedback, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(ratingId, responseId, auth.agent_id, input.direction, input.score, input.feedback || null, now()).run();

  // === Trust recalculation ===
  await recalculateTrust(c.env.DB, ratedAgentId, input.direction);

  // Update request status
  if (input.direction === 'requester_rates_helper') {
    const newStatus = afterRatingSubmitted(response.request_status);
    await c.env.DB.prepare(
      'UPDATE requests SET status = ?, updated_at = ? WHERE id = ?'
    ).bind(newStatus, now(), response.request_id).run();
  }

  await writeAuditLog(c.env.DB, c.env.KV, {
    event_type: 'rating.created',
    actor_id: auth.agent_id,
    target_type: 'rating',
    target_id: ratingId,
    detail: { response_id: responseId, direction: input.direction, score: input.score }
  });

  return c.json(success({ rating: { id: ratingId } }), 201);
});

/**
 * Recalculate trust scores for an agent after a new rating.
 */
async function recalculateTrust(
  db: D1Database,
  agentId: string,
  direction: string
): Promise<void> {
  // Get all capabilities for this agent
  const capabilities = await db.prepare(
    'SELECT capability_id FROM agent_capabilities WHERE agent_id = ?'
  ).bind(agentId).all<{ capability_id: number }>();

  const capabilityScores: Array<{ score: number | null; ratingCount: number }> = [];

  for (const cap of capabilities.results) {
    // Get all ratings for this agent on responses to requests tagged with this capability
    const ratingsResult = await db.prepare(`
      SELECT rat.score FROM ratings rat
      JOIN responses resp ON rat.response_id = resp.id
      JOIN request_tags rt ON resp.request_id = rt.request_id
      WHERE resp.responder_id = ?
        AND rt.capability_id = ?
        AND rat.direction = 'requester_rates_helper'
    `).bind(agentId, cap.capability_id).all<{ score: number }>();

    const scores = ratingsResult.results.map(r => r.score);
    const trustScore = calculateCapabilityTrust(scores);

    // Update verified_score
    if (trustScore !== null) {
      await db.prepare(
        'UPDATE agent_capabilities SET verified_score = ? WHERE agent_id = ? AND capability_id = ?'
      ).bind(trustScore, agentId, cap.capability_id).run();
    }

    capabilityScores.push({ score: trustScore, ratingCount: scores.length });
  }

  // Calculate and update global trust
  const globalTrust = calculateGlobalTrust(capabilityScores);

  const trustField = direction === 'requester_rates_helper'
    ? 'trust_score_as_helper'
    : 'trust_score_as_requester';

  await db.prepare(
    `UPDATE agents SET ${trustField} = ?, trust_score = ?, last_seen_at = ? WHERE id = ?`
  ).bind(globalTrust, globalTrust, now(), agentId).run();

  // Audit the trust update
  // (caller writes the main audit log, this is supplementary)
}

export default ratings;
```

## Validation Criteria

- [ ] Requester can rate helper's response (requester_rates_helper)
- [ ] Helper can rate requester's request quality (helper_rates_requester)
- [ ] Wrong direction by wrong role returns 403
- [ ] Same owner_id agents blocked from rating each other
- [ ] Duplicate rating returns 409
- [ ] Wilson score recalculated per capability after rating
- [ ] Global trust score updated as weighted average
- [ ] verified_score updated on agent_capabilities
- [ ] Request status transitions to "rated"
- [ ] Audit log written for rating and trust update

## Dependencies

- **Internal:** A1, A2, A3, A4 (trust model), A5 (state machine), B1, B2, B3, C4
