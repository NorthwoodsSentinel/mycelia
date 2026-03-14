# Component Spec: DB/KV/Audit Helpers

**Component ID:** `helpers`
**Phase:** B (Depends on A1)
**Effort:** 1 hour

---

## Purpose

Utility functions for D1 queries, KV caching, audit log writing, and common operations. Keeps route handlers clean by abstracting platform-specific boilerplate.

## Location

```
mycelia/src/lib/
├── db.ts      # D1 query helpers
├── kv.ts      # KV cache helpers
├── audit.ts   # Audit log writer
└── utils.ts   # UUID, timestamps, response helpers
```

## Implementation

### src/lib/utils.ts

```typescript
import type { ApiResponse, ApiError, ErrorCode } from '../types';

export function generateId(): string {
  return crypto.randomUUID();
}

export function now(): string {
  return new Date().toISOString();
}

export function success<T>(data: T): ApiResponse<T> {
  return {
    ok: true,
    data,
    meta: { request_id: generateId(), timestamp: now() }
  };
}

export function error(code: ErrorCode, message: string, status: number) {
  return {
    body: {
      ok: false,
      error: { code, message },
      meta: { request_id: generateId(), timestamp: now() }
    } as ApiError,
    status
  };
}
```

### src/lib/db.ts

```typescript
import type { PaginationParams, PaginatedResult } from '../types';

/**
 * Execute a paginated query against D1.
 */
export async function paginatedQuery<T>(
  db: D1Database,
  query: string,
  countQuery: string,
  params: unknown[],
  pagination: PaginationParams
): Promise<PaginatedResult<T>> {
  const offset = (pagination.page - 1) * pagination.limit;

  const [results, countResult] = await Promise.all([
    db.prepare(`${query} LIMIT ? OFFSET ?`)
      .bind(...params, pagination.limit, offset)
      .all<T>(),
    db.prepare(countQuery)
      .bind(...params)
      .first<{ count: number }>()
  ]);

  const total = countResult?.count ?? 0;

  return {
    items: results.results,
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      total,
      has_more: offset + pagination.limit < total
    }
  };
}

/**
 * Parse pagination params from query string with defaults.
 */
export function parsePagination(query: Record<string, string>): PaginationParams {
  return {
    page: Math.max(1, parseInt(query.page || '1', 10)),
    limit: Math.min(50, Math.max(1, parseInt(query.limit || '20', 10))),
    sort: query.sort
  };
}
```

### src/lib/kv.ts

```typescript
/**
 * Get cached value from KV, or compute and cache it.
 */
export async function kvCacheGet<T>(
  kv: KVNamespace,
  key: string,
  ttlSeconds: number,
  compute: () => Promise<T>
): Promise<T> {
  const cached = await kv.get(key, 'json');
  if (cached !== null) return cached as T;

  const value = await compute();
  await kv.put(key, JSON.stringify(value), { expirationTtl: ttlSeconds });
  return value;
}

/**
 * Invalidate a KV cache key.
 */
export async function kvInvalidate(kv: KVNamespace, key: string): Promise<void> {
  await kv.delete(key);
}

/**
 * Invalidate all capability matching caches.
 */
export async function kvInvalidateCapabilityCache(kv: KVNamespace, tags: string[]): Promise<void> {
  await Promise.all(tags.map((tag) => kv.delete(`match:${tag}`)));
}
```

### src/lib/audit.ts

```typescript
import type { AuditEventType, AuditTargetType } from '../types';
import { now } from './utils';

/**
 * Write an audit log entry to D1 and update the KV feed cache.
 */
export async function writeAuditLog(
  db: D1Database,
  kv: KVNamespace,
  entry: {
    event_type: AuditEventType;
    actor_id: string | null;
    target_type: AuditTargetType;
    target_id: string;
    detail?: Record<string, unknown>;
  }
): Promise<void> {
  const timestamp = now();

  await db.prepare(
    `INSERT INTO audit_log (event_type, actor_id, target_type, target_id, detail, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(
    entry.event_type,
    entry.actor_id,
    entry.target_type,
    entry.target_id,
    entry.detail ? JSON.stringify(entry.detail) : null,
    timestamp
  ).run();

  // Update the latest feed cache (best-effort, non-blocking)
  // Full feed update happens in the feed route handler
}
```

## Validation Criteria

- [ ] paginatedQuery returns correct page + total count
- [ ] parsePagination clamps values to valid ranges
- [ ] kvCacheGet returns cached value on hit
- [ ] kvCacheGet computes and stores on miss
- [ ] writeAuditLog inserts row in audit_log table
- [ ] success() and error() return correct envelopes
- [ ] generateId returns valid UUIDv4

## Dependencies

- **External:** Cloudflare D1, KV, R2 APIs
- **Internal:** A1 (scaffold), A3 (types)
