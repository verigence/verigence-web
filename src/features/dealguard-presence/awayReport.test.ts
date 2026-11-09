import { describe, expect, it } from 'vitest';

import { locationAwayPath, type AwayInstance } from '../../services/audit-core/locationChecks';
import {
  awayCsv,
  dateLabel,
  deviceLabel,
  groupByDate,
  instanceLine,
  presetOf,
  presetRange,
  roughKm,
} from './awayReport';

function item(over: Partial<AwayInstance>): AwayInstance {
  return {
    checkId: Math.random().toString(36).slice(2),
    actorId: 'pc-1',
    name: 'S Siba Rao',
    date: '2026-11-05',
    time: '13:23',
    checkedAtUtc: '2026-11-05T07:53:00Z',
    distanceM: 5612.3,
    distanceKm: 5.6,
    outletName: 'Utkal Mahindra - PALASUNI COMMERCIAL',
    accuracyM: 200,
    source: 'BROWSER',
    deviceType: 'WEB',
    ...over,
  };
}

describe('away more than N km, date-wise', () => {
  it('says roughly how far, to a tenth of a kilometre', () => {
    expect(roughKm(5.6)).toBe('~5.6 km');
    expect(roughKm(145.8)).toBe('~145.8 km');
    expect(roughKm(10)).toBe('~10.0 km');
    expect(roughKm(null)).toBe('—');
  });

  it('groups the instances by date, oldest first, each by time', () => {
    const groups = groupByDate([
      item({ date: '2026-11-06', time: '13:10', checkedAtUtc: '2026-11-06T07:40:00Z' }),
      item({ date: '2026-11-05', time: '15:42', distanceKm: 5.1, checkedAtUtc: '2026-11-05T10:12:00Z' }),
      item({ date: '2026-11-06', time: '12:31', actorId: 'pc-2', name: 'Bodhisundar Mohanty', distanceKm: 145.8,
        outletName: 'Aditya Motors - Cuttack', checkedAtUtc: '2026-11-06T07:01:00Z' }),
      item({ date: '2026-11-05', time: '13:23' }),
    ]);
    expect(groups.map((g) => g.date)).toEqual(['2026-11-05', '2026-11-06']);
    expect(groups[0].instances.map((i) => i.time)).toEqual(['13:23', '15:42']);
    expect(groups[0]).toMatchObject({ pcs: 1, furthestKm: 5.6 });
    expect(groups[1].instances.map((i) => i.time)).toEqual(['12:31', '13:10']);
    expect(groups[1]).toMatchObject({ pcs: 2, furthestKm: 145.8 });
    expect(groupByDate([])).toEqual([]);
  });

  it('words each instance as time · PC · distance from the outlet', () => {
    expect(instanceLine(item({}))).toBe('13:23 · S Siba Rao · ~5.6 km from Utkal Mahindra - PALASUNI COMMERCIAL');
    expect(instanceLine(item({ name: null, outletName: null }))).toBe('13:23 · pc-1 · ~5.6 km from the nearest outlet');
    expect(deviceLabel(item({}))).toBe('Computer');
    expect(deviceLabel(item({ deviceType: null, source: 'NATIVE' }))).toBe('App');
  });

  it('labels dates in India style', () => {
    expect(dateLabel('2026-11-05')).toMatch(/Thu.*5.*Nov.*2026/);
  });

  it('works out the quick dates from the India date', () => {
    expect(presetRange('this-month', '2026-11-09')).toEqual({ from: '2026-11-01', to: '2026-11-09' });
    expect(presetRange('last-7', '2026-11-03')).toEqual({ from: '2026-10-28', to: '2026-11-03' });
    expect(presetRange('last-month', '2026-11-09')).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(presetRange('last-month', '2026-03-15')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(presetRange('last-month', '2026-01-05')).toEqual({ from: '2025-12-01', to: '2025-12-31' });
    expect(presetOf({ from: '2026-11-01', to: '2026-11-09' }, '2026-11-09')).toBe('this-month');
    expect(presetOf({ from: '2026-11-02', to: '2026-11-09' }, '2026-11-09')).toBeNull();
  });

  it('exports the instances as CSV', () => {
    const csv = awayCsv([item({}), item({ name: 'A, "B"', accuracyM: null, outletName: null })]);
    const [head, first, second] = csv.split('\n');
    expect(head).toBe('Date,Time (IST),PC,Distance (km),Nearest outlet,Device,Accuracy (m)');
    expect(first).toBe('2026-11-05,13:23,S Siba Rao,5.6,Utkal Mahindra - PALASUNI COMMERCIAL,Computer,200');
    expect(second).toBe('2026-11-05,13:23,"A, ""B""",5.6,,Computer,');
  });

  it('reads the Project report or the SuperAdmin one', () => {
    const range = { from: '2026-11-01', to: '2026-11-09', minKm: 5 };
    expect(locationAwayPath('project', 't 1', range))
      .toBe('/p2/v1/tenants/t%201/location-checks:away?from=2026-11-01&to=2026-11-09&minKm=5');
    expect(locationAwayPath('admin', 't', range))
      .toBe('/v1/admin/tenants/t/location-checks:away?from=2026-11-01&to=2026-11-09&minKm=5');
  });
});
