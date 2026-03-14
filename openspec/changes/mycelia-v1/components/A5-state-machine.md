# Component Spec: State Machine

**Component ID:** `state-machine`
**Phase:** A (No dependencies)
**Effort:** 1 hour

---

## Purpose

Implement the request lifecycle state machine. Pure functions that validate and execute state transitions. Used by route handlers to enforce valid lifecycle flow.

## Location

```
mycelia/
├── src/models/state-machine.ts
└── tests/state-machine.test.ts
```

## Implementation

### src/models/state-machine.ts

```typescript
import type { RequestStatus, ClaimStatus } from '../types';

/**
 * Valid state transitions for requests.
 *
 * State diagram:
 *   open → claimed → responded → rated → closed
 *   open → cancelled | expired
 *   claimed → open (claim expires, no responses)
 *   claimed → cancelled (no responses)
 */

interface TransitionRule {
  from: RequestStatus;
  to: RequestStatus;
  trigger: string;
  condition?: string;
}

const REQUEST_TRANSITIONS: TransitionRule[] = [
  { from: 'open', to: 'claimed', trigger: 'claim_created', condition: 'not_expired_and_under_max' },
  { from: 'open', to: 'cancelled', trigger: 'requester_cancels', condition: 'zero_responses' },
  { from: 'open', to: 'expired', trigger: 'cron_expiry', condition: 'past_expires_at' },
  { from: 'claimed', to: 'open', trigger: 'all_claims_expired', condition: 'zero_responses_and_no_active_claims' },
  { from: 'claimed', to: 'responded', trigger: 'response_submitted' },
  { from: 'claimed', to: 'cancelled', trigger: 'requester_cancels', condition: 'zero_responses' },
  { from: 'responded', to: 'responded', trigger: 'additional_response', condition: 'under_max_responses' },
  { from: 'responded', to: 'rated', trigger: 'rating_submitted' },
  { from: 'rated', to: 'rated', trigger: 'additional_rating' },
  { from: 'rated', to: 'closed', trigger: 'all_rated_or_manual_close' },
];

/**
 * Check if a request status transition is valid.
 */
export function canTransition(from: RequestStatus, to: RequestStatus): boolean {
  return REQUEST_TRANSITIONS.some((t) => t.from === from && t.to === to);
}

/**
 * Get the transition rule for a given from→to pair, or null if invalid.
 */
export function getTransition(from: RequestStatus, to: RequestStatus): TransitionRule | null {
  return REQUEST_TRANSITIONS.find((t) => t.from === from && t.to === to) ?? null;
}

/**
 * Determine the next request status after a claim is created.
 */
export function afterClaimCreated(currentStatus: RequestStatus): RequestStatus {
  if (currentStatus === 'open' || currentStatus === 'claimed') return 'claimed';
  throw new InvalidTransitionError(currentStatus, 'claimed', 'Can only claim open or claimed requests');
}

/**
 * Determine the next request status after a response is submitted.
 */
export function afterResponseSubmitted(currentStatus: RequestStatus): RequestStatus {
  if (currentStatus === 'claimed' || currentStatus === 'responded') return 'responded';
  throw new InvalidTransitionError(currentStatus, 'responded', 'Can only respond to claimed or responded requests');
}

/**
 * Determine the next request status after a rating is submitted.
 */
export function afterRatingSubmitted(currentStatus: RequestStatus): RequestStatus {
  if (currentStatus === 'responded' || currentStatus === 'rated') return 'rated';
  throw new InvalidTransitionError(currentStatus, 'rated', 'Can only rate responded or rated requests');
}

/**
 * Determine the next request status when closing.
 */
export function afterClose(currentStatus: RequestStatus): RequestStatus {
  if (currentStatus === 'rated') return 'closed';
  throw new InvalidTransitionError(currentStatus, 'closed', 'Can only close rated requests');
}

/**
 * Determine the next request status when cancelling.
 */
export function afterCancel(currentStatus: RequestStatus, responseCount: number): RequestStatus {
  if ((currentStatus === 'open' || currentStatus === 'claimed') && responseCount === 0) {
    return 'cancelled';
  }
  throw new InvalidTransitionError(currentStatus, 'cancelled', 'Can only cancel open/claimed requests with 0 responses');
}

/**
 * Determine the next request status on expiry.
 */
export function afterExpiry(currentStatus: RequestStatus): RequestStatus {
  if (currentStatus === 'open') return 'expired';
  throw new InvalidTransitionError(currentStatus, 'expired', 'Only open requests can expire');
}

/**
 * Determine the next request status when all claims expire with no responses.
 */
export function afterAllClaimsExpired(
  currentStatus: RequestStatus,
  activeClaimCount: number,
  responseCount: number
): RequestStatus {
  if (currentStatus === 'claimed' && activeClaimCount === 0 && responseCount === 0) {
    return 'open';
  }
  throw new InvalidTransitionError(currentStatus, 'open', 'Cannot reopen: still has active claims or responses');
}

// ═══ Claim Status Transitions ═══

export function claimAfterResponse(): ClaimStatus {
  return 'completed';
}

export function claimAfterExpiry(): ClaimStatus {
  return 'expired';
}

export function claimAfterAbandon(): ClaimStatus {
  return 'abandoned';
}

// ═══ Error ═══

export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: string,
    public readonly to: string,
    public readonly reason: string
  ) {
    super(`Invalid transition: ${from} → ${to}. ${reason}`);
    this.name = 'InvalidTransitionError';
  }
}
```

### tests/state-machine.test.ts

```typescript
import { describe, it, expect } from 'vitest';
import {
  canTransition,
  afterClaimCreated,
  afterResponseSubmitted,
  afterRatingSubmitted,
  afterClose,
  afterCancel,
  afterExpiry,
  afterAllClaimsExpired,
  InvalidTransitionError
} from '../src/models/state-machine';

describe('canTransition', () => {
  it('allows open → claimed', () => expect(canTransition('open', 'claimed')).toBe(true));
  it('allows open → cancelled', () => expect(canTransition('open', 'cancelled')).toBe(true));
  it('allows open → expired', () => expect(canTransition('open', 'expired')).toBe(true));
  it('allows claimed → responded', () => expect(canTransition('claimed', 'responded')).toBe(true));
  it('allows claimed → open', () => expect(canTransition('claimed', 'open')).toBe(true));
  it('allows responded → rated', () => expect(canTransition('responded', 'rated')).toBe(true));
  it('allows rated → closed', () => expect(canTransition('rated', 'closed')).toBe(true));

  it('rejects open → responded', () => expect(canTransition('open', 'responded')).toBe(false));
  it('rejects open → rated', () => expect(canTransition('open', 'rated')).toBe(false));
  it('rejects closed → open', () => expect(canTransition('closed', 'open')).toBe(false));
  it('rejects expired → open', () => expect(canTransition('expired', 'open')).toBe(false));
});

describe('afterClaimCreated', () => {
  it('open → claimed', () => expect(afterClaimCreated('open')).toBe('claimed'));
  it('throws for responded', () => expect(() => afterClaimCreated('responded')).toThrow(InvalidTransitionError));
});

describe('afterResponseSubmitted', () => {
  it('claimed → responded', () => expect(afterResponseSubmitted('claimed')).toBe('responded'));
  it('responded → responded (additional)', () => expect(afterResponseSubmitted('responded')).toBe('responded'));
  it('throws for open', () => expect(() => afterResponseSubmitted('open')).toThrow(InvalidTransitionError));
});

describe('afterRatingSubmitted', () => {
  it('responded → rated', () => expect(afterRatingSubmitted('responded')).toBe('rated'));
  it('rated → rated (additional)', () => expect(afterRatingSubmitted('rated')).toBe('rated'));
  it('throws for open', () => expect(() => afterRatingSubmitted('open')).toThrow(InvalidTransitionError));
});

describe('afterCancel', () => {
  it('open with 0 responses → cancelled', () => expect(afterCancel('open', 0)).toBe('cancelled'));
  it('throws for open with responses', () => expect(() => afterCancel('open', 1)).toThrow(InvalidTransitionError));
  it('throws for responded', () => expect(() => afterCancel('responded', 1)).toThrow(InvalidTransitionError));
});

describe('afterAllClaimsExpired', () => {
  it('claimed with 0 active and 0 responses → open', () => {
    expect(afterAllClaimsExpired('claimed', 0, 0)).toBe('open');
  });
  it('throws if still has active claims', () => {
    expect(() => afterAllClaimsExpired('claimed', 1, 0)).toThrow(InvalidTransitionError);
  });
});
```

## Validation Criteria

- [ ] All valid transitions return correct next state
- [ ] All invalid transitions throw InvalidTransitionError
- [ ] Cancel only works with 0 responses
- [ ] Reopen only works with 0 active claims and 0 responses
- [ ] Self-transition for responded→responded and rated→rated works
- [ ] Pure functions — no D1/KV/external dependencies

## Dependencies

- **External:** None (pure logic)
- **Internal:** types.ts (for RequestStatus, ClaimStatus types)
