import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import PageHeader from '../../components/PageHeader';
import SectionCard from '../../components/SectionCard';
import { ATTENDANCE_PERMISSION, getAttendanceToday, getMyAttendance, type AttendanceEvent } from '../../services/hr/attendance';
import { hrErrorMessage } from '../../services/hr/client';
import { useSessionStore } from '../../store/sessionStore';
import CaptureDialog from '../../features/hr/attendance/CaptureDialog';
import MonthPanel from '../../features/hr/attendance/MonthPanel';
import MonthSwitcher from '../../features/hr/attendance/MonthSwitcher';
import TodayCard from '../../features/hr/attendance/TodayCard';
import { attendanceKeys } from '../../features/hr/attendance/attendanceQueries';
import { currentMonthIst } from '../../features/hr/attendance/attendanceFormat';
import { useHrAccess } from '../../features/hr/hrQueries';
import '../../styles/hr-attendance.css';

/** The signed-in employee's own attendance: today, live check-in / check-out, and the month so far. */
export default function HrAttendancePage() {
  const accessToken = useSessionStore((state) => state.accessToken);
  const access = useHrAccess();
  const [month, setMonth] = useState(currentMonthIst);
  const [capturing, setCapturing] = useState<AttendanceEvent | null>(null);

  const today = useQuery({
    queryKey: attendanceKeys.today,
    queryFn: () => getAttendanceToday(accessToken!),
    enabled: Boolean(accessToken) && access.isEmployee,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const history = useQuery({
    queryKey: attendanceKeys.mine(month),
    queryFn: () => getMyAttendance(accessToken!, month),
    enabled: Boolean(accessToken) && access.isEmployee,
    retry: false,
    refetchOnWindowFocus: false,
  });

  if (access.loading) return <div className="uc01-admin-state">Loading…</div>;
  if (!access.isEmployee) {
    return (
      <section className="uc01-admin-page" aria-label="Attendance">
        <PageHeader eyebrow="HR" title="Attendance" />
        <div className="uc01-admin-state">
          <strong>No employee record is linked to your login.</strong>
          <span>If you should have one, ask HR to check that your sign-in email matches your employee record.</span>
        </div>
      </section>
    );
  }

  const data = today.data;
  // The server's clock decides "late"; keep the gap to this device so the warning matches it.
  const clockSkewMs = data ? Date.parse(data.serverTime) - today.dataUpdatedAt : 0;

  return (
    <section className="uc01-admin-page hr-page hr-att-page" aria-label="Attendance">
      <PageHeader
        eyebrow="HR"
        title="Attendance"
        description="Check in and out with a live photo and your location. Times are in IST."
        actions={access.can(ATTENDANCE_PERMISSION.readAll) ? (
          <Link className="uc01-admin-button" to="/hr/attendance/team">Everyone&apos;s attendance</Link>
        ) : undefined}
      />

      <SectionCard
        title="Today"
        action={(
          <button type="button" className="uc01-admin-button" onClick={() => today.refetch()} disabled={today.isFetching || capturing !== null}>
            {today.isFetching ? 'Refreshing…' : 'Refresh'}
          </button>
        )}
      >
        {today.isLoading && <div className="uc01-admin-state">Loading today&apos;s attendance…</div>}
        {today.isError && (
          <div className="uc01-admin-state uc01-admin-state--error" role="alert">
            <strong>Today&apos;s attendance could not be loaded.</strong>
            <span>{hrErrorMessage(today.error)}</span>
            <button type="button" className="uc01-admin-button" onClick={() => today.refetch()}>Try again</button>
          </div>
        )}
        {data && <TodayCard today={data} onStart={setCapturing} disabled={capturing !== null || today.isFetching} />}
      </SectionCard>

      <SectionCard
        title="My history"
        description="Days you have checked in, newest first. Tap a photo to see it full size."
        action={<MonthSwitcher month={month} onChange={setMonth} />}
      >
        <MonthPanel month={month} query={history} viewer="self" />
      </SectionCard>

      {capturing && data && (
        <CaptureDialog event={capturing} today={data} clockSkewMs={clockSkewMs} onClose={() => setCapturing(null)} />
      )}
    </section>
  );
}
