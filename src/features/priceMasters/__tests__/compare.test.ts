import { describe, expect, it } from 'vitest';

import type { PriceMasterStandard, PriceMasterVehicle, PriceVersion } from '../../../services/audit-core/priceMasters';
import { amountChange, buildCompareLines, defaultCompareDates, defaultWef, findVehicle, wefDates } from '../compare';

const version = (effectiveFrom: string, v: number): PriceVersion => ({
  priceListVersionId: `id-${effectiveFrom}-${v}`, priceList: 'List', version: v, effectiveFrom, effectiveTo: null, status: 'PUBLISHED', sourceFiles: [],
});

const standard = (over: Partial<PriceMasterStandard> = {}): PriceMasterStandard => ({
  wefDate: '2026-09-01', priceListVersion: 1, exShowroom: '1000000.00', tcs: '10000.00',
  insurance: { inHouse: '40000.00', options: [], selectionNeeded: false },
  ewFourthYear: null, ewFourthAndFifthYear: null, accessoriesKit: null, essentialAccessories: null, rsa: null, fastag: null,
  registrationWithoutHypo: '90000.00', registrationWithHypo: '91500.00', hypothecationCharge: '1500.00', hypothecationSource: 'PRICE_LIST',
  onRoadWithoutHypo: '1140000.00', onRoadWithHypo: '1141500.00',
  onRoadByEw: { NONE: { withoutHypo: '1140000.00', withHypo: '1141500.00' }, '4TH': { withoutHypo: null, withHypo: null }, '4TH_5TH': { withoutHypo: null, withHypo: null } },
  minimumBookingAmount: null, extraCharges: [], ...over,
});

describe('wefDates', () => {
  it('lists each date once, newest first, keeping the latest version on a date', () => {
    const got = wefDates([version('2026-08-01', 1), version('2026-09-01', 1), version('2026-09-01', 2)]);
    expect(got.map((d) => d.effectiveFrom)).toEqual(['2026-09-01', '2026-08-01']);
    expect(got[0].version).toBe(2);
  });
});

describe('defaultWef and defaultCompareDates', () => {
  const dates = wefDates([version('2026-10-15', 1), version('2026-09-01', 1), version('2026-08-01', 1), version('2026-07-01', 1)]);
  it('opens on the newest date that has started, not one in the future', () => {
    expect(defaultWef(dates, '2026-10-06')).toBe('2026-09-01');
    expect(defaultWef(dates, '2026-12-01')).toBe('2026-10-15');
    expect(defaultWef([], '2026-10-06')).toBe('');
  });
  it('compares with the two dates just before, then any other dates, never the date itself', () => {
    expect(defaultCompareDates(dates, '2026-09-01')).toEqual(['2026-08-01', '2026-07-01']);
    expect(defaultCompareDates(dates, '2026-07-01')).toEqual(['2026-10-15', '2026-09-01']);
    expect(defaultCompareDates(wefDates([version('2026-09-01', 1)]), '2026-09-01')).toEqual(['', '']);
  });
});

describe('findVehicle', () => {
  it('matches by SKU code, not by position', () => {
    const vehicles = [{ sku: { skuCode: 'A' } }, { sku: { skuCode: 'B' } }] as unknown as PriceMasterVehicle[];
    expect(findVehicle(vehicles, 'B')?.sku.skuCode).toBe('B');
    expect(findVehicle(vehicles, 'Z')).toBeNull();
  });
});

describe('buildCompareLines', () => {
  it('puts the same line from each price list side by side and marks a missing list as null', () => {
    const lines = buildCompareLines([standard(), null, standard({ exShowroom: '1050000.00' })]);
    const ex = lines.find((l) => l.key === 'exShowroom')!;
    expect(ex.values).toEqual(['1000000.00', null, '1050000.00']);
    expect(lines.find((l) => l.key === 'onRoadNoHypo')?.emphasis).toBe(true);
  });
  it('has a line for each warranty option and every extra charge any list names', () => {
    const lines = buildCompareLines([
      standard({ extraCharges: [{ key: 'matte', label: 'Matte colour', amount: '15000.00' }] }),
      standard(),
    ]);
    expect(lines.filter((l) => l.key.startsWith('ew-'))).toHaveLength(6);
    expect(lines.find((l) => l.key === 'extra-matte')?.values).toEqual(['15000.00', null]);
  });
});

describe('amountChange', () => {
  it('says same, more, less, or unknown, and never treats a missing amount as zero', () => {
    expect(amountChange('100.00', '100.00')).toEqual({ kind: 'same', text: 'same' });
    expect(amountChange('100000.00', '105000.00').kind).toBe('up');
    expect(amountChange('100000.00', '105000.00').text).toContain('5,000');
    expect(amountChange('100000.00', '95000.50').kind).toBe('down');
    expect(amountChange(null, '100.00').kind).toBe('unknown');
    expect(amountChange('100.00', null).kind).toBe('unknown');
  });
});
