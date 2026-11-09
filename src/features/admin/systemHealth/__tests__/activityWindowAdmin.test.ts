import { describe, expect, it } from 'vitest';

import { changeText, minutesText, WINDOW_CHOICES, windowCommand } from '../activityWindowAdmin';

describe('reading window control', () => {
  it('offers 1 to 10 minutes', () => {
    expect(WINDOW_CHOICES).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(minutesText(1)).toBe('1 minute');
    expect(minutesText(3)).toBe('3 minutes');
  });

  it('builds the change for all Projects or one Project', () => {
    expect(windowCommand('*', '5')).toEqual({ command: { tenantId: null, readingWindowMinutes: 5 } });
    expect(windowCommand('t1', '2')).toEqual({ command: { tenantId: 't1', readingWindowMinutes: 2 } });
    expect(windowCommand('t1', 'inherit')).toEqual({ command: { tenantId: 't1', readingWindowMinutes: null } });
    expect(windowCommand('*', 'inherit').error).toMatch(/every Project/);
    expect(windowCommand('*', '11').error).toMatch(/1 to 10/);
    expect(windowCommand('*', '0').error).toMatch(/1 to 10/);
  });

  it('describes each recorded change', () => {
    const base = { changedByActorId: 'sa-1', changedAtUtc: '2026-11-09T03:00:00Z' };
    expect(changeText({ ...base, tenantId: null, projectName: null, previousMinutes: 3, minutes: 5 })).toBe('All Projects: 3 minutes → 5 minutes');
    expect(changeText({ ...base, tenantId: 't1', projectName: 'Mahindra Orissa', previousMinutes: null, minutes: 2 })).toBe('Mahindra Orissa: 2 minutes');
    expect(changeText({ ...base, tenantId: 't1', projectName: 'Mahindra Orissa', previousMinutes: 2, minutes: null }))
      .toBe('Mahindra Orissa: 2 minutes → follows the all-Projects value');
  });
});
