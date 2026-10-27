import type { TmRole, TmSchedule, TmTask } from '../../services/audit-core/taskManager';

// Short role names everywhere in the Task Manager (product owner 2026-10-27).
export const ROLE_LABELS: Record<string, string> = {
  PC: 'PC', TL: 'TL', PM: 'PM', CRM: 'CRM', REVIEWER: 'Reviewer',
  EXECUTIVE: 'Exec', SUPER_ADMIN: 'Superadmin', SYSTEM: 'System',
};

export function roleLabel(role?: string | null): string {
  return role ? ROLE_LABELS[role] ?? role : '';
}

/** Expected time to close: the opener must choose one (product owner 2026-10-26). */
export const EXPECTED_TIME_OPTIONS: Array<{ minutes: number; label: string }> = [
  { minutes: 120, label: '2 hours' },
  { minutes: 240, label: '4 hours' },
  { minutes: 1440, label: '1 day' },
  { minutes: 2880, label: '2 days' },
  { minutes: 4320, label: '3 days' },
];

export function durationLabel(minutes?: number | null): string {
  if (!minutes) return '—';
  if (minutes % 1440 === 0) return `${minutes / 1440} day${minutes === 1440 ? '' : 's'}`;
  if (minutes % 60 === 0) return `${minutes / 60} hour${minutes === 60 ? '' : 's'}`;
  if (minutes > 60) return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
  return `${minutes} min`;
}

export function minutesText(minutes: number): string {
  if (!minutes) return '0 min';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`;
}

const WEEKDAY_SHORT = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function scheduleLabel(schedule: Pick<TmSchedule, 'frequency' | 'weekdays' | 'monthDay' | 'runTimeIst'>): string {
  const at = `at ${schedule.runTimeIst} IST`;
  if (schedule.frequency === 'MONTHLY') {
    return `Monthly on day ${schedule.monthDay} ${at} (a Sunday moves to Monday)`;
  }
  const days = [...schedule.weekdays].sort().map((d) => WEEKDAY_SHORT[d]).join(', ');
  if (schedule.frequency === 'DAILY') {
    return days === 'Mon, Tue, Wed, Thu, Fri, Sat' ? `Every working day (Mon–Sat) ${at}` : `Daily on ${days} ${at}`;
  }
  return `Weekly on ${days} ${at}${schedule.weekdays.includes(7) ? ' (Sunday moves to Monday)' : ''}`;
}

export function assigneeRuleLabel(schedule: TmSchedule): string {
  if (schedule.assigneeMode === 'OUTLET_PCS') return "Each outlet's PCs";
  if (schedule.assigneeMode === 'ROLE_EACH') return `Every ${roleLabel(schedule.assignedRole)}`;
  return schedule.assignedName || schedule.assignedActorId || '—';
}

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export function statusChip(task: Pick<TmTask, 'status' | 'completionProtocol'>): { label: string; tone: Tone } {
  switch (task.status) {
    case 'READY': return { label: 'To do', tone: 'info' };
    case 'IN_PROGRESS': return { label: 'In progress', tone: 'info' };
    case 'RETURNED': return { label: 'Sent back', tone: 'warning' };
    case 'AWAITING_REQUESTER_REVIEW': return { label: 'Awaiting review', tone: 'warning' };
    case 'VERIFIED_COMPLETE': return { label: 'Closed', tone: 'success' };
    case 'CANCELLED': return { label: 'Cancelled', tone: 'neutral' };
    case 'FAILED': return { label: 'Incomplete', tone: 'danger' };
    default: return { label: task.status.replace(/_/g, ' ').toLowerCase(), tone: 'neutral' };
  }
}

export function kindLabel(task: Pick<TmTask, 'kind' | 'taskType'>): string {
  if (task.kind === 'GATE_PASS') return 'Daily gate pass';
  if (task.taskType === 'GATE_PASS_DELIVERY_NOT_NOTIFIED') return 'Gate pass';
  if (task.kind === 'RECURRING') return 'Recurring';
  if (task.kind === 'SYSTEM') return 'System';
  return 'Task';
}

export function flagsOf(task: Pick<TmTask, 'overdue' | 'reviewOverdue' | 'missed' | 'incomplete' | 'closedLate'>): Array<{ label: string; tone: Tone }> {
  const flags: Array<{ label: string; tone: Tone }> = [];
  if (task.incomplete) flags.push({ label: 'Incomplete', tone: 'danger' });
  if (task.overdue) flags.push({ label: 'Overdue', tone: 'danger' });
  if (task.missed) flags.push({ label: 'Missed', tone: 'danger' });
  if (task.reviewOverdue) flags.push({ label: 'Review overdue', tone: 'warning' });
  if (task.closedLate) flags.push({ label: 'Closed late', tone: 'warning' });
  return flags;
}

export const FLAG_LABELS: Record<string, string> = {
  OVERDUE: 'Overdue', REVIEW_OVERDUE: 'Review overdue', MISSED: 'Missed', INCOMPLETE: 'Incomplete',
  CLOSED_LATE: 'Closed late',
};

export function personName(name?: string | null, actorId?: string | null, role?: string | null): string {
  if (name?.trim()) return name.trim();
  if (actorId) return actorId;
  return role ? `Any ${roleLabel(role)}` : '—';
}

export function formatWhen(value?: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

/** Today in IST as YYYY-MM-DD. */
export function istToday(now = Date.now()): string {
  return new Date(now + 330 * 60_000).toISOString().slice(0, 10);
}

export function addDays(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const ASSIGNABLE_ORDER: TmRole[] = ['EXECUTIVE', 'PM', 'TL', 'CRM', 'REVIEWER', 'PC'];
