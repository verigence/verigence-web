import { describe, expect, it } from 'vitest';

import type { EngagementPerson } from '../../services/audit-core/taskManager';
import { dayLeaders, istClock, sourceShareText, timeRanking, topBy } from './engagementHighlights';

function person(actorId: string, minutes: number, extra: Partial<EngagementPerson> = {}, files = 0): EngagementPerson {
  return {
    actorId, name: actorId.toUpperCase(), role: 'PC', activeInProject: true, outlets: [], periods: [],
    totals: {
      activeMinutes: minutes, daysActive: minutes ? 1 : 0, filesUploaded: files, journeyTasksWorked: 0, tasksCompleted: 0,
      activeMinutesBySource: minutes ? { WEB: minutes } : {},
      efficacy: { avgActiveMinutesPerDayActive: minutes || null },
    } as unknown as EngagementPerson['totals'],
    ...extra,
  };
}

describe('engagement highlights', () => {
  it('finds who was in first and out last each day, newest day first', () => {
    const people = [
      person('a', 60, { days: [
        { day: '2026-10-26', activeMinutes: 30, firstActiveAtUtc: '2026-10-26T03:30:00Z', lastActiveAtUtc: '2026-10-26T12:00:00Z' },
        { day: '2026-10-27', activeMinutes: 30, firstActiveAtUtc: '2026-10-27T04:00:00Z', lastActiveAtUtc: '2026-10-27T10:00:00Z' },
      ] }),
      person('b', 40, { days: [
        { day: '2026-10-27', activeMinutes: 40, firstActiveAtUtc: '2026-10-27T03:45:00Z', lastActiveAtUtc: '2026-10-27T13:15:00Z' },
      ] }),
    ];
    const days = dayLeaders(people);
    expect(days.map((d) => d.day)).toEqual(['2026-10-27', '2026-10-26']);
    expect(days[0].firstIn?.actorId).toBe('b');
    expect(days[0].lastOut?.actorId).toBe('b');
    expect(days[0].peopleActive).toBe(2);
    expect(days[0].activeMinutes).toBe(70);
    expect(days[1].firstIn?.actorId).toBe('a');
    expect(istClock(days[0].firstIn!.at)).toBe('09:15');
  });

  it('ranks most and least time without overlap and keeps the unseen apart', () => {
    const people = [person('a', 300), person('b', 120), person('c', 20), person('d', 0),
      person('e', 0, { activeInProject: false })];
    const r = timeRanking(people);
    expect(r.most.map((p) => p.actorId)).toEqual(['a', 'b']);
    expect(r.least.map((p) => p.actorId)).toEqual(['c']);
    expect(r.notSeen.map((p) => p.actorId)).toEqual(['d']);
    expect(r.total).toBe(440);
    expect(r.perPersonDay).toBe(147);
    expect(timeRanking([person('solo', 10)]).least).toEqual([]);
  });

  it('names the top person and the share of time by source', () => {
    const people = [person('a', 30, {}, 2), person('b', 10, {}, 5)];
    people[1].totals.activeMinutesBySource = { ANDROID: 10 };
    expect(topBy(people, (p) => p.totals.filesUploaded)).toMatchObject({ actorId: 'b', count: 5 });
    expect(topBy(people, (p) => p.totals.tasksCompleted)).toBeNull();
    expect(sourceShareText(people, { WEB: 'Computer', ANDROID: 'Android app' })).toBe('Computer 75% · Android app 25%');
  });
});
