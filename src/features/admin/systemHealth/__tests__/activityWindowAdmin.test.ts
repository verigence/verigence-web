import { describe, expect, it } from 'vitest';

import { changeText, engagementCommand, minutesText, WINDOW_CHOICES, windowCommand } from '../activityWindowAdmin';

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

describe('engagement settings (2026-11-16)', () => {
  const window = { min: 5, max: 60 };
  const hop = { min: 3, max: 50 };
  it('builds the change of one number for all Projects or one Project', () => {
    expect(engagementCommand('*', 'outputWindowMinutes', '30', window)).toEqual({ command: { tenantId: null, outputWindowMinutes: 30 } });
    expect(engagementCommand('t1', 'hopScreenChanges', '12', hop)).toEqual({ command: { tenantId: 't1', hopScreenChanges: 12 } });
    expect(engagementCommand('t1', 'hopScreenChanges', '', hop)).toEqual({ command: { tenantId: 't1', hopScreenChanges: null } });
    expect(engagementCommand('*', 'hopScreenChanges', '', hop).error).toMatch(/every Project/);
    expect(engagementCommand('*', 'outputWindowMinutes', '4', window).error).toMatch(/5 to 60/);
    expect(engagementCommand('*', 'hopScreenChanges', '51', hop).error).toMatch(/3 to 50/);
  });

  it('describes an engagement change in the log', () => {
    const base = { tenantId: 't1', projectName: 'Mahindra Orissa', previousMinutes: null, minutes: null,
      changedByActorId: 'sa', changedAtUtc: '2026-11-16T15:00:00Z' };
    expect(changeText({ ...base, setting: 'ENGAGEMENT', outputWindowMinutes: 30, hopScreenChanges: 12 }))
      .toBe('Mahindra Orissa: output window 30 minutes, clicking around after 12 screen changes');
    expect(changeText({ ...base, setting: 'ENGAGEMENT', outputWindowMinutes: null, hopScreenChanges: 12 }))
      .toBe('Mahindra Orissa: clicking around after 12 screen changes');
    expect(changeText({ ...base, setting: 'ENGAGEMENT', outputWindowMinutes: null, hopScreenChanges: null }))
      .toBe('Mahindra Orissa: engagement numbers follow the all-Projects values');
    expect(changeText({ ...base, setting: 'READING_WINDOW', minutes: 4 })).toBe('Mahindra Orissa: 4 minutes');
  });
});
