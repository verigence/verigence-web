import { describe, expect, it } from 'vitest';

import { fieldLabel, shown } from '../uc03VerifiedBookings';

describe('verified bookings labels (2026-11-17)', () => {
  it('names the figure that moved in words', () => {
    expect(fieldLabel('deal.payable')).toBe('Deal · payable');
    expect(fieldLabel('ndcPayments.receiptsShort')).toBe('NDC vs receipts · receipts short');
    expect(fieldLabel('openTasks.PAYMENT_RECEIPT_MISSING')).toBe('Open tasks · payment_receipt_missing');
  });

  it('shows a missing value as a dash', () => {
    expect(shown(null)).toBe('—');
    expect(shown('1061874.00')).toBe('1061874.00');
  });
});
