import type {
  DutyCloseReason, DutyInput, DutyReasonCategory, MyDay, MyDutyItem, TeamDutyCell, TeamDutyState,
} from '../../services/audit-core/duties';

/** YYYY-MM-DD of a moment in IST. */
export function istToday(at: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(at);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "Tue 17 Nov" for 2026-11-17. */
export function dayLabel(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).format(d)
    .replace(',', '');
}

/** "11:05 am" (IST) of a UTC timestamp. */
export function timeLabel(at: string | null | undefined): string {
  if (!at) return '';
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true })
    .format(d).toLowerCase();
}

export const WEEKDAYS: Array<{ day: number; label: string }> = [
  { day: 1, label: 'Mon' }, { day: 2, label: 'Tue' }, { day: 3, label: 'Wed' }, { day: 4, label: 'Thu' },
  { day: 5, label: 'Fri' }, { day: 6, label: 'Sat' }, { day: 7, label: 'Sun' },
];

export function weekdaysLabel(days: number[]): string {
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.length === 7) return 'Every day';
  if (sorted.join() === '1,2,3,4,5,6') return 'Mon to Sat';
  return sorted.map((d) => WEEKDAYS.find((w) => w.day === d)?.label ?? String(d)).join(', ');
}

/** What the line says the duty is for, when that is not simply today: "for Mon 16 Nov". */
export function forLabel(item: Pick<MyDutyItem, 'forDate' | 'dutyDate'>, today: string): string | null {
  return item.forDate === today ? null : `for ${dayLabel(item.forDate)}`;
}

/** The value a duty asked for, as it reads in a list: "Amount 1,25,000.50". */
export function valuesLabel(inputs: DutyInput[], values: Record<string, string | number>): string {
  return inputs.filter((i) => values[i.key] !== undefined && values[i.key] !== '').map((i) => {
    const value = values[i.key];
    const shown = i.type === 'AMOUNT' && typeof value === 'number'
      ? value.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : String(value);
    return `${i.label} ${shown}`;
  }).join(' · ');
}

/** What stops a tick being saved, if anything. */
export function tickProblem(inputs: DutyInput[], values: Record<string, string>): string | undefined {
  for (const input of inputs) {
    const raw = (values[input.key] ?? '').trim();
    if (!raw) {
      if (input.required) return `Enter ${input.label}.`;
      continue;
    }
    if (input.type === 'TEXT') continue;
    const number = Number(raw.replace(/,/g, ''));
    if (!Number.isFinite(number) || number < 0) return `${input.label} must be a number, 0 or more.`;
    if (input.type === 'NUMBER' && !Number.isInteger(number)) return `${input.label} must be a whole number.`;
  }
  return undefined;
}

/** A mandatory duty not done, with no reason yet: day close asks about it. */
export function needsReason(item: MyDutyItem): boolean {
  return item.mandatory && item.status === 'PENDING' && item.myReason === null;
}

export type DutyProjectDay = { tenantId: string; projectName: string; day: MyDay };

/** The Projects whose list applies to this person today (duties on, and they are a PC of an outlet). */
export function activeDays(days: DutyProjectDay[]): DutyProjectDay[] {
  return days.filter((d) => d.day.enabled && d.day.applies && (d.day.outlets?.length ?? 0) > 0);
}

export function itemsOf(day: MyDay): MyDutyItem[] {
  return (day.outlets ?? []).flatMap((o) => o.items);
}

/** How many duties across the Projects still need a reason before check-out. */
export function reasonsNeeded(days: DutyProjectDay[]): number {
  return activeDays(days).reduce((n, d) => n + itemsOf(d.day).filter(needsReason).length, 0);
}

/** True when the gate register is one of the person's duties in that Project: the old
 *  check-out warning about yesterday's register is then covered by the duty list. */
export function coversGateRegister(days: DutyProjectDay[], tenantId: string | undefined): boolean {
  return activeDays(days).some((d) => d.tenantId === tenantId
    && itemsOf(d.day).some((i) => i.checkerCode === 'GATE_REGISTER'));
}

export type ReasonDraft = { category: string; remark: string; handledByActorId: string };

/** What stops the day close, if anything; else the reasons to send for one Project. */
export function closeReasons(items: MyDutyItem[], drafts: Record<string, ReasonDraft>,
  categories: DutyReasonCategory[]): { problem?: string; reasons: DutyCloseReason[] } {
  const reasons: DutyCloseReason[] = [];
  for (const item of items.filter(needsReason)) {
    const draft = drafts[item.itemId];
    const category = categories.find((c) => c.code === draft?.category);
    if (!draft || !category) return { problem: `Choose a reason for "${item.title}".`, reasons: [] };
    if (category.needsRemark && draft.remark.trim().length < 3) {
      return { problem: `Say why "${item.title}" is not done, in a few words.`, reasons: [] };
    }
    if (category.needsPerson && !draft.handledByActorId) {
      return { problem: `Choose the PC who is doing "${item.title}".`, reasons: [] };
    }
    reasons.push({
      itemId: item.itemId, category: category.code, remark: draft.remark.trim() || null,
      handledByActorId: category.needsPerson ? draft.handledByActorId : null,
    });
  }
  return { reasons };
}

export const TEAM_STATE_LABEL: Record<TeamDutyState, string> = {
  DONE: 'Done', DONE_LATE: 'Done late', ON_TRACK: 'On track', PENDING: 'Pending', NOT_RECEIVED: 'Not received',
  INCOMPLETE: 'Incomplete',
};

/** The one line under a team cell's state: who and when, what is missing, or why. */
export function teamCellDetail(cell: TeamDutyCell): string {
  if (cell.state === 'DONE' || cell.state === 'DONE_LATE') {
    const who = cell.doneSource === 'SYSTEM' ? (cell.doneByName ? `${cell.doneByName} (read by system)` : 'Read by system')
      : (cell.doneByName ?? '');
    const values = valuesLabel(cell.inputs, cell.values);
    return [who, timeLabel(cell.doneAt), values || cell.comment || ''].filter(Boolean).join(' · ');
  }
  const reason = cell.reasons[cell.reasons.length - 1];
  const parts: string[] = [];
  if (cell.progress?.note) parts.push(cell.progress.note);
  if (reason) {
    parts.push(`${reason.byName}: ${reason.label}${reason.handledByName ? ` (${reason.handledByName})` : ''}`
      + (reason.remark ? `, ${reason.remark}` : ''));
    if (reason.category === 'NOT_RECEIVED' && reason.informedGroup !== null) {
      parts.push(reason.informedGroup ? 'WhatsApp group informed' : 'WhatsApp group not informed');
    }
  }
  return parts.join(' · ');
}
