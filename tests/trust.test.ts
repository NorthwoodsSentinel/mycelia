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

  it('converges toward true proportion for large sample', () => {
    // 50 ratings at p=0.875 → lower bound ~0.756 (approaches true value asymptotically)
    const score = wilsonScoreLowerBound(0.875, 50)!;
    expect(score).toBeGreaterThan(0.70);
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

  it('returns meaningful trust score for 10 ratings averaging 4.5', () => {
    // 10 ratings avg 4.5/5 → normalized p=0.875 → Wilson lower bound ~0.568
    // Lower bound is conservative by design — trust must be earned with volume
    const ratings = [5, 4, 5, 4, 5, 5, 4, 5, 4, 4]; // avg 4.5
    const score = calculateCapabilityTrust(ratings)!;
    expect(score).toBeGreaterThan(0.45);
    expect(score).toBeLessThan(0.75);
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
    expect(claimHoardingPenalty(3)).toBeCloseTo(-0.15);
  });
});
