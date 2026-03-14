# Component Spec: Rate Limiting

**Component ID:** `rate-limit`
**Phase:** B (Depends on A1, B1)
**Effort:** 45 minutes

---

## Purpose

Per-API-key rate limiting using KV counters. Different limits for different endpoint categories and key types.

## Location

```
mycelia/src/middleware/rate-limit.ts
```

## Implementation

### Rate Limit Configuration

| Endpoint Category | Limit | Window | Key Type |
|-------------------|-------|--------|----------|
| Agent registration | 5 | per hour | agent |
| Request creation | 20 | per hour | agent |
| Claim creation | 30 | per hour | agent |
| Response submission | 20 | per hour | agent |
| Rating submission | 30 | per hour | agent |
| Browse/read | 120 | per minute | agent |
| Observer feed | 60 | per minute | observer |

### src/middleware/rate-limit.ts

```typescript
import { createMiddleware } from 'hono/factory';
import type { Env, AuthContext } from '../types';

interface RateLimitConfig {
  limit: number;
  windowSeconds: number;
}

const RATE_LIMITS: Record<string, RateLimitConfig> = {
  'agent.register': { limit: 5, windowSeconds: 3600 },
  'request.create': { limit: 20, windowSeconds: 3600 },
  'claim.create': { limit: 30, windowSeconds: 3600 },
  'response.create': { limit: 20, windowSeconds: 3600 },
  'rating.create': { limit: 30, windowSeconds: 3600 },
  'read': { limit: 120, windowSeconds: 60 },
  'feed': { limit: 60, windowSeconds: 60 },
};

export function rateLimit(category: string) {
  const config = RATE_LIMITS[category];
  if (!config) throw new Error(`Unknown rate limit category: ${category}`);

  return createMiddleware<{ Bindings: Env; Variables: { auth: AuthContext } }>(
    async (c, next) => {
      const auth = c.get('auth');
      const key = `ratelimit:${auth.agent_id}:${category}`;
      const windowKey = Math.floor(Date.now() / (config.windowSeconds * 1000));
      const kvKey = `${key}:${windowKey}`;

      const current = parseInt(await c.env.KV.get(kvKey) || '0', 10);

      if (current >= config.limit) {
        const resetTime = (windowKey + 1) * config.windowSeconds;
        c.header('X-RateLimit-Limit', String(config.limit));
        c.header('X-RateLimit-Remaining', '0');
        c.header('X-RateLimit-Reset', String(resetTime));

        return c.json({
          ok: false,
          error: { code: 'RATE_LIMITED', message: `Rate limit exceeded. Try again later.` },
          meta: { request_id: crypto.randomUUID(), timestamp: new Date().toISOString() }
        }, 429);
      }

      // Increment counter
      await c.env.KV.put(kvKey, String(current + 1), {
        expirationTtl: config.windowSeconds
      });

      c.header('X-RateLimit-Limit', String(config.limit));
      c.header('X-RateLimit-Remaining', String(config.limit - current - 1));

      await next();
    }
  );
}
```

## Validation Criteria

- [ ] Rate limit enforced at configured threshold
- [ ] Counter resets after window expires
- [ ] X-RateLimit-* headers present on all responses
- [ ] 429 response returned when limit exceeded
- [ ] Different categories have different limits
- [ ] KV counter TTL matches window duration

## Dependencies

- **External:** Cloudflare KV
- **Internal:** A1 (scaffold), A3 (types), B1 (auth — needs AuthContext)
