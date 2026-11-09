/**
 * The supervisor's journey list filters by Dealership (product owner
 * 2026-11-09), and the Outlet choices follow the chosen Dealership.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { journeyFilterParams } from '../../../../services/audit-core/uc03P2';
import { dealerAfterOutletPick, outletAfterDealerChange, outletsOfDealer } from '../listSelection';

const outlets = [
  { outlet_id: 'o1', dealer_id: 'd1' },
  { outlet_id: 'o2', dealer_id: 'd1' },
  { outlet_id: 'o3', dealer_id: 'd2' },
];

describe('journey filter parameters', () => {
  it('sends the Dealership with the other filters', () => {
    const params = journeyFilterParams({
      search: '  98765 43210 ', month: '2026-11', monthBasis: 'business', dealerId: 'd1', outletId: 'o1', pcActorId: 'pc-1',
    });
    expect(Object.fromEntries(params)).toEqual({
      q: '98765 43210', month: '2026-11', month_basis: 'business', dealer_id: 'd1', outlet_id: 'o1', pc_actor_id: 'pc-1',
    });
  });

  it('sends no Dealership when none is picked', () => {
    expect(journeyFilterParams({ dealerId: '', outletId: 'o1' }).has('dealer_id')).toBe(false);
    expect(journeyFilterParams({}).toString()).toBe('');
  });
});

describe('Outlet choices follow the Dealership', () => {
  it('offers only the picked Dealership\'s Outlets', () => {
    expect(outletsOfDealer(outlets, 'd1').map((o) => o.outlet_id)).toEqual(['o1', 'o2']);
    expect(outletsOfDealer(outlets, 'd2').map((o) => o.outlet_id)).toEqual(['o3']);
    expect(outletsOfDealer(outlets, '')).toBe(outlets);
  });

  it('offers every Outlet when the Outlets do not name their Dealership', () => {
    const unnamed = [{ outlet_id: 'o1' }, { outlet_id: 'o2', dealer_id: null }];
    expect(outletsOfDealer(unnamed, 'd1')).toBe(unnamed);
  });

  it('keeps the picked Outlet only while it belongs to the new Dealership', () => {
    expect(outletAfterDealerChange('o1', 'd1', outlets)).toBe('o1');
    expect(outletAfterDealerChange('o1', 'd2', outlets)).toBe('');
    expect(outletAfterDealerChange('o1', '', outlets)).toBe('o1');
    expect(outletAfterDealerChange('', 'd2', outlets)).toBe('');
  });

  it('moves the Dealership to a picked Outlet\'s own', () => {
    expect(dealerAfterOutletPick('d1', 'o3', outlets)).toBe('d2');
    expect(dealerAfterOutletPick('d1', 'o2', outlets)).toBe('d1');
    expect(dealerAfterOutletPick('', 'o3', outlets)).toBe('');
    expect(dealerAfterOutletPick('d1', '', outlets)).toBe('d1');
  });
});

describe('the list', () => {
  const source = readFileSync(join(__dirname, '..', 'JourneyListTabs.tsx'), 'utf8');

  it('offers the Dealership filter and panel only when the Project has more than one Dealership', () => {
    expect(source).toContain('const manyDealers = supervisor && dealers.length > 1;');
    expect(source).toContain('title="Dealership-wise"');
    expect(source).toContain('<option value="">All dealerships</option>');
  });

  it('says a full mobile number can be searched', () => {
    expect(source).toContain('placeholder="Customer name, mobile number, vehicle, outlet or Journey ID"');
    expect(source).not.toContain('mobile last 4');
  });
});
