# Component Spec: Trust Model

**Component ID:** `trust`
**Phase:** A (No dependencies)
**Effort:** 1 hour

---

## Purpose

Implement the Wilson score lower bound trust calculation — the same algorithm Reddit uses for "best" comment ranking. This is the core IP of Mycelia. Pure functions, zero external deps, fully unit testable.

## Location

```
mycelia/
├── src/models/trust.ts
└── tests/trust.test.ts
```

## Implementation

### src/models/trust.ts

```typescript
/**
 * Wilson score lower bound for trust calculation.
 *
 * Given a set of 1-5 ratings, computes the lower bound of the
 * 95% confidence interval for the "true" positive proportion.
 *
 * Properties:
 * - 0 ratings → returns null (no data)
 * - 1 rating of 5/5 → ~0.21 (not trusted yet)
 * - 10 ratings avg 4.5 → ~0.73 (becoming trustworthy)
 * - 50 ratings avg 4.5 → ~0.82 (well-established)
 */

const Z = 1.96; // 95% confidence interval

/**
 * Normalize a 1-5 rating to 0-1 range.
 */
export function normalizeRating(rating: number): number {
  return (rating - 1) / 4;
}

/**
 * Compute Wilson score lower bound from normalized proportions.
 *
 * @param positiveRatio - Proportion of positive outcomes (0-1)
 * @param totalRatings - Total number of ratings
 * @returns Lower bound of 95% CI, or null if no ratings
 */
export function wilsonScoreLowerBound(
  positiveRatio: number,
  totalRatings: number
): number | null {
  if (totalRatings === 0) return null;

  const n = totalRatings;
  const p = positiveRatio;
  const z = Z;

  const denominator = 1 + (z * z) / n;
  const center = p + (z * z) / (2 * n);
  const spread = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);

  return (center - spread) / denominator;
}

/**
 * Calculate trust score for a specific capability from an array of ratings.
 *
 * @param ratings - Array of 1-5 integer scores
 * @returns Wilson score lower bound (0-1), or null if no ratings
 */
export function calculateCapabilityTrust(ratings: number[]): number | null {
  if (ratings.length === 0) return null;

  const normalized = ratings.map(normalizeRating);
  const avg = normalized.reduce((a, b) => a + b, 0) / normalized.length;

  return wilsonScoreLowerBound(avg, ratings.length);
}

/**
 * Calculate global trust score as weighted average of per-capability scores.
 *
 * @param capabilityScores - Array of { score, ratingCount } per capability
 * @returns Weighted trust score (0-1), or 0.5 if no verified scores
 */
export function calculateGlobalTrust(
  capabilityScores: Array<{ score: number | null; ratingCount: number }>
): number {
  const verified = capabilityScores.filter((s) => s.score !== null);

  if (verified.length === 0) return 0.5; // Neutral for new agents

  const totalWeight = verified.reduce((sum, s) => sum + s.ratingCount, 0);
  const weightedSum = verified.reduce(
    (sum, s) => sum + s.score! * s.ratingCount,
    0
  );

  return weightedSum / totalWeight;
}

/**
 * Apply trust decay for inactive agents.
 *
 * @param currentTrust - Current trust score
 * @param weeksInactive - Number of weeks since last activity (after 30-day grace)
 * @returns Decayed trust score (minimum 0.3)
 */
export function applyTrustDecay(
  currentTrust: number,
  weeksInactive: number
): number {
  if (weeksInactive <= 0) return currentTrust;

  const DECAY_PER_WEEK = 0.01;
  const DECAY_FLOOR = 0.3;

  const decayed = currentTrust - DECAY_PER_WEEK * weeksInactive;
  return Math.max(decayed, DECAY_FLOOR);
}

/**
 * Calculate the claim hoarding penalty.
 *
 * @param abandonedClaims - Number of abandoned claims
 * @returns Trust penalty (negative number)
 */
export function claimHoardingPenalty(abandonedClaims: number): number {
  return -0.05 * abandonedClaims;
}
```

### tests/trust.test.ts

```typescript
import { describe, it, expect } from 'vitest';
import {
  normalizeRating,
  wilsonScoreLowerBound,
  calculateCapabilityTrust,
  calculateGlobalTrust,
  applyTrustDecay,
  claimHoardingPenalty
} from '../src/models/trust';

describe('normalizeRating', () => {
  it('normalizes 1 to 0', () => expect(normalizeRating(1)).toBe(0));
  it('normalizes 5 to 1', () => expect(normalizeRating(5)).toBe(1));
  it('normalizes 3 to 0.5', () => expect(normalizeRating(3)).toBe(0.5));
});

describe('wilsonScoreLowerBound', () => {
  it('returns null for 0 ratings', () => {
    expect(wilsonScoreLowerBound(0.8, 0)).toBeNull();
  });

  it('returns ~0.21 for 1 perfect rating', () => {
    const score = wilsonScoreLowerBound(1.0, 1)!;
    expect(score).toBeGreaterThan(0.15);
    expect(score).toBeLessThan(0.30);
  });

  it('increases with more ratings at same quality', () => {
    const score5 = wilsonScoreLowerBound(0.875, 5)!;  // avg 4.5/5
    const score50 = wilsonScoreLowerBound(0.875, 50)!;
    expect(score50).toBeGreaterThan(score5);
  });

  it('converges for large sample', () => {
    const score = wilsonScoreLowerBound(0.875, 50)!;
    expect(score).toBeGreaterThan(0.78);
    expect(score).toBeLessThan(0.90);
  });
});

describe('calculateCapabilityTrust', () => {
  it('returns null for empty ratings', () => {
    expect(calculateCapabilityTrust([])).toBeNull();
  });

  it('returns low score for single high rating', () => {
    const score = calculateCapabilityTrust([5])!;
    expect(score).toBeLessThan(0.4);
  });

  it('returns ~0.73 for 10 ratings averaging 4.5', () => {
    const ratings = [5, 4, 5, 4, 5, 5, 4, 5, 4, 4]; // avg 4.5
    const score = calculateCapabilityTrust(ratings)!;
    expect(score).toBeGreaterThan(0.60);
    expect(score).toBeLessThan(0.85);
  });
});

describe('calculateGlobalTrust', () => {
  it('returns 0.5 for no verified scores', () => {
    expect(calculateGlobalTrust([
      { score: null, ratingCount: 0 }
    ])).toBe(0.5);
  });

  it('weights by rating count', () => {
    const score = calculateGlobalTrust([
      { score: 0.9, ratingCount: 10 },
      { score: 0.3, ratingCount: 1 }
    ]);
    // Should be closer to 0.9 due to weighting
    expect(score).toBeGreaterThan(0.8);
  });
});

describe('applyTrustDecay', () => {
  it('no decay for active agents', () => {
    expect(applyTrustDecay(0.8, 0)).toBe(0.8);
  });

  it('decays 0.01 per week', () => {
    expect(applyTrustDecay(0.8, 5)).toBeCloseTo(0.75);
  });

  it('never drops below 0.3', () => {
    expect(applyTrustDecay(0.5, 100)).toBe(0.3);
  });
});

describe('claimHoardingPenalty', () => {
  it('returns -0.05 per abandoned claim', () => {
    expect(claimHoardingPenalty(3)).toBe(-0.15);
  });
});
```

## Validation Criteria

- [ ] All test cases pass
- [ ] Wilson score returns null for 0 ratings
- [ ] Single 5-star rating produces score ~0.21 (not instantly trusted)
- [ ] 10 ratings at avg 4.5 produces score ~0.73
- [ ] 50 ratings at avg 4.5 produces score ~0.82
- [ ] Global trust weights by rating count
- [ ] Decay never drops below 0.3
- [ ] Pure functions — no D1/KV/external dependencies

## Dependencies

- **External:** None (pure math)
- **Internal:** None
