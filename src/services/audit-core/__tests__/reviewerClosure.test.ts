import { describe, expect, it } from 'vitest';

import { recheckBeforeClosing, unansweredItems, type ClosureItem } from '../reviewerClosure';

const item = (key: string, prefilledAnswer?: string): ClosureItem => ({ key, kind: 'MISSING_DOCUMENT', label: key, prefilledAnswer });

describe('closing a journey needs an answer for every open item (product owner 2026-11-04)', () => {
  it('counts an item answered by a typed reason or an accepted claim, not by a short note', () => {
    const items = [item('document:rsa', 'Not mandatory: accepted by the Reviewer.'), item('finding:1'), item('task:2')];
    expect(unansweredItems(items, {}, 10).map((i) => i.key)).toEqual(['finding:1', 'task:2']);
    expect(unansweredItems(items, { 'finding:1': 'ok', 'task:2': 'Customer confirmed on call' }, 10).map((i) => i.key))
      .toEqual(['finding:1']);
    expect(unansweredItems(items, { 'finding:1': 'Discount approved by the GM', 'task:2': 'Customer confirmed on call' }, 10))
      .toEqual([]);
  });
});

describe('the list is read again just before closing (SHI-SS-261027-013, 2026-11-06)', () => {
  const answers = { 'finding:1': 'Discount approved by the GM' };
  const fresh = (items: ClosureItem[], extra: Partial<{ blockers: string[]; canClose: boolean }> = {}) => ({
    items, blockers: [], canClose: true, minAnswerLength: 10, ...extra,
  });

  it('names an item that opened while the form was open instead of sending a close the server refuses', () => {
    const reopened = { ...item('task:9'), kind: 'OPEN_TASK' as const, label: 'Fix pages that could not be processed' };
    expect(recheckBeforeClosing(['finding:1'], fresh([item('finding:1'), reopened]), answers))
      .toBe('An item opened while this form was open: Fix pages that could not be processed. Give a reason for it below.');
  });

  it('sends the close when nothing new opened, or an item closed meanwhile', () => {
    expect(recheckBeforeClosing(['finding:1'], fresh([item('finding:1')]), answers)).toBeUndefined();
    expect(recheckBeforeClosing(['finding:1', 'task:2'], fresh([item('finding:1')]), answers)).toBeUndefined();
  });

  it('stops on a claim now waiting for a decision', () => {
    expect(recheckBeforeClosing(['finding:1'], fresh([item('finding:1')],
      { blockers: ['A claim is waiting.'], canClose: false }), answers)).toBe('A claim is waiting.');
  });
});
