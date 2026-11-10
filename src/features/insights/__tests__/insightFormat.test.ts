import { describe, expect, it } from 'vitest';

import {
  count, days, gapStep, heatStep, monthLabel, percent, quickRange, rupees, rupeesShort, shortOutlet, signed, sortRows, toCsv,
} from '../insightFormat';
import { reportFromParam } from '../reportCatalog';

describe('money and counts', () => {
  it('writes rupees with Indian grouping and a dash for nothing', () => {
    expect(rupees(1234567)).toBe('₹12,34,567');
    expect(rupees(-2500)).toBe('−₹2,500');
    expect(rupees(null)).toBe('—');
  });

  it('shortens to lakh and crore', () => {
    expect(rupeesShort(15_397_156)).toBe('₹1.54 crore');
    expect(rupeesShort(1_266_369)).toBe('₹12.7 lakh');
    expect(rupeesShort(250_000)).toBe('₹2.5 lakh');
    expect(rupeesShort(45_000)).toBe('₹45,000');
    expect(rupeesShort(-1_129_200)).toBe('−₹11.3 lakh');
    expect(rupeesShort(undefined)).toBe('—');
  });

  it('formats counts, shares, signed gaps and days', () => {
    expect(count(1253)).toBe('1,253');
    expect(percent(86.4)).toBe('86%');
    expect(percent(4.42, 1)).toBe('4.4%');
    expect(percent(null)).toBe('—');
    expect(signed(2.44)).toBe('+2.4');
    expect(signed(-1)).toBe('−1');
    expect(signed(0.01)).toBe('0');
    expect(days(1)).toBe('1 day');
    expect(days(9.2)).toBe('9 days');
  });
});

describe('names and dates', () => {
  it('drops the dealership from an outlet name shown under it', () => {
    expect(shortOutlet('Utkal Mahindra - CDA', 'Utkal Mahindra')).toBe('CDA');
    expect(shortOutlet('Utkal Mahindra - CDA')).toBe('Utkal Mahindra - CDA');
    expect(shortOutlet('Shivnath Tamando', 'Utkal Mahindra')).toBe('Shivnath Tamando');
    expect(shortOutlet(null)).toBe('—');
  });

  it('reads a month key', () => {
    expect(monthLabel('2026-10')).toMatch(/Oct.*2026/);
    expect(monthLabel('unknown')).toBe('unknown');
  });

  it('gives the first and last day of the month for the quick ranges', () => {
    const today = new Date(2026, 10, 10);
    expect(quickRange('this-month', today)).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    expect(quickRange('last-month', today)).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(quickRange('last-month', new Date(2027, 0, 5))).toEqual({ from: '2026-12-01', to: '2026-12-31' });
    expect(quickRange('all', today)).toEqual({ from: '', to: '' });
  });
});

describe('shades', () => {
  it('steps a rate from none to nearly all', () => {
    expect([0, 5, 12, 30, 50, 70, 95].map(heatStep)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(heatStep(null)).toBe(0);
  });

  it('steps a gap by its share of what was expected, and ignores less than one deal', () => {
    expect(gapStep(0.6, 10)).toBe(0);
    expect(gapStep(2, 10)).toBe(1);
    expect(gapStep(-4, 10)).toBe(-2);
    expect(gapStep(7, 10)).toBe(3);
    expect(gapStep(-3, 0)).toBe(-3);
    expect(gapStep(null, 10)).toBe(0);
  });
});

describe('tables', () => {
  it('sorts numbers and text, and keeps empty values last either way', () => {
    const rows = [{ n: 3, t: 'b' }, { n: null, t: 'a' }, { n: 10, t: 'c' }];
    expect(sortRows(rows, (row) => row.n, 'desc').map((row) => row.n)).toEqual([10, 3, null]);
    expect(sortRows(rows, (row) => row.n, 'asc').map((row) => row.n)).toEqual([3, 10, null]);
    expect(sortRows(rows, (row) => row.t, 'asc').map((row) => row.t)).toEqual(['a', 'b', 'c']);
  });

  it('writes a CSV a spreadsheet opens safely', () => {
    expect(toCsv(['Name', 'Amount'], [['A, B', 1200], ['=SUM(A1)', -5], ['He said "ok"', null]])).toBe(
      'Name,Amount\n"A, B",1200\n\'=SUM(A1),-5\n"He said ""ok""",',
    );
  });
});

describe('report addresses', () => {
  it('opens the named report, and the business overview for anything unknown', () => {
    expect(reportFromParam('insurance')).toBe('insurance');
    expect(reportFromParam(null)).toBe('sales');
    expect(reportFromParam('nonsense')).toBe('sales');
  });

  it('keeps the addresses of the earlier reports working', () => {
    expect(reportFromParam('overview')).toBe('sales');
    expect(reportFromParam('addons')).toBe('penetration');
    expect(reportFromParam('geography')).toBe('catchment');
    expect(reportFromParam('trade-in')).toBe('discounts');
  });
});
