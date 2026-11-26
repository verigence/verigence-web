import { describe, expect, it } from 'vitest';

import { countedReceipts, notCountedLine } from '../j360Format';

describe('Payments tab lists what is counted (product owner 2026-11-26)', () => {
  // UTK-JP-261031-007: the same receipts uploaded twice, one removed document.
  const items = [
    { paymentId: 'a', counted: true, receiptNumber: 'CRBM/2627/00927' },
    { paymentId: 'b', counted: false, receiptNumber: null, duplicateOf: 'a' },
    { paymentId: 'c', counted: true, receiptNumber: 'SM/2627/04806' },
    { paymentId: 'd', counted: false, receiptNumber: 'BRBM/2627/04806', duplicateOf: 'c' },
    { paymentId: 'e', counted: false, receiptNumber: null, duplicateOf: null },
  ];

  it('lists only the receipts that are counted', () => {
    expect(countedReceipts(items).map((item) => item.paymentId)).toEqual(['a', 'c']);
  });

  it('says in one line how many on file are not listed, by why', () => {
    expect(notCountedLine(items)).toBe(
      "Not listed, not counted: 2 copies of a receipt already listed · 1 removed or not this customer's.");
    expect(notCountedLine([items[0], items[1]])).toBe('Not listed, not counted: 1 copy of a receipt already listed.');
  });

  it('says nothing when every receipt on file is counted', () => {
    expect(notCountedLine([items[0], items[2]])).toBeNull();
    expect(notCountedLine([])).toBeNull();
  });
});
