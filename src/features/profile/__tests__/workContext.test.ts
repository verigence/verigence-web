import { describe, expect, it } from 'vitest';

import type { OperationalProject } from '../../../services/audit-core/uc03';
import { chooseDisplayName, roleOrDesignation, workContextLabels } from '../workContext';

const outlet = (id: string, name: string, dealer = 'Mahindra Odisha') => ({ dealerId: `d-${dealer}`, dealerName: dealer, outletId: id, outletName: name, outletClassification: 'SALES' });
const project = (outlets: ReturnType<typeof outlet>[], over: Partial<OperationalProject['scope']> = {}): OperationalProject => ({
  tenantId: 't1', projectCode: 'MAH', projectName: 'Mahindra', projectStatus: 'ACTIVE', timezoneName: 'Asia/Kolkata', operatingRole: 'PC',
  scope: { allDealers: false, dealerCount: 1, outletCount: outlets.length, outlets, ...over },
});

describe('chooseDisplayName', () => {
  it('prefers the HR name, then the sign-in name, then nothing', () => {
    expect(chooseDisplayName('Akansh Chopra', 'akanshchopra')).toBe('Akansh Chopra');
    expect(chooseDisplayName('  ', 'akanshchopra')).toBe('akanshchopra');
    expect(chooseDisplayName(undefined, 'akanshchopra')).toBe('akanshchopra');
    expect(chooseDisplayName(null, '')).toBe('');
  });
});

describe('workContextLabels', () => {
  it('shows the project, dealer and the one outlet', () => {
    expect(workContextLabels(project([outlet('o1', 'Bhubaneswar Central')]), 'o1')).toEqual({
      project: 'Mahindra', dealer: 'Mahindra Odisha', outlet: 'Bhubaneswar Central',
    });
  });

  it('lists the selected outlet first and each dealer once', () => {
    const p = project([outlet('o1', 'Cuttack'), outlet('o2', 'Puri', 'TVS East'), outlet('o3', 'Rourkela')]);
    const labels = workContextLabels(p, 'o2');
    expect(labels.outlet).toBe('Puri, Cuttack, Rourkela');
    expect(labels.dealer).toBe('TVS East, Mahindra Odisha');
  });

  it('says "All" when the scope is wide but lists nothing, and "Not assigned" otherwise', () => {
    expect(workContextLabels(project([], { allDealers: true }), '')).toMatchObject({ dealer: 'All dealers', outlet: 'All outlets' });
    expect(workContextLabels(project([]), '')).toMatchObject({ dealer: 'Not assigned', outlet: 'Not assigned' });
    expect(workContextLabels(undefined, '')).toEqual({ project: 'Not assigned', dealer: 'Not assigned', outlet: 'Not assigned' });
  });
});


describe('roleOrDesignation', () => {
  it('shows the designation for an employee, not the role', () => {
    expect(roleOrDesignation(true, 'Senior Analyst', 'Process Consultant')).toEqual({ label: 'Designation', value: 'Senior Analyst' });
  });
  it('says so when an employee has no designation yet', () => {
    expect(roleOrDesignation(true, null, 'Process Consultant')).toEqual({ label: 'Designation', value: 'Not set yet' });
    expect(roleOrDesignation(true, '  ', 'Process Consultant').value).toBe('Not set yet');
  });
  it('keeps the role for someone without an employee record', () => {
    expect(roleOrDesignation(false, null, 'Team Lead')).toEqual({ label: 'Role', value: 'Team Lead' });
  });
});
