---
project: mycelia
last_updated: 2026-03-13T14:00:00-06:00
---

# Project Tasks

This file tracks tasks for Mycelia in a format compatible with PAI's Task tools.

## Integration with PAI v2.4 Task Tools

**To load these tasks into your current session:**
```
load tasks from tasks.md
```

**To save session tasks back to this file:**
```
sync tasks to tasks.md
```

---

## In Progress

(Tasks currently being worked on)

---

## Pending

### Finalize domain
- **Status**: pending
- **Active Form**: Finalizing domain choice
- **Priority**: medium
- **Notes**: Research done. Top candidates: mycelia.community, mycelia.help, getmycelia.com. Wally to decide.

### Create GitHub repo
- **Status**: pending
- **Active Form**: Creating GitHub repo on personal account
- **Priority**: high
- **Dependencies**: Finalize domain
- **Notes**: Personal GitHub account. Name: mycelia or getmycelia.

### Scaffold Cloudflare Worker with Hono
- **Status**: pending
- **Active Form**: Scaffolding Cloudflare Worker project
- **Priority**: high
- **Dependencies**: Create GitHub repo
- **Notes**: `wrangler init`, add Hono, configure D1/KV/R2 bindings in wrangler.toml.

### D1 schema migrations
- **Status**: pending
- **Active Form**: Creating D1 schema migrations
- **Priority**: high
- **Dependencies**: Scaffold Cloudflare Worker with Hono
- **Notes**: 9 tables + tag_proposals table. Schema defined in architecture doc v1.1. Wilson score fields, bidirectional trust, council threading.

### Auth middleware
- **Status**: pending
- **Active Form**: Implementing auth middleware
- **Priority**: high
- **Dependencies**: Scaffold Cloudflare Worker with Hono
- **Notes**: Two API key types — agent (full CRUD) and observer (read-only). API key generation on agent registration.

### Agent registration endpoint
- **Status**: pending
- **Active Form**: Building agent registration endpoint
- **Priority**: high
- **Dependencies**: D1 schema migrations, Auth middleware
- **Notes**: POST /v1/agents — register agent, return API key, declare capabilities. PATCH /v1/agents/{id} for updates.

### Request CRUD
- **Status**: pending
- **Active Form**: Implementing request creation and browsing
- **Priority**: high
- **Dependencies**: Agent registration endpoint
- **Notes**: POST /v1/requests, GET /v1/requests (with tag filtering). Request types: review, validation, second-opinion, council, fact-check, summarize, translate, debug.

### Claim + response with state machine
- **Status**: pending
- **Active Form**: Building claim and response system with state machine
- **Priority**: high
- **Dependencies**: Request CRUD
- **Notes**: Claims with estimated_minutes and note. Dynamic expiry = estimate × 1.5 buffer. State transitions: open → claimed → responded → rated → closed. Council threading via parent_response_id.

### Rating + trust recalculation
- **Status**: pending
- **Active Form**: Implementing bidirectional rating and trust scoring
- **Priority**: high
- **Dependencies**: Claim + response with state machine
- **Notes**: Bidirectional: requester rates helper, helper rates requester. Wilson score lower bound. Per-capability trust. trust_score_as_helper, trust_score_as_requester, trust_score (global weighted).

### Capability matching
- **Status**: pending
- **Active Form**: Building capability matching and tag system
- **Priority**: high
- **Dependencies**: Agent registration endpoint
- **Notes**: Tag-based set intersection, KV-cached. GET /v1/capabilities, GET /v1/capabilities/{tag}/agents. POST /v1/capabilities/propose for new tags (admin approval v1).

### Observer feed with KV caching
- **Status**: pending
- **Active Form**: Building observer activity feed
- **Priority**: medium
- **Dependencies**: Rating + trust recalculation
- **Notes**: GET /v1/feed — read-only activity stream. KV-cached with TTL. Human-observable — transparency is the point.

### Stats endpoint
- **Status**: pending
- **Active Form**: Implementing network statistics endpoint
- **Priority**: medium
- **Dependencies**: Observer feed with KV caching
- **Notes**: GET /v1/feed/stats — active agents, open requests, response rates, trust distribution.

### Rate limiting
- **Status**: pending
- **Active Form**: Adding rate limiting middleware
- **Priority**: medium
- **Dependencies**: Auth middleware
- **Notes**: Per-API-key rate limiting. Different limits for agent vs observer keys.

### Cron worker for timeouts and expiry
- **Status**: pending
- **Active Form**: Building cron worker for claim timeouts and request expiry
- **Priority**: medium
- **Dependencies**: Claim + response with state machine
- **Notes**: Expire stale claims (based on estimated_minutes × 1.5). Close expired requests (ttl_hours). Trust decay for inactive agents.

### Dogfood — register Bob and Work Bob
- **Status**: pending
- **Active Form**: Dogfooding with Bob and Work Bob as first agents
- **Priority**: high
- **Dependencies**: Rating + trust recalculation, Observer feed with KV caching
- **Notes**: Register Bob (PAI) and Work Bob as first two agents. Create a real request, respond, rate. Verify full lifecycle.

### Write README
- **Status**: pending
- **Active Form**: Writing public README
- **Priority**: high
- **Dependencies**: Dogfood — register Bob and Work Bob
- **Notes**: One-liner, why this exists, 5-minute quickstart, philosophical context (dual-layer messaging). This is the thing that gets GitHub stars.

### Cognitive Loop #1 — "Why I'm Building Mutual Aid for AI Agents"
- **Status**: pending
- **Active Form**: Writing first Cognitive Loop post
- **Priority**: medium
- **Notes**: Draft exists at ~/projects/TSFUR/content/drafts/cognitive-loop-01-why-mycelium.md. Needs Wally's edit pass + name update to Mycelia.

### Cognitive Loop #2 — Trust Model and Cooperation
- **Status**: pending
- **Active Form**: Writing trust model and cooperation philosophy post
- **Priority**: low
- **Dependencies**: Cognitive Loop #1
- **Notes**: Wilson score, bidirectional trust, why mutual aid not marketplace. Post around/after GBAIC.

### Add project page to wallykroeker.com
- **Status**: pending
- **Active Form**: Adding Mycelia project page to wallykroeker.com
- **Priority**: medium
- **Dependencies**: Cognitive Loop #1
- **Notes**: Source of truth for the project. All roads lead to wallykroeker.com.

### LinkedIn post #1 — announce the project
- **Status**: pending
- **Active Form**: Writing LinkedIn announcement post
- **Priority**: medium
- **Dependencies**: Add project page to wallykroeker.com
- **Notes**: Short version for GBAIC/professional audience. Points to wallykroeker.com.

### Prep GBAIC Meeting #3 demo
- **Status**: pending
- **Active Form**: Preparing GBAIC Meeting #3 demo and discussion
- **Priority**: high
- **Dependencies**: Dogfood — register Bob and Work Bob
- **Notes**: March 25 deadline. Working demo of Bob and Work Bob interacting. Discussion topic: "here's what I built, here's why it matters for anyone running AI agents."

### LinkedIn post #2 — GBAIC recap
- **Status**: pending
- **Active Form**: Writing GBAIC recap LinkedIn post
- **Priority**: low
- **Dependencies**: Prep GBAIC Meeting #3 demo
- **Notes**: After March 25. Recap the discussion, what resonated.

---

## Completed

### Lock project name
- **Status**: completed
- **Active Form**: Locking project name
- **Completed**: 2026-03-13
- **Notes**: Mycelia — agents helping agents. Personal connection to Wally's mushroom trip in the woods.

### Review architecture doc
- **Status**: completed
- **Active Form**: Reviewing architecture document
- **Completed**: 2026-03-13
- **Notes**: Updated to v1.1 with 5 changes: tag proposals, estimate-based claim expiry, bidirectional ratings, council request type, expanded request types.

### Bootstrap project folder
- **Status**: completed
- **Active Form**: Bootstrapping project folder structure
- **Completed**: 2026-03-13
- **Notes**: Created ~/projects/mycelia with CLAUDE.md and tasks.md using ProjectManagement skill.

---

## Deferred

(None)

---

## Notes

**Build sprint estimate:** ~12 hours (weekend build)
- Saturday morning (3h): Foundation — scaffold, migrations, auth, agent registration
- Saturday afternoon (4h): Core API — requests, claims, responses, ratings, capabilities
- Sunday morning (3h): Observability — feed, stats, cron, rate limiting
- Sunday afternoon (2h): Dogfood — Bob + Work Bob, verify, write README

**GBAIC deadline:** March 25 (12 days from now)

**Architecture doc:** `~/projects/TSFUR/agent-mutual-aid-architecture.md` (v1.1)
