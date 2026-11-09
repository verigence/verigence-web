import type { OtherProject, StandardTimes, TeamDailyRow } from '../../../services/hr/attendanceCalendar';
import { arrivalKind, arrivalPlace, hhmmMinutes, istMinutes, summarizeArrivals } from './teamArrival';

/**
 * The team's day, project by project, with check-in and check-out statistics (product owner, 9 Nov
 * 2026: "group the people who didn't check in, then show some stats who did late check in, first
 * check in, same for checkout as well"; and a quick summary of who is absent or not checked in so
 * far, without scrolling).
 *
 * Everything is read from team-daily. Who reached the outlet, who is on leave and who has the morning
 * off come from teamArrival, so this view and the DealGuard "Team today" card say the same thing.
 * Late and early are myHR's own flags (LATE_CHECK_IN, EARLY_CHECK_OUT); this file never decides them.
 * "How late" is only worked out when myHR sends the person's standard times for the day.
 */

export interface TeamDayPerson {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  roles: string[];
  outlets: string[];
}

export interface Punch extends TeamDayPerson {
  /** ISO instant. */
  at: string;
}

export interface TimedPunch extends Punch {
  /** Minutes after the standard check-in (late) or before the standard check-out (early); null when unknown. */
  minutes: number | null;
  /** The standard time it is measured from ("10:30"), or null. */
  reference: string | null;
}

export interface AwayPunch extends Punch {
  /** "Away 2.4 km". */
  label: string;
  outlet: string | null;
}

export interface Absentee extends TeamDayPerson {
  /** Leave applied and not decided yet (on-leave group only). */
  leaveApplied: boolean;
  /** Morning off: when the afternoon starts ("14:00"), or null. */
  until: string | null;
}

export interface PunchStats {
  firstIn: Punch | null;
  lastIn: Punch | null;
  firstOut: Punch | null;
  lastOut: Punch | null;
  late: TimedPunch[];
  early: TimedPunch[];
  away: AwayPunch[];
  /**
   * Checked in and not out: on a past day everyone who never checked out; today only those whose
   * standard check-out time has passed. Null when it means nothing yet (today, before the end time,
   * or myHR sent no times).
   */
  notCheckedOut: Punch[] | null;
}

export interface NoCheckIn {
  /** myHR marked the day absent: no check-in by the cut-off (17:00), or a past day. */
  absent: Absentee[];
  /** No check-in yet, and the cut-off has not passed. */
  notYet: Absentee[];
  onLeave: Absentee[];
  /** A half-day holiday with the morning off, before the afternoon starts. */
  morningOff: Absentee[];
}

export interface ProjectDay extends NoCheckIn {
  key: string;
  code: string | null;
  name: string;
  rows: TeamDailyRow[];
  /** People listed under the project. */
  people: number;
  /** Not on leave: the people the project expects at work that day. */
  expected: number;
  /** Checked in (or the day was corrected to a working day). */
  present: number;
  punches: PunchStats;
}

export interface DayOverview extends NoCheckIn {
  /** Different people: someone on two projects is counted once. */
  people: number;
  expected: number;
  present: number;
  reached: number;
  away: number;
  outletStaffExpected: number;
  outletStaffReached: number;
  leaveApplied: number;
  morningOffUntil: string | null;
  punches: PunchStats;
  /** The standard times of an ordinary day, when myHR sends them. */
  standardTimes: StandardTimes | null;
}

export interface TeamDay {
  overview: DayOverview;
  projects: ProjectDay[];
}

const instant = (iso: string | null | undefined) => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
};

/**
 * The moment the day is judged at: now for today; the end of the day for a past day, so a half-day
 * morning off never hides someone who did not come on a day that is over.
 */
export function dayClock(date: string, today: string, now: Date = new Date()): Date {
  return date === today ? now : new Date(`${date}T23:59:00+05:30`);
}

/** "10:30" -> "10:30 am", "14:00" -> "2:00 pm", in the same style as formatTimeIst. */
export function formatHhmm(value: string | null | undefined): string {
  const minutes = hhmmMinutes(value ?? undefined);
  if (minutes === null) return value ?? '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

const person = (row: TeamDailyRow): TeamDayPerson => ({
  employeeId: row.employeeId,
  employeeName: row.employeeName,
  employeeCode: row.employeeCode,
  roles: [...row.roles],
  outlets: [...row.outlets],
});

const hasFlag = (row: TeamDailyRow, code: string) => row.delinquencies.some((d) => d.code === code);

const byName = (a: { employeeName: string }, b: { employeeName: string }) => a.employeeName.localeCompare(b.employeeName);
const byTime = (a: Punch, b: Punch) => (instant(a.at) ?? 0) - (instant(b.at) ?? 0);

/** One row per person: the rows of someone on two projects carry the same day; roles and outlets are merged. */
export function uniquePeople(rows: TeamDailyRow[]): TeamDailyRow[] {
  const byId = new Map<string, TeamDailyRow>();
  for (const row of rows) {
    const known = byId.get(row.employeeId);
    if (!known) {
      byId.set(row.employeeId, { ...row, roles: [...row.roles], outlets: [...row.outlets] });
      continue;
    }
    for (const role of row.roles) if (!known.roles.includes(role)) known.roles.push(role);
    for (const outlet of row.outlets) if (!known.outlets.includes(outlet)) known.outlets.push(outlet);
  }
  return [...byId.values()];
}

function timesOf(row: TeamDailyRow, fallback: StandardTimes | null): StandardTimes | null {
  return row.standardTimes ?? fallback;
}

/** Who did not check in, in four groups that never mix. */
export function noCheckIn(rows: TeamDailyRow[], now: Date): NoCheckIn {
  const out: NoCheckIn = { absent: [], notYet: [], onLeave: [], morningOff: [] };
  for (const row of rows) {
    if (row.checkInAt) continue;
    const kind = arrivalKind(row, now);
    const base = { ...person(row), leaveApplied: false, until: null as string | null };
    if (kind === 'ON_LEAVE') out.onLeave.push({ ...base, leaveApplied: row.status === 'LEAVE_APPLIED' });
    else if (kind === 'MORNING_OFF') out.morningOff.push({ ...base, until: row.halfDayHoliday?.splitAt ?? null });
    else if (kind === 'NOT_YET') (row.status === 'ABSENT' ? out.absent : out.notYet).push(base);
  }
  out.absent.sort(byName);
  out.notYet.sort(byName);
  out.onLeave.sort(byName);
  out.morningOff.sort(byName);
  return out;
}

/** First and last in and out, late and early check-ins, away-from-outlet check-ins, not checked out. */
export function punchStats(
  rows: TeamDailyRow[],
  { date, today, now, standardTimes = null }: { date: string; today: string; now: Date; standardTimes?: StandardTimes | null },
): PunchStats {
  const ins: Punch[] = [];
  const outs: Punch[] = [];
  const late: TimedPunch[] = [];
  const early: TimedPunch[] = [];
  const away: AwayPunch[] = [];
  const notCheckedOut: Punch[] = [];
  let outMeaningful = date < today;
  const nowMinutes = istMinutes(now);
  for (const row of rows) {
    const times = timesOf(row, standardTimes);
    if (row.checkInAt && instant(row.checkInAt) !== null) {
      const p: Punch = { ...person(row), at: row.checkInAt };
      ins.push(p);
      if (hasFlag(row, 'LATE_CHECK_IN')) {
        const start = hhmmMinutes(times?.checkIn);
        const minutes = start === null ? null : istMinutes(new Date(row.checkInAt)) - start;
        late.push({ ...p, minutes: minutes !== null && minutes > 0 ? minutes : null, reference: start === null ? null : times!.checkIn });
      }
      if (row.checkInOutOfFence === true) {
        const place = arrivalPlace(row);
        away.push({ ...p, label: place.label ?? 'Away from outlet', outlet: place.outlet });
      }
      if (row.checkOutAt && instant(row.checkOutAt) !== null) {
        const o: Punch = { ...person(row), at: row.checkOutAt };
        outs.push(o);
        if (hasFlag(row, 'EARLY_CHECK_OUT')) {
          const end = hhmmMinutes(times?.checkOut);
          const minutes = end === null ? null : end - istMinutes(new Date(row.checkOutAt));
          early.push({ ...o, minutes: minutes !== null && minutes > 0 ? minutes : null, reference: end === null ? null : times!.checkOut });
        }
      } else if (date < today) {
        notCheckedOut.push(p);
      } else if (date === today) {
        const end = hhmmMinutes(times?.checkOut);
        if (end !== null && nowMinutes >= end) {
          outMeaningful = true;
          notCheckedOut.push(p);
        }
      }
    }
  }
  // Today: once the ordinary day's end has passed, "nobody left inside" is a statement too.
  if (date === today) {
    const end = hhmmMinutes(standardTimes?.checkOut);
    if (end !== null && nowMinutes >= end) outMeaningful = true;
  }
  ins.sort(byTime);
  outs.sort(byTime);
  late.sort(byTime);
  early.sort(byTime);
  away.sort(byTime);
  notCheckedOut.sort(byName);
  return {
    firstIn: ins[0] ?? null,
    lastIn: ins.length ? ins[ins.length - 1] : null,
    firstOut: outs[0] ?? null,
    lastOut: outs.length ? outs[outs.length - 1] : null,
    late,
    early,
    away,
    notCheckedOut: outMeaningful ? notCheckedOut : null,
  };
}

const isPresent = (row: TeamDailyRow) => Boolean(row.checkInAt) || row.status === 'CORRECTED';

function counts(rows: TeamDailyRow[], groups: NoCheckIn) {
  return { people: rows.length, expected: rows.length - groups.onLeave.length, present: rows.filter(isPresent).length };
}

/**
 * The day as the daily view shows it: the overview counts each person once; every project lists the
 * people on it (someone on two projects under both). Projects are in name order, "No project" last.
 */
export function buildTeamDay(
  rows: TeamDailyRow[],
  { date, today, now = new Date(), standardTimes = null }: { date: string; today: string; now?: Date; standardTimes?: StandardTimes | null },
): TeamDay {
  const clock = dayClock(date, today, now);
  const people = uniquePeople(rows);
  const groups = noCheckIn(people, clock);
  const arrivals = summarizeArrivals(people, clock);
  const overview: DayOverview = {
    ...groups,
    ...counts(people, groups),
    reached: arrivals.reached,
    away: arrivals.away,
    outletStaffExpected: arrivals.outletStaffExpected,
    outletStaffReached: arrivals.outletStaffReached,
    leaveApplied: groups.onLeave.filter((p) => p.leaveApplied).length,
    morningOffUntil: groups.morningOff.find((p) => p.until)?.until ?? null,
    punches: punchStats(people, { date, today, now: clock, standardTimes }),
    standardTimes,
  };

  const byProject = new Map<string, { code: string | null; name: string; rows: TeamDailyRow[] }>();
  for (const row of rows) {
    const key = row.projectCode ?? '';
    const entry = byProject.get(key) ?? { code: row.projectCode, name: row.projectName || row.projectCode || 'No project', rows: [] };
    entry.rows.push(row);
    byProject.set(key, entry);
  }
  const projects = [...byProject.entries()]
    .sort(([ka, a], [kb, b]) => (ka === '' ? 1 : kb === '' ? -1 : a.name.localeCompare(b.name)))
    .map(([key, entry]): ProjectDay => {
      const g = noCheckIn(entry.rows, clock);
      return {
        key,
        code: entry.code,
        name: entry.name,
        rows: entry.rows,
        ...g,
        ...counts(entry.rows, g),
        punches: punchStats(entry.rows, { date, today, now: clock, standardTimes }),
      };
    });
  return { overview, projects };
}

/** The names of a shared person's other projects, for the Shared tag. */
export function otherProjectNames(others: OtherProject[]): string {
  return others.map((o) => o.projectName || o.projectCode).join(', ');
}
