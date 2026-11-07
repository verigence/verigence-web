import type { HalfDayHoliday } from './attendance';
import type { DayHolidayInfo } from './attendanceReports';
import { hrRequest } from './client';

/**
 * Hours clocked, the attendance calendar, the project-wise team views and attendance corrections
 * (hrmgmt/api/attendance_calendar.py, attendance_reports.py, attendance_corrections.py).
 * Product owner, 6 Nov 2026.
 */

export type CalendarStatus =
  | 'PRESENT'
  | 'CHECKED_IN'
  | 'MISSING_CHECK_OUT'
  | 'PENDING_APPROVAL'
  | 'HALF_DAY'
  | 'CORRECTED'
  | 'ABSENT'
  | 'LEAVE_APPROVED'
  | 'LEAVE_APPLIED'
  | 'NOT_CHECKED_IN'
  | 'OFF_DAY'
  | 'OFF_DAY_WORKED'
  | 'UPCOMING'
  | 'NOT_JOINED';

export type CorrectionKind = 'FULL_DAY' | 'HALF_DAY';
export type CorrectionStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface CalendarLeave {
  requestId: string;
  leaveType: string;
  halfDay: boolean;
  status: 'PENDING' | 'APPROVED';
}

export interface CalendarCorrection {
  correctionId: string;
  requested: CorrectionKind;
  reason: string;
  status: 'PENDING' | 'APPROVED';
}

export interface CalendarDay {
  /** YYYY-MM-DD */
  date: string;
  status: CalendarStatus;
  label: string;
  dayKind: 'WORKING' | 'SUNDAY' | 'HOLIDAY';
  holiday: string | null;
  /** A half-day holiday of this person on a working day. Absent from services before 7 Nov 2026. */
  halfDayHoliday?: HalfDayHoliday | null;
  checkInAt: string | null;
  checkOutAt: string | null;
  /** Check-out minus check-in, for a day with both. */
  minutes: number;
  /** Today, checked in and not yet out: minutes so far (not in any total). */
  runningMinutes: number | null;
  leave: CalendarLeave | null;
  correction: CalendarCorrection | null;
  exceptions: Array<{ kind: string; status: 'PENDING' | 'APPROVED' | 'REJECTED' }>;
  /** Absent because there was no check-in by 17:00. */
  markedBySystem: boolean;
  /** Only in a month calendar: false for the days of the weeks that spill into the next/previous month. */
  inMonth?: boolean;
}

export interface CalendarWeek {
  weekStart: string;
  weekEnd: string;
  minutes: number;
  daysWorked: number;
  days: CalendarDay[];
}

export interface AttendanceCalendar {
  month: string;
  /** "HH:MM": no check-in by then and the system marks the day absent. */
  absentAfter: string;
  minimumHours: number;
  totals: { minutes: number; daysWorked: number; statusCounts: Partial<Record<CalendarStatus, number>> };
  weeks: CalendarWeek[];
  employeeId?: string;
  employeeCode?: string;
  employeeName?: string;
}

export interface OtherProject {
  projectCode: string;
  projectName: string | null;
}

export interface TeamDailyRow {
  workDate: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  projectCode: string | null;
  projectName: string | null;
  roles: string[];
  outlets: string[];
  status: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  delinquencies: Array<{ code: string; label: string; decision: string | null; reason?: string | null }>;
  workedMinutes: number;
  runningMinutes: number | null;
  weekMinutes: number;
  leave: CalendarLeave | null;
  shared: boolean;
  otherProjects: OtherProject[];
}

export interface TeamDailySummary {
  employees: number;
  checkedIn: number;
  completed: number;
  stillIn: number;
  notCheckedIn: number;
  absent: number;
  onLeave: number;
  leaveApplied: number;
  missingCheckOut: number;
  pendingApproval: number;
  rejected: number;
  corrected: number;
  late: number;
  shortDay: number;
}

export interface TeamDaily {
  date: string;
  /** For the company as a whole; a person's own day can differ (project or outlet holidays). */
  dayKind: 'WORKING' | 'SUNDAY' | 'HOLIDAY';
  holiday: string | null;
  holidays?: DayHolidayInfo[];
  summary: TeamDailySummary;
  projects: Array<{ projectCode: string | null; projectName: string | null; summary: TeamDailySummary }>;
  rows: TeamDailyRow[];
}

export interface WeeklyPerson {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  projectCode: string | null;
  projectName: string | null;
  roles: string[];
  outlets: string[];
  shared: boolean;
  otherProjects: OtherProject[];
  weekMinutes: number;
  daysWorked: number;
  days: CalendarDay[];
}

export interface WeeklySummary {
  employees: number;
  shared: number;
  minutes: number;
  absentDays: number;
  leaveApprovedDays: number;
  leaveAppliedDays: number;
  pendingDays: number;
  byDay: Array<{ date: string; present: number; absent: number; onLeave: number; minutes: number }>;
}

export interface TeamWeekly {
  weekStart: string;
  weekEnd: string;
  days: string[];
  labels: Record<string, string>;
  summary: WeeklySummary;
  projects: Array<{ projectCode: string | null; projectName: string | null; people: WeeklyPerson[]; summary: WeeklySummary }>;
}

export interface Correction {
  correctionId: string;
  workDate: string;
  requested: CorrectionKind;
  reason: string;
  status: CorrectionStatus;
  decisionNote: string | null;
  decidedAt: string | null;
  createdAt: string;
}

export interface CorrectionApproval extends Correction {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  day: {
    checkInAt: string | null;
    checkOutAt: string | null;
    exceptions: Array<{ kind: string; status: string }>;
  };
}

const base = '/hr/v1';

const query = (params: Record<string, string | undefined>) => {
  const parts = Object.entries(params)
    .filter(([, v]) => v)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v as string)}`);
  return parts.length ? `?${parts.join('&')}` : '';
};

export const getMyCalendar = (token: string, month?: string) =>
  hrRequest<AttendanceCalendar>(`${base}/attendance/calendar/me${query({ month })}`, { accessToken: token });

/** A lead (people on their projects), HR or the CEO. */
export const getEmployeeCalendar = (token: string, employeeId: string, month?: string) =>
  hrRequest<AttendanceCalendar>(
    `${base}/attendance/calendar/employee/${encodeURIComponent(employeeId)}${query({ month })}`,
    { accessToken: token },
  );

/** Team Lead, Project Manager, Executive (their projects), HR and the CEO (all). */
export const getTeamDaily = (token: string, date?: string, projectCode?: string) =>
  hrRequest<TeamDaily>(`${base}/attendance/team-daily${query({ date, projectCode })}`, { accessToken: token });

export const getTeamWeekly = (token: string, date?: string, projectCode?: string) =>
  hrRequest<TeamWeekly>(`${base}/attendance/team-weekly${query({ date, projectCode })}`, { accessToken: token });

export const raiseCorrection = (token: string, body: { workDate: string; requested: CorrectionKind; reason: string }) =>
  hrRequest<Correction>(`${base}/attendance/corrections`, { accessToken: token, method: 'POST', body });

export const listMyCorrections = async (token: string) =>
  (await hrRequest<{ items: Correction[] }>(`${base}/attendance/corrections/me`, { accessToken: token })).items;

export const cancelCorrection = (token: string, correctionId: string) =>
  hrRequest<{ correctionId: string; status: 'CANCELLED' }>(
    `${base}/attendance/corrections/${encodeURIComponent(correctionId)}/cancel`,
    { accessToken: token, method: 'POST' },
  );

export const listCorrectionApprovals = async (token: string) =>
  (await hrRequest<{ items: CorrectionApproval[] }>(`${base}/approvals/attendance-corrections`, { accessToken: token })).items;

export const decideCorrection = (token: string, correctionId: string, body: { decision: 'APPROVE' | 'REJECT'; note?: string }) =>
  hrRequest<{ correctionId: string; status: 'APPROVED' | 'REJECTED' }>(
    `${base}/approvals/attendance-corrections/${encodeURIComponent(correctionId)}/decision`,
    { accessToken: token, method: 'POST', body },
  );
