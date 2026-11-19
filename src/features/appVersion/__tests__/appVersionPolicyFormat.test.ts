import { describe, expect, it } from 'vitest';

import { coveredByEveryone, fromLocalInput, peopleBelow, projectFromLabel, toLocalInput } from '../appVersionPolicyFormat';

describe('a minimum app version for one Project', () => {
  it('reads and writes the time as India time', () => {
    expect(fromLocalInput('2026-11-19T20:00')).toBe('2026-11-19T20:00:00+05:30');
    expect(fromLocalInput('')).toBeNull();
    expect(toLocalInput('2026-11-19T14:30:00+00:00')).toBe('2026-11-19T20:00');
    expect(toLocalInput(null)).toBe('');
  });

  it('counts the people still below it', () => {
    expect(peopleBelow([])).toBe(0);
    expect(peopleBelow([{ appVersion: '1.7.0', devices: 12, people: 12 }, { appVersion: '1.8.0', devices: 1, people: 1 }])).toBe(13);
  });

  it('says whether it is in force or from when', () => {
    expect(projectFromLabel({ inForce: true, effectiveFrom: null })).toBe('In force');
    expect(projectFromLabel({ inForce: true, effectiveFrom: '2026-11-19T04:00:00+00:00' })).toBe('In force');
    expect(projectFromLabel({ inForce: false, effectiveFrom: '2026-11-19T14:30:00+00:00' })).toMatch(/^From 19 Nov 2026/);
  });

  it('knows when the minimum for everyone already asks for as much', () => {
    expect(coveredByEveryone('1.9.0', '1.7.0')).toBe(false);
    expect(coveredByEveryone('1.7.0', '1.7.0')).toBe(true);
    expect(coveredByEveryone('1.6.0', '1.7.0')).toBe(true);
    expect(coveredByEveryone('1.9.0', null)).toBe(false);
  });
});
