import { describe, expect, it } from 'vitest';

import type { JourneyReviewRow } from '../../../../services/audit-core/adminReports';
import {
  amountAt, discountLine, docCounts, money, needsLook, parts, searchRows, signals, stageCounts, stageLabel, stageTone,
} from '../journeyReviewLogic';

const row = (over: Partial<JourneyReviewRow>): JourneyReviewRow => ({ ref: 'R-1', invoices: [], ...over });

describe('journey review', () => {
  it('names stages in words', () => {
    expect(stageLabel('DELIVERY_DOCUMENT_UPLOAD')).toBe('Delivery documents');
    expect(stageLabel('SOMETHING_NEW')).toBe('Something new');
    expect(stageTone('DELIVERY_COMPLETE')).toBe('ok');
    expect(stageTone('BOOKING_CANCELLED')).toBe('muted');
  });

  it('reads an amount and the document it came from', () => {
    expect(amountAt('999000.00 @booking_form')).toEqual({ amount: 999000, source: 'booking form' });
    expect(amountAt('1030100.00 @customer_ledger')).toEqual({ amount: 1030100, source: 'NDC / ledger' });
    expect(amountAt('')).toEqual({ amount: null, source: null });
    expect(money(1030100)).toBe('₹10,30,100');
  });

  it('splits the packed lists', () => {
    expect(parts('a=1 | b=2')).toEqual(['a=1', 'b=2']);
    expect(docCounts('customer_invoice_dmsx2, rto_challanx1')).toEqual([['customer invoice dms', 2], ['rto challan', 1]]);
  });

  it('flags what is worth a look', () => {
    const fine = row({ stage: 'DELIVERY_DOCUMENT_UPLOAD', sku_code: 'X', std_ex_showroom: '1000000',
      deal_ex_showroom: '1000050 @cost_sheet', invoices: [{ doc: 'd' }] });
    expect(needsLook(fine)).toBe(false);
    expect(signals(fine).exShowroomGap).toBe(50);
    expect(needsLook({ ...fine, sku_code: null })).toBe(true);
    expect(needsLook({ ...fine, invoices: [] })).toBe(true);
    expect(needsLook({ ...fine, deal_ex_showroom: '1009000 @cost_sheet' })).toBe(true);
  });

  it('searches and counts by stage', () => {
    const rows = [row({ ref: 'ADI-1', customer: 'Raju Bhal', stage: 'BOOKING_COMPLETE' }),
      row({ ref: 'UTK-2', customer: 'Nihar', stage: 'BOOKING_COMPLETE' }), row({ ref: 'SHI-3', stage: 'DELIVERY_COMPLETE' })];
    expect(searchRows(rows, 'raju').map((r) => r.ref)).toEqual(['ADI-1']);
    expect(stageCounts(rows)).toEqual([['BOOKING_COMPLETE', 2], ['DELIVERY_COMPLETE', 1]]);
  });

  it('writes a discount against the SKU in words', () => {
    expect(discountLine('CASH_DISCOUNT elig=25000,a=30000,ELIGIBLE'))
      .toBe('Cash discount: given ₹30,000 · entitled ₹25,000 · eligible');
    expect(discountLine('EXCHANGE_BONUS elig=-,a=20000,NOT_EVALUATED'))
      .toBe('Exchange bonus: given ₹20,000 · no entitlement on record · not evaluated');
  });
});
