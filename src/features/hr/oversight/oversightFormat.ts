import { HrHttpError, hrErrorMessage } from '../../../services/hr/client';
import { NIGHT_MODE_MESSAGE, isNightModeError } from '../../../services/nightMode';
import type { OversightItemType, PendingItem } from '../../../services/hr/oversight';
import { attendanceKindLabels, label, leaveTypeLabels } from '../approvals/approvalFormat';

export const oversightKeys = {
  approvers: ['hr', 'oversight', 'approvers'] as const,
  pending: (userId: string) => ['hr', 'oversight', 'pending', userId] as const,
};

export const itemTypeLabels: Record<OversightItemType, string> = {
  ATTENDANCE: 'Attendance',
  LEAVE: 'Leave',
  CLAIM: 'Claim',
};

const roleLabels: Record<string, string> = {
  TL: 'Team Lead',
  PM: 'Project Manager',
  EXECUTIVE: 'Executive',
};

export const roleLabel = (role: string): string => label(roleLabels, role);

/** What the item is about: the attendance exception, the leave type, or the claim category code. */
export function itemDetail(item: Pick<PendingItem, 'type' | 'detail'>): string {
  if (item.type === 'ATTENDANCE') return label(attendanceKindLabels, item.detail);
  if (item.type === 'LEAVE') return label(leaveTypeLabels, item.detail);
  return item.detail || '—';
}

/** A waiting time in hours, readable: "Under 1 h", "3 h", "2 d", "2 d 4 h". */
export function formatAgeHours(hours: number | null | undefined): string {
  if (hours === null || hours === undefined || !Number.isFinite(hours)) return '—';
  const whole = Math.floor(Math.max(0, hours));
  if (whole < 1) return 'Under 1 h';
  if (whole < 24) return `${whole} h`;
  const days = Math.floor(whole / 24);
  const rest = whole % 24;
  return rest ? `${days} d ${rest} h` : `${days} d`;
}

/** The server allows only an Executive, HR or the CEO; anyone else gets 403. */
export function oversightErrorMessage(error: unknown): string {
  if (isNightModeError(error)) return NIGHT_MODE_MESSAGE;
  if (error instanceof HrHttpError && error.status === 403) return 'Only an Executive, HR or the CEO can see this.';
  if (error instanceof HrHttpError && error.status === 404) return 'This person was not found. The list may have changed; refresh it.';
  return hrErrorMessage(error);
}

export const isForbidden = (error: unknown): boolean => error instanceof HrHttpError && error.status === 403 && !isNightModeError(error);
