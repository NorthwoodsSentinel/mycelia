// src/lib/scope-claim.ts
// Scope-claim envelope types and validation for mycelia v1.1 + Service Bindings.
// Companion spec: docs/specs/MYCELIA_ENVELOPE.md
// F1 cheap-fix lineage: from the combined redteam (project-fleet-access-redteam-combined-20260518).

/**
 * Tier hierarchy (top is most restrictive).
 *
 * sealed   — Principal + per-item consent only. NEVER over mycelia. Handler-discipline-enforced.
 * personal — Principal + named fleet. Work-internal. In-flight private decisions.
 * cohort   — fleet-internal doctrine, technical specs, project memories.
 * public   — published essays, doctrine docs, pack source, anything externalized.
 *
 * Names changed in v1.1.1 (2026-06-14) from the original `intimate/sacred` defaults
 * after community-adoption feedback (religious / governance connotations). Operators
 * who prefer different display labels can alias via TIER_ALIASES_JSON env var
 * (see docs/specs/MYCELIA_ENVELOPE.md § Tier aliasing).
 */
export type Tier = 'public' | 'cohort' | 'personal' | 'sealed';

const TIER_RANK: Record<Tier, number> = {
  public: 0,
  cohort: 1,
  personal: 2,
  sealed: 3,
};

const TIER_VALUES: readonly Tier[] = ['public', 'cohort', 'personal', 'sealed'] as const;

/**
 * Parse a TIER_ALIASES_JSON env var into a normalized alias map.
 *
 * Format: JSON object mapping operator-chosen labels to canonical tier names.
 *   { "intimate": "personal", "sacred": "sealed" }
 *
 * Used to accept legacy or operator-preferred labels on input while keeping
 * internal logic on the canonical names. Invalid entries (unknown canonical
 * target, non-string keys, etc.) are silently dropped to keep the system
 * fail-open on misconfiguration rather than blocking requests.
 */
export function parseTierAliases(rawJson: string | undefined | null): Record<string, Tier> {
  if (!rawJson) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return {};
  }
  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const out: Record<string, Tier> = {};
  for (const [alias, canonical] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof alias !== 'string' || alias.length === 0) continue;
    if (typeof canonical !== 'string') continue;
    if (!TIER_VALUES.includes(canonical as Tier)) continue;
    out[alias] = canonical as Tier;
  }
  return out;
}

/**
 * Normalize a tier-shaped input to the canonical name.
 * - If `input` is already a canonical tier, return it.
 * - If `input` matches a key in `aliases`, return the aliased canonical.
 * - Otherwise return null (caller treats as INVALID_TIER).
 */
export function normalizeTier(input: unknown, aliases: Record<string, Tier> = {}): Tier | null {
  if (typeof input !== 'string') return null;
  if (TIER_VALUES.includes(input as Tier)) return input as Tier;
  if (input in aliases) return aliases[input];
  return null;
}

/**
 * The structured envelope every v1.1 mycelia request must carry.
 * Spec: docs/specs/MYCELIA_ENVELOPE.md
 */
export interface ScopeClaim {
  /** Human-readable agent name (e.g., "leroy", "margin"). Logs only, not auth. */
  requester: string;

  /** Requesting agent's UUID. MUST match bearer token's resolved agent. */
  agent_id: string;

  /** Requester's own clearance tier. */
  tier: Tier;

  /**
   * Maximum tier of content the requester wants surfaced in responses.
   * MUST be <= tier. Allows deliberately asking for lower-tier responses
   * when the result will be shared more widely than the requester's clearance.
   */
  ask_max_tier: Tier;

  /** ISO-8601 timestamp when the claim was constructed. >1h old = stale. */
  ts: string;

  /**
   * Reserved for future signed-claim support. When present, will be
   * Ed25519 signature over (requester|agent_id|tier|ask_max_tier|ts)
   * by the agent's instance key. Spec'd, not yet enforced.
   */
  signature?: string;
}

export type ValidationResult =
  | { ok: true; claim: ScopeClaim }
  | { ok: false; code: ScopeClaimErrorCode; message: string };

export type ScopeClaimErrorCode =
  | 'SCOPE_CLAIM_REQUIRED'
  | 'SCOPE_CLAIM_MALFORMED'
  | 'INVALID_TIER'
  | 'ASK_EXCEEDS_TIER'
  | 'IDENTITY_MISMATCH'
  | 'STALE_CLAIM'
  | 'INVALID_SIGNATURE';

/** Maximum age of a scope_claim.ts before it's considered stale. */
const STALE_CLAIM_MS = 60 * 60 * 1000; // 1 hour

/**
 * Validate a raw scope_claim object against the v1.1 contract.
 *
 * @param raw   The parsed JSON object (from request body).
 * @param bearerAgentId  The agent_id resolved from the bearer token (auth layer).
 *                       Pass null if you want to skip identity-mismatch check
 *                       (e.g. testing).
 * @param now   Unix ms timestamp for "now"; defaults to Date.now(). Injectable for tests.
 * @param tierAliases  Optional map of operator-chosen labels → canonical tiers. See parseTierAliases.
 */
export function validateScopeClaim(
  raw: unknown,
  bearerAgentId: string | null,
  now: number = Date.now(),
  tierAliases: Record<string, Tier> = {},
): ValidationResult {
  if (raw == null) {
    return {
      ok: false,
      code: 'SCOPE_CLAIM_REQUIRED',
      message: 'scope_claim is required in v1.1; see docs/specs/MYCELIA_ENVELOPE.md',
    };
  }

  if (typeof raw !== 'object') {
    return {
      ok: false,
      code: 'SCOPE_CLAIM_MALFORMED',
      message: 'scope_claim must be a JSON object',
    };
  }

  const c = raw as Partial<ScopeClaim> & { tier?: unknown; ask_max_tier?: unknown };

  if (typeof c.requester !== 'string' || c.requester.length === 0) {
    return { ok: false, code: 'SCOPE_CLAIM_MALFORMED', message: 'scope_claim.requester must be a non-empty string' };
  }
  if (typeof c.agent_id !== 'string' || c.agent_id.length === 0) {
    return { ok: false, code: 'SCOPE_CLAIM_MALFORMED', message: 'scope_claim.agent_id must be a non-empty string' };
  }

  const normalizedTier = normalizeTier(c.tier, tierAliases);
  if (normalizedTier === null) {
    return { ok: false, code: 'INVALID_TIER', message: `scope_claim.tier must be one of ${TIER_VALUES.join(', ')}` };
  }
  const normalizedAsk = normalizeTier(c.ask_max_tier, tierAliases);
  if (normalizedAsk === null) {
    return { ok: false, code: 'INVALID_TIER', message: `scope_claim.ask_max_tier must be one of ${TIER_VALUES.join(', ')}` };
  }

  if (typeof c.ts !== 'string' || c.ts.length === 0) {
    return { ok: false, code: 'SCOPE_CLAIM_MALFORMED', message: 'scope_claim.ts must be an ISO-8601 timestamp string' };
  }

  // Identity match
  if (bearerAgentId != null && c.agent_id !== bearerAgentId) {
    return {
      ok: false,
      code: 'IDENTITY_MISMATCH',
      message: `scope_claim.agent_id (${c.agent_id}) does not match bearer token's agent (${bearerAgentId})`,
    };
  }

  // ask_max_tier must be <= tier
  if (TIER_RANK[normalizedAsk] > TIER_RANK[normalizedTier]) {
    return {
      ok: false,
      code: 'ASK_EXCEEDS_TIER',
      message: `scope_claim.ask_max_tier (${normalizedAsk}) cannot exceed scope_claim.tier (${normalizedTier})`,
    };
  }

  // Stale check
  const claimTime = Date.parse(c.ts);
  if (isNaN(claimTime)) {
    return { ok: false, code: 'SCOPE_CLAIM_MALFORMED', message: 'scope_claim.ts could not be parsed as a date' };
  }
  if (now - claimTime > STALE_CLAIM_MS) {
    return {
      ok: false,
      code: 'STALE_CLAIM',
      message: `scope_claim.ts is more than 1 hour old (${Math.round((now - claimTime) / 60000)} min); replay protection rejected this claim`,
    };
  }

  return {
    ok: true,
    claim: {
      requester: c.requester,
      agent_id: c.agent_id,
      tier: normalizedTier,
      ask_max_tier: normalizedAsk,
      ts: c.ts,
      signature: typeof c.signature === 'string' ? c.signature : undefined,
    },
  };
}

/**
 * Check whether a holder of `holderTier` may access content classified as `contentTier`.
 * Read rule: tier X may read content at tier X and below.
 */
export function permits(holderTier: Tier, contentTier: Tier): boolean {
  return TIER_RANK[holderTier] >= TIER_RANK[contentTier];
}

/**
 * Compare two tiers. Returns negative if a < b, 0 if equal, positive if a > b.
 */
export function compareTiers(a: Tier, b: Tier): number {
  return TIER_RANK[a] - TIER_RANK[b];
}

/**
 * Sealed-tier content NEVER traverses mycelia (handler discipline rule).
 * Helper to make the check explicit at call sites.
 */
export function refusalRequiredForMycelia(contentTier: Tier): boolean {
  return contentTier === 'sealed';
}

/**
 * Construct a fresh ScopeClaim. Convenience for clients.
 */
export function buildScopeClaim(args: {
  requesterName: string;
  agentId: string;
  tier: Tier;
  askMaxTier?: Tier; // defaults to tier (ask for the max you hold)
}): ScopeClaim {
  return {
    requester: args.requesterName,
    agent_id: args.agentId,
    tier: args.tier,
    ask_max_tier: args.askMaxTier ?? args.tier,
    ts: new Date().toISOString(),
  };
}
