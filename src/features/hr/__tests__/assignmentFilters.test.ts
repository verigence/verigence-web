import { describe, expect, it } from 'vitest';

import type { AssignedEmployee } from '../../../services/hr/workAssignments';
import { assignmentFreshness, filterAssigned, NO_PROJECT_FILTER } from '../assignmentFilters';

const a = (projectCode: string) => ({ projectCode, projectName: projectCode, role: 'PC', dealerName: null, outletName: null, outletHasLocation: true, since: null });
const people: AssignedEmployee[] = [
  { employeeId: '1', employeeCode: 'JBR001', fullName: 'Asha Rao', hasLogin: true, assignments: [a('MAH')] },
  { employeeId: '2', employeeCode: 'JBR002', fullName: 'Biswa Das', hasLogin: true, assignments: [a('TVS'), a('MAH')] },
  { employeeId: '3', employeeCode: 'JBR003', fullName: 'Chandini', hasLogin: false, assignments: [] },
];

describe('filterAssigned', () => {
  it('filters by project, no project and search', () => {
    expect(filterAssigned(people, '', '').length).toBe(3);
    expect(filterAssigned(people, 'TVS', '').map((p) => p.employeeId)).toEqual(['2']);
    expect(filterAssigned(people, NO_PROJECT_FILTER, '').map((p) => p.employeeId)).toEqual(['3']);
    expect(filterAssigned(people, 'MAH', ' jbr00 ').map((p) => p.employeeId)).toEqual(['1', '2']);
    expect(filterAssigned(people, '', 'asha').map((p) => p.employeeId)).toEqual(['1']);
  });
});

describe('assignmentFreshness', () => {
  const now = new Date('2026-10-04T12:00:00Z');
  it('is fine when recent and OK', () => {
    expect(assignmentFreshness('2026-10-04T03:00:00Z', 'OK', now).warn).toBe(false);
  });
  it('warns when never synced, older than 36 hours, or not OK', () => {
    expect(assignmentFreshness(null, 'OK', now).warn).toBe(true);
    expect(assignmentFreshness('2026-10-02T23:00:00Z', 'OK', now).warn).toBe(true);
    expect(assignmentFreshness('2026-10-04T03:00:00Z', 'FAILED', now).warn).toBe(true);
  });
});
