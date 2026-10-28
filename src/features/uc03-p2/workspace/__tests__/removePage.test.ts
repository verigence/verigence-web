import { describe, expect, it } from 'vitest';

import { removablePage } from '../P2DocumentList';
import { removablePages, removalPagesText, removeOptions, removeReasonProblem } from '../RemovePageDialog';

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
      .toEqual([{ page: 2, queueId: 'q2', pages: [2] }]);
    expect(removablePages({})).toEqual([]);
    expect(removablePages(undefined)).toEqual([]);
  });

  it('reads the failed pages of a "Document to resubmit" task, so they can be removed after the sweep', () => {
    expect(removablePages({ pages: [
      { queueId: 'q3', pageNumbers: [3], reason: 'x' },
      { queueId: 'q4', pageNumbers: [4, 5] },
      { queueId: 'q6', pageNumbers: [] },
      { pageNumbers: [7] },
    ] })).toEqual([{ page: 3, queueId: 'q3', pages: [3] }, { page: 4, queueId: 'q4', pages: [4, 5] }]);
    expect(removalPagesText([3])).toBe('page 3');
    expect(removalPagesText([2, 3, 4])).toBe('pages 2, 3 and 4');
  });

  it('offers the buttons on an open image-quality or resubmit task, and the fallback link only on an open quality task', () => {
    const quality = { task_type: 'PC_PAGE_QUALITY_REJECTED', task_status: 'READY', reference: { pageQueues: [{ page: 2, queueId: 'q2' }] } };
    expect(removeOptions(quality, true)).toEqual({ pages: [{ page: 2, queueId: 'q2', pages: [2] }], fallbackLink: false });
    // raised before the queue ids were kept: the link to the page list
    expect(removeOptions({ ...quality, reference: {} }, true)).toEqual({ pages: [], fallbackLink: true });
    // closed: nothing, not even the link (V4)
    expect(removeOptions({ ...quality, task_status: 'VERIFIED_COMPLETE', reference: {} }, true)).toEqual({ pages: [], fallbackLink: false });
    expect(removeOptions({ ...quality, task_status: 'VERIFIED_COMPLETE' }, true).pages).toEqual([]);
    const resubmit = { task_type: 'DOCUMENT_RESUBMIT', task_status: 'READY', reference: { pages: [{ queueId: 'q3', pageNumbers: [3] }] } };
    expect(removeOptions(resubmit, true).pages).toEqual([{ page: 3, queueId: 'q3', pages: [3] }]);
    expect(removeOptions({ ...resubmit, reference: {} }, true)).toEqual({ pages: [], fallbackLink: false });
    expect(removeOptions({ ...resubmit, task_status: 'CANCELLED' }, true).pages).toEqual([]);
    // no other task type
    expect(removeOptions({ ...resubmit, task_type: 'DOCUMENT_MISSING' }, true).pages).toEqual([]);
  });
});

describe('pages not on the booking have no card (product owner 2026-10-28)', () => {
  it('hides failed, removed and duplicate pages; keeps pages being read, retried, read or replaced', async () => {
    const { shownOnCards } = await import('../P2DocumentList');
    for (const status of ['FAILED', 'DEAD_LETTER', 'CANCELLED', 'DUPLICATE']) {
      expect(shownOnCards({ status })).toBe(false);
    }
    for (const status of ['QUEUED', 'CLASSIFYING', 'EXTRACTING', 'RETRY_WAIT', 'READY', 'SUPPORTING', 'NEEDS_REVIEW', 'SUPERSEDED']) {
      expect(shownOnCards({ status })).toBe(true);
    }
    expect(shownOnCards({ status: 'READY', health: { state: 'REJECTED' } as never })).toBe(false);
    expect(shownOnCards({ status: 'EXTRACTING', health: { state: 'FAILED' } as never })).toBe(false);
  });
});
