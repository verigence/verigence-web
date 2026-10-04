import { describe, expect, it } from 'vitest';

import type { ClaimCategory, ClaimSummary } from '../../../../services/hr/claims';
import { claimOutlook, estimatePerKm, isStale, toPaise, validateClaimForm, type ClaimFormValues } from '../claimRules';

const travel: ClaimCategory = { code: 'CAR_TAXI', label: 'Car or taxi', kind: 'TRAVEL', receiptRequired: true, perKm: false, ratePerKm: null, taxable: true };
const bike: ClaimCategory = { code: 'PERSONAL_BIKE', label: 'Personal bike', kind: 'TRAVEL', receiptRequired: false, perKm: true, ratePerKm: 4.5, taxable: true };
const base: ClaimFormValues = { category: 'CAR_TAXI', expenseDate: '2026-10-03', amount: '450', distanceKm: '', description: '' };
const today = '2026-10-04';
const ctx = (category: ClaimCategory | undefined, receiptCount = 1) => ({ category, receiptCount, today });

const summary: ClaimSummary = {
  month: '2026-10', travelUsed: 2800, travelLimit: 5000, travelRemaining: 2200, financeThreshold: 3000,
  mealsUsed: 0, mealsLimit: null, cutoffDay: 25, staleAfterMonths: 2, nextPayrollMonth: '2026-10', rules: [],
};

describe('paise', () => {
  it('reads rupees as whole paise', () => {
    expect(toPaise('450')).toBe(45000);
    expect(toPaise('450.5')).toBe(45050);
    expect(toPaise('450.55')).toBe(45055);
    expect(toPaise(3000)).toBe(300000);
    expect(toPaise('450.555')).toBeNull();
    expect(toPaise('-5')).toBeNull();
    expect(toPaise('abc')).toBeNull();
    expect(toPaise('')).toBeNull();
  });
  it('estimates a per-km amount without floating point drift', () => {
    expect(estimatePerKm('10', 4.5)).toBe('45.00');
    expect(estimatePerKm('12.5', 4.5)).toBe('56.25');
    expect(estimatePerKm('0.3', 0.1)).toBe('0.03');
    expect(estimatePerKm('10', 0)).toBeNull();
    expect(estimatePerKm('x', 4.5)).toBeNull();
  });
});

describe('stale claims', () => {
  it('matches the service rule', () => {
    const submitted = '2026-10-12';
    expect(isStale('2026-08-12', submitted, 2)).toBe(false);
    expect(isStale('2026-08-11', submitted, 2)).toBe(true);
    expect(isStale('2026-10-01', submitted, 2)).toBe(false);
    expect(isStale('2025-01-01', submitted, 2)).toBe(true);
    expect(isStale('2026-12-31', '2027-02-28', 2)).toBe(false);
  });
});

describe('claim form checks', () => {
  it('accepts a good travel claim', () => {
    expect(validateClaimForm(base, ctx(travel))).toEqual({});
  });
  it('needs a category', () => {
    expect(validateClaimForm({ ...base, category: '' }, ctx(undefined)).category).toBeTruthy();
  });
  it('rejects bad amounts like the service does', () => {
    for (const amount of ['', 'abc', '0', '-5', '10.123', '100000.01']) {
      expect(validateClaimForm({ ...base, amount }, ctx(travel)).amount, amount).toBeTruthy();
    }
    expect(validateClaimForm({ ...base, amount: '100000' }, ctx(travel)).amount).toBeUndefined();
    expect(validateClaimForm({ ...base, amount: '12.50' }, ctx(travel)).amount).toBeUndefined();
  });
  it('rejects a future or missing date', () => {
    expect(validateClaimForm({ ...base, expenseDate: '2026-10-05' }, ctx(travel)).expenseDate).toMatch(/future/);
    expect(validateClaimForm({ ...base, expenseDate: '' }, ctx(travel)).expenseDate).toBeTruthy();
    expect(validateClaimForm({ ...base, expenseDate: '2026-02-30' }, ctx(travel)).expenseDate).toBeTruthy();
    expect(validateClaimForm({ ...base, expenseDate: today }, ctx(travel)).expenseDate).toBeUndefined();
  });
  it('asks for distance, not amount, for per-km categories', () => {
    const values = { ...base, category: 'PERSONAL_BIKE', amount: '' };
    expect(validateClaimForm({ ...values, distanceKm: '' }, ctx(bike, 0)).distanceKm).toBeTruthy();
    expect(validateClaimForm({ ...values, distanceKm: '2001' }, ctx(bike, 0)).distanceKm).toBeTruthy();
    expect(validateClaimForm({ ...values, distanceKm: '12.5' }, ctx(bike, 0))).toEqual({});
    expect(validateClaimForm({ ...values, distanceKm: '12.5' }, ctx({ ...bike, ratePerKm: 0 }, 0)).distanceKm).toMatch(/per-km rate/);
  });
  it('needs a receipt only when the category says so, and at most five', () => {
    expect(validateClaimForm(base, ctx(travel, 0)).receipts).toBeTruthy();
    expect(validateClaimForm({ ...base, category: 'PERSONAL_BIKE', distanceKm: '5' }, ctx(bike, 0)).receipts).toBeUndefined();
    expect(validateClaimForm(base, ctx(travel, 6)).receipts).toMatch(/at most 5/);
  });
  it('limits the description', () => {
    expect(validateClaimForm({ ...base, description: 'x'.repeat(501) }, ctx(travel)).description).toBeTruthy();
  });
});

describe('outlook', () => {
  const args = { category: travel, expenseDate: '2026-10-03', today, summary };
  it('sends travel above the threshold to Finance and above the limit to a refusal', () => {
    expect(claimOutlook({ ...args, amountPaise: 10000 })).toMatchObject({ needsFinance: false, overLimit: false, projectedTravelPaise: 290000 });
    expect(claimOutlook({ ...args, amountPaise: 30000 })).toMatchObject({ needsFinance: true, overLimit: false });
    expect(claimOutlook({ ...args, amountPaise: 230000 })).toMatchObject({ needsFinance: true, overLimit: true });
    expect(claimOutlook({ ...args, amountPaise: 220000 }).overLimit).toBe(false); // exactly at the limit is fine
  });
  it('leaves out the claim being corrected', () => {
    expect(claimOutlook({ ...args, amountPaise: 230000, excludePaise: 100000 }).overLimit).toBe(false);
  });
  it('ignores a summary for another month and meals', () => {
    expect(claimOutlook({ ...args, expenseDate: '2026-09-03', amountPaise: 230000 })).toMatchObject({ projectedTravelPaise: null, overLimit: false });
    expect(claimOutlook({ ...args, category: { ...travel, kind: 'MEALS' }, amountPaise: 230000 }).projectedTravelPaise).toBeNull();
  });
  it('flags an old expense', () => {
    expect(claimOutlook({ ...args, expenseDate: '2026-07-01', amountPaise: 100 }).stale).toBe(true);
  });
});
