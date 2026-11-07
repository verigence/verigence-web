import { HrHttpError, hrErrorMessage } from '../../../services/hr/client';
import type {
  ApplyLeaveType,
  ApproverRule,
  LeaveApplyInput,
  LeaveRequest,
  LeaveStatus,
  LeaveType,
  PaidLeaveType,
} from '../../../services/hr/leave';

export const leaveTypeLabels: Record<LeaveType, string> = {
  PAID: 'Paid leave',
  SPECIAL: 'Special occasion leave',
  COMP_OFF: 'Comp-off',
  UNPAID: 'Unpaid leave',
  // Old requests only: these can no longer be applied for or adjusted.
  SICK: 'Sick leave (old)',
  EARNED: 'Earned leave (old)',
};

/** The types with a balance, in the order they are shown. */
export const PAID_TYPES: PaidLeaveType[] = ['PAID', 'SPECIAL', 'COMP_OFF'];

export const paidTypeLabels: Record<PaidLeaveType, string> = {
  PAID: 'Paid',
  SPECIAL: 'Special occasion',
  COMP_OFF: 'Comp-off',
};

/** PAID and COMP_OFF carry over from year to year; SPECIAL is a yearly quota. */
export function isYearlyType(type: PaidLeaveType): boolean {
  return type === 'SPECIAL';
}

export const statusLabels: Record<LeaveStatus, string> = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
};

/** Which uc01-admin-status colour a leave status uses. */
export const statusTone: Record<LeaveStatus, string> = {
  PENDING: 'pending',
  APPROVED: 'active',
  REJECTED: 'suspended',
  CANCELLED: 'rejected',
};

/** Who a pending request is waiting for, in plain words. `own` is true on the employee's own screen. */
export function waitingFor(rule: ApproverRule, own: boolean): string {
  const their = own ? 'your' : 'their';
  switch (rule) {
    case 'CEO':
      return 'Waiting for the CEO';
    case 'PM':
      return `Waiting for ${their} Project Manager`;
    case 'TL_PM':
      return `Waiting for ${their} Team Lead or Project Manager`;
    case 'HR':
      return 'Waiting for HR';
    case 'AUTO':
      return 'Recorded without approval';
    default:
      return 'Waiting for approval';
  }
}

/** Every number comes from the server; this only writes it as words. */
export function formatDays(days: number): string {
  if (days === 0.5) return 'Half day';
  const text = Number.isInteger(days) ? String(days) : String(Number(days.toFixed(1)));
  return `${text} ${days === 1 ? 'day' : 'days'}`;
}

/** A number of days without a unit, for balance cards. */
export function dayCount(days: number): string {
  return Number.isInteger(days) ? String(days) : String(Number(days.toFixed(1)));
}

export function requestStatusLine(request: LeaveRequest, own: boolean): string {
  if (request.status === 'PENDING') return waitingFor(request.approverRule, own);
  if (request.status === 'APPROVED') return request.approverRule === 'AUTO' ? 'Recorded without approval' : 'Approved';
  if (request.status === 'REJECTED') return 'Not approved';
  return 'Cancelled';
}

// ---- dates (IST calendar dates, yyyy-mm-dd) ------------------------------------------------------------

/** Today's calendar date in India, yyyy-mm-dd. */
export function istToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function parseIso(value: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return null;
  return { y, m, d };
}

/** Whole calendar days from a to b (b - a). Dates are plain calendar dates, so UTC maths is exact. */
export function daysBetween(a: string, b: string): number {
  const pa = parseIso(a);
  const pb = parseIso(b);
  if (!pa || !pb) return NaN;
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86_400_000);
}

export function addDays(value: string, days: number): string {
  const p = parseIso(value);
  if (!p) return value;
  const next = new Date(Date.UTC(p.y, p.m - 1, p.d + days));
  return next.toISOString().slice(0, 10);
}

export function isSunday(value: string): boolean {
  const p = parseIso(value);
  return Boolean(p) && new Date(Date.UTC(p!.y, p!.m - 1, p!.d)).getUTCDay() === 0;
}

export const BACKDATE_DAYS = 30;
export const ADVANCE_DAYS = 365;
const MAX_RANGE_DAYS = 60;
export const REASON_MAX = 500;
export const OCCASION_MAX = 100;

export interface ApplyForm {
  leaveType: ApplyLeaveType | '';
  fromDate: string;
  toDate: string;
  halfDay: boolean;
  reason: string;
  /** Only used for special occasion leave. */
  occasion: string;
}

export type ApplyErrors = Partial<Record<'leaveType' | 'fromDate' | 'toDate' | 'halfDay' | 'reason' | 'occasion', string>>;

/**
 * The same date rules the server applies, so obvious mistakes are caught before a request is sent.
 * The server stays the authority: it also counts the days (skipping Sundays and declared holidays)
 * and checks the balance.
 */
export function validateApply(form: ApplyForm, today: string): ApplyErrors {
  const errors: ApplyErrors = {};
  if (!form.leaveType) errors.leaveType = 'Choose the type of leave.';
  if (!form.fromDate || !parseIso(form.fromDate)) errors.fromDate = 'Choose the first day of leave.';
  if (!form.toDate || !parseIso(form.toDate)) errors.toDate = 'Choose the last day of leave.';
  if (!errors.fromDate && daysBetween(today, form.fromDate) < -BACKDATE_DAYS) {
    errors.fromDate = `Leave can be applied up to ${BACKDATE_DAYS} days after the fact.`;
  }
  if (!errors.toDate && daysBetween(today, form.toDate) > ADVANCE_DAYS) {
    errors.toDate = 'That is too far ahead.';
  }
  if (!errors.fromDate && !errors.toDate) {
    const span = daysBetween(form.fromDate, form.toDate);
    if (span < 0) errors.toDate = 'The last day is before the first day.';
    else if (form.fromDate.slice(0, 4) !== form.toDate.slice(0, 4)) {
      errors.toDate = 'A leave request stays within one calendar year. Apply separately for each.';
    } else if (span > MAX_RANGE_DAYS) errors.toDate = `Apply for at most ${MAX_RANGE_DAYS} days at a time.`;
    else if (form.halfDay && span !== 0) errors.halfDay = 'A half day is for a single date.';
  }
  if (form.leaveType === 'SPECIAL') {
    const occasion = form.occasion.trim();
    if (!occasion) errors.occasion = 'Say what the special occasion is.';
    else if (occasion.length > OCCASION_MAX) errors.occasion = `Keep the occasion within ${OCCASION_MAX} characters.`;
  }
  if (form.reason.trim().length > REASON_MAX) errors.reason = `Keep the reason within ${REASON_MAX} characters.`;
  return errors;
}

export function buildApplyPayload(form: ApplyForm): LeaveApplyInput {
  const reason = form.reason.trim();
  const occasion = form.occasion.trim();
  return {
    leave_type: form.leaveType as ApplyLeaveType,
    from_date: form.fromDate,
    to_date: form.toDate,
    half_day: form.halfDay,
    ...(reason ? { reason } : {}),
    ...(form.leaveType === 'SPECIAL' ? { occasion } : {}),
  };
}

// ---- paid leave earned from attendance ------------------------------------------------------------------

/** "1 day" / "2.5 days", without the "Half day" wording used for requests. */
export function dayWord(days: number): string {
  return `${dayCount(days)} ${days === 1 ? 'day' : 'days'}`;
}

/** Share of the next block already counted, 0 to 100, for the progress bar. */
export function earningProgress(soFar: number, needed: number): number {
  if (!(needed > 0)) return 0;
  return Math.max(0, Math.min(100, Math.round((soFar / needed) * 100)));
}

// ---- HR balance adjustment ------------------------------------------------------------------------------

export interface AdjustForm {
  leaveType: PaidLeaveType;
  year: string;
  days: string;
  note: string;
}

export type AdjustErrors = Partial<Record<keyof AdjustForm, string>>;

/** A signed number of days with at most one decimal place, never zero, under 1000 either way. */
export function parseAdjustDays(value: string): number | null {
  const text = value.trim();
  if (!/^[+-]?\d{1,3}(\.\d)?$/.test(text)) return null;
  const n = Number(text);
  return n === 0 ? null : n;
}

export function validateAdjust(form: AdjustForm): AdjustErrors {
  const errors: AdjustErrors = {};
  const year = Number(form.year);
  if (!Number.isInteger(year) || year < 2020 || year > 2100) errors.year = 'Enter a year between 2020 and 2100.';
  if (parseAdjustDays(form.days) === null) {
    errors.days = 'Enter the days to add (for example 2) or take off (for example -1.5). Not zero; one decimal place at most.';
  }
  const note = form.note.trim();
  if (note.length < 3) errors.note = 'Say why, in at least 3 characters.';
  else if (note.length > 300) errors.note = 'Keep the reason within 300 characters.';
  return errors;
}

// ---- errors --------------------------------------------------------------------------------------------

/** The server writes plain-words messages for leave problems; show them, with the support reference. */
export function leaveErrorMessage(error: unknown): string {
  if (error instanceof HrHttpError) {
    if (error.code === 'LEAVE_OCCASION_REQUIRED') return 'Say what the special occasion is.';
    if (error.status === 404 && /employee record/i.test(error.message)) {
      return 'No employee record is linked to your login. Ask HR to link it.';
    }
    if (error.status === 404) return 'This leave request was not found. It may have been removed.';
  }
  return hrErrorMessage(error);
}

// ---- holidays inside the chosen dates (product owner, 7 Nov 2026) ---------------------------------

interface NoteHoliday {
  date: string;
  name: string;
  status: 'TENTATIVE' | 'DECLARED';
  dayPart?: 'FULL_DAY' | 'MORNING' | 'AFTERNOON';
}

export interface HolidayNoteParts<T extends NoteHoliday> {
  /** Declared full-day holidays: not leave days. */
  full: T[];
  /** Declared half-day holidays: a day of leave on one counts half. */
  half: T[];
  /** Tentative ones of any kind: they count as working days until HR declares them. */
  tentative: T[];
  /** Half-day leave was chosen on a date that is already a declared half-day holiday. */
  halfDayClash: T | null;
}

/**
 * Sorts the holidays that fall inside the dates. The list is the person's own (the service sends
 * only those that apply to them), so nothing here decides who a holiday is for.
 */
export function holidayNoteParts<T extends NoteHoliday>(items: T[], fromDate: string, toDate: string, halfDay = false): HolidayNoteParts<T> {
  const end = toDate && toDate >= fromDate ? toDate : fromDate;
  const inside = items.filter((h) => h.date >= fromDate && h.date <= end);
  const declared = inside.filter((h) => h.status === 'DECLARED');
  const isHalf = (h: T) => h.dayPart === 'MORNING' || h.dayPart === 'AFTERNOON';
  const fullDates = new Set(declared.filter((h) => !isHalf(h)).map((h) => h.date));
  // A morning off and an afternoon off on the same date make a full day off.
  for (const date of new Set(declared.filter(isHalf).map((h) => h.date))) {
    const parts = new Set(declared.filter((h) => h.date === date && isHalf(h)).map((h) => h.dayPart));
    if (parts.has('MORNING') && parts.has('AFTERNOON')) fullDates.add(date);
  }
  const full = declared.filter((h) => fullDates.has(h.date));
  const half = declared.filter((h) => isHalf(h) && !fullDates.has(h.date));
  const halfDayClash = halfDay ? half.find((h) => h.date === fromDate) ?? null : null;
  return { full, half, tentative: inside.filter((h) => h.status === 'TENTATIVE'), halfDayClash };
}

/** "morning off" / "afternoon off" / "" for a full day. */
export function dayPartWords(dayPart: NoteHoliday['dayPart']): string {
  if (dayPart === 'MORNING') return 'morning off';
  if (dayPart === 'AFTERNOON') return 'afternoon off';
  return '';
}
