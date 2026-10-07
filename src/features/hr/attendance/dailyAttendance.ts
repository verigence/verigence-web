import type { DailyRow, DailyStatus, Delinquency } from '../../../services/hr/attendanceReports';
import { exceptionLabel } from './attendanceFormat';

export const REPORT_MAX_DAYS = 31;
const NO_PROJECT = 'No project';

export const dailyKeys = {
  day: (date: string, project: string) => ['hr', 'attendance', 'daily', date, project] as const,
  assignments: (employeeId: string) => ['hr', 'work-assignments', employeeId] as const,
};

export const dailyStatusLabels: Record<DailyStatus, string> = {
  COMPLETE: 'Complete',
  CHECKED_IN: 'Still in',
  NOT_CHECKED_IN: 'Not checked in',
  MISSING_CHECK_OUT: 'Missing check-out',
  ABSENT: 'Absent',
  ON_LEAVE: 'On leave',
  PENDING_APPROVAL: 'Awaiting approval',
  EXCEPTION_REJECTED: 'Exception rejected',
};

/** uc01-admin-status modifier per status. Empty means the neutral chip. */
export const dailyStatusTone: Record<DailyStatus, string> = {
  COMPLETE: 'active',
  CHECKED_IN: '',
  NOT_CHECKED_IN: 'pending',
  MISSING_CHECK_OUT: 'pending',
  ABSENT: 'suspended',
  ON_LEAVE: 'rejected',
  PENDING_APPROVAL: 'pending',
  EXCEPTION_REJECTED: 'suspended',
};

export const needsAttention = (row: DailyRow) => row.delinquencies.length > 0;

/** Which people to show on the Daily attendance page. One at a time. */
export type DayFilter =
  | 'ALL'
  | 'CHECKED_IN'
  | 'CHECKED_OUT'
  | 'BOTH'
  | 'IN_NOT_OUT'
  | 'NOT_IN'
  | 'ON_LEAVE'
  | 'DELINQUENT'
  | 'NEEDS_APPROVAL';

export const DAY_FILTERS: DayFilter[] = ['ALL', 'CHECKED_IN', 'CHECKED_OUT', 'BOTH', 'IN_NOT_OUT', 'NOT_IN', 'ON_LEAVE', 'DELINQUENT', 'NEEDS_APPROVAL'];

export const dayFilterLabels: Record<DayFilter, string> = {
  ALL: 'Everyone',
  CHECKED_IN: 'Checked in',
  CHECKED_OUT: 'Checked out',
  BOTH: 'Checked in and out',
  IN_NOT_OUT: 'In, not out yet',
  NOT_IN: 'Not checked in',
  ON_LEAVE: 'On leave',
  DELINQUENT: 'Delinquencies',
  NEEDS_APPROVAL: 'Needs approval',
};

/** A delinquency that someone still has to approve or reject. */
const waitingForApproval = (row: DailyRow) => row.status === 'PENDING_APPROVAL' || row.delinquencies.some((d) => d.decision === 'PENDING');

/** Works from the times and the delinquencies, not the status chip, so a person who is waiting for approval is still found by Checked in or Checked out. */
export function matchesDayFilter(row: DailyRow, filter: DayFilter): boolean {
  switch (filter) {
    case 'ALL':
      return true;
    case 'CHECKED_IN':
      return Boolean(row.checkInAt);
    case 'CHECKED_OUT':
      return Boolean(row.checkOutAt);
    case 'BOTH':
      return Boolean(row.checkInAt && row.checkOutAt);
    case 'IN_NOT_OUT':
      return Boolean(row.checkInAt && !row.checkOutAt);
    case 'NOT_IN':
      return !row.checkInAt && row.status !== 'ON_LEAVE';
    case 'ON_LEAVE':
      return row.status === 'ON_LEAVE';
    case 'DELINQUENT':
      return needsAttention(row);
    case 'NEEDS_APPROVAL':
      return waitingForApproval(row);
  }
}

/** How many people each filter would show, for the numbers on the buttons. */
export function countByFilter(rows: DailyRow[]): Record<DayFilter, number> {
  const counts = Object.fromEntries(DAY_FILTERS.map((f) => [f, 0])) as Record<DayFilter, number>;
  for (const row of rows) for (const f of DAY_FILTERS) if (matchesDayFilter(row, f)) counts[f] += 1;
  return counts;
}

/** "Late check-in (pending)". The server's own label wins; a code it did not label falls back to a readable name. */
export function delinquencyText(d: Delinquency): string {
  const label = d.label?.trim() || exceptionLabel(d.code);
  return d.decision ? `${label} (${d.decision.toLowerCase()})` : label;
}

/** 8.5 -> "8 h 30 m". */
export function formatHours(hours: number | null | undefined): string {
  if (hours === null || hours === undefined || !Number.isFinite(hours)) return '—';
  const minutes = Math.round(hours * 60);
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} m`;
}

export interface ProjectGroup {
  key: string;
  name: string;
  rows: DailyRow[];
  delinquent: number;
}

/** Rows grouped by project, named projects A to Z and "No project" last. Row order inside a group is kept. */
export function groupByProject(rows: DailyRow[]): ProjectGroup[] {
  const groups = new Map<string, ProjectGroup>();
  for (const row of rows) {
    const key = row.projectCode ?? '';
    let group = groups.get(key);
    if (!group) {
      group = { key, name: row.projectName?.trim() || row.projectCode || NO_PROJECT, rows: [], delinquent: 0 };
      groups.set(key, group);
    }
    group.rows.push(row);
    if (needsAttention(row)) group.delinquent += 1;
  }
  return [...groups.values()].sort((a, b) => {
    if (!a.key !== !b.key) return a.key ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

// ---- dates (YYYY-MM-DD, no time zones: both ends are plain calendar days) ----------------------------

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function dayNumber(date: string): number | null {
  const m = DATE.exec(date);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const utc = Date.UTC(y, mo - 1, d);
  const check = new Date(utc);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  return utc / 86_400_000;
}

export function shiftDate(date: string, days: number): string {
  const n = dayNumber(date);
  if (n === null) return date;
  return new Date((n + days) * 86_400_000).toISOString().slice(0, 10);
}

/** Checks a report range: real dates, from not after to, none in the future, at most 31 days. Returns a sentence or null. */
export function validateReportRange(from: string, to: string, today: string): string | null {
  const a = dayNumber(from);
  const b = dayNumber(to);
  if (a === null) return 'Choose the first day.';
  if (b === null) return 'Choose the last day.';
  if (from > today || to > today) return 'The report cannot include days that have not happened yet.';
  if (b < a) return 'The last day cannot be before the first day.';
  if (b - a + 1 > REPORT_MAX_DAYS) return `Choose at most ${REPORT_MAX_DAYS} days.`;
  return null;
}

export function reportFileName(from: string, to: string, projectCode?: string): string {
  const range = from === to ? from : `${from}_to_${to}`;
  const project = projectCode ? `-${projectCode.replace(/[^A-Za-z0-9_-]+/g, '-')}` : '';
  return `attendance-${range}${project}.xlsx`;
}

/** "Yes" when outside the tagged location, "No" when inside, and a dash when the fence does not apply. */
export function fenceLabel(value: boolean | null | undefined): string {
  if (value === true) return 'Yes';
  if (value === false) return 'No';
  return '—';
}

/** "Face match 0.91 (profile photo)", or null when no face was compared. Shown to HR as information only. */
export function faceScoreText(score: number | null | undefined, ref: 'PROFILE' | 'CHECK_IN' | null | undefined): string | null {
  if (score === null || score === undefined || !Number.isFinite(score)) return null;
  const against = ref === 'CHECK_IN' ? 'check-in photo' : 'profile photo';
  return `Face match ${score.toFixed(2)} (${against})`;
}
