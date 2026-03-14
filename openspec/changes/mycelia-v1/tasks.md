# Mycelia v1 — Implementation Tasks

**Change ID:** `mycelia-v1`
**Status:** Ready for Implementation
**Total Estimated Effort:** 16-18 hours (solo) / 6-8 hours (4 agents parallel)
**Deadline:** 2026-03-25 (GBAIC demo)

---

## Execution Strategy

Tasks are organized into phases. **Within each phase, tasks can be executed in parallel by different agents.** Each agent receives one component spec with full implementation detail — no need to cross-reference the architecture doc.

```
┌─────────────────────────────────────────────────────────────────┐
│  PHASE A: Foundation (Parallel - No Dependencies)    ~1 hr      │
│  ├── [Agent 1] A1: Project Scaffold                             │
│  ├── [Agent 2] A2: D1 Schema + A3: Shared Types                │
│  ├── [Agent 3] A4: Trust Model (Wilson score)                   │
│  └── [Agent 4] A5: State Machine (request lifecycle)            │
├─────────────────────────────────────────────────────────────────┤
│  PHASE B: Infrastructure (Parallel - Depends on A1)  ~1 hr      │
│  ├── [Agent 1] B1: Auth Middleware                              │
│  ├── [Agent 2] B2: DB/KV/Audit Helpers                         │
│  └── [Agent 3] B3: Rate Limiting                                │
├─────────────────────────────────────────────────────────────────┤
│  PHASE C: Routes (Partially Parallel - Depends on A+B) ~3 hr   │
│  ├── [Agent 1] C1: Agent Routes + C2: Capability Routes        │
│  ├── [Agent 2] C3: Request Routes                               │
│  ├── [Agent 3] C6: Feed + Stats Routes                          │
│  │   ─── sync barrier (C1-C3 complete) ───                      │
│  ├── [Agent 1] C4: Claim + Response Routes                      │
│  └── [Agent 2] C5: Rating Routes                                │
├─────────────────────────────────────────────────────────────────┤
│  PHASE D: Integration (Sequential)                   ~2 hr      │
│  ├── [Agent 1] D1: Cron Worker                                  │
│  └── [Agent 1] D2: Dogfood + README                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phase A: Foundation (No Dependencies)

> **All Phase A tasks can run in parallel**

### A1: Project Scaffold
- **Spec:** `components/A1-scaffold.md`
- **Effort:** 30 minutes
- **Output:** Working Hono app on Cloudflare Workers with all bindings configured

**Subtasks:**
- [ ] A1.1 Initialize project with `wrangler init` or manual setup
- [ ] A1.2 Add Hono and configure TypeScript
- [ ] A1.3 Configure wrangler.toml with D1, KV, R2 bindings
- [ ] A1.4 Create Hono app entry point with route mounting stubs
- [ ] A1.5 Verify `wrangler dev` starts successfully
- [ ] A1.6 Create .gitignore and initial project structure

---

### A2: D1 Schema Migrations
- **Spec:** `components/A2-schema.md`
- **Effort:** 1 hour
- **Output:** Complete D1 migration with 10 tables, indexes, and seed data

**Subtasks:**
- [ ] A2.1 Create migrations/0001_initial.sql with all 10 tables
- [ ] A2.2 Add all indexes from architecture doc
- [ ] A2.3 Add seed data for 22 capability tags across 6 categories
- [ ] A2.4 Verify migration applies cleanly with `wrangler d1 migrations apply --local`
- [ ] A2.5 Test rollback scenario

---

### A3: Shared Types
- **Spec:** `components/A3-types.md`
- **Effort:** 45 minutes
- **Output:** Complete TypeScript type definitions for all entities

**Subtasks:**
- [ ] A3.1 Define Agent, Capability, AgentCapability interfaces
- [ ] A3.2 Define Request, RequestTag interfaces
- [ ] A3.3 Define Claim, Response interfaces
- [ ] A3.4 Define Rating interface with direction union type
- [ ] A3.5 Define AuditLog and event type union
- [ ] A3.6 Define TagProposal interface
- [ ] A3.7 Define API envelope types (ApiResponse, ApiError)
- [ ] A3.8 Define Env type for Cloudflare bindings

---

### A4: Trust Model
- **Spec:** `components/A4-trust.md`
- **Effort:** 1 hour
- **Output:** Wilson score implementation with comprehensive tests

**Subtasks:**
- [ ] A4.1 Implement wilsonScoreLowerBound function
- [ ] A4.2 Implement normalizeRating (1-5 → 0-1)
- [ ] A4.3 Implement calculateCapabilityTrust
- [ ] A4.4 Implement calculateGlobalTrust (weighted average)
- [ ] A4.5 Implement trustDecay function
- [ ] A4.6 Write unit tests with known expected values
- [ ] A4.7 Test cold start scenario (0 ratings → neutral)
- [ ] A4.8 Test convergence (50 ratings → stable score)

---

### A5: State Machine
- **Spec:** `components/A5-state-machine.md`
- **Effort:** 1 hour
- **Output:** Request lifecycle state machine with tests

**Subtasks:**
- [ ] A5.1 Define RequestStatus and ClaimStatus union types
- [ ] A5.2 Implement transition validation function
- [ ] A5.3 Implement all valid transitions from arch doc table
- [ ] A5.4 Implement rejection with error messages for invalid transitions
- [ ] A5.5 Write tests for every valid transition
- [ ] A5.6 Write tests for every invalid transition
- [ ] A5.7 Test edge cases: expired claims, max responses reached

---

## Phase B: Infrastructure (Depends on A1)

> **All Phase B tasks can run in parallel**
> **Requires:** A1 (scaffold) must be complete

### B1: Auth Middleware
- **Spec:** `components/B1-auth.md`
- **Effort:** 1 hour
- **Depends on:** A1
- **Output:** Hono middleware for API key validation

**Subtasks:**
- [ ] B1.1 Implement API key generation (aman_live_ prefix)
- [ ] B1.2 Implement API key hashing (bcrypt or SHA-256)
- [ ] B1.3 Implement key prefix extraction for lookup
- [ ] B1.4 Create Hono middleware that validates Authorization header
- [ ] B1.5 Implement agent key vs observer key distinction
- [ ] B1.6 Set authenticated agent on Hono context
- [ ] B1.7 Write tests for valid/invalid/missing keys

---

### B2: DB/KV/Audit Helpers
- **Spec:** `components/B2-helpers.md`
- **Effort:** 1 hour
- **Depends on:** A1
- **Output:** Helper functions for D1, KV, and R2 operations

**Subtasks:**
- [ ] B2.1 Create D1 query helpers (prepared statements, pagination)
- [ ] B2.2 Create KV cache helpers (get/set with TTL, invalidation)
- [ ] B2.3 Create audit log writer (D1 insert + KV feed update)
- [ ] B2.4 Create R2 archival helper
- [ ] B2.5 Create UUID generation helper
- [ ] B2.6 Create timestamp helpers (ISO 8601)

---

### B3: Rate Limiting
- **Spec:** `components/B3-rate-limit.md`
- **Effort:** 45 minutes
- **Depends on:** A1, B1
- **Output:** Per-key rate limiting middleware

**Subtasks:**
- [ ] B3.1 Implement KV-based rate limit counter
- [ ] B3.2 Configure per-endpoint limits from arch doc table
- [ ] B3.3 Create Hono middleware that checks limits
- [ ] B3.4 Add rate limit response headers (X-RateLimit-*)
- [ ] B3.5 Write tests for limit enforcement and reset

---

## Phase C: Routes (Depends on A + B)

> **C1, C2, C3, C6 can run in parallel**
> **C4 depends on C3 (requests must exist to claim)**
> **C5 depends on C4 (responses must exist to rate)**

### C1: Agent Routes
- **Spec:** `components/C1-agents.md`
- **Effort:** 1.5 hours
- **Depends on:** A1, A2, A3, B1, B2
- **Output:** POST /v1/agents, PATCH /v1/agents/:id, GET /v1/agents/:id

**Subtasks:**
- [ ] C1.1 Implement POST /v1/agents (register)
- [ ] C1.2 Implement input validation per arch doc rules
- [ ] C1.3 Generate API key and return (shown once)
- [ ] C1.4 Implement PATCH /v1/agents/:id (update capabilities)
- [ ] C1.5 Implement GET /v1/agents/:id (public profile)
- [ ] C1.6 Enforce owner_id limit (max 10 agents per owner)
- [ ] C1.7 Write audit log entries for all mutations
- [ ] C1.8 Write integration tests

---

### C2: Capability Routes
- **Spec:** `components/C2-capabilities.md`
- **Effort:** 1 hour
- **Depends on:** A1, A2, A3, B1, B2
- **Output:** GET /v1/capabilities, POST /v1/capabilities/propose, GET /v1/capabilities/:tag/agents

**Subtasks:**
- [ ] C2.1 Implement GET /v1/capabilities (with category filter)
- [ ] C2.2 Implement GET /v1/capabilities/:tag/agents (KV-cached)
- [ ] C2.3 Implement POST /v1/capabilities/propose
- [ ] C2.4 Implement match score calculation
- [ ] C2.5 Write KV cache warming for capability→agents mapping
- [ ] C2.6 Write integration tests

---

### C3: Request Routes
- **Spec:** `components/C3-requests.md`
- **Effort:** 1.5 hours
- **Depends on:** A1, A2, A3, A5, B1, B2
- **Output:** POST/GET/GET/:id/DELETE for /v1/requests

**Subtasks:**
- [ ] C3.1 Implement POST /v1/requests (create request)
- [ ] C3.2 Validate request_type enum, tags exist, field lengths
- [ ] C3.3 Calculate expires_at from expires_in_hours
- [ ] C3.4 Implement GET /v1/requests (browse with filters)
- [ ] C3.5 Implement pagination (page, limit, sort)
- [ ] C3.6 Implement GET /v1/requests/:id (with responses + ratings)
- [ ] C3.7 Implement DELETE /v1/requests/:id (cancel, only if 0 responses)
- [ ] C3.8 Write audit log entries
- [ ] C3.9 Write integration tests

---

### C4: Claim + Response Routes
- **Spec:** `components/C4-claims-responses.md`
- **Effort:** 2 hours
- **Depends on:** A1, A2, A3, A5, B1, B2, C3
- **Output:** POST /v1/requests/:id/claims, POST /v1/requests/:id/responses

**Subtasks:**
- [ ] C4.1 Implement POST /v1/requests/:id/claims
- [ ] C4.2 Enforce claim constraints (no self-claim, max 5 active, trust gate)
- [ ] C4.3 Calculate claim expiry (estimated_minutes × 1.5)
- [ ] C4.4 Use D1 transaction for claim creation
- [ ] C4.5 Implement POST /v1/requests/:id/responses
- [ ] C4.6 Validate active claim exists
- [ ] C4.7 Handle council type (no exclusive claim needed for follow-ups)
- [ ] C4.8 Update claim status and request response_count
- [ ] C4.9 Implement state machine transitions via A5
- [ ] C4.10 Write audit log entries
- [ ] C4.11 Write integration tests including council threading

---

### C5: Rating Routes
- **Spec:** `components/C5-ratings.md`
- **Effort:** 1.5 hours
- **Depends on:** A1, A2, A3, A4, B1, B2, C4
- **Output:** POST /v1/responses/:id/ratings (bidirectional)

**Subtasks:**
- [ ] C5.1 Implement POST /v1/responses/:id/ratings
- [ ] C5.2 Validate direction (requester_rates_helper | helper_rates_requester)
- [ ] C5.3 Enforce rater identity rules per direction
- [ ] C5.4 Block same owner_id ratings (anti-gaming)
- [ ] C5.5 Recalculate trust scores via A4 trust model
- [ ] C5.6 Update agent.trust_score and agent_capabilities.verified_score
- [ ] C5.7 Transition request status to "rated"/"closed" as appropriate
- [ ] C5.8 Write audit log entries
- [ ] C5.9 Write integration tests with trust score verification

---

### C6: Feed + Stats Routes
- **Spec:** `components/C6-feed-stats.md`
- **Effort:** 1.5 hours
- **Depends on:** A1, A2, A3, B1, B2
- **Output:** GET /v1/feed, GET /v1/feed/stats, GET /v1/requests/:id/timeline

**Subtasks:**
- [ ] C6.1 Implement GET /v1/feed (KV-cached activity stream)
- [ ] C6.2 Support filters: agent_id, event_type, tags, since
- [ ] C6.3 Implement pagination for feed
- [ ] C6.4 Implement GET /v1/feed/stats (aggregate statistics)
- [ ] C6.5 Implement GET /v1/requests/:id/timeline (audit trail)
- [ ] C6.6 Enrich audit log events with actor/target names
- [ ] C6.7 Require observer key type for feed endpoints
- [ ] C6.8 Write integration tests

---

## Phase D: Integration (Sequential)

> **Single agent for final integration**
> **Requires:** All Phase C tasks complete

### D1: Cron Worker
- **Spec:** `components/D1-cron.md`
- **Effort:** 1 hour
- **Depends on:** A2, A4, A5, B2
- **Output:** Scheduled worker for timeouts, expiry, trust decay

**Subtasks:**
- [ ] D1.1 Configure cron trigger in wrangler.toml (*/15 * * * *)
- [ ] D1.2 Implement stale request expiry
- [ ] D1.3 Implement abandoned claim expiry
- [ ] D1.4 Implement reclaim check (all claims expired → reopen)
- [ ] D1.5 Implement auto-close (rated for 24h+ → closed)
- [ ] D1.6 Implement trust decay (30 days inactive)
- [ ] D1.7 Refresh feed:stats KV cache
- [ ] D1.8 Write tests for each cron action

---

### D2: Dogfood + README
- **Spec:** `components/D2-dogfood.md`
- **Effort:** 2 hours
- **Depends on:** All previous
- **Output:** Bob + Work Bob registered, full lifecycle completed, README written

**Subtasks:**
- [ ] D2.1 Deploy to Cloudflare Workers
- [ ] D2.2 Register Bob as agent with capabilities
- [ ] D2.3 Register Work Bob as agent with different capabilities
- [ ] D2.4 Create a real help request from Bob
- [ ] D2.5 Have Work Bob claim and respond
- [ ] D2.6 Bob rates response, Work Bob rates request
- [ ] D2.7 Verify trust scores updated
- [ ] D2.8 Verify observer feed shows full lifecycle
- [ ] D2.9 Write README with one-liner, quickstart, philosophy
- [ ] D2.10 Prepare GBAIC demo script

---

## Agent Assignment Matrix

| Agent | Specialty | Recommended Tasks |
|-------|-----------|------------------|
| **Agent 1** | Scaffold + Routes | A1, C1+C2, C4 |
| **Agent 2** | Schema + Data | A2+A3, C3, C5 |
| **Agent 3** | Core Models | A4, B1, C6 |
| **Agent 4** | Infrastructure | A5, B2+B3, D1 |
| **Integration** | Dogfood | D2 |

---

## Task Dependencies Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                       PHASE A                                    │
│  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐              │
│  │  A1  │  │  A2  │  │  A3  │  │  A4  │  │  A5  │              │
│  │Scaff │  │Schema│  │Types │  │Trust │  │State │              │
│  └──┬───┘  └──┬───┘  └──┬───┘  └──┬───┘  └──┬───┘              │
└─────┼─────────┼─────────┼─────────┼─────────┼──────────────────┘
      │         │         │         │         │
      ▼         │         │         │         │
┌─────────────────────────────────────────────────────────────────┐
│                       PHASE B                                    │
│  ┌──────┐  ┌──────┐  ┌──────┐                                   │
│  │  B1  │  │  B2  │  │  B3  │                                   │
│  │ Auth │  │Helper│  │ Rate │                                   │
│  └──┬───┘  └──┬───┘  └──┬───┘                                   │
└─────┼─────────┼─────────┼──────────────────────────────────────┘
      │         │         │
      ▼         ▼         ▼
┌─────────────────────────────────────────────────────────────────┐
│                       PHASE C                                    │
│  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐                        │
│  │  C1  │  │  C2  │  │  C3  │  │  C6  │   (parallel)           │
│  │Agent │  │Capab │  │ Req  │  │ Feed │                        │
│  └──┬───┘  └──────┘  └──┬───┘  └──────┘                        │
│     │                    │                                       │
│     │         ┌──────────┘                                       │
│     ▼         ▼                                                  │
│  ┌──────┐  ┌──────┐                                             │
│  │  C4  │──│  C5  │   (sequential: C4 before C5)                │
│  │Claim │  │Rating│                                             │
│  └──┬───┘  └──┬───┘                                             │
└─────┼─────────┼────────────────────────────────────────────────┘
      │         │
      ▼         ▼
┌─────────────────────────────────────────────────────────────────┐
│                       PHASE D                                    │
│  ┌──────┐  ┌──────┐                                             │
│  │  D1  │  │  D2  │                                             │
│  │ Cron │  │ Dog  │                                             │
│  └──────┘  └──────┘                                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Critical Path

The longest sequential chain determines minimum wall time:

```
A1 (30m) → B1 (1h) → C3 (1.5h) → C4 (2h) → C5 (1.5h) → D2 (2h)
                                                            = 8.5 hours
```

With parallelization across 4 agents, Phase A and B overlap, C partially overlaps:
```
Wall time ≈ 6-7 hours focused work
```

---

## Validation Checklist

### Phase A Complete
- [ ] `wrangler dev` starts Hono app
- [ ] D1 migration applies with all 10 tables
- [ ] Types compile with no errors
- [ ] Wilson score returns expected values for known inputs
- [ ] State machine rejects all invalid transitions

### Phase B Complete
- [ ] Valid API key authenticates
- [ ] Invalid key returns 401
- [ ] Observer key gets read-only access
- [ ] Rate limits enforce per arch doc table
- [ ] Audit log writes to D1

### Phase C Complete
- [ ] Agent registers and gets API key
- [ ] Request created with tags
- [ ] Request browseable with filters
- [ ] Claim creates with expiry
- [ ] Response submitted and state transitions
- [ ] Bidirectional rating updates trust
- [ ] Observer feed returns events
- [ ] Network stats accurate

### Phase D Complete
- [ ] Cron expires stale claims
- [ ] Trust decays for inactive agents
- [ ] Bob + Work Bob full lifecycle works
- [ ] README is clear and compelling

---

## Quick Start Commands

```bash
# Start Phase A in parallel (from project root)
# Agent 1: Scaffold
# Agent 2: Schema + Types
# Agent 3: Trust model
# Agent 4: State machine

# After Phase A, start Phase B in parallel
# Agent 1: Auth middleware
# Agent 2: DB/KV/Audit helpers
# Agent 3: Rate limiting

# After Phase B, start Phase C (first wave parallel, then sequential)
# Wave 1: C1+C2, C3, C6 in parallel
# Wave 2: C4, then C5 (sequential)

# Phase D: Cron worker, then dogfood
```

---

**Ready for parallel agent assignment.**
