import { describe, expect, it } from 'vitest';

import {
  dailyProcessingDay,
  hasNextPeriod,
  istMonth,
  monthLabel,
  monthsUpTo,
  shiftPeriod,
  trackerFromSearch,
  trackerLabel,
  trackerRange,
  trackerSearch,
  trackerTabFromSearch,
  trackerTabHref,
  TRACKER_TABS,
  trackerTabsFor,
} from './uc03ProjectTracker';

describe('Project Tracker periods', () => {
  it('a day, a Monday-to-Sunday week and a calendar month', () => {
    expect(trackerRange('DAY', '2026-11-07')).toEqual({ first: '2026-11-07', last: '2026-11-07' });
    expect(trackerRange('WEEK', '2026-11-07')).toEqual({ first: '2026-11-02', last: '2026-11-08' });
    // A Sunday belongs to the week that started on the Monday before it.
    expect(trackerRange('WEEK', '2026-11-08')).toEqual({ first: '2026-11-02', last: '2026-11-08' });
    expect(trackerRange('WEEK', '2026-11-09')).toEqual({ first: '2026-11-09', last: '2026-11-15' });
    // Across a year end.
    expect(trackerRange('WEEK', '2027-01-01')).toEqual({ first: '2026-12-28', last: '2027-01-03' });
    expect(trackerRange('MONTH', '2026-11-07')).toEqual({ first: '2026-11-01', last: '2026-11-30' });
    expect(trackerRange('MONTH', '2028-02-10')).toEqual({ first: '2028-02-01', last: '2028-02-29' });
    expect(trackerRange('MONTH', '2026-12-31')).toEqual({ first: '2026-12-01', last: '2026-12-31' });
  });

  it('steps to the previous and next period', () => {
    expect(shiftPeriod('DAY', '2026-11-01', -1)).toBe('2026-10-31');
    expect(shiftPeriod('WEEK', '2026-11-07', -1)).toBe('2026-10-26');
    expect(shiftPeriod('WEEK', '2026-11-07', 1)).toBe('2026-11-09');
    expect(shiftPeriod('MONTH', '2026-03-31', -1)).toBe('2026-02-01');
    expect(shiftPeriod('MONTH', '2026-12-15', 1)).toBe('2027-01-01');
    expect(hasNextPeriod('MONTH', '2026-11-07', '2026-11-07')).toBe(false);
    expect(hasNextPeriod('WEEK', '2026-10-28', '2026-11-07')).toBe(true);
    expect(hasNextPeriod('DAY', '2026-11-07', '2026-11-07')).toBe(false);
  });

  it('labels', () => {
    expect(trackerLabel('DAY', '2026-11-07')).toBe('Sat 7 Nov 2026');
    expect(trackerLabel('WEEK', '2026-11-07')).toBe('2 Nov – 8 Nov 2026');
    expect(trackerLabel('WEEK', '2027-01-01')).toBe('28 Dec 2026 – 3 Jan 2027');
    expect(trackerLabel('MONTH', '2026-11-07')).toBe('November 2026');
  });

  it('reads and writes the shareable address', () => {
    const today = '2026-11-07';
    expect(trackerFromSearch(new URLSearchParams(''), today)).toEqual({ period: 'DAY', date: today });
    expect(trackerFromSearch(new URLSearchParams('period=week&date=2026-10-20'), today))
      .toEqual({ period: 'WEEK', date: '2026-10-20' });
    expect(trackerFromSearch(new URLSearchParams('period=MONTH'), today)).toEqual({ period: 'MONTH', date: today });
    // Unknown period, malformed or future date: today's day.
    expect(trackerFromSearch(new URLSearchParams('period=year&date=nonsense'), today)).toEqual({ period: 'DAY', date: today });
    expect(trackerFromSearch(new URLSearchParams('period=day&date=2026-11-09'), today)).toEqual({ period: 'DAY', date: today });
    // The current week may be asked by any of its days, the coming Sunday included.
    expect(trackerFromSearch(new URLSearchParams('period=week&date=2026-11-08'), today))
      .toEqual({ period: 'WEEK', date: '2026-11-08' });
    expect(trackerSearch('MONTH', '2026-11-03', today)).toBe('period=month');
    expect(trackerSearch('WEEK', '2026-10-20', today)).toBe('period=week&date=2026-10-20');
  });
});

describe('Team Lead dashboard calendar month', () => {
  it('is the IST month', () => {
    // 20:00 UTC on 31 Oct is 01:30 on 1 Nov in India.
    expect(istMonth(new Date('2026-10-31T20:00:00Z'))).toBe('2026-11');
    expect(istMonth(new Date('2026-10-31T18:00:00Z'))).toBe('2026-10');
  });

  it('lists months newest first across a year end', () => {
    const months = monthsUpTo('2026-02', 4);
    expect(months.map((m) => m.value)).toEqual(['2026-02', '2026-01', '2025-12', '2025-11']);
    expect(months[0].label).toBe('Feb 2026');
    expect(monthLabel('2026-11')).toBe('November 2026');
  });
});

describe('Project Tracker tabs', () => {
  it('reads the tab from the address, Performance by default (old tracker addresses too)', () => {
    expect(trackerTabFromSearch(new URLSearchParams(''))).toBe('performance');
    expect(trackerTabFromSearch(new URLSearchParams('tab=tracker'))).toBe('performance');
    expect(trackerTabFromSearch(new URLSearchParams('period=week&view=files'))).toBe('performance');
    expect(trackerTabFromSearch(new URLSearchParams('tab=daily-processing'))).toBe('daily-processing');
    expect(trackerTabFromSearch(new URLSearchParams('tab=gate-pass'))).toBe('gate-pass');
    expect(trackerTabFromSearch(new URLSearchParams('tab=nonsense'))).toBe('performance');
  });

  it('the Daily processing day comes from ?day=, then the tracker date, never the future', () => {
    const today = '2026-11-09';
    expect(dailyProcessingDay(new URLSearchParams('tab=daily-processing&day=2026-11-07'), today)).toBe('2026-11-07');
    expect(dailyProcessingDay(new URLSearchParams('period=week&date=2026-11-04'), today)).toBe('2026-11-04');
    expect(dailyProcessingDay(new URLSearchParams('day=2026-11-10'), today)).toBe(today);
    expect(dailyProcessingDay(new URLSearchParams('day=bad'), today)).toBe(today);
  });

  it('keeps Performance and the two pieces the product owner keeps, with Journeys and the DMS dumps (2026-11-13)', () => {
    // Journeys: the Dealership / Outlet / PC-wise panels moved off the TL landing page; DMS dumps:
    // the daily dumps like the gate register, the Team Lead's only.
    expect(TRACKER_TABS.map((t) => t.label)).toEqual(['Performance', 'Journeys', 'Work done and files closed',
      'Gate Register', 'DMS dumps']);
    expect(trackerTabsFor('TL').map((t) => t.key)).toContain('dms-dumps');
    expect(trackerTabsFor('PM').map((t) => t.key)).not.toContain('dms-dumps');
    expect(trackerTabsFor('EXECUTIVE').map((t) => t.key)).not.toContain('dms-dumps');
  });

  it('old addresses open the matching tab', () => {
    expect(trackerTabHref('daily-processing', '2026-11-08')).toBe('/p2/project-tracker?tab=daily-processing&day=2026-11-08');
    expect(trackerTabHref('daily-processing')).toBe('/p2/project-tracker?tab=daily-processing');
    expect(trackerTabHref('gate-pass')).toBe('/p2/project-tracker?tab=gate-pass');
    expect(trackerTabHref('performance')).toBe('/p2/project-tracker');
  });
});

describe('journey filters: a date range (2026-11-14)', () => {
  it('sends from and to, only both together', async () => {
    const { journeyFilterParams } = await import('./uc03P2');
    expect(journeyFilterParams({ dateFrom: '2026-11-01', dateTo: '2026-11-14' }).toString()).toBe('from=2026-11-01&to=2026-11-14');
    expect(journeyFilterParams({ dateFrom: '2026-11-01' }).toString()).toBe('');
  });
});
