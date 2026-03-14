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
