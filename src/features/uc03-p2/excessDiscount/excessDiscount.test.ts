import { describe, expect, it } from 'vitest';

import type { DiscountVarianceItem } from '../../../services/audit-core/uc03DiscountVariance';
import {
  applyFilters, breakdown, dealTypeOf, EMPTY_FILTERS, excessOf, excessOnly, inView, modelOf, offerLine, options, readingsLine, viewFromParams, filtersFromParams, paramsFromFilters, quickRange, sortItems, toCsv, totals,
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

  it('filters by deal type and by model; a deal type not decided and a model not identified are their own choices', () => {
    // Product owner, 23 Nov 2026: "give filters to have inscope, and filter by dealership, model wise".
    const rows = [
      row({ journeyId: 'a', dealType: 'Inscope', model: 'MAXX HD' }),
      row({ journeyId: 'b', dealType: 'Outscope', model: 'MAXX HD' }),
      row({ journeyId: 'c', dealType: null, model: null }),
    ];
    expect(applyFilters(rows, { ...EMPTY_FILTERS, dealType: 'Inscope' }).map((i) => i.journeyId)).toEqual(['a']);
    expect(applyFilters(rows, { ...EMPTY_FILTERS, model: 'MAXX HD' }).map((i) => i.journeyId)).toEqual(['a', 'b']);
    expect(applyFilters(rows, { ...EMPTY_FILTERS, model: 'MAXX HD', dealType: 'Outscope' }).map((i) => i.journeyId)).toEqual(['b']);
    expect(options(rows, dealTypeOf)).toEqual(['Deal type not decided', 'Inscope', 'Outscope']);
    expect(applyFilters(rows, { ...EMPTY_FILTERS, dealType: 'Deal type not decided' }).map((i) => i.journeyId)).toEqual(['c']);
    expect(applyFilters(rows, { ...EMPTY_FILTERS, model: 'Model not identified' }).map((i) => i.journeyId)).toEqual(['c']);
    expect(breakdown(rows, modelOf)[0]).toMatchObject({ name: 'MAXX HD', discounts: 2, bookings: 2 });
    const params = paramsFromFilters({ ...EMPTY_FILTERS, dealType: 'Inscope', model: 'MAXX HD' });
    expect(filtersFromParams(params)).toEqual({ ...EMPTY_FILTERS, dealType: 'Inscope', model: 'MAXX HD' });
    expect(toCsv(rows, 'booking').split('\n')[0]).toContain('Variant,Deal type,Discount type');
    expect(toCsv(rows, 'booking').split('\n')[1]).toContain('AX5,Inscope,Consumer offer');
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

describe('readings and offer (2026-11-14); the NDC decides (2026-11-15)', () => {
  const item = {
    journeyId: 'j9', journeyReference: 'UTK-SB-261114-012', customer: null, pc: null, outlet: null, model: null, variant: null,
    discountKey: 'ADDITIONAL_DISCOUNT', discount: 'Dealer discount', status: 'FIGURES_DISAGREE', entitled: '7000',
    invoice: '71000', variance: '64000', givenFrom: 'billed', ledger: '7000',
    readings: [{ document: 'NDC (Account Statement)', amount: '71000' }, { document: 'Customer ledger (Tally)', amount: '7000' }],
    offer: { source: 'Dealer discount grid', tier: 'WITH_INSURANCE', tiers: { BASE: '5000', WITH_INSURANCE: '7000' } },
  } as const;

  it('judges on the NDC: a row the Tally ledger contradicts stays in the excess list', () => {
    const items = [{ ...item, status: 'OVER_ENTITLEMENT' } as never];
    expect(inView(items, 'over')).toHaveLength(1);
    expect(viewFromParams(new URLSearchParams('view=disagree'))).toBe('over');
  });

  it('says what each document read and what the master offers', () => {
    expect(readingsLine(item as never)).toBe('NDC (Account Statement) ₹71,000 · Customer ledger (Tally) ₹7,000');
    expect(offerLine(item as never)).toBe('Grid: base ₹5,000 · with insurance ₹7,000 (judged at with insurance)');
  });
});

describe('the NDC reading in doubt list (2026-11-17)', () => {
  it('lists a discount read from an NDC that does not add up apart, never as excess', () => {
    const doubt = { journeyId: 'j1', journeyReference: 'UTK-SA-261027-004', customer: null, pc: null, outlet: null,
      model: null, variant: null, discountKey: 'ADDITIONAL_DISCOUNT', discount: 'Dealer discount', status: 'READING_IN_DOUBT',
      entitled: '0', invoice: '71000', variance: '71000', givenFrom: 'billed', reason: 'the NDC does not add up' } as const;
    expect(inView([doubt], 'doubt')).toHaveLength(1);
    expect(inView([doubt], 'over')).toHaveLength(0);
  });
});
