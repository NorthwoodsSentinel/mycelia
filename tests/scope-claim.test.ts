// tests/scope-claim.test.ts
// Tests for the v1.1 scope-claim validator.

import { describe, it, expect } from 'vitest';
import {
  validateScopeClaim,
  permits,
  compareTiers,
  refusalRequiredForMycelia,
  buildScopeClaim,
  parseTierAliases,
  normalizeTier,
} from '../src/lib/scope-claim';

const NOW = Date.parse('2026-05-18T18:00:00Z');
const FRESH_TS = '2026-05-18T17:30:00Z'; // 30 min before NOW
const STALE_TS = '2026-05-18T16:30:00Z'; // 90 min before NOW (stale)

describe('validateScopeClaim', () => {
  const validClaim = {
    requester: 'leroy',
    agent_id: 'pai-leroy-mn4ol0k6',
    tier: 'cohort',
    ask_max_tier: 'cohort',
    ts: FRESH_TS,
  };

  it('accepts a valid claim', () => {
    const r = validateScopeClaim(validClaim, 'pai-leroy-mn4ol0k6', NOW);
    expect(r.ok).toBe(true);
  });

  it('rejects null', () => {
    const r = validateScopeClaim(null, 'pai-leroy-mn4ol0k6', NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('SCOPE_CLAIM_REQUIRED');
  });

  it('rejects non-object', () => {
    const r = validateScopeClaim('not-an-object', 'pai-leroy-mn4ol0k6', NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('SCOPE_CLAIM_MALFORMED');
  });

  it('rejects missing requester', () => {
    const r = validateScopeClaim({ ...validClaim, requester: '' }, 'pai-leroy-mn4ol0k6', NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('SCOPE_CLAIM_MALFORMED');
  });

  it('rejects invalid tier', () => {
    const r = validateScopeClaim({ ...validClaim, tier: 'classified' }, 'pai-leroy-mn4ol0k6', NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('INVALID_TIER');
  });

  it('rejects ask_max_tier > tier', () => {
    const r = validateScopeClaim(
      { ...validClaim, tier: 'public', ask_max_tier: 'sealed' },
      'pai-leroy-mn4ol0k6',
      NOW,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('ASK_EXCEEDS_TIER');
  });

  it('allows ask_max_tier < tier', () => {
    const r = validateScopeClaim(
      { ...validClaim, tier: 'sealed', ask_max_tier: 'public' },
      'pai-leroy-mn4ol0k6',
      NOW,
    );
    expect(r.ok).toBe(true);
  });

  it('rejects identity mismatch', () => {
    const r = validateScopeClaim(validClaim, 'pai-someone-else', NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('IDENTITY_MISMATCH');
  });

  it('skips identity check when bearerAgentId is null', () => {
    const r = validateScopeClaim(validClaim, null, NOW);
    expect(r.ok).toBe(true);
  });

  it('rejects stale ts (>1h old)', () => {
    const r = validateScopeClaim({ ...validClaim, ts: STALE_TS }, 'pai-leroy-mn4ol0k6', NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('STALE_CLAIM');
  });

  it('rejects unparseable ts', () => {
    const r = validateScopeClaim({ ...validClaim, ts: 'not-a-date' }, 'pai-leroy-mn4ol0k6', NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('SCOPE_CLAIM_MALFORMED');
  });

  it('preserves optional signature field', () => {
    const r = validateScopeClaim(
      { ...validClaim, signature: 'ed25519:abcdef' },
      'pai-leroy-mn4ol0k6',
      NOW,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.claim.signature).toBe('ed25519:abcdef');
  });
});

describe('permits', () => {
  it('permits same tier', () => {
    expect(permits('cohort', 'cohort')).toBe(true);
  });
  it('permits higher tier reading lower', () => {
    expect(permits('sealed', 'public')).toBe(true);
    expect(permits('personal', 'cohort')).toBe(true);
  });
  it('denies lower tier reading higher', () => {
    expect(permits('public', 'cohort')).toBe(false);
    expect(permits('cohort', 'sealed')).toBe(false);
  });
});

describe('compareTiers', () => {
  it('orders correctly', () => {
    expect(compareTiers('public', 'cohort')).toBeLessThan(0);
    expect(compareTiers('cohort', 'cohort')).toBe(0);
    expect(compareTiers('sealed', 'public')).toBeGreaterThan(0);
  });
});

describe('refusalRequiredForMycelia', () => {
  it('only refuses sealed', () => {
    expect(refusalRequiredForMycelia('sealed')).toBe(true);
    expect(refusalRequiredForMycelia('personal')).toBe(false);
    expect(refusalRequiredForMycelia('cohort')).toBe(false);
    expect(refusalRequiredForMycelia('public')).toBe(false);
  });
});

describe('buildScopeClaim', () => {
  it('defaults ask_max_tier to tier', () => {
    const c = buildScopeClaim({
      requesterName: 'leroy',
      agentId: 'pai-leroy-mn4ol0k6',
      tier: 'cohort',
    });
    expect(c.ask_max_tier).toBe('cohort');
  });
  it('honors explicit ask_max_tier', () => {
    const c = buildScopeClaim({
      requesterName: 'leroy',
      agentId: 'pai-leroy-mn4ol0k6',
      tier: 'sealed',
      askMaxTier: 'public',
    });
    expect(c.ask_max_tier).toBe('public');
  });
  it('produces a parseable ts', () => {
    const c = buildScopeClaim({
      requesterName: 'leroy',
      agentId: 'pai-leroy-mn4ol0k6',
      tier: 'public',
    });
    expect(isNaN(Date.parse(c.ts))).toBe(false);
  });
});

describe('parseTierAliases', () => {
  it('returns empty map on undefined/null', () => {
    expect(parseTierAliases(undefined)).toEqual({});
    expect(parseTierAliases(null)).toEqual({});
    expect(parseTierAliases('')).toEqual({});
  });
  it('returns empty map on malformed JSON', () => {
    expect(parseTierAliases('not-json')).toEqual({});
    expect(parseTierAliases('{broken')).toEqual({});
  });
  it('returns empty map on non-object JSON', () => {
    expect(parseTierAliases('[]')).toEqual({});
    expect(parseTierAliases('null')).toEqual({});
    expect(parseTierAliases('"string"')).toEqual({});
  });
  it('drops aliases whose target is not a canonical tier', () => {
    expect(parseTierAliases('{"foo":"bar"}')).toEqual({});
    expect(parseTierAliases('{"intimate":"unknown-tier"}')).toEqual({});
  });
  it('accepts well-formed alias maps', () => {
    expect(parseTierAliases('{"intimate":"personal","sacred":"sealed"}')).toEqual({
      intimate: 'personal',
      sacred: 'sealed',
    });
  });
  it('keeps only the valid entries from a mixed map', () => {
    expect(parseTierAliases('{"intimate":"personal","junk":"junk","sacred":"sealed"}')).toEqual({
      intimate: 'personal',
      sacred: 'sealed',
    });
  });
});

describe('normalizeTier', () => {
  it('returns canonical input as-is', () => {
    expect(normalizeTier('public')).toBe('public');
    expect(normalizeTier('cohort')).toBe('cohort');
    expect(normalizeTier('personal')).toBe('personal');
    expect(normalizeTier('sealed')).toBe('sealed');
  });
  it('returns null for non-string', () => {
    expect(normalizeTier(null)).toBeNull();
    expect(normalizeTier(undefined)).toBeNull();
    expect(normalizeTier(42)).toBeNull();
  });
  it('returns null for unknown string with no aliases', () => {
    expect(normalizeTier('intimate')).toBeNull();
    expect(normalizeTier('sacred')).toBeNull();
  });
  it('resolves aliased input to canonical', () => {
    const aliases = { intimate: 'personal' as const, sacred: 'sealed' as const };
    expect(normalizeTier('intimate', aliases)).toBe('personal');
    expect(normalizeTier('sacred', aliases)).toBe('sealed');
  });
  it('canonical names always win over aliases', () => {
    // If operator aliased 'public' to something weird, canonical still wins
    const aliases = { intimate: 'personal' as const };
    expect(normalizeTier('public', aliases)).toBe('public');
  });
});

describe('validateScopeClaim with tierAliases', () => {
  const baseClaim = {
    requester: 'leroy',
    agent_id: 'pai-leroy-mn4ol0k6',
    ts: FRESH_TS,
  };

  it('accepts aliased tier inputs when alias map provided', () => {
    const r = validateScopeClaim(
      { ...baseClaim, tier: 'intimate', ask_max_tier: 'intimate' },
      'pai-leroy-mn4ol0k6',
      NOW,
      { intimate: 'personal', sacred: 'sealed' },
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.claim.tier).toBe('personal'); // normalized to canonical
      expect(r.claim.ask_max_tier).toBe('personal');
    }
  });

  it('rejects aliased input when no alias map provided', () => {
    const r = validateScopeClaim(
      { ...baseClaim, tier: 'intimate', ask_max_tier: 'intimate' },
      'pai-leroy-mn4ol0k6',
      NOW,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('INVALID_TIER');
  });

  it('handles mixed canonical + aliased input', () => {
    const r = validateScopeClaim(
      { ...baseClaim, tier: 'sacred', ask_max_tier: 'cohort' },
      'pai-leroy-mn4ol0k6',
      NOW,
      { intimate: 'personal', sacred: 'sealed' },
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.claim.tier).toBe('sealed');
      expect(r.claim.ask_max_tier).toBe('cohort');
    }
  });

  it('still enforces ask <= tier after alias resolution', () => {
    const r = validateScopeClaim(
      { ...baseClaim, tier: 'public', ask_max_tier: 'sacred' },
      'pai-leroy-mn4ol0k6',
      NOW,
      { sacred: 'sealed' },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('ASK_EXCEEDS_TIER');
  });
});
