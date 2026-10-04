import { hrRawRequest, hrRequest } from './client';

/** Daily attendance for everyone (hr.attendance.read_all) and the Excel report built from it. */

export type DailyStatus =
  | 'COMPLETE'
  | 'CHECKED_IN'
  | 'NOT_CHECKED_IN'
  | 'MISSING_CHECK_OUT'
  | 'ABSENT'
  | 'ON_LEAVE'
  | 'PENDING_APPROVAL'
  | 'EXCEPTION_REJECTED';

export type DelinquencyDecision = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface Delinquency {
  code: string;
  label: string;
  decision: DelinquencyDecision | null;
}

export interface DailyRow {
  workDate: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  projectCode: string | null;
  projectName: string | null;
  roles: string[];
  outlets: string[];
  status: DailyStatus;
  checkInAt: string | null;
  checkOutAt: string | null;
  checkInOutlet: string | null;
  checkOutOutlet: string | null;
  checkInDistanceM: number | null;
  checkOutDistanceM: number | null;
  hoursWorked: number | null;
  delinquencies: Delinquency[];
}

export interface DailySummary {
  employees: number;
  checkedIn: number;
  completed: number;
  stillIn: number;
  notCheckedIn: number;
  absent: number;
  onLeave: number;
  pendingApproval: number;
  withDelinquencies: number;
}

export interface DailyAttendance {
  date: string;
  dayKind: 'WORKING' | 'SUNDAY' | 'HOLIDAY';
  holiday: string | null;
  summary: DailySummary;
  rows: DailyRow[];
}

const base = '/hr/v1/attendance';

export const getDailyAttendance = (token: string, date: string, projectCode?: string) => {
  const query = new URLSearchParams({ date });
  if (projectCode) query.set('projectCode', projectCode);
  return hrRequest<DailyAttendance>(`${base}/daily?${query.toString()}`, { accessToken: token });
};

/** The .xlsx for a date range, as a blob (it needs the caller's token, so it cannot be a plain link). */
export async function fetchAttendanceReport(token: string, from: string, to: string, projectCode?: string): Promise<Blob> {
  const query = new URLSearchParams({ from, to });
  if (projectCode) query.set('projectCode', projectCode);
  const response = await hrRawRequest(`${base}/report?${query.toString()}`, { accessToken: token, timeoutMs: 60_000 });
  return response.blob();
}
