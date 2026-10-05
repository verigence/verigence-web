import { describe, expect, it } from 'vitest';

import type { DailyRow } from '../../../../services/hr/attendanceReports';
import { delinquencyText, fenceLabel, formatHours, groupByProject, reportFileName, shiftDate, validateReportRange } from '../dailyAttendance';
import { approverPhrase, exceptionLabel } from '../attendanceFormat';

const row = (over: Partial<DailyRow>): DailyRow => ({
  workDate: '2026-10-02', employeeId: 'e1', employeeCode: 'JBR001', employeeName: 'Asha Rao', projectCode: 'MAH', projectName: 'Mahindra',
  roles: ['PC'], outlets: [], status: 'COMPLETE', checkInAt: null, checkOutAt: null, checkInOutlet: null, checkOutOutlet: null,
  checkInDistanceM: null, checkOutDistanceM: null, hoursWorked: null, delinquencies: [], ...over,
});

describe('groupByProject', () => {
  it('groups by project, sorts names, puts "No project" last and counts delinquencies', () => {
    const groups = groupByProject([
      row({ employeeId: 'a', projectCode: null, projectName: null }),
      row({ employeeId: 'b', projectCode: 'TVS', projectName: 'TVS' }),
      row({ employeeId: 'c', delinquencies: [{ code: 'LATE_CHECK_IN', label: 'Late check-in', decision: null }] }),
      row({ employeeId: 'd' }),
    ]);
    expect(groups.map((g) => g.name)).toEqual(['Mahindra', 'TVS', 'No project']);
    expect(groups[0].rows.map((r) => r.employeeId)).toEqual(['c', 'd']);
    expect(groups[0].delinquent).toBe(1);
  });
});

describe('labels and formats', () => {
  it('shows the decision in brackets and falls back to a readable code', () => {
    expect(delinquencyText({ code: 'X', label: 'Late check-in', decision: 'PENDING' })).toBe('Late check-in (pending)');
    expect(delinquencyText({ code: 'OUT_OF_FENCE', label: '', decision: null })).toBe('Not in tagged location');
  });
  it('has a clear label for a missing outlet location', () => {
    expect(exceptionLabel('NO_OUTLET_LOCATION')).toBe('No outlet location on file');
  });
  it('names who decides', () => {
    expect(approverPhrase(['LATE_CHECK_IN'])).toBe('your Team Lead or Project Manager');
    expect(approverPhrase(['NO_OUTLET_LOCATION'])).toBe('HR');
    expect(approverPhrase(['NO_OUTLET_LOCATION', 'LATE_CHECK_IN'])).toBe('your Team Lead, Project Manager or HR');
  });
  it('formats hours', () => {
    expect(formatHours(8.5)).toBe('8 h 30 m');
    expect(formatHours(0.25)).toBe('0 h 15 m');
    expect(formatHours(null)).toBe('—');
  });
});

describe('dates and report range', () => {
  it('shifts across month ends', () => {
    expect(shiftDate('2026-10-01', -1)).toBe('2026-09-30');
    expect(shiftDate('2026-02-28', 1)).toBe('2026-03-01');
  });
  it('accepts a single day and exactly 31 days', () => {
    expect(validateReportRange('2026-10-02', '2026-10-02', '2026-10-04')).toBeNull();
    expect(validateReportRange('2026-09-04', '2026-10-04', '2026-10-04')).toBeNull();
  });
  it('refuses 32 days, reversed, future and invalid dates', () => {
    expect(validateReportRange('2026-09-03', '2026-10-04', '2026-10-04')).toMatch(/at most 31/);
    expect(validateReportRange('2026-10-03', '2026-10-02', '2026-10-04')).toMatch(/before/);
    expect(validateReportRange('2026-10-03', '2026-10-05', '2026-10-04')).toMatch(/not happened/);
    expect(validateReportRange('', '2026-10-02', '2026-10-04')).toBeTruthy();
    expect(validateReportRange('2026-02-30', '2026-03-01', '2026-10-04')).toBeTruthy();
  });
  it('names the file', () => {
    expect(reportFileName('2026-10-02', '2026-10-02')).toBe('attendance-2026-10-02.xlsx');
    expect(reportFileName('2026-10-01', '2026-10-04', 'MAH 1')).toBe('attendance-2026-10-01_to_2026-10-04-MAH-1.xlsx');
  });
});

describe('fenceLabel', () => {
  it('says Yes outside the tagged location, No inside it, and a dash when the fence does not apply', () => {
    expect(fenceLabel(true)).toBe('Yes');
    expect(fenceLabel(false)).toBe('No');
    expect(fenceLabel(null)).toBe('—');
    expect(fenceLabel(undefined)).toBe('—');
  });
});
