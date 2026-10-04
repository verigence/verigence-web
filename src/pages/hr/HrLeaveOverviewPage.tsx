import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import PageHeader from '../../components/PageHeader';
import { LEAVE_PERMISSION, getLeaveOverview, type LeaveBalanceType, type LeaveOverviewItem } from '../../services/hr/leave';
import { useSessionStore } from '../../store/sessionStore';
import { useHrAccess } from '../../features/hr/hrQueries';
import EmployeeLeavePanel from '../../features/hr/leave/EmployeeLeavePanel';
import { dayCount, istToday, leaveErrorMessage } from '../../features/hr/leave/leaveLogic';
import { leaveKeys, yearChoices } from '../../features/hr/leave/leaveQueries';
import '../../styles/hr-leave.css';

function BalanceCell({ type }: { type: LeaveBalanceType | undefined }) {
  if (!type) return <span className="hr-muted">—</span>;
  return (
    <>
      <strong>{dayCount(type.available)} available</strong>
      <small>Granted {dayCount(type.granted)} · Used {dayCount(type.used)} · Pending {dayCount(type.pending)}</small>
    </>
  );
}

export default function HrLeaveOverviewPage() {
  const accessToken = useSessionStore((state) => state.accessToken);
  const access = useHrAccess();
  const currentYear = Number(istToday().slice(0, 4));
  const [year, setYear] = useState(currentYear);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<LeaveOverviewItem | null>(null);
  const allowed = access.can(LEAVE_PERMISSION.review);

  const overview = useQuery({
    queryKey: leaveKeys.overview(year),
    queryFn: () => getLeaveOverview(accessToken!, year),
    enabled: Boolean(accessToken) && allowed,
    retry: false,
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });

  const items = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const all = overview.data?.items ?? [];
    if (!needle) return all;
    return all.filter((i) => i.fullName.toLowerCase().includes(needle) || i.employeeCode.toLowerCase().includes(needle));
  }, [overview.data, search]);

  if (access.loading) return <div className="uc01-admin-state">Loading…</div>;
  if (!allowed) {
    return (
      <section className="uc01-admin-page" aria-label="Leave overview">
        <PageHeader eyebrow="HR" title="Leave overview" />
        <div className="uc01-admin-state uc01-admin-state--error">
          <strong>You do not have access to everyone&apos;s leave.</strong>
          <span>Ask an administrator to give you an HR role.</span>
        </div>
      </section>
    );
  }

  if (selected) {
    return (
      <section className="uc01-admin-page hr-page hr-leave-page" aria-label="Employee leave">
        <PageHeader eyebrow="HR · Leave" title="Employee leave" description="Balances and requests for one person. Reverse an approved leave or adjust a balance here." />
        <EmployeeLeavePanel
          employeeId={selected.employeeId}
          employeeName={selected.fullName}
          employeeCode={selected.employeeCode}
          year={year}
          currentYear={currentYear}
          onYearChange={setYear}
          onBack={() => setSelected(null)}
        />
      </section>
    );
  }

  const total = overview.data?.items.length ?? 0;

  return (
    <section className="uc01-admin-page hr-page hr-leave-page" aria-label="Leave overview">
      <PageHeader
        eyebrow="HR"
        title="Leave overview"
        description="Sick and Earned leave balances of every active employee. Tap a person to see their requests."
      />

      <div className="uc01-admin-toolbar hr-leave-toolbar">
        <label className="uc01-admin-search">
          <span>Search employees</span>
          <input type="search" value={search} placeholder="Name or code" onChange={(e) => setSearch(e.target.value)} />
        </label>
        <label className="uc01-admin-filter">
          <span>Year</span>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {yearChoices(currentYear).map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        <button type="button" className="uc01-admin-button" onClick={() => overview.refetch()} disabled={overview.isFetching}>
          {overview.isFetching ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {overview.isLoading && <div className="uc01-admin-state">Loading balances…</div>}
      {overview.isError && (
        <div className="uc01-admin-state uc01-admin-state--error" role="alert">
          <strong>Balances could not be loaded.</strong>
          <span>{leaveErrorMessage(overview.error)}</span>
          <button type="button" className="uc01-admin-button" onClick={() => overview.refetch()}>Try again</button>
        </div>
      )}

      {!overview.isLoading && !overview.isError && (
        <>
          <p className="hr-count" aria-live="polite">
            {search.trim() ? `${items.length} of ${total} employees` : total === 1 ? '1 employee' : `${total} employees`} · {overview.data?.year ?? year}
          </p>
          <div className="uc01-admin-table-wrap">
            <table className="uc01-admin-table hr-table hr-leave-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Sick leave</th>
                  <th>Earned leave</th>
                  <th><span className="hr-visually-hidden">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {items.map((e) => (
                  <tr key={e.employeeId}>
                    <td data-label="Employee">
                      <strong>{e.fullName}</strong>
                      <small>{e.employeeCode}</small>
                    </td>
                    <td data-label="Sick leave"><BalanceCell type={e.types.find((t) => t.leaveType === 'SICK')} /></td>
                    <td data-label="Earned leave"><BalanceCell type={e.types.find((t) => t.leaveType === 'EARNED')} /></td>
                    <td>
                      <div className="uc01-admin-row-actions">
                        <button type="button" className="uc01-admin-button hr-leave-view" aria-label={`View leave of ${e.fullName}`} onClick={() => setSelected(e)}>
                          View leave
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr><td colSpan={4} className="uc01-admin-empty">
                    {search.trim() ? 'No employees match this search.' : 'There are no active employees yet.'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
