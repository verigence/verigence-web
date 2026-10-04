import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import PageHeader from '../../components/PageHeader';
import SectionCard from '../../components/SectionCard';
import {
  ATTENDANCE_PERMISSION,
  getEmployeeAttendance,
  getTeamAttendance,
  type TeamAttendanceEmployee,
} from '../../services/hr/attendance';
import { hrErrorMessage } from '../../services/hr/client';
import { useSessionStore } from '../../store/sessionStore';
import MonthPanel from '../../features/hr/attendance/MonthPanel';
import MonthSwitcher from '../../features/hr/attendance/MonthSwitcher';
import { attendanceKeys } from '../../features/hr/attendance/attendanceQueries';
import { currentMonthIst, formatMonth, formatWorkDate } from '../../features/hr/attendance/attendanceFormat';
import { useHrAccess } from '../../features/hr/hrQueries';
import '../../styles/hr-attendance.css';

/** HR / Finance / CEO: every active employee's month, then one person's days with their photos. */
export default function HrTeamAttendancePage() {
  const accessToken = useSessionStore((state) => state.accessToken);
  const access = useHrAccess();
  const allowed = access.can(ATTENDANCE_PERMISSION.readAll);
  const [month, setMonth] = useState(currentMonthIst);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<TeamAttendanceEmployee | null>(null);

  const team = useQuery({
    queryKey: attendanceKeys.team(month),
    queryFn: () => getTeamAttendance(accessToken!, month),
    enabled: Boolean(accessToken) && allowed,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const person = useQuery({
    queryKey: attendanceKeys.employee(selected?.employeeId ?? '', month),
    queryFn: () => getEmployeeAttendance(accessToken!, selected!.employeeId, month),
    enabled: Boolean(accessToken) && allowed && Boolean(selected),
    retry: false,
    refetchOnWindowFocus: false,
  });

  const people = team.data?.employees;
  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!people) return [];
    return needle
      ? people.filter((p) => p.fullName.toLowerCase().includes(needle) || p.employeeCode.toLowerCase().includes(needle))
      : people;
  }, [people, search]);
  const current = selected ? people?.find((p) => p.employeeId === selected.employeeId) : undefined;
  const pendingTotal = (people ?? []).reduce((sum, p) => sum + p.pendingExceptions, 0);

  if (access.loading) return <div className="uc01-admin-state">Loading…</div>;
  if (!allowed) {
    return (
      <section className="uc01-admin-page" aria-label="Team attendance">
        <PageHeader eyebrow="HR" title="Team attendance" />
        <div className="uc01-admin-state uc01-admin-state--error">
          <strong>You do not have access to everyone&apos;s attendance.</strong>
          <span>Ask an administrator to give you an HR role.</span>
        </div>
      </section>
    );
  }

  // ---- one person's month ---------------------------------------------------------------------
  if (selected) {
    return (
      <section className="uc01-admin-page hr-page hr-att-page" aria-label={`Attendance of ${selected.fullName}`}>
        <PageHeader
          eyebrow="HR"
          title={selected.fullName}
          description={`${selected.employeeCode} · attendance in IST. Photos open only when you tap them, and each view is recorded.`}
          actions={<button type="button" className="uc01-admin-button" onClick={() => setSelected(null)}>Back to everyone</button>}
        />
        <SectionCard
          title={formatMonth(month)}
          description={current
            ? `${current.daysPresent} present, ${current.daysOnLeave} on leave, ${current.daysAbsent} absent${current.offDayWorked ? `, ${current.offDayWorked} on a day off` : ''}${current.pendingExceptions ? `, ${current.pendingExceptions} waiting for a decision` : ''}.`
            : undefined}
          action={<MonthSwitcher month={month} onChange={setMonth} />}
        >
          <MonthPanel month={month} query={person} viewer="other" />
        </SectionCard>
      </section>
    );
  }

  // ---- everyone ---------------------------------------------------------------------------------
  return (
    <section className="uc01-admin-page hr-page hr-att-page" aria-label="Team attendance">
      <PageHeader
        eyebrow="HR"
        title="Team attendance"
        description="The month at a glance: working days, holidays, and each person's present, leave and absent days. Tap a person for their days and photos."
      />

      <div className="hr-att-toolbar">
        <MonthSwitcher month={month} onChange={setMonth} />
        <label className="uc01-admin-search hr-att-toolbar__search">
          <span>Search employees</span>
          <input type="search" value={search} placeholder="Name or code" onChange={(e) => setSearch(e.target.value)} />
        </label>
        <button type="button" className="uc01-admin-button" onClick={() => team.refetch()} disabled={team.isFetching}>
          {team.isFetching ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {team.isLoading && <div className="uc01-admin-state">Loading attendance…</div>}
      {team.isError && (
        <div className="uc01-admin-state uc01-admin-state--error" role="alert">
          <strong>Attendance could not be loaded.</strong>
          <span>{hrErrorMessage(team.error)}</span>
          <button type="button" className="uc01-admin-button" onClick={() => team.refetch()}>Try again</button>
        </div>
      )}

      {team.data && (
        <>
          <div className="hr-daily__tiles">
            <div><span>Working days</span><strong>{team.data.summary.workingDays}</strong><small>{team.data.summary.workingDaysSoFar} so far</small></div>
            <div><span>Sundays</span><strong>{team.data.summary.sundays}</strong></div>
            <div>
              <span>Holidays</span>
              <strong>{team.data.summary.holidays.length}</strong>
              {team.data.summary.holidays.length > 0 && (
                <small>{team.data.summary.holidays.map((h) => `${formatWorkDate(h.date)} ${h.name}`).join(' · ')}</small>
              )}
            </div>
            <div className={pendingTotal > 0 ? 'is-attention' : undefined}><span>Waiting for a decision</span><strong>{pendingTotal}</strong></div>
          </div>
          <p className="hr-count" aria-live="polite">{shown.length === 1 ? '1 employee' : `${shown.length} employees`}</p>
          {shown.length === 0 ? (
            <div className="uc01-admin-state">{search ? 'No employees match this search.' : 'No active employees.'}</div>
          ) : (
            <div className="uc01-admin-table-wrap">
              <table className="uc01-admin-table hr-table hr-daily-table">
                <thead>
                  <tr><th>Employee</th><th>Present</th><th>On leave</th><th>Absent</th><th>Off-day work</th><th>Pending</th></tr>
                </thead>
                <tbody>
                  {shown.map((p) => (
                    <tr key={p.employeeId} className={p.pendingExceptions > 0 ? 'hr-daily-row--attention' : undefined}>
                      <td data-label="Employee">
                        <button type="button" className="hr-daily-open" onClick={() => setSelected(p)} aria-label={`Open ${p.fullName}, ${p.employeeCode}`}>
                          <span className="hr-daily-cell"><strong>{p.fullName}</strong><small>{p.employeeCode}</small></span>
                        </button>
                      </td>
                      <td data-label="Present">{p.daysPresent}</td>
                      <td data-label="On leave">{p.daysOnLeave}</td>
                      <td data-label="Absent">{p.daysAbsent > 0 ? <strong className="hr-att-absent">{p.daysAbsent}</strong> : 0}</td>
                      <td data-label="Off-day work">{p.offDayWorked}</td>
                      <td data-label="Pending">
                        {p.pendingExceptions > 0 ? <span className="uc01-admin-status uc01-admin-status--pending">{p.pendingExceptions}</span> : 0}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
