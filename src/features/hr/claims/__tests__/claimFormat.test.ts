import { describe, expect, it } from 'vitest';

import { eventLabel, formatMonth, formatPaise, formatRupees, formatRupeesShort, istDate, progressText } from '../claimFormat';

describe('money display', () => {
  it('groups digits the Indian way with two decimals', () => {
    expect(formatRupees(5000)).toBe('₹5,000.00');
    expect(formatRupees(1234567.5)).toBe('₹12,34,567.50');
    expect(formatRupees('100000')).toBe('₹1,00,000.00');
    expect(formatRupees(0)).toBe('₹0.00');
    expect(formatRupees(999.999)).toBe('₹1,000.00');
  });
  it('shows a dash for missing or non-numeric values', () => {
    expect(formatRupees(null)).toBe('—');
    expect(formatRupees(undefined)).toBe('—');
    expect(formatRupees('abc')).toBe('—');
  });
  it('drops .00 only in the short form', () => {
    expect(formatRupeesShort(5000)).toBe('₹5,000');
    expect(formatRupeesShort(3000.5)).toBe('₹3,000.50');
  });
  it('formats whole paise without dividing', () => {
    expect(formatPaise(550000)).toBe('₹5,500.00');
    expect(formatPaise(5)).toBe('₹0.05');
  });
});

describe('dates and labels', () => {
  it('names the month', () => {
    expect(formatMonth('2026-10')).toBe('October 2026');
    expect(formatMonth('bad')).toBe('bad');
  });
  it('uses the Indian calendar date', () => {
    // 20:00 UTC on 3 Oct is already 4 Oct, 01:30 in India.
    expect(istDate(new Date('2026-10-03T20:00:00Z'))).toBe('2026-10-04');
    expect(istDate(new Date('2026-10-03T10:00:00Z'))).toBe('2026-10-03');
  });
  it('says who a claim is waiting for', () => {
    expect(progressText({ status: 'SUBMITTED', waitingFor: 'HR', payrollMonth: '2026-10' })).toBe('Waiting for HR');
    expect(progressText({ status: 'APPROVED', waitingFor: null, payrollMonth: '2026-10' })).toContain('October 2026');
    expect(progressText({ status: 'CORRECTION_REQUESTED', waitingFor: null, payrollMonth: '2026-10' })).toContain('Waiting for you');
  });
  it('labels history events with the stage', () => {
    expect(eventLabel('STAGE_APPROVED', 'TL_PM')).toBe('Approved by Team Lead or Project Manager');
    expect(eventLabel('SUBMITTED', 'HR')).toBe('Submitted, to HR');
    expect(eventLabel('PAID', null)).toBe('Paid');
    expect(eventLabel('SOMETHING_NEW', null)).toBe('Something new');
  });
});
