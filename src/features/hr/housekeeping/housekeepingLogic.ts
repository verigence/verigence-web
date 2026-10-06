import type { HousekeepingKind } from '../../../services/hr/housekeeping';

export type PeriodMode = 'DAY' | 'MONTH';

export const KIND_LABEL: Record<HousekeepingKind, string> = {
  ATTENDANCE: 'Attendance',
  LEAVE: 'Leave',
  CLAIMS: 'Reimbursements',
};

/** The dates a day or a month stands for. A month that is still running ends today: the server refuses future days. */
export function periodRange(mode: PeriodMode, value: string, today: string): { from: string; to: string } | null {
  if (mode === 'DAY') {
    return /^\d{4}-\d{2}-\d{2}$/.test(value) && value <= today ? { from: value, to: value } : null;
  }
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return null;
  const [year, month] = value.split('-').map(Number);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const from = `${value}-01`;
  if (from > today) return null;
  const to = `${value}-${String(last).padStart(2, '0')}`;
  return { from, to: to > today ? today : to };
}

const COUNT_LABEL: Record<string, string> = {
  days: 'attendance days',
  approvals: 'approval records',
  photos: 'photos',
  requests: 'leave requests',
  ledgerRows: 'leave balance entries',
  claims: 'reimbursement claims',
  receipts: 'receipts',
  keptInPayroll: 'claims kept because a payroll already has them',
};

/** "12 attendance days, 3 approval records, 24 photos". */
export function describeCounts(counts: Record<string, number>): string {
  return Object.entries(counts)
    .filter(([key]) => key in COUNT_LABEL)
    .map(([key, n]) => `${n} ${COUNT_LABEL[key]}`)
    .join(', ');
}

/** What will really be deleted: kept claims are not part of it. */
export const deletableTotal = (counts: Record<string, number>): number =>
  Object.entries(counts).filter(([key]) => key in COUNT_LABEL && key !== 'keptInPayroll').reduce((sum, [, n]) => sum + n, 0);

const EMPLOYEE_COUNT_LABEL: Record<string, string> = {
  attendanceDays: 'attendance days',
  attendanceApprovals: 'attendance approvals',
  leaveRequests: 'leave requests',
  leaveLedgerRows: 'leave balance entries',
  claims: 'reimbursement claims',
  salaryStructures: 'salary proposals',
  supportTickets: 'support tickets',
  emailLog: 'email records',
  qualifications: 'qualifications',
  experiences: 'experience records',
  statusChanges: 'status requests',
};

/** "12 attendance days, 2 leave requests" for what goes with the employee; empty counts are left out. */
export function describeEmployeeCounts(counts: Record<string, number>): string {
  return Object.entries(counts)
    .filter(([key, n]) => key in EMPLOYEE_COUNT_LABEL && n > 0)
    .map(([key, n]) => `${n} ${EMPLOYEE_COUNT_LABEL[key]}`)
    .join(', ');
}

/** An employee code as the server expects it: no spaces, upper case. */
export const cleanEmployeeCode = (value: string): string => value.trim().toUpperCase();
