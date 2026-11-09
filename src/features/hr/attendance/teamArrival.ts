import type { TeamDailyRow } from '../../../services/hr/attendanceCalendar';
import { formatDistance } from './attendanceFormat';

/**
 * Who has reached the outlet today, for the Team Lead, Project Manager and Executive (product owner,
 * 9 Nov 2026: "instead of asking manually, the TL/PM can check there itself").
 *
 * Everything is read from what myHR stored at the check-in. Whether the person was at the outlet is
 * myHR's own geofence decision (`checkInOutOfFence`): false is "at the outlet", true is "away from
 * it". When myHR has nothing to say (null: the fence does not apply to a Team Lead or Project Manager,
 * or the outlet has no location on file) the screen says nothing either, and never guesses from the
 * distance alone.
 */

export type ArrivalKind =
  /** Checked in inside the geofence of their outlet. */
  | 'REACHED'
  /** Checked in outside the geofence. */
  | 'AWAY'
  /** Checked in, with no outlet check (not geofenced, or the outlet has no location on file). */
  | 'CHECKED_IN'
  /** No check-in on a working day (after 17:00 myHR marks it absent). */
  | 'NOT_YET'
  /** A half-day holiday with the morning off, before the afternoon starts (splitAt): not expected yet. */
  | 'MORNING_OFF'
  /** Approved leave, or leave applied and not decided yet, and no check-in. */
  | 'ON_LEAVE'
  /** Anything else without a check-in (a correction made the day, for example). */
  | 'OTHER';

type ArrivalRow = Pick<
  TeamDailyRow,
  'employeeId' | 'employeeName' | 'employeeCode' | 'roles' | 'status' | 'checkInAt' | 'checkInOutlet' | 'checkInDistanceM' | 'checkInOutOfFence'
> & Partial<Pick<TeamDailyRow, 'halfDayHoliday'>>;

/** Minutes since midnight in India time. */
function istMinutes(now: Date): number {
  const ist = new Date(now.getTime() + 330 * 60_000);
  return ist.getUTCHours() * 60 + ist.getUTCMinutes();
}

function hhmmMinutes(value: string | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(value ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/**
 * The morning is off (a half-day holiday, product owner 9 Nov 2026) and the afternoon has not started
 * yet: myHR's own split time (attendance.half_day_split, sent with each row as splitAt).
 */
export function morningOffNow(row: ArrivalRow, now: Date = new Date()): boolean {
  const half = row.halfDayHoliday;
  if (!half || half.dayPart !== 'MORNING') return false;
  const split = hhmmMinutes(half.splitAt);
  return split !== null && istMinutes(now) < split;
}

export function arrivalKind(row: ArrivalRow, now: Date = new Date()): ArrivalKind {
  if (row.checkInAt) {
    if (row.checkInOutOfFence === false) return 'REACHED';
    if (row.checkInOutOfFence === true) return 'AWAY';
    return 'CHECKED_IN';
  }
  if (row.status === 'ON_LEAVE' || row.status === 'LEAVE_APPLIED') return 'ON_LEAVE';
  if (morningOffNow(row, now)) return 'MORNING_OFF';
  if (row.status === 'NOT_CHECKED_IN' || row.status === 'ABSENT') return 'NOT_YET';
  return 'OTHER';
}

export interface ArrivalPlace {
  /** "At outlet", "Away 2.4 km", or null when myHR made no outlet check. */
  label: string | null;
  tone: 'green' | 'red' | null;
  /** The outlet the check-in was measured against (the nearest of the person's outlets). */
  outlet: string | null;
}

/** What to show under the check-in time. The outlet name is shown whenever myHR stored one. */
export function arrivalPlace(row: ArrivalRow): ArrivalPlace {
  const outlet = row.checkInOutlet?.trim() || null;
  if (!row.checkInAt) return { label: null, tone: null, outlet: null };
  if (row.checkInOutOfFence === false) return { label: 'At outlet', tone: 'green', outlet };
  if (row.checkInOutOfFence === true) {
    const distance = formatDistance(row.checkInDistanceM);
    return { label: distance ? `Away ${distance}` : 'Away from outlet', tone: 'red', outlet };
  }
  return { label: null, tone: null, outlet };
}

/**
 * myHR's own rule for who is geofenced: a Process Coordinator who is not also a Team Lead or Project
 * Manager. "n of m reached the outlet" counts these people only, so a Team Lead on the team is never
 * shown as "not reached".
 */
export function isOutletStaff(roles: string[]): boolean {
  const set = new Set(roles.map((r) => r.toUpperCase()));
  return set.has('PC') && !set.has('TL') && !set.has('PM');
}

export interface ArrivalPerson {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  roles: string[];
  kind: ArrivalKind;
  /** Leave applied and not decided yet (kind ON_LEAVE). */
  leaveApplied: boolean;
  checkInAt: string | null;
}

export interface ArrivalSummary {
  /** Different people (someone on two projects is counted once). */
  people: number;
  reached: number;
  away: number;
  /** Checked in with no outlet check. */
  checkedIn: number;
  notYet: ArrivalPerson[];
  onLeave: number;
  /** Of onLeave: leave applied, not approved yet. */
  leaveApplied: number;
  /** Morning off (half-day holiday) and the afternoon has not started: not expected yet. */
  morningOff: number;
  /** When the afternoon starts for them ("14:00"), or null. */
  morningOffUntil: string | null;
  /** Outlet staff (see isOutletStaff) who are not on leave: the "m" of "n of m reached the outlet". */
  outletStaffExpected: number;
  /** Outlet staff who reached the outlet: the "n". */
  outletStaffReached: number;
  /** The first and the latest check-in at the outlet (ISO instants), or null. */
  firstArrival: string | null;
  lastArrival: string | null;
}

/** One entry per person: the rows of someone on two projects carry the same day, so their roles are merged. */
export function arrivalPeople(rows: ArrivalRow[], now: Date = new Date()): ArrivalPerson[] {
  const byId = new Map<string, ArrivalPerson>();
  for (const row of rows) {
    const known = byId.get(row.employeeId);
    if (known) {
      for (const role of row.roles) if (!known.roles.includes(role)) known.roles.push(role);
      continue;
    }
    byId.set(row.employeeId, {
      employeeId: row.employeeId,
      employeeName: row.employeeName,
      employeeCode: row.employeeCode,
      roles: [...row.roles],
      kind: arrivalKind(row, now),
      leaveApplied: !row.checkInAt && row.status === 'LEAVE_APPLIED',
      checkInAt: row.checkInAt,
    });
  }
  return [...byId.values()];
}

const instant = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
};

export function summarizeArrivals(rows: ArrivalRow[], now: Date = new Date()): ArrivalSummary {
  const people = arrivalPeople(rows, now);
  const until = rows.find((r) => morningOffNow(r, now))?.halfDayHoliday?.splitAt ?? null;
  const summary: ArrivalSummary = {
    people: people.length,
    reached: 0,
    away: 0,
    checkedIn: 0,
    notYet: [],
    onLeave: 0,
    leaveApplied: 0,
    morningOff: 0,
    morningOffUntil: until,
    outletStaffExpected: 0,
    outletStaffReached: 0,
    firstArrival: null,
    lastArrival: null,
  };
  let first: number | null = null;
  let last: number | null = null;
  for (const p of people) {
    if (p.kind === 'REACHED') summary.reached += 1;
    else if (p.kind === 'AWAY') summary.away += 1;
    else if (p.kind === 'CHECKED_IN') summary.checkedIn += 1;
    else if (p.kind === 'NOT_YET') summary.notYet.push(p);
    else if (p.kind === 'MORNING_OFF') summary.morningOff += 1;
    else if (p.kind === 'ON_LEAVE') {
      summary.onLeave += 1;
      if (p.leaveApplied) summary.leaveApplied += 1;
    }
    if (p.kind === 'REACHED' && p.checkInAt) {
      const t = instant(p.checkInAt);
      if (t !== null) {
        if (first === null || t < first) { first = t; summary.firstArrival = p.checkInAt; }
        if (last === null || t > last) { last = t; summary.lastArrival = p.checkInAt; }
      }
    }
    if (isOutletStaff(p.roles) && p.kind !== 'ON_LEAVE' && p.kind !== 'MORNING_OFF') {
      summary.outletStaffExpected += 1;
      if (p.kind === 'REACHED') summary.outletStaffReached += 1;
    }
  }
  summary.notYet.sort((a, b) => a.employeeName.localeCompare(b.employeeName));
  return summary;
}

/** "Asha Rao, Ravi Das +3": at most `limit` names, then how many more. */
export function namesWithMore(people: Array<{ employeeName: string }>, limit = 5): string {
  if (!people.length) return '';
  const shown = people.slice(0, limit).map((p) => p.employeeName).join(', ');
  const more = people.length - limit;
  return more > 0 ? `${shown} +${more}` : shown;
}

export type CheckInSort = 'none' | 'asc' | 'desc';

/** The next step of a Carbon sortable header: unsorted, earliest first, latest first, unsorted. */
export function nextCheckInSort(sort: CheckInSort): CheckInSort {
  return sort === 'none' ? 'asc' : sort === 'asc' ? 'desc' : 'none';
}

/** Rows by check-in time; people without a check-in always go last, in their original order. */
export function sortByCheckIn<T extends { checkInAt: string | null }>(rows: T[], sort: CheckInSort): T[] {
  if (sort === 'none') return rows;
  const dir = sort === 'asc' ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index, t: row.checkInAt ? instant(row.checkInAt) : null }))
    .sort((a, b) => {
      if (a.t === null && b.t === null) return a.index - b.index;
      if (a.t === null) return 1;
      if (b.t === null) return -1;
      return a.t === b.t ? a.index - b.index : (a.t - b.t) * dir;
    })
    .map((x) => x.row);
}

/** Today's view refreshes itself every three minutes while it is open; past days never change. */
export const TODAY_REFRESH_MS = 3 * 60_000;
