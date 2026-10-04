import { hrErrorMessage, HrHttpError } from '../../../services/hr/client';
import { APPROVAL_ERROR, DECISION_NOTE_MAX, type DecisionKind } from '../../../services/hr/approvals';

/** All dates and times on these screens are India Standard Time. */
const IST = 'Asia/Kolkata';
const DAY_MS = 86_400_000;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-10-03" -> "03 Oct 2026". Date-only values are never shifted by a time zone. */
export function formatDate(value: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '');
  if (!match) return '—';
  return `${match[3]} ${MONTHS[Number(match[2]) - 1] ?? match[2]} ${match[1]}`;
}

/** "2026-10" -> "Oct 2026". */
export function formatMonth(value: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})/.exec(value ?? '');
  if (!match) return '—';
  return `${MONTHS[Number(match[2]) - 1] ?? match[2]} ${match[1]}`;
}

export function formatDateRange(from: string, to: string): string {
  return from === to ? formatDate(from) : `${formatDate(from)} to ${formatDate(to)}`;
}

function isoToDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "03 Oct 2026, 10:15 am IST" */
export function formatDateTimeIst(value: string | null | undefined): string {
  const date = isoToDate(value);
  if (!date) return '—';
  const day = new Intl.DateTimeFormat('en-GB', { timeZone: IST, day: '2-digit', month: 'short', year: 'numeric' }).format(date);
  return `${day}, ${formatTimeIst(value)}`;
}

/** "10:15 am IST" */
export function formatTimeIst(value: string | null | undefined): string {
  const date = isoToDate(value);
  if (!date) return '—';
  const time = new Intl.DateTimeFormat('en-IN', { timeZone: IST, hour: 'numeric', minute: '2-digit', hour12: true }).format(date);
  return `${time.replace(/\s+/g, ' ').toLowerCase()} IST`;
}

/** Today's calendar date in India, as YYYY-MM-DD. */
export function istToday(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: IST, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

function dayNumber(isoDate: string): number {
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / DAY_MS);
}

/** How long ago a calendar date was, in whole days (never negative). */
export function daysSinceDate(workDate: string, now: Date): number {
  if (!/^\d{4}-\d{2}-\d{2}/.test(workDate)) return 0;
  return Math.max(0, dayNumber(istToday(now)) - dayNumber(workDate));
}

function dayWords(days: number): string {
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
}

/** Age of a date-only value ("Today", "Yesterday", "4 days ago"). */
export function dateAgeLabel(workDate: string, now: Date): string {
  return dayWords(daysSinceDate(workDate, now));
}

/** Age of a timestamp: minutes and hours on the first day, then days. */
export function ageLabel(value: string | null | undefined, now: Date): string {
  const date = isoToDate(value);
  if (!date) return '—';
  const diff = Math.max(0, now.getTime() - date.getTime());
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return dayWords(Math.floor(diff / DAY_MS));
}

/** Waiting three days or more is shown in a warning colour. */
export function isOldDays(days: number): boolean {
  return days >= 3;
}

export function timestampDays(value: string | null | undefined, now: Date): number {
  const date = isoToDate(value);
  return date ? Math.floor(Math.max(0, now.getTime() - date.getTime()) / DAY_MS) : 0;
}

export function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const whole = Number.isInteger(value);
  return `₹${new Intl.NumberFormat('en-IN', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 }).format(value)}`;
}

export function formatDistanceM(meters: number | null | undefined): string | null {
  if (meters === null || meters === undefined || Number.isNaN(meters)) return null;
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}

export function formatDays(days: number, halfDay: boolean): string {
  if (halfDay) return 'Half day';
  return days === 1 ? '1 day' : `${days} days`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---- labels ----------------------------------------------------------------------------------

export const attendanceKindLabels: Record<string, string> = {
  LATE_CHECK_IN: 'Late check-in',
  EARLY_CHECK_OUT: 'Early check-out',
  OUT_OF_FENCE: 'Outside the outlet area',
  NO_OUTLET_LOCATION: 'Outlet location not on record',
};

export const attendanceEventLabels: Record<string, string> = { CHECK_IN: 'Check-in', CHECK_OUT: 'Check-out' };

export const leaveTypeLabels: Record<string, string> = { SICK: 'Sick leave', EARNED: 'Earned leave', UNPAID: 'Unpaid leave' };

export const leaveApproverLabels: Record<string, string> = {
  AUTO: 'Automatic',
  CEO: 'CEO',
  PM: 'Project Manager',
  TL_PM: 'Team Lead or Project Manager',
  HR: 'HR',
};

export const claimStageLabels: Record<string, string> = { TL_PM: 'Team Lead or PM', HR: 'HR', FINANCE: 'Finance' };

export const claimStatusLabels: Record<string, string> = {
  SUBMITTED: 'Submitted',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CORRECTION_REQUESTED: 'Correction requested',
};

export const label = (map: Record<string, string>, key: string | null | undefined): string => (key ? map[key] ?? key : '—');

export type StageState = 'done' | 'current' | 'upcoming';

export interface StageStep {
  stage: string;
  label: string;
  state: StageState;
}

/** The claim's route through the reviewers, with the one it is waiting on marked. */
export function stageSteps(plan: string[], current: string | null): StageStep[] {
  const at = current ? plan.indexOf(current) : -1;
  return plan.map((stage, index) => ({
    stage,
    label: label(claimStageLabels, stage),
    state: at === -1 ? 'upcoming' : index < at ? 'done' : index === at ? 'current' : 'upcoming',
  }));
}

// ---- decisions -------------------------------------------------------------------------------

export const decisionVerb: Record<DecisionKind, { button: string; title: string; done: string }> = {
  APPROVE: { button: 'Approve', title: 'Approve this request', done: 'approved' },
  REJECT: { button: 'Reject', title: 'Reject this request', done: 'rejected' },
  CORRECTION: { button: 'Send back for correction', title: 'Send back for correction', done: 'sent back for correction' },
};

/** The server needs a reason when something is rejected or sent back. */
export const noteRequired = (decision: DecisionKind): boolean => decision !== 'APPROVE';

/** A message for the note field, or an empty string when it is acceptable. */
export function noteProblem(decision: DecisionKind, note: string): string {
  const trimmed = note.trim();
  if (noteRequired(decision) && !trimmed) {
    return decision === 'CORRECTION' ? 'Say what needs correcting, so the employee knows what to do.' : 'Say why you are rejecting it.';
  }
  if (trimmed.length > DECISION_NOTE_MAX) return `Keep the note within ${DECISION_NOTE_MAX} characters.`;
  return '';
}

/** Plain-words messages for the decision errors the server returns. */
export function decisionErrorMessage(error: unknown): string {
  if (error instanceof HrHttpError) {
    switch (error.code) {
      case APPROVAL_ERROR.alreadyDecided:
        return 'This request has already been decided, so nothing was changed. The list has been refreshed.';
      case APPROVAL_ERROR.noteRequired:
        return 'Please write a short reason before you continue.';
      case APPROVAL_ERROR.leaveBalanceTooLow:
        return 'The employee’s leave balance is no longer enough, so this leave cannot be approved. You can reject it and say why.';
      case APPROVAL_ERROR.notFound:
        return 'This request is no longer available to you. It may have been decided or withdrawn. The list has been refreshed.';
      default:
        break;
    }
  }
  return hrErrorMessage(error);
}

/** After these the item is gone or settled, so the list is worth fetching once more. */
export function staleAfterError(error: unknown): boolean {
  return (
    error instanceof HrHttpError &&
    (error.code === APPROVAL_ERROR.alreadyDecided || error.code === APPROVAL_ERROR.notFound)
  );
}
