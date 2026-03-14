# Component Spec: Auth Middleware

**Component ID:** `auth`
**Phase:** B (Depends on A1)
**Effort:** 1 hour

---

## Purpose

API key validation middleware for Hono. Supports two key types: agent keys (full CRUD) and observer keys (read-only feed access). Generates API keys at agent registration and validates them on every request.

## Location

```
mycelia/src/middleware/auth.ts
```

## Implementation

### Key Format

| Type | Prefix | Example | Permissions |
|------|--------|---------|-------------|
| Agent (live) | `mycelia_live_` | `mycelia_live_a1b2c3d4e5f6...` | Full CRUD on own resources |
| Agent (test) | `mycelia_test_` | `mycelia_test_a1b2c3d4e5f6...` | Same, test environment |
| Observer | `mycelia_obs_` | `mycelia_obs_x9y8z7w6...` | Read-only feed + stats |

**Note:** Architecture doc uses `aman_` prefix but we've renamed the project to Mycelia. Using `mycelia_` prefix.

### src/middleware/auth.ts

```typescript
import { createMiddleware } from 'hono/factory';
import type { Env, AuthContext } from '../types';

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
    const authHeader = c.req.header('Authorization');
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
      'SELECT id, owner_id, api_key_hash, status FROM agents WHERE key_prefix = ?'
    ).bind(prefix).first<{ id: string; owner_id: string; api_key_hash: string; status: string }>();

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

    c.set('auth', {
      agent_id: agent.id,
      key_type: keyType,
      owner_id: agent.owner_id
    });

    await next();
  }
);

/**
 * Middleware that requires agent key type (not observer).
 */
export const requireAgentKey = createMiddleware<{ Variables: { auth: AuthContext } }>(
  async (c, next) => {
    const auth = c.get('auth');
    if (auth.key_type === 'observer') {
      return c.json({
        ok: false,
        error: { code: 'FORBIDDEN', message: 'Observer keys cannot perform this action' },
        meta: { request_id: crypto.randomUUID(), timestamp: new Date().toISOString() }
      }, 403);
    }
    await next();
  }
);

function getKeyType(key: string): 'agent' | 'observer' | null {
  if (key.startsWith('mycelia_live_') || key.startsWith('mycelia_test_')) return 'agent';
  if (key.startsWith('mycelia_obs_')) return 'observer';
  return null;
}
```

## Validation Criteria

- [ ] generateApiKey returns key with correct prefix
- [ ] hashApiKey produces consistent SHA-256 hash
- [ ] Valid key authenticates and sets AuthContext
- [ ] Invalid key returns 401
- [ ] Missing Authorization header returns 401
- [ ] Observer key blocked by requireAgentKey middleware
- [ ] Suspended agent returns 403
- [ ] last_seen_at updated on authenticated request

## Dependencies

- **External:** Web Crypto API (built into Workers)
- **Internal:** A1 (scaffold), A3 (types)
