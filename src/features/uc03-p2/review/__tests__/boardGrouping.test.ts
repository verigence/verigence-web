import { describe, expect, it } from 'vitest';

import type { ReviewerJourney } from '../../../../services/audit-core/uc03P2Reviewer';
import { formatUploadDay, groupByPc, groupByUploadDay, pcCounts } from '../boardGrouping';

const journey = (journeyId: string, uploadDate?: string): ReviewerJourney => ({
  journeyId, uploadDate, claimedByMe: false,
  booking: { documentCount: 0 }, delivery: { documentCount: 0 },
});

describe("an outlet's journeys by upload day", () => {
  it('groups consecutive journeys of one day and keeps the order it was given', () => {
    const groups = groupByUploadDay([
      journey('a', '2026-10-10'), journey('b', '2026-10-10'), journey('c', '2026-10-12'),
    ]);
    expect(groups.map((g) => [g.uploadDate, g.journeys.map((j) => j.journeyId)])).toEqual([
      ['2026-10-10', ['a', 'b']], ['2026-10-12', ['c']],
    ]);
  });

  it('keeps a journey with no upload date, in a group of its own at the end', () => {
    const groups = groupByUploadDay([journey('x'), journey('a', '2026-10-10')]);
    expect(groups.map((g) => [g.uploadDate, g.journeys.length])).toEqual([['2026-10-10', 1], ['', 1]]);
  });

  it('writes the day without shifting it through a timezone', () => {
    expect(formatUploadDay('2026-10-01')).toBe('1 Oct 2026');
    expect(formatUploadDay('')).toBe('No upload date');
  });
});

describe("an outlet's journeys by PC", () => {
  const byPc = (journeyId: string, pcName?: string | null): ReviewerJourney => ({
    ...journey(journeyId, '2026-10-10'), pcName,
  });

  it('groups by PC A to Z, keeps the given order within a PC, and puts no-PC last', () => {
    const groups = groupByPc([
      byPc('a', 'subhakant'), byPc('b', null), byPc('c', 'Aditya'), byPc('d', 'subhakant'), byPc('e', '  '),
    ]);
    expect(groups.map((g) => [g.pcName, g.journeys.map((j) => j.journeyId)])).toEqual([
      ['Aditya', ['c']], ['subhakant', ['a', 'd']], ['', ['b', 'e']],
    ]);
  });

  it('counts journeys per PC', () => {
    expect(pcCounts([byPc('a', 'X'), byPc('b', 'X'), byPc('c')])).toEqual([
      { pcName: 'X', count: 2 }, { pcName: '', count: 1 },
    ]);
  });
});
