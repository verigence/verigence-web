import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { attendanceKeys } from '../../hr/attendance/attendanceQueries';
import { formatTimeIst, todayIst } from '../../hr/attendance/attendanceFormat';
import { namesWithMore, summarizeArrivals, TODAY_REFRESH_MS } from '../../hr/attendance/teamArrival';
import { getTeamDaily, type TeamDaily } from '../../../services/hr/attendanceCalendar';
import { HrHttpError } from '../../../services/hr/client';
import { isNightModeError, NIGHT_MODE_MESSAGE } from '../../../services/nightMode';
import '../../../styles/uc03-tl-team-today.css';

/**
 * "Team today" on the supervisory dashboard of a Team Lead, Project Manager and Executive (product
 * owner, 9 Nov 2026): who of the team has reached the outlet, so nobody has to ask. Read from myHR's
 * team-daily attendance, the same request (and cache) as My HR > Attendance Overview's "All my
 * projects", narrowed here to the dashboard's Project. DealGuard and myHR share the Project code
 * (myHR's work assignments are synced from Audit Core's projects), so the narrowing is exact.
 *
 * It is information only: when myHR cannot be reached, or the person leads no team there, the card says
 * so in one quiet line and the rest of the dashboard is untouched.
 */

export const ATTENDANCE_OVERVIEW_PATH = '/hr/attendance/overview';

export function attendanceOverviewLink(projectCode: string | undefined): string {
  return projectCode ? `${ATTENDANCE_OVERVIEW_PATH}?project=${encodeURIComponent(projectCode)}` : ATTENDANCE_OVERVIEW_PATH;
}

/** One quiet sentence for a failed read. */
export function teamTodayProblem(error: unknown): string {
  if (isNightModeError(error)) return NIGHT_MODE_MESSAGE;
  if (error instanceof HrHttpError && error.status === 403) return 'You do not lead a team in myHR, so there is no team attendance to show.';
  if (error instanceof HrHttpError && error.status === 401) return 'Sign in again to see today’s team attendance.';
  return 'Today’s team attendance could not be loaded from myHR just now. It will try again in a few minutes.';
}

interface ViewProps {
  data: TeamDaily | undefined;
  error: unknown;
  loading: boolean;
  projectCode: string | undefined;
}

export function TeamTodayView({ data, error, loading, projectCode }: ViewProps) {
  const rows = useMemo(
    () => (data?.rows ?? []).filter((r) => !projectCode || r.projectCode === projectCode),
    [data, projectCode],
  );
  const summary = useMemo(() => summarizeArrivals(rows), [rows]);
  const link = attendanceOverviewLink(rows.length ? projectCode : undefined);

  let body;
  const quiet = !data || !rows.length;
  if (loading && !data) {
    body = <p className="uc03-tl-team__quiet">Loading today’s attendance…</p>;
  } else if (!data) {
    body = <p className="uc03-tl-team__quiet">{teamTodayProblem(error)}</p>;
  } else if (!rows.length) {
    body = (
      <p className="uc03-tl-team__quiet">
        {data.dayKind !== 'WORKING' ? 'A day off: no one on your team is expected today.' : 'No one on this Project’s team in myHR today.'}
      </p>
    );
  } else {
    const n = summary.outletStaffExpected > 0 ? summary.outletStaffReached : summary.reached;
    const notYet = summary.notYet;
    body = (
      <>
        <div className="uc03-tl-team__stats">
          <div className="uc03-tl-team__headline">
            <strong>
              {n}
              {summary.outletStaffExpected > 0 && <span> of {summary.outletStaffExpected}</span>}
            </strong>
            <span>reached the outlet</span>
          </div>
          <dl className="uc03-tl-team__facts">
            <div><dt>First arrival</dt><dd>{summary.firstArrival ? formatTimeIst(summary.firstArrival) : '—'}</dd></div>
            <div><dt>Latest arrival</dt><dd>{summary.lastArrival ? formatTimeIst(summary.lastArrival) : '—'}</dd></div>
            <div className={summary.away ? 'is-attention' : undefined}><dt>Away from the outlet</dt><dd>{summary.away}</dd></div>
            <div><dt>On leave</dt><dd>{summary.onLeave}</dd></div>
          </dl>
        </div>
        <p className={`uc03-tl-team__missing${notYet.length ? ' is-attention' : ''}`}>
          {notYet.length
            ? <><strong>Not checked in yet ({notYet.length}):</strong> {namesWithMore(notYet, 5)}</>
            : 'Everyone expected today has checked in.'}
        </p>
      </>
    );
  }

  return (
    <section className={`uc03-tl-team${quiet ? ' uc03-tl-team--quiet' : ''}`} aria-label="Team today">
      <header className="uc03-tl-team__head">
        <div>
          <span className="uc03-tl-team__eyebrow">Today · myHR attendance</span>
          <h2>Team today</h2>
        </div>
        <Link className="uc03-tl-team__cta" to={link}>Open Attendance Overview →</Link>
      </header>
      {body}
    </section>
  );
}

export default function TeamTodayCard({ accessToken, projectCode }: { accessToken: string | null | undefined; projectCode: string | undefined }) {
  const today = todayIst();
  // The same key as Attendance Overview's "All my projects" for today, so the two share one read.
  const query = useQuery({
    queryKey: attendanceKeys.teamDaily(today, ''),
    queryFn: () => getTeamDaily(accessToken!, today),
    enabled: Boolean(accessToken),
    retry: false,
    refetchOnWindowFocus: false,
    refetchInterval: TODAY_REFRESH_MS,
    staleTime: 60_000,
  });
  return <TeamTodayView data={query.data} error={query.error} loading={query.isPending} projectCode={projectCode} />;
}
