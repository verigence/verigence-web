import { describe, expect, it } from 'vitest';

import { compareDecimal, formatDays, formatIndian, formatPayMonth, formatRupees, formatSignedRupees, toPaise, todayInIndia } from '../money';

describe('rupee formatting', () => {
  it('groups digits the Indian way with two decimals', () => {
    expect(formatRupees('0')).toBe('₹0.00');
    expect(formatRupees('999.5')).toBe('₹999.50');
    expect(formatRupees('1000')).toBe('₹1,000.00');
    expect(formatRupees('31000.00')).toBe('₹31,000.00');
    expect(formatRupees('123456')).toBe('₹1,23,456.00');
    expect(formatRupees('1234567.5')).toBe('₹12,34,567.50');
    expect(formatRupees('100000000')).toBe('₹10,00,00,000.00');
  });

  it('accepts JSON numbers as well as strings', () => {
    expect(formatRupees(30000)).toBe('₹30,000.00');
    expect(formatRupees(30000.5)).toBe('₹30,000.50');
  });

  it('rounds half up on the third decimal without float error', () => {
    expect(formatRupees('1.005')).toBe('₹1.01');
    expect(formatRupees('2.675')).toBe('₹2.68');
    expect(formatRupees('1.004')).toBe('₹1.00');
    expect(toPaise('0.285')).toBe(29n);
  });

  it('keeps exact digits that a float could not hold', () => {
    expect(formatRupees('9007199254740993.01')).toBe('₹9,00,71,99,25,47,40,993.01');
  });

  it('shows negatives and signs', () => {
    expect(formatRupees('-250')).toBe('-₹250.00');
    expect(formatSignedRupees('1000')).toBe('+₹1,000.00');
    expect(formatSignedRupees('-1000')).toBe('-₹1,000.00');
    expect(formatIndian('-1234.5')).toBe('-1,234.50');
  });

  it('shows a dash for something that is not an amount', () => {
    for (const bad of [null, undefined, '', 'abc', '1,000', NaN, '1e5']) expect(formatRupees(bad)).toBe('—');
  });
});

describe('days and comparisons', () => {
  it('shows days without inventing or dropping precision', () => {
    expect(formatDays('28')).toBe('28');
    expect(formatDays('27.5')).toBe('27.5');
    expect(formatDays('3.0')).toBe('3');
    expect(formatDays(1)).toBe('1');
    expect(formatDays(null)).toBe('—');
  });

  it('compares exactly whatever the number of decimals', () => {
    expect(compareDecimal('21001', '21001.00')).toBe(0);
    expect(compareDecimal('21000.99', '21001')).toBe(-1);
    expect(compareDecimal('25000.01', '25000')).toBe(1);
    expect(compareDecimal('x', '1')).toBeNull();
  });
});

describe('dates', () => {
  it('names the pay month', () => {
    expect(formatPayMonth('2026-10')).toBe('October 2026');
    expect(formatPayMonth('2026-13')).toBe('2026-13');
  });

  it('judges "today" by the date in India, not the browser zone', () => {
    // 18:45 UTC on 3 Oct is already 4 Oct 00:15 in India.
    expect(todayInIndia(new Date('2026-10-03T18:45:00Z'))).toBe('2026-10-04');
    expect(todayInIndia(new Date('2026-10-03T18:29:00Z'))).toBe('2026-10-03');
  });
});
