import { describe, it, expect } from 'vitest';
import { buildRequestListFilter } from '../src/routes/requests';

// Regression tests for the silently-ignored target_agent_id filter (found 2026-08-13).
//
// GET /v1/requests accepted `target_agent_id`, and clients sent it — the MCP browse
// tool documents it as "Use this to find requests addressed to you" — but no route
// ever read it off the query string. The filter was a no-op, so asking "what is
// directed at me?" returned every open request on the network with a 200 and no
// warning. A superset is the one wrong answer that looks exactly like a right one.
//
// The load-bearing test is `does NOT collapse to the unfiltered query` below: it is
// the only one that fails if the filter is deleted again. Assertions on the emitted
// SQL alone would still pass against a handler that ignored the value.

const q = (o: Record<string, string | undefined>) => o;

describe('buildRequestListFilter — target_agent_id (the filter that was never read)', () => {
  const AGENT = 'pai-ceecee-mn4ol0k6';

  it('defaults to open status with no target constraint', () => {
    const { where, params } = buildRequestListFilter(q({}));
    expect(where).toBe('WHERE r.status = ?');
    expect(params).toEqual(['open']);
  });

  it('constrains on target_agent_id and binds the value', () => {
    const { where, params } = buildRequestListFilter(q({ target_agent_id: AGENT }));
    expect(where).toContain('AND r.target_agent_id = ?');
    expect(params).toEqual(['open', AGENT]);
  });

  it('THE REGRESSION: filtering by target does NOT collapse to the unfiltered query', () => {
    // This is the bug. Before the fix both calls produced an identical query, so a
    // directed-inbox lookup silently returned the whole open network.
    const filtered = buildRequestListFilter(q({ target_agent_id: AGENT }));
    const unfiltered = buildRequestListFilter(q({}));

    expect(filtered.where).not.toBe(unfiltered.where);
    expect(filtered.params).not.toEqual(unfiltered.params);
  });

  it('selects broadcast-only requests with the `none` sentinel, binding no param', () => {
    const { where, params } = buildRequestListFilter(q({ target_agent_id: 'none' }));
    expect(where).toContain('AND r.target_agent_id IS NULL');
    expect(where).not.toContain('r.target_agent_id = ?');
    expect(params).toEqual(['open']);
  });

  it('distinguishes broadcast-only from directed-to-an-agent', () => {
    const broadcast = buildRequestListFilter(q({ target_agent_id: 'none' }));
    const directed = buildRequestListFilter(q({ target_agent_id: AGENT }));
    expect(broadcast.where).not.toBe(directed.where);
  });

  it('is ignored when empty, rather than matching the empty string', () => {
    const { where, params } = buildRequestListFilter(q({ target_agent_id: '' }));
    expect(where).not.toContain('target_agent_id');
    expect(params).toEqual(['open']);
  });
});

describe('buildRequestListFilter — positional binding across combined filters', () => {
  it('keeps params in the same order as their placeholders', () => {
    // D1 binds positionally: if params drift out of order the query still runs and
    // returns wrong rows, which is the same class of silent-wrong as the original bug.
    const { where, params } = buildRequestListFilter(
      q({
        status: 'claimed',
        type: 'validation',
        priority: 'high',
        target_agent_id: 'agent-xyz',
        tags: 'fact-verification,second-opinion',
      })
    );

    const placeholders = (where.match(/\?/g) || []).length;
    expect(placeholders).toBe(params.length);
    expect(params).toEqual([
      'claimed',
      'validation',
      'high',
      'agent-xyz',
      'fact-verification',
      'second-opinion',
    ]);
  });

  it('preserves the existing status/type/priority/tags behaviour unchanged', () => {
    const { where, params } = buildRequestListFilter(
      q({ status: 'responded', type: 'council', tags: 'code-review' })
    );
    expect(where).toContain('WHERE r.status = ?');
    expect(where).toContain('AND r.request_type = ?');
    expect(where).not.toContain('r.priority');
    expect(where).toContain('SELECT rt.request_id FROM request_tags rt');
    expect(params).toEqual(['responded', 'council', 'code-review']);
  });
});
