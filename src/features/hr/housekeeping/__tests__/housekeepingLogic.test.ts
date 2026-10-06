import { describe, expect, it } from 'vitest';

import { cleanEmployeeCode, deletableTotal, describeCounts, describeEmployeeCounts, periodRange } from '../housekeepingLogic';

describe('periodRange', () => {
  it('takes a past day as it is and refuses a future one', () => {
    expect(periodRange('DAY', '2026-10-05', '2026-10-06')).toEqual({ from: '2026-10-05', to: '2026-10-05' });
    expect(periodRange('DAY', '2026-10-07', '2026-10-06')).toBeNull();
    expect(periodRange('DAY', '', '2026-10-06')).toBeNull();
  });
  it('covers a finished month whole and a running month up to today', () => {
    expect(periodRange('MONTH', '2026-09', '2026-10-06')).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(periodRange('MONTH', '2026-02', '2026-10-06')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(periodRange('MONTH', '2026-10', '2026-10-06')).toEqual({ from: '2026-10-01', to: '2026-10-06' });
    expect(periodRange('MONTH', '2026-11', '2026-10-06')).toBeNull();
    expect(periodRange('MONTH', '2026-13', '2026-10-06')).toBeNull();
  });
});

describe('counts', () => {
  it('reads out only what is known and does not count kept claims as deletable', () => {
    const counts = { claims: 2, receipts: 3, keptInPayroll: 4, other: 9 };
    expect(describeCounts(counts)).toBe('2 reimbursement claims, 3 receipts, 4 claims kept because a payroll already has them');
    expect(deletableTotal(counts)).toBe(5);
  });
});

describe('employee delete helpers', () => {
  it('names what goes with the employee and leaves out zeros', () => {
    expect(describeEmployeeCounts({ attendanceDays: 12, claims: 0, leaveRequests: 2, other: 5 })).toBe('12 attendance days, 2 leave requests');
    expect(describeEmployeeCounts({ attendanceDays: 0 })).toBe('');
  });

  it('cleans the code typed by a person', () => {
    expect(cleanEmployeeCode('  jbr033 ')).toBe('JBR033');
  });
});
