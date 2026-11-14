import { describe, expect, it } from 'vitest';

import type { DiscountVarianceItem } from '../../../services/audit-core/uc03DiscountVariance';
import {
  applyFilters, breakdown, EMPTY_FILTERS, excessOf, excessOnly, inView, viewFromParams, filtersFromParams, paramsFromFilters, quickRange, sortItems, toCsv, totals,
} from './excessDiscount';

const row = (over: Partial<DiscountVarianceItem>): DiscountVarianceItem => ({
  journeyId: 'j1', journeyReference: 'UTK-1', customer: 'A', pc: 'PC1', outlet: 'O1', dealer: 'Utkal', model: 'XUV3XO',
  variant: 'AX5', discountKey: 'CONSUMER', discount: 'Consumer offer', status: 'OVER_ENTITLEMENT', entitled: '0',
  invoice: '5000', variance: '5000', givenFrom: 'billed', givenDocument: 'NDC (Account Statement)',
  bookingDate: '2026-10-20', deliveryDate: '2026-10-28', ...over,
});

const items = [
  row({}),
  row({ journeyId: 'j2', journeyReference: 'SHI-2', customer: 'Bina', dealer: 'Shivnath', outlet: 'O2', discount: 'Dealer cash',
    variance: '20000', bookingDate: '2026-11-02', deliveryDate: null }),
  row({ journeyId: 'j2', journeyReference: 'SHI-2', customer: 'Bina', dealer: 'Shivnath', outlet: 'O2', discountKey: 'X',
    variance: '1000', bookingDate: '2026-11-02', deliveryDate: null }),
  row({ journeyId: 'j3', status: 'UNDER_ENTITLEMENT', variance: '-500' }),
];

describe('the Excess discount screen filters (product owner 2026-11-06)', () => {
  it('keeps only discounts over their entitlement', () => {
    expect(excessOnly(items)).toHaveLength(3);
  });

  it('filters by booking or delivery date, dealership, discount type and search', () => {
    const over = excessOnly(items);
    expect(applyFilters(over, { ...EMPTY_FILTERS, from: '2026-11-01' }).map((i) => i.journeyId)).toEqual(['j2', 'j2']);
    // By delivery date a booking not yet delivered drops out of a dated range.
    expect(applyFilters(over, { ...EMPTY_FILTERS, basis: 'delivery', from: '2026-10-01' }).map((i) => i.journeyId)).toEqual(['j1']);
    expect(applyFilters(over, { ...EMPTY_FILTERS, dealer: 'Shivnath', discount: 'Dealer cash' })).toHaveLength(1);
    expect(applyFilters(over, { ...EMPTY_FILTERS, q: 'shi-2' })).toHaveLength(2);
  });

  it('totals and breakdowns follow the filters', () => {
    const over = excessOnly(items);
    expect(totals(over)).toMatchObject({ excess: 26000, bookings: 2, discounts: 3 });
    expect(breakdown(over, (i) => i.dealer ?? '')[0]).toEqual({ name: 'Shivnath', excess: 21000, discounts: 2, bookings: 1 });
  });

  it('sorts by any column and keeps the URL as the state', () => {
    const over = excessOnly(items);
    expect(sortItems(over, 'excess', 'desc', 'booking').map((i) => i.variance)).toEqual(['20000', '5000', '1000']);
    expect(sortItems(over, 'date', 'asc', 'booking')[0].journeyId).toBe('j1');
    const params = paramsFromFilters({ ...EMPTY_FILTERS, dealer: 'Utkal', basis: 'delivery' });
    expect(params.toString()).toBe('basis=delivery&dealer=Utkal');
    expect(filtersFromParams(params)).toEqual({ ...EMPTY_FILTERS, dealer: 'Utkal', basis: 'delivery' });
  });

  it('gives quick ranges in India time and a CSV of what is shown', () => {
    expect(quickRange('last-month', new Date('2026-11-06T08:00:00Z'))).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(quickRange('this-month', new Date('2026-11-06T08:00:00Z'))).toEqual({ from: '2026-11-01', to: '2026-11-06' });
    const csv = toCsv([row({ customer: 'Das, R' })], 'booking').split('\n');
    expect(csv[0].startsWith('Booking date,Journey,Customer')).toBe(true);
    expect(csv[1]).toContain('"Das, R"');
  });
});

describe('the three lists (product owner 2026-11-06)', () => {
  const mixed = [
    row({}),
    row({ journeyId: 'k', status: 'KIT_AS_CASH', variance: '30000', kit: '30000', invoice: '50000', entitled: '20000' }),
    row({ journeyId: 'u', status: 'ENTITLEMENT_UNKNOWN', entitled: null, variance: null, invoice: '35000',
      reason: 'no scheme master stands behind "Other scheme"' }),
    row({ journeyId: 'h', status: 'OVER_UNLESS_INHOUSE', entitled: '5000', invoice: '7000', variance: '2000',
      ifInhouse: '7000', reason: 'within the grid\'s Rs 7,000 if the insurance was in-house' }),
  ];
  it('splits excess, kit given as cash and entitlement unknown, each with its own amount', () => {
    expect(inView(mixed, 'over').map((i) => i.journeyId)).toEqual(['j1']);
    expect(inView(mixed, 'kit').map((i) => excessOf(i))).toEqual([30000]);
    expect(inView(mixed, 'unknown').map((i) => excessOf(i))).toEqual([35000]);
  });
  it('lists a dealer discount over only unless in-house apart, never as excess (2026-11-14)', () => {
    expect(inView(mixed, 'inhouse').map((i) => [i.journeyId, excessOf(i)])).toEqual([['h', 2000]]);
    expect(viewFromParams(new URLSearchParams('view=inhouse'))).toBe('inhouse');
  });
  it('reads the list from the URL, excess by default', () => {
    expect(viewFromParams(new URLSearchParams('view=kit'))).toBe('kit');
    expect(viewFromParams(new URLSearchParams(''))).toBe('over');
  });
});
