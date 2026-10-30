import { describe, expect, it } from 'vitest';

import type { DailyHealthRow, ErrorRouteRow } from '../../../../services/audit-core/systemHealth';
import { dayLabel, halfOverHalf, hasCodes, rangeFailedPct, routesFor, signedPct, splitCodeKey } from '../trendLogic';

const day = (date: string, over: Partial<DailyHealthRow> = {}): DailyHealthRow => ({
  date, documents: 0, read: 0, badScan: 0, notReadInTime: 0, failedOther: 0, inProgress: 0, diFailedPct: null,
  diSystemFailedPct: null, requests: 0, clientErrors: 0, serverErrors: 0, unauthenticated: 0, forbidden: 0, notFound: 0,
  otherClientErrors: 0, codes: {}, restarts: 0, uncleanStops: 0, deploys: 0, deploysFailed: 0, deadLetters: 0, ...over,
});

describe('system health trend logic', () => {
  it('labels IST days and splits a status-and-code key', () => {
    expect(dayLabel('2026-10-30')).toBe('30 Oct');
    expect(splitCodeKey('401 VAC-AUTH-001')).toEqual({ status: '401', code: 'VAC-AUTH-001' });
    expect(splitCodeKey('500')).toEqual({ status: '500', code: null });
  });

  it('weights the range failure rate by settled pages, and can leave scan quality out', () => {
    const rows = [day('2026-10-29', { read: 90, badScan: 5, notReadInTime: 5 }), day('2026-10-30', { read: 8, failedOther: 2 })];
    expect(rangeFailedPct(rows)).toBe(10.9);
    expect(rangeFailedPct(rows, true)).toBe(6.4);
    expect(rangeFailedPct([day('2026-10-30')])).toBeNull();
  });

  it('compares the second half of the range with the first', () => {
    const rows = ['27', '28', '29', '30'].map((d, i) => day(`2026-10-${d}`, { serverErrors: [4, 6, 2, 3][i] }));
    expect(halfOverHalf(rows, 'serverErrors')).toBe(-50);
    expect(signedPct(-50)).toBe('down 50% on the first half');
    expect(halfOverHalf([day('2026-10-29'), day('2026-10-30', { serverErrors: 3 })], 'serverErrors')).toBeNull();
  });

  it('keeps only days from when the codes were recorded', () => {
    expect(hasCodes(day('2026-10-29'), '2026-10-30')).toBe(false);
    expect(hasCodes(day('2026-10-30'), '2026-10-30')).toBe(true);
    expect(hasCodes(day('2026-10-30'), null)).toBe(false);
  });

  it('narrows routes to a code and a search', () => {
    const route = (r: string, keys: string[]): ErrorRouteRow => ({
      service: 'verigence-audit-core', route: r, clientErrors: 1, serverErrors: 0, notClassified: 0,
      codes: keys.map((k) => ({ key: k, status: Number(k.split(' ')[0]), errorCode: k.split(' ')[1] ?? null, count: 1 })),
    });
    const rows = [route('/p2/v1/x/documents', ['401 VAC-AUTH-001']), route('/v1/finance', ['404 VAC-NF-005'])];
    expect(routesFor(rows, '404 VAC-NF-005', '').map((r) => r.route)).toEqual(['/v1/finance']);
    expect(routesFor(rows, null, 'DOC').map((r) => r.route)).toEqual(['/p2/v1/x/documents']);
  });
});
