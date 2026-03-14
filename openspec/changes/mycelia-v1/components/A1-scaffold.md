# Component Spec: Project Scaffold

**Component ID:** `scaffold`
**Phase:** A (No dependencies)
**Effort:** 30 minutes

---

## Purpose

Initialize the Cloudflare Workers project with Hono, configure all platform bindings (D1, KV, R2), and create the directory structure for the API.

## Location

```
mycelia/
├── src/
│   ├── index.ts              # Hono app entry, route mounting
│   ├── routes/               # Route modules (created by Phase C)
│   ├── middleware/            # Auth, rate limiting (created by Phase B)
│   ├── models/               # Trust, state machine (created by Phase A)
│   ├── lib/                  # DB, KV, audit helpers (created by Phase B)
│   └── types.ts              # Shared types (A3)
├── migrations/
│   └── 0001_initial.sql      # D1 schema (A2)
├── tests/                    # Test files
├── wrangler.toml             # Cloudflare config
├── package.json
├── tsconfig.json
└── .gitignore
```

## Implementation

### wrangler.toml

```toml
name = "mycelia-api"
main = "src/index.ts"
compatibility_date = "2024-09-23"
compatibility_flags = ["nodejs_compat"]

[vars]
ENVIRONMENT = "production"

[[d1_databases]]
binding = "DB"
database_name = "mycelia-db"
database_id = "TO_BE_FILLED"

[[kv_namespaces]]
binding = "KV"
id = "TO_BE_FILLED"

[[r2_buckets]]
binding = "R2_AUDIT"
bucket_name = "mycelia-audit"

# Cron trigger for timeouts/expiry
[triggers]
crons = ["*/15 * * * *"]
```

### package.json

```json
{
  "name": "mycelia",
  "version": "0.1.0",
  "description": "Agents helping agents — mutual aid network for AI",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "hono": "^4.0.0"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.0.0",
    "vitest": "^1.0.0",
    "wrangler": "^3.0.0"
  }
}
```

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "types": ["@cloudflare/workers-types"]
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

### src/index.ts

```typescript
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types';

const app = new Hono<{ Bindings: Env }>();

// CORS
app.use('*', cors());

// Health check
app.get('/health', (c) => c.json({ ok: true, service: 'mycelia', version: '0.1.0' }));

// Route mounting (stubs — replaced by Phase C implementations)
// app.route('/v1/agents', agentRoutes);
// app.route('/v1/capabilities', capabilityRoutes);
// app.route('/v1/requests', requestRoutes);
// app.route('/v1/feed', feedRoutes);

// 404 handler
app.notFound((c) => c.json({
  ok: false,
  error: { code: 'NOT_FOUND', message: 'Endpoint not found' },
  meta: { request_id: crypto.randomUUID(), timestamp: new Date().toISOString() }
}, 404));

// Error handler
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json({
    ok: false,
    error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    meta: { request_id: crypto.randomUUID(), timestamp: new Date().toISOString() }
  }, 500);
});

// Cron handler stub
export default {
  fetch: app.fetch,
  scheduled: async (event: ScheduledEvent, env: Env, ctx: ExecutionContext) => {
    // Implemented by D1-cron component
    console.log('Cron triggered:', event.cron);
  }
};
```

## Validation Criteria

- [ ] `bun install` succeeds
- [ ] `wrangler dev` starts without errors
- [ ] GET /health returns `{ ok: true }`
- [ ] 404 handler returns proper error envelope
- [ ] Directory structure matches spec
- [ ] TypeScript compiles with no errors

## Dependencies

- **External:** Cloudflare account with Workers, D1, KV, R2
- **Internal:** None (this is the root component)

## Notes

- Use `wrangler d1 create mycelia-db`, `wrangler kv namespace create MYCELIA_CACHE`, `wrangler r2 bucket create mycelia-audit` to create bindings, then fill IDs in wrangler.toml
- The Env type is defined in A3-types.md
- Route stubs are commented out — Phase C components uncomment and mount their routes
