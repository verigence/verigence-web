import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import PageHeader from '../../components/PageHeader';
import { ATTENDANCE_PERMISSION } from '../../services/hr/attendance';
import { getDailyAttendance, type DailyRow } from '../../services/hr/attendanceReports';
import { hrErrorMessage } from '../../services/hr/client';
import { HR_PERMISSION } from '../../services/hr/employees';
import { getWorkAssignments } from '../../services/hr/workAssignments';
import { useSessionStore } from '../../store/sessionStore';
import DailyDetailDialog from '../../features/hr/attendance/DailyDetailDialog';
import PhotoThumb from '../../features/hr/attendance/PhotoThumb';
import ReportDialog from '../../features/hr/attendance/ReportDialog';
import { formatDistance, formatTimeIst, formatWorkDate, todayIst } from '../../features/hr/attendance/attendanceFormat';
import {
  DAY_FILTERS,
  countByFilter,
  dailyKeys,
  dailyStatusLabels,
  dailyStatusTone,
  dayFilterLabels,
  delinquencyText,
  faceScoreText,
  fenceLabel,
  formatHours,
  groupByProject,
  matchesDayFilter,
  needsAttention,
  shiftDate,
  type DayFilter,
} from '../../features/hr/attendance/dailyAttendance';
import { useHrAccess } from '../../features/hr/hrQueries';
import '../../styles/hr-attendance.css';

interface Project { code: string; name: string }

function Side({ at, outlet, distance, photo, face }: { at: string | null; outlet: string | null; distance: number | null; photo?: ReactNode; face?: string | null }) {
  const far = formatDistance(distance);
  return (
    <span className="hr-daily-cell">
      <strong>{formatTimeIst(at)}</strong>
      {at && (outlet || far) && <small>{[outlet, far].filter(Boolean).join(' · ')}</small>}
      {at && face && <small className="hr-daily-face">{face}</small>}
      {photo}
    </span>
  );
}

/** Outside the tagged location? Only for people the fence applies to; everyone else gets a dash. */
function Fence({ row }: { row: DailyRow }) {
  const inValue = row.checkInOutOfFence;
  const outValue = row.checkOutOutOfFence;
  if ((inValue === null || inValue === undefined) && (outValue === null || outValue === undefined)) return <span className="hr-muted">—</span>;
  const part = (label: string, value: boolean | null | undefined) => (
    <small>{label}: <strong className={value === true ? 'hr-fence hr-fence--out' : 'hr-fence'}>{fenceLabel(value)}</strong></small>
  );
  return <span className="hr-daily-cell">{part('Check-in', inValue)}{part('Check-out', outValue)}</span>;
}

/** The stamped photo, opened only when tapped (and recorded when HR looks at it). */
function photoFor(row: DailyRow, event: 'CHECK_IN' | 'CHECK_OUT') {
  const has = event === 'CHECK_IN' ? row.hasCheckInPhoto : row.hasCheckOutPhoto;
  if (!row.attendanceId || !has) return null;
  return <PhotoThumb attendanceId={row.attendanceId} event={event} hasPhoto caption={`${row.employeeName}, ${formatWorkDate(row.workDate)}`} />;
}

function RowLine({ row, onOpen }: { row: DailyRow; onOpen: (row: DailyRow) => void }) {
  return (
    <tr className={needsAttention(row) ? 'hr-daily-row--attention' : undefined}>
      <td data-label="Employee">
        <button type="button" className="hr-daily-open" onClick={() => onOpen(row)} aria-label={`Open ${row.employeeName}, ${row.employeeCode}`}>
          <span className="hr-daily-cell"><strong>{row.employeeName}</strong><small>{row.employeeCode}</small></span>
        </button>
      </td>
      <td data-label="Role">{row.roles.length ? row.roles.join(', ') : '—'}</td>
      <td data-label="Check-in"><Side at={row.checkInAt} outlet={row.checkInOutlet} distance={row.checkInDistanceM} photo={photoFor(row, 'CHECK_IN')} face={faceScoreText(row.checkInFaceScore, row.checkInFaceRef)} /></td>
      <td data-label="Check-out"><Side at={row.checkOutAt} outlet={row.checkOutOutlet} distance={row.checkOutDistanceM} photo={photoFor(row, 'CHECK_OUT')} face={faceScoreText(row.checkOutFaceScore, row.checkOutFaceRef)} /></td>
      <td data-label="Out of fence"><Fence row={row} /></td>
      <td data-label="Hours">{formatHours(row.hoursWorked)}</td>
      <td data-label="Status">
        <span className={`uc01-admin-status${dailyStatusTone[row.status] ? ` uc01-admin-status--${dailyStatusTone[row.status]}` : ''}`}>
          {dailyStatusLabels[row.status] ?? row.status}
        </span>
      </td>
      <td data-label="Delinquencies">
        {row.delinquencies.length === 0 ? <span className="hr-muted">None</span> : (
          <span className="hr-daily-cell">
            <span className="hr-flags">
              {row.delinquencies.map((d, i) => <span key={`${d.code}-${i}`} className="hr-flag">{delinquencyText(d)}</span>)}
            </span>
            {row.delinquencies.filter((d) => d.reason).map((d, i) => (
              <small key={`${d.code}-reason-${i}`}>Reason given: {d.reason}</small>
            ))}
          </span>
        )}
      </td>
    </tr>
  );
}

/** HR / Finance / CEO: who checked in on a day, by project, with what needs attention marked. */
export default function HrDailyAttendancePage() {
  const accessToken = useSessionStore((state) => state.accessToken);
  const access = useHrAccess();
  const allowed = access.can(ATTENDANCE_PERMISSION.readAll);
  const today = todayIst();
  const [date, setDate] = useState(today);
  const [project, setProject] = useState('');
  const [filter, setFilter] = useState<DayFilter>('ALL');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [reportOpen, setReportOpen] = useState(false);
  const [openRow, setOpenRow] = useState<DailyRow | null>(null);
  const [known, setKnown] = useState<Map<string, string>>(new Map());

  const query = useQuery({
    queryKey: dailyKeys.day(date, project),
    queryFn: () => getDailyAttendance(accessToken!, date, project || undefined),
    enabled: Boolean(accessToken) && allowed,
    retry: false,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  });
  // The project list for the filter, when the person may also read assignments.
  const assigned = useQuery({
    queryKey: dailyKeys.assignments(''),
    queryFn: () => getWorkAssignments(accessToken!),
    enabled: Boolean(accessToken) && allowed && access.can(HR_PERMISSION.employeeRead),
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 10 * 60_000,
  });
  const data = query.data;

  // Projects seen in any answer, so choosing one does not empty the list to choose from.
  useEffect(() => {
    if (!data) return;
    setKnown((current) => {
      const next = new Map(current);
      for (const r of data.rows) if (r.projectCode) next.set(r.projectCode, r.projectName ?? r.projectCode);
      return next.size === current.size ? current : next;
    });
  }, [data]);
  const projects = useMemo<Project[]>(() => {
    const all = new Map(known);
    for (const p of assigned.data?.projects ?? []) all.set(p.projectCode, p.projectName);
    return [...all].map(([code, name]) => ({ code, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [known, assigned.data]);

  const counts = useMemo(() => countByFilter(data?.rows ?? []), [data]);
  const rows = useMemo(() => (data?.rows ?? []).filter((r) => matchesDayFilter(r, filter)), [data, filter]);
  const groups = useMemo(() => groupByProject(rows), [rows]);
  const toggle = (key: string) => setCollapsed((current) => {
    const next = new Set(current);
    if (!next.delete(key)) next.add(key);
    return next;
  });

  if (access.loading) return <div className="uc01-admin-state">Loading…</div>;
  if (!allowed) {
    return (
      <section className="uc01-admin-page" aria-label="Daily attendance">
        <PageHeader eyebrow="HR" title="Daily attendance" />
        <div className="uc01-admin-state uc01-admin-state--error">
          <strong>You do not have access to everyone&apos;s attendance.</strong>
          <span>Ask an administrator to give you an HR role.</span>
        </div>
      </section>
    );
  }

  const s = data?.summary;
  const tiles: Array<[string, number | undefined, string?]> = [
    ['Employees', s?.employees],
    ['Checked in', s?.checkedIn],
    ['Completed', s?.completed],
    ['Not checked in / absent', s ? s.notCheckedIn + s.absent : undefined, s ? `${s.notCheckedIn} not in, ${s.absent} absent` : undefined],
    ['On leave', s?.onLeave],
    ['Pending approval', s?.pendingApproval],
    ['With delinquencies', s?.withDelinquencies],
  ];

  return (
    <section className="uc01-admin-page hr-page hr-att-page hr-daily" aria-label="Daily attendance">
      <PageHeader
        eyebrow="HR"
        title="Daily attendance"
        description="Who checked in on a day, by project. Times are in IST."
        actions={<button type="button" className="uc01-admin-button uc01-admin-button--primary hr-daily__download" onClick={() => setReportOpen(true)}>Download report</button>}
      />

      <div className="hr-daily__toolbar">
        <div className="hr-att-months" role="group" aria-label="Day">
          <button type="button" className="uc01-admin-button hr-att-months__step" aria-label="Previous day" onClick={() => setDate(shiftDate(date, -1))}>‹</button>
          <label className="hr-att-months__select">
            <span className="hr-visually-hidden">Choose day</span>
            <input type="date" className="hr-daily__date" value={date} max={today} onChange={(e) => e.target.value && e.target.value <= today && setDate(e.target.value)} />
          </label>
          <button type="button" className="uc01-admin-button hr-att-months__step" aria-label="Next day" disabled={date >= today} onClick={() => setDate(shiftDate(date, 1))}>›</button>
        </div>
        <div className="hr-daily__quick">
          <button type="button" className="uc01-admin-button" disabled={date === today} onClick={() => setDate(today)}>Today</button>
          <button type="button" className="uc01-admin-button" disabled={date === shiftDate(today, -1)} onClick={() => setDate(shiftDate(today, -1))}>Yesterday</button>
        </div>
        <label className="uc01-admin-filter">
          <span>Project</span>
          <select value={project} onChange={(e) => setProject(e.target.value)}>
            <option value="">All projects</option>
            {projects.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
          </select>
        </label>
      </div>

      <div className="hr-daily__filters" role="group" aria-label="Show">
        {DAY_FILTERS.map((f) => (
          <button key={f} type="button" className={`hr-daily__chip${filter === f ? ' is-on' : ''}`} aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {dayFilterLabels[f]} <span>{data ? counts[f] : '–'}</span>
          </button>
        ))}
      </div>

      <p className="hr-count" aria-live="polite">{formatWorkDate(date)}</p>
      {data?.dayKind === 'SUNDAY' && <div className="uc01-admin-message uc01-admin-message--info">Sunday is the weekly off.</div>}
      {data?.dayKind === 'HOLIDAY' && <div className="uc01-admin-message uc01-admin-message--info">Holiday{data.holiday ? `: ${data.holiday}` : ''}.</div>}

      {query.isLoading && <div className="uc01-admin-state">Loading attendance…</div>}
      {query.isError && (
        <div className="uc01-admin-state uc01-admin-state--error" role="alert">
          <strong>Attendance could not be loaded.</strong>
          <span>{hrErrorMessage(query.error)}</span>
          <button type="button" className="uc01-admin-button" onClick={() => query.refetch()}>Try again</button>
        </div>
      )}

      {data && !query.isError && (
        <>
          <div className="hr-daily__tiles">
            {tiles.map(([label, value, sub]) => (
              <div key={label} className={label === 'With delinquencies' && value ? 'is-attention' : undefined}>
                <span>{label}</span>
                <strong>{value ?? '—'}</strong>
                {sub && <small>{sub}</small>}
              </div>
            ))}
          </div>

          {groups.length === 0 ? (
            <div className="uc01-admin-state">{filter !== 'ALL' && (data?.rows.length ?? 0) > 0 ? `No one matches “${dayFilterLabels[filter]}” on this day.` : 'No attendance to show for this day.'}</div>
          ) : (
            groups.map((g) => {
              const open = !collapsed.has(g.key);
              return (
                <section key={g.key || 'none'} className="hr-daily-group" aria-label={g.name}>
                  <button type="button" className="hr-daily-group__head" aria-expanded={open} onClick={() => toggle(g.key)}>
                    <span className="hr-daily-group__caret" aria-hidden="true">{open ? '▾' : '▸'}</span>
                    <strong>{g.name}</strong>
                    <span className="hr-muted">
                      {g.rows.length === 1 ? '1 person' : `${g.rows.length} people`}
                      {g.delinquent > 0 && ` · ${g.delinquent} with delinquencies`}
                    </span>
                  </button>
                  {open && (
                    <div className="uc01-admin-table-wrap">
                      <table className="uc01-admin-table hr-table hr-daily-table">
                        <thead>
                          <tr>
                            <th>Employee</th><th>Role</th><th>Check-in</th><th>Check-out</th><th>Out of fence</th><th>Hours</th><th>Status</th><th>Delinquencies</th>
                          </tr>
                        </thead>
                        <tbody>{g.rows.map((r) => <RowLine key={`${r.employeeId}-${r.projectCode ?? ''}`} row={r} onOpen={setOpenRow} />)}</tbody>
                      </table>
                    </div>
                  )}
                </section>
              );
            })
          )}
        </>
      )}

      {openRow && <DailyDetailDialog row={openRow} onClose={() => setOpenRow(null)} />}
      {reportOpen && <ReportDialog date={date} projects={projects} onClose={() => setReportOpen(false)} />}
    </section>
  );
}
