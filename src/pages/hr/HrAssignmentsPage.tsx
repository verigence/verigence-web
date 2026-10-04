import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import PageHeader from '../../components/PageHeader';
import { hrErrorMessage } from '../../services/hr/client';
import { HR_PERMISSION } from '../../services/hr/employees';
import { getWorkAssignments } from '../../services/hr/workAssignments';
import { useSessionStore } from '../../store/sessionStore';
import AssignmentLines from '../../features/hr/AssignmentLines';
import { assignmentFreshness, filterAssigned, NO_PROJECT_FILTER } from '../../features/hr/assignmentFilters';
import { dailyKeys } from '../../features/hr/attendance/dailyAttendance';
import { formatDateTime } from '../../features/hr/hrLabels';
import { useHrAccess } from '../../features/hr/hrQueries';
import '../../styles/hr-attendance.css';

/** A read-only copy of who is on which project, as held in Audit Core. */
export default function HrAssignmentsPage() {
  const accessToken = useSessionStore((state) => state.accessToken);
  const access = useHrAccess();
  const allowed = access.can(HR_PERMISSION.employeeRead);
  const [project, setProject] = useState('');
  const [search, setSearch] = useState('');

  const query = useQuery({
    queryKey: dailyKeys.assignments(''),
    queryFn: () => getWorkAssignments(accessToken!),
    enabled: Boolean(accessToken) && allowed,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const data = query.data;
  const shown = useMemo(() => filterAssigned(data?.employees ?? [], project, search), [data, project, search]);

  if (access.loading) return <div className="uc01-admin-state">Loading…</div>;
  if (!allowed) {
    return (
      <section className="uc01-admin-page" aria-label="Project assignments">
        <PageHeader eyebrow="HR" title="Project assignments" />
        <div className="uc01-admin-state uc01-admin-state--error">
          <strong>You do not have access to employee records.</strong>
          <span>Ask an administrator to give you an HR role.</span>
        </div>
      </section>
    );
  }

  const freshness = data ? assignmentFreshness(data.syncedAt, data.syncStatus) : null;

  return (
    <section className="uc01-admin-page hr-page hr-att-page" aria-label="Project assignments">
      <PageHeader eyebrow="HR" title="Project assignments" description="Who is on which project. Changes are made in Audit Core and arrive in HR daily." />

      {data && (
        <p className="hr-count">{data.syncedAt ? `Updated from Audit Core at ${formatDateTime(data.syncedAt)}` : 'Not yet updated from Audit Core'}</p>
      )}
      {freshness?.warn && <div className="uc01-admin-message uc01-admin-message--error" role="alert">{freshness.text}</div>}

      <div className="hr-daily__toolbar hr-daily__toolbar--two">
        <label className="uc01-admin-search">
          <span>Search employees</span>
          <input type="search" value={search} placeholder="Name or code" onChange={(e) => setSearch(e.target.value)} />
        </label>
        <label className="uc01-admin-filter">
          <span>Project</span>
          <select value={project} onChange={(e) => setProject(e.target.value)}>
            <option value="">All projects</option>
            <option value={NO_PROJECT_FILTER}>No project</option>
            {(data?.projects ?? []).map((p) => <option key={p.projectCode} value={p.projectCode}>{p.projectName}</option>)}
          </select>
        </label>
      </div>

      {query.isLoading && <div className="uc01-admin-state">Loading assignments…</div>}
      {query.isError && (
        <div className="uc01-admin-state uc01-admin-state--error" role="alert">
          <strong>Project assignments could not be loaded.</strong>
          <span>{hrErrorMessage(query.error)}</span>
          <button type="button" className="uc01-admin-button" onClick={() => query.refetch()}>Try again</button>
        </div>
      )}

      {data && (
        <>
          <p className="hr-count" aria-live="polite">{shown.length === 1 ? '1 employee' : `${shown.length} employees`}</p>
          {shown.length === 0 ? (
            <div className="uc01-admin-state">{search || project ? 'No employees match these filters.' : 'No employees to show.'}</div>
          ) : (
            <div className="uc01-admin-table-wrap">
              <table className="uc01-admin-table hr-table hr-assign-table">
                <thead><tr><th>Employee</th><th>Projects</th></tr></thead>
                <tbody>
                  {shown.map((e) => (
                    <tr key={e.employeeId}>
                      <td data-label="Employee">
                        <span className="hr-daily-cell">
                          <strong>{e.fullName}</strong>
                          <small>{e.employeeCode}{e.hasLogin ? '' : ' · No login yet'}</small>
                        </span>
                      </td>
                      <td data-label="Projects"><AssignmentLines assignments={e.assignments} /></td>
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
