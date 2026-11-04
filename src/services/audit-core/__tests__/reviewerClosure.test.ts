import { describe, expect, it } from 'vitest';

import { unansweredItems, type ClosureItem } from '../reviewerClosure';

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
