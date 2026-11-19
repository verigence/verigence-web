import { describe, expect, it } from 'vitest';

import { coveredByEveryone, fromLocalInput, peopleBelow, projectFromLabel, projectOptions, toLocalInput } from '../appVersionPolicyFormat';

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

  it('lists the Projects with people, any that already has a minimum, and tells same-named ones apart', () => {
    const choices = [
      { tenantId: 'a', tenantName: 'Mahindra Orissa', people: 17 },
      { tenantId: 'b', tenantName: 'RBAC', people: 1 },
      { tenantId: 'c', tenantName: 'RBAC', people: 3 },
    ];
    const projects = [{ tenantId: 'z', tenantName: 'Old Project', minimumVersion: '1.9.0', effectiveFrom: null, inForce: true, devicesBelow: [] }];
    expect(projectOptions(choices, projects).map((o) => o.tenantName)).toEqual([
      'Mahindra Orissa', 'RBAC (1 person)', 'RBAC (3 people)', 'Old Project',
    ]);
  });

  it('knows when the minimum for everyone already asks for as much', () => {
    expect(coveredByEveryone('1.9.0', '1.7.0')).toBe(false);
    expect(coveredByEveryone('1.7.0', '1.7.0')).toBe(true);
    expect(coveredByEveryone('1.6.0', '1.7.0')).toBe(true);
    expect(coveredByEveryone('1.9.0', null)).toBe(false);
  });
});
