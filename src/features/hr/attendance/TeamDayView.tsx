import { useMemo, useState, type ReactNode } from 'react';

import type { OtherProject, TeamDaily, TeamDailyRow } from '../../../services/hr/attendanceCalendar';
import { formatTimeIst } from './attendanceFormat';
import { formatMinutes, sharedText, type TagType } from './calendarFormat';
import { arrivalPlace, nextCheckInSort, sortByCheckIn, type CheckInSort } from './teamArrival';
import {
  buildTeamDay,
  formatHhmm,
  otherProjectNames,
  type Absentee,
  type DayOverview,
  type ProjectDay,
  type Punch,
  type PunchStats,
  type TeamDayPerson,
  type TimedPunch,
} from './teamDayStats';

/**
 * The daily view of the team attendance overview (product owner, 9 Nov 2026): a quick summary that
 * fits on one laptop screen (key figures, then everyone absent or not checked in so far, project by
 * project, then the first and last check-in and check-out), and below it one collapsible section per
 * project with its check-in and check-out statistics and the full table. IBM Carbon patterns: tiles,
 * tags, accordion, structured list, data table. Face scores are never part of team-daily and never
 * shown here.
 */

export interface OpenPerson { employeeId: string; employeeName: string; employeeCode: string }

/** The day's statuses from the daily rows (hrmgmt attendance_report). */
export const dailyStatus: Record<string, { text: string; tag: TagType }> = {
  COMPLETE: { text: 'Present', tag: 'green' },
  CHECKED_IN: { text: 'Checked in', tag: 'blue' },
  NOT_CHECKED_IN: { text: 'Not checked in yet', tag: 'outline' },
  ABSENT: { text: 'Absent (system)', tag: 'red' },
  ON_LEAVE: { text: 'Leave approved', tag: 'teal' },
  LEAVE_APPLIED: { text: 'Leave applied (not approved)', tag: 'purple' },
  MISSING_CHECK_OUT: { text: 'No check-out', tag: 'magenta' },
  PENDING_APPROVAL: { text: 'Waiting for approval', tag: 'warm-gray' },
  EXCEPTION_REJECTED: { text: 'Half day (rejected)', tag: 'magenta' },
  CORRECTED: { text: 'Corrected', tag: 'green' },
};

export function SharedTag({ others }: { others: OtherProject[] }) {
  if (!others.length) return null;
  return <span className="hr-tag hr-tag--shared" title={sharedText(others)}>Shared · {otherProjectNames(others)}</span>;
}

const SORT_LABEL: Record<CheckInSort, 'none' | 'ascending' | 'descending'> = { none: 'none', asc: 'ascending', desc: 'descending' };

const roleOutlet = (p: TeamDayPerson) => [p.roles.join(', '), p.outlets.join(', ')].filter(Boolean).join(' · ');

/** A person as a Carbon tag-like chip that opens their calendar. */
function PersonChip({ person, tone, extra, onOpen }: { person: TeamDayPerson; tone: 'red' | 'gray' | 'teal' | 'blue'; extra?: string; onOpen: (p: OpenPerson) => void }) {
  const meta = [roleOutlet(person), extra].filter(Boolean).join(' · ');
  return (
    <button
      type="button"
      className={`hr-td-chip hr-td-chip--${tone}`}
      onClick={() => onOpen(person)}
      title={`${person.employeeName} (${person.employeeCode})${meta ? ` · ${meta}` : ''}. Open the calendar.`}
    >
      <strong>{person.employeeName}</strong>
      {meta && <small>{meta}</small>}
    </button>
  );
}

function ChipGroup({ label, people, tone, onOpen, extra }: { label: string; people: Absentee[]; tone: 'red' | 'gray' | 'teal' | 'blue'; onOpen: (p: OpenPerson) => void; extra?: (p: Absentee) => string | undefined }) {
  if (!people.length) return null;
  return (
    <div className="hr-td-group">
      <span className={`hr-td-group__label hr-td-group__label--${tone}`}>{label} <b>{people.length}</b></span>
      <div className="hr-td-chips">
        {people.map((p) => <PersonChip key={p.employeeId} person={p} tone={tone} extra={extra?.(p)} onOpen={onOpen} />)}
      </div>
    </div>
  );
}

const leaveExtra = (p: Absentee) => (p.leaveApplied ? 'applied, not approved' : undefined);
const morningExtra = (p: Absentee) => (p.until ? `from ${formatHhmm(p.until)}` : undefined);

function PunchName({ punch, onOpen }: { punch: Punch | null; onOpen: (p: OpenPerson) => void }) {
  if (!punch) return <span className="hr-muted">—</span>;
  return (
    <>
      <strong className="hr-td-time">{formatTimeIst(punch.at)}</strong>{' '}
      <button type="button" className="hr-arrival-name" onClick={() => onOpen(punch)}>{punch.employeeName}</button>
    </>
  );
}

/** "1 h 10 m after 10:30 am", or nothing when myHR sent no times. */
function howFar(p: TimedPunch, word: 'after' | 'before'): string | null {
  return p.minutes && p.reference ? `${formatMinutes(p.minutes)} ${word} ${formatHhmm(p.reference)}` : null;
}

function QuickSummary({ overview, projects, isToday, updatedAt, onOpen }: { overview: DayOverview; projects: ProjectDay[]; isToday: boolean; updatedAt: number; onOpen: (p: OpenPerson) => void }) {
  const t = overview.standardTimes;
  const missing = overview.absent.length + overview.notYet.length;
  const p = overview.punches;
  const withNames = projects.filter((x) => x.absent.length || x.notYet.length || x.onLeave.length || x.morningOff.length);
  return (
    <section className="hr-td-quick" aria-label="Quick summary of the day">
      <div className="hr-td-figures" role="list">
        <div role="listitem" className="is-good">
          <span>Present</span>
          <strong>{overview.present}<small> / {overview.expected}</small></strong>
          <small>
            {overview.outletStaffExpected > 0 ? `${overview.outletStaffReached}/${overview.outletStaffExpected} at outlet` : `${overview.reached} at outlet`}
            {overview.away > 0 ? ` · ${overview.away} away` : ''}
          </small>
        </div>
        <div role="listitem" className={overview.notYet.length ? 'is-attention' : undefined}>
          <span>Not checked in yet</span>
          <strong>{overview.notYet.length}</strong>
          <small>{overview.morningOff.length ? `+${overview.morningOff.length} morning off${overview.morningOffUntil ? ` until ${formatHhmm(overview.morningOffUntil)}` : ''}` : isToday && t ? `absent after ${formatHhmm(t.absentAfter)}` : ' '}</small>
        </div>
        <div role="listitem" className={overview.absent.length ? 'is-attention' : undefined}>
          <span>Absent</span>
          <strong>{overview.absent.length}</strong>
          <small>{t ? `none by ${formatHhmm(t.absentAfter)}` : 'no check-in'}</small>
        </div>
        <div role="listitem" className={p.late.length ? 'is-warning' : undefined}>
          <span>Late check-in</span>
          <strong>{p.late.length}</strong>
          <small>{t ? `after ${formatHhmm(t.lateAfter)}` : ' '}</small>
        </div>
        <div role="listitem" className={p.early.length ? 'is-warning' : undefined}>
          <span>Early check-out</span>
          <strong>{p.early.length}</strong>
          <small>{t ? `before ${formatHhmm(t.checkOutEarliest)}` : ' '}</small>
        </div>
        <div role="listitem">
          <span>On leave</span>
          <strong>{overview.onLeave.length}</strong>
          <small>{overview.leaveApplied ? `${overview.leaveApplied} applied, not approved` : ' '}</small>
        </div>
      </div>

      <div className="hr-td-names" aria-label="Absent or not checked in so far">
        <div className="hr-td-names__head">
          <h3>{isToday ? 'Absent or not checked in so far' : 'Absent or not checked in'} <b>{missing}</b></h3>
          {isToday && updatedAt > 0 && <small>Updated {formatTimeIst(new Date(updatedAt).toISOString())} · refreshes every 3 minutes</small>}
        </div>
        <div className="hr-td-names__body" tabIndex={0}>
          {missing === 0 && <p className="hr-td-empty">Everyone expected {isToday ? 'so far ' : ''}has checked in.</p>}
          {withNames.map((x) => (
            <div key={x.key || 'none'} className="hr-td-names__project">
              <h4>{x.name}</h4>
              <div>
                <ChipGroup label="Absent" people={x.absent} tone="red" onOpen={onOpen} />
                <ChipGroup label="Not checked in yet" people={x.notYet} tone="gray" onOpen={onOpen} />
                <ChipGroup label="On leave" people={x.onLeave} tone="teal" onOpen={onOpen} extra={leaveExtra} />
                <ChipGroup label="Morning off" people={x.morningOff} tone="blue" onOpen={onOpen} extra={morningExtra} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <dl className="hr-td-line" aria-label="First and last check-in and check-out">
        <div><dt>First in</dt><dd><PunchName punch={p.firstIn} onOpen={onOpen} /></dd></div>
        <div><dt>Last in</dt><dd><PunchName punch={p.lastIn} onOpen={onOpen} /></dd></div>
        <div><dt>First out</dt><dd><PunchName punch={p.firstOut} onOpen={onOpen} /></dd></div>
        <div><dt>Last out</dt><dd><PunchName punch={p.lastOut} onOpen={onOpen} /></dd></div>
        {p.notCheckedOut && (
          <div className={p.notCheckedOut.length ? 'is-attention' : undefined}>
            <dt>{isToday && t ? `Still in after ${formatHhmm(t.checkOut)}` : 'Never checked out'}</dt>
            <dd><strong className="hr-td-time">{p.notCheckedOut.length}</strong></dd>
          </div>
        )}
      </dl>
    </section>
  );
}

function PunchList<T extends Punch>({ items, empty, render }: { items: T[]; empty: string; render: (p: T) => ReactNode }) {
  if (!items.length) return <span className="hr-muted">{empty}</span>;
  return <ul className="hr-td-punches">{items.map((p) => <li key={`${p.employeeId}-${p.at}`}>{render(p)}</li>)}</ul>;
}

function ProjectStats({ project, isToday, onOpen }: { project: ProjectDay; isToday: boolean; onOpen: (p: OpenPerson) => void }) {
  const p: PunchStats = project.punches;
  const nameButton = (x: TeamDayPerson) => <button type="button" className="hr-arrival-name" onClick={() => onOpen(x)}>{x.employeeName}</button>;
  const noOne = !project.absent.length && !project.notYet.length && !project.onLeave.length && !project.morningOff.length;
  return (
    <>
      <div className="hr-td-block">
        <h4>Not checked in</h4>
        {noOne ? <span className="hr-muted">Everyone expected has checked in.</span> : (
          <>
            <ChipGroup label="Absent" people={project.absent} tone="red" onOpen={onOpen} />
            <ChipGroup label="Not checked in yet" people={project.notYet} tone="gray" onOpen={onOpen} />
            <ChipGroup label="On leave" people={project.onLeave} tone="teal" onOpen={onOpen} extra={leaveExtra} />
            <ChipGroup label="Morning off" people={project.morningOff} tone="blue" onOpen={onOpen} extra={morningExtra} />
          </>
        )}
      </div>
      <div className="hr-td-stats">
        <div className="hr-td-block">
          <h4>Check-in</h4>
          <dl className="hr-td-slist">
            <div><dt>First in</dt><dd><PunchName punch={p.firstIn} onOpen={onOpen} /></dd></div>
            <div><dt>Last in</dt><dd><PunchName punch={p.lastIn} onOpen={onOpen} /></dd></div>
            <div>
              <dt>Late <b>{p.late.length}</b></dt>
              <dd>
                <PunchList items={p.late} empty="None" render={(x) => (
                  <>{nameButton(x)} <span className="hr-td-time">{formatTimeIst(x.at)}</span> <small>{howFar(x, 'after') ?? 'Late'}</small></>
                )} />
              </dd>
            </div>
            <div>
              <dt>Away from the outlet <b>{p.away.length}</b></dt>
              <dd>
                <PunchList items={p.away} empty="None" render={(x) => (
                  <>{nameButton(x)} <span className="hr-td-time">{formatTimeIst(x.at)}</span> <span className="hr-tag hr-tag--red">{x.label}</span>{x.outlet && <small> {x.outlet}</small>}</>
                )} />
              </dd>
            </div>
          </dl>
        </div>
        <div className="hr-td-block">
          <h4>Check-out</h4>
          <dl className="hr-td-slist">
            <div><dt>First out</dt><dd><PunchName punch={p.firstOut} onOpen={onOpen} /></dd></div>
            <div><dt>Last out</dt><dd><PunchName punch={p.lastOut} onOpen={onOpen} /></dd></div>
            <div>
              <dt>Early <b>{p.early.length}</b></dt>
              <dd>
                <PunchList items={p.early} empty="None" render={(x) => (
                  <>{nameButton(x)} <span className="hr-td-time">{formatTimeIst(x.at)}</span> <small>{howFar(x, 'before') ?? 'Early'}</small></>
                )} />
              </dd>
            </div>
            <div>
              <dt>{isToday ? 'Not checked out yet' : 'Never checked out'} {p.notCheckedOut && <b>{p.notCheckedOut.length}</b>}</dt>
              <dd>
                {p.notCheckedOut === null
                  ? <span className="hr-muted">Shown after the standard check-out time</span>
                  : <PunchList items={p.notCheckedOut} empty="None" render={(x) => <>{nameButton(x)} <small>in at {formatTimeIst(x.at)}</small></>} />}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </>
  );
}

function CheckInCell({ row }: { row: TeamDailyRow }) {
  if (!row.checkInAt) return <>—</>;
  const place = arrivalPlace(row);
  return (
    <span className="hr-arrival">
      <strong>{formatTimeIst(row.checkInAt)}</strong>
      {place.outlet && <small>{place.outlet}</small>}
      {place.label && <span className={`hr-tag hr-tag--${place.tone}`}>{place.label}</span>}
    </span>
  );
}

function ProjectTable({ rows, sort, onSort, onOpen }: { rows: TeamDailyRow[]; sort: CheckInSort; onSort: () => void; onOpen: (p: OpenPerson) => void }) {
  return (
    <div className="uc01-admin-table-wrap">
      <table className="uc01-admin-table hr-table hr-ov-table">
        <thead>
          <tr>
            <th>Employee</th>
            <th>Status</th>
            <th aria-sort={SORT_LABEL[sort]}>
              <button type="button" className={`hr-sort${sort !== 'none' ? ' is-sorted' : ''}`} onClick={onSort} title="Sort by check-in time">
                Check-in · outlet
                <span aria-hidden="true" className="hr-sort__icon">{sort === 'asc' ? '↑' : sort === 'desc' ? '↓' : '↕'}</span>
              </button>
            </th>
            <th>Check-out</th><th>Hours</th><th>Notes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const s = dailyStatus[r.status] ?? { text: r.status, tag: 'outline' as TagType };
            const notes = r.delinquencies.filter((d) => d.code !== 'ABSENT').map((d) => d.label);
            return (
              <tr key={`${r.employeeId}-${r.projectCode}`} className={r.shared ? 'hr-ov-row--shared' : undefined}>
                <td data-label="Employee">
                  <button type="button" className="hr-daily-open" onClick={() => onOpen(r)} aria-label={`Open the calendar of ${r.employeeName}`}>
                    <span className="hr-daily-cell">
                      <strong>{r.employeeName}</strong>
                      <small>{r.employeeCode}{r.roles.length ? ` · ${r.roles.join(', ')}` : ''}{r.outlets.length ? ` · ${r.outlets.join(', ')}` : ''}</small>
                    </span>
                  </button>
                  <SharedTag others={r.otherProjects} />
                </td>
                <td data-label="Status"><span className={`hr-tag hr-tag--${s.tag}`}>{s.text}</span></td>
                <td data-label="Check-in"><CheckInCell row={r} /></td>
                <td data-label="Check-out">{r.checkOutAt ? formatTimeIst(r.checkOutAt) : '—'}</td>
                <td data-label="Hours">
                  {r.workedMinutes ? formatMinutes(r.workedMinutes) : r.runningMinutes ? `${formatMinutes(r.runningMinutes)} so far` : '—'}
                  <small>{formatMinutes(r.weekMinutes)} this week</small>
                </td>
                <td data-label="Notes">{notes.length ? notes.join(' · ') : <span className="hr-muted">—</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ProjectHeaderFacts({ project }: { project: ProjectDay }) {
  const p = project.punches;
  const missing = project.absent.length + project.notYet.length;
  return (
    <span className="hr-td-acc__facts">
      <span><b>{project.present}</b> of {project.expected} present</span>
      {p.late.length > 0 && <span className="hr-tag hr-tag--magenta">{p.late.length} late</span>}
      {p.early.length > 0 && <span className="hr-tag hr-tag--magenta">{p.early.length} early out</span>}
      {missing > 0 && <span className="hr-tag hr-tag--red">{missing} not checked in</span>}
      {p.firstIn && <span className="hr-td-acc__range">In {formatTimeIst(p.firstIn.at)}{p.lastIn && p.lastIn !== p.firstIn ? ` – ${formatTimeIst(p.lastIn.at)}` : ''}</span>}
    </span>
  );
}

export default function TeamDayView({
  data,
  today,
  updatedAt,
  needle,
  onOpen,
}: {
  data: TeamDaily;
  today: string;
  updatedAt: number;
  /** The search, lower case: filters the project tables; the summaries stay whole. */
  needle: string;
  onOpen: (p: OpenPerson) => void;
}) {
  const [sort, setSort] = useState<CheckInSort>('none');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const isToday = data.date === today;
  // updatedAt changes with every refresh, so "now" moves with the 3-minute refresh of today.
  const day = useMemo(
    () => buildTeamDay(data.rows, { date: data.date, today, now: new Date(updatedAt || Date.now()), standardTimes: data.standardTimes ?? null }),
    [data, today, updatedAt],
  );
  const matches = (r: TeamDailyRow) => !needle || r.employeeName.toLowerCase().includes(needle) || r.employeeCode.toLowerCase().includes(needle);
  const sections = day.projects
    .map((project) => ({ project, rows: sortByCheckIn(project.rows.filter(matches), sort) }))
    .filter((s) => s.rows.length > 0);
  const toggle = (key: string) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const allOpen = sections.length > 0 && sections.every((s) => expanded.has(s.project.key));
  const onSort = () => setSort(nextCheckInSort(sort));

  return (
    <>
      <QuickSummary overview={day.overview} projects={day.projects} isToday={isToday} updatedAt={updatedAt} onOpen={onOpen} />

      <div className="hr-td-sections-head">
        <h3>Projects <b>{sections.length}</b></h3>
        <div className="hr-td-sections-head__actions">
          {sections.length > 0 && (
            <button type="button" className="uc01-admin-button hr-sort-phone" onClick={onSort}>
              {sort === 'asc' ? 'Check-in: earliest first' : sort === 'desc' ? 'Check-in: latest first' : 'Sort by check-in time'}
            </button>
          )}
          {sections.length > 0 && (
            <button type="button" className="uc01-admin-button" onClick={() => setExpanded(allOpen ? new Set() : new Set(sections.map((s) => s.project.key)))}>
              {allOpen ? 'Collapse all' : 'Expand all'}
            </button>
          )}
        </div>
      </div>
      {sections.length === 0 && <div className="uc01-admin-state">{needle ? 'No one matches this search.' : 'No one on your projects for this day.'}</div>}

      <ul className="hr-td-acc">
        {sections.map(({ project, rows }) => {
          // Collapsed by default; a search opens the projects it found someone in.
          const open = expanded.has(project.key) || Boolean(needle);
          const id = `hr-td-${project.key || 'none'}`;
          return (
            <li key={project.key || 'none'} className={`hr-td-acc__item${open ? ' is-open' : ''}${project.expected === 0 ? ' is-quiet' : ''}`}>
              <button type="button" className="hr-td-acc__head" aria-expanded={open} aria-controls={id} onClick={() => toggle(project.key)}>
                <span className="hr-td-acc__chevron" aria-hidden="true">›</span>
                <span className="hr-td-acc__title">{project.name}<small>{project.people} {project.people === 1 ? 'person' : 'people'}</small></span>
                <ProjectHeaderFacts project={project} />
              </button>
              {open && (
                <div id={id} className="hr-td-acc__panel">
                  <ProjectStats project={project} isToday={isToday} onOpen={onOpen} />
                  <ProjectTable rows={rows} sort={sort} onSort={onSort} onOpen={onOpen} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
