import { describe, expect, it } from 'vitest';

import { removablePage } from '../P2DocumentList';
import { removablePages, removeReasonProblem } from '../RemovePageDialog';

describe('removing a refused or failed page (2026-10-21)', () => {
  it('is offered only for a page that was refused or could not be processed', () => {
    const unit = { queueId: 'q1' } as never;
    expect(removablePage({ unit, status: 'FAILED' })).toBe(true);
    expect(removablePage({ unit, status: 'DEAD_LETTER' })).toBe(true);
    expect(removablePage({ unit, status: 'READY' })).toBe(false);
    expect(removablePage({ unit, status: 'RETRY_WAIT' })).toBe(false);
    expect(removablePage({ unit: undefined, status: 'FAILED' })).toBe(false);
    expect(removablePage(undefined)).toBe(false);
  });

  it('needs a short reason', () => {
    expect(removeReasonProblem('Re-scan uploaded')).toBeUndefined();
    expect(removeReasonProblem('  ')).toMatch(/why/);
  });

  it('reads the refused pages from the image-quality task', () => {
    expect(removablePages({ pageQueues: [{ page: 2, queueId: 'q2' }, { page: 'x', queueId: 3 }, null] }))
      .toEqual([{ page: 2, queueId: 'q2' }]);
    expect(removablePages({})).toEqual([]);
    expect(removablePages(undefined)).toEqual([]);
  });
});
