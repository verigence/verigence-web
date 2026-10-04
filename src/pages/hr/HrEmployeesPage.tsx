import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import PageHeader from '../../components/PageHeader';
import { hrErrorMessage } from '../../services/hr/client';
import { listEmployees, type EmploymentStatus } from '../../services/hr/employees';
import { useSessionStore } from '../../store/sessionStore';
import { initialsOf } from '../../features/hr/EmployeeAvatar';
import { dataFlagLabels, loginLabels, statusLabels } from '../../features/hr/hrLabels';
import { hrKeys, useHrAccess } from '../../features/hr/hrQueries';

const PAGE_SIZE = 25;

export default function HrEmployeesPage() {
  const accessToken = useSessionStore((state) => state.accessToken);
  const access = useHrAccess();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'' | EmploymentStatus>('');
  const [page, setPage] = useState(0);

  // One request after the person stops typing, not one per keystroke.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(search);
      setPage(0);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  const list = useQuery({
    queryKey: [...hrKeys.employees, { query, status, page }],
    queryFn: () => listEmployees(accessToken!, { q: query, status: status || undefined, limit: PAGE_SIZE, offset: page * PAGE_SIZE }),
    enabled: Boolean(accessToken) && access.canReadEmployees,
    retry: false,
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });

  if (access.loading) return <div className="uc01-admin-state">Loading…</div>;
  if (!access.canReadEmployees) {
    return (
      <section className="uc01-admin-page" aria-label="Employees">
        <PageHeader eyebrow="HR" title="Employees" />
        <div className="uc01-admin-state uc01-admin-state--error">
          <strong>You do not have access to employee records.</strong>
          <span>Ask an administrator to give you an HR role.</span>
        </div>
      </section>
    );
  }

  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section className="uc01-admin-page hr-page" aria-label="Employees">
      <PageHeader
        eyebrow="HR"
        title="Employees"
        description="Employee records for the company. PAN and Aadhaar stay masked here."
        actions={access.canManageEmployees ? (
          <>
            <Link className="uc01-admin-button" to="/hr/employees/import">Import from Excel</Link>
            <Link className="uc01-admin-button uc01-admin-button--primary" to="/hr/employees/new">Add employee</Link>
          </>
        ) : undefined}
      />

      <div className="uc01-admin-toolbar">
        <label className="uc01-admin-search">
          <span>Search employees</span>
          <input type="search" value={search} placeholder="Name, code or email" onChange={(e) => setSearch(e.target.value)} />
        </label>
        <label className="uc01-admin-filter">
          <span>Status</span>
          <select value={status} onChange={(e) => { setStatus(e.target.value as '' | EmploymentStatus); setPage(0); }}>
            <option value="">All</option>
            {(Object.keys(statusLabels) as EmploymentStatus[]).map((s) => <option key={s} value={s}>{statusLabels[s]}</option>)}
          </select>
        </label>
        <button type="button" className="uc01-admin-button" onClick={() => list.refetch()} disabled={list.isFetching}>
          {list.isFetching ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {list.isLoading && <div className="uc01-admin-state">Loading employees…</div>}
      {list.isError && (
        <div className="uc01-admin-state uc01-admin-state--error" role="alert">
          <strong>Employees could not be loaded.</strong>
          <span>{hrErrorMessage(list.error)}</span>
          <button type="button" className="uc01-admin-button" onClick={() => list.refetch()}>Try again</button>
        </div>
      )}

      {!list.isLoading && !list.isError && (
        <>
          <p className="hr-count" aria-live="polite">{total === 1 ? '1 employee' : `${total} employees`}</p>
          <div className="uc01-admin-table-wrap">
            <table className="uc01-admin-table hr-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Department</th>
                  <th>Designation</th>
                  <th>Contact</th>
                  <th>Status</th>
                  <th>Login</th>
                  <th>Needs attention</th>
                </tr>
              </thead>
              <tbody>
                {items.map((e) => (
                  <tr key={e.employeeId}>
                    <td data-label="Employee">
                      <Link className="hr-employee-link" to={`/hr/employees/${e.employeeId}`}>
                        <span className="hr-avatar hr-avatar--sm" aria-hidden="true"><span>{initialsOf(e.fullName)}</span></span>
                        <span>
                          <strong>{e.fullName}</strong>
                          <small>{e.employeeCode}</small>
                        </span>
                      </Link>
                    </td>
                    <td data-label="Department"><span>{e.department ?? '—'}</span></td>
                    <td data-label="Designation"><span>{e.designation ?? 'Not set'}</span></td>
                    <td data-label="Contact">
                      <strong>{e.mobile ?? 'No mobile'}</strong>
                      <small>{e.personalEmail}</small>
                    </td>
                    <td data-label="Status">
                      <span className={`uc01-admin-status uc01-admin-status--${e.employmentStatus === 'ACTIVE' ? 'active' : 'rejected'}`}>{statusLabels[e.employmentStatus]}</span>
                    </td>
                    <td data-label="Login">
                      <span className={`uc01-admin-status uc01-admin-status--${e.loginStatus === 'CREATED' ? 'active' : e.loginStatus === 'FAILED' ? 'pending' : 'rejected'}`}>{loginLabels[e.loginStatus]}</span>
                    </td>
                    <td data-label="Needs attention">
                      {e.dataFlags.length === 0 ? <span className="hr-muted">—</span> : (
                        <span className="hr-flags">
                          {e.dataFlags.map((f) => <span key={f} className="hr-flag">{dataFlagLabels[f]}</span>)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr><td colSpan={7} className="uc01-admin-empty">
                    {query || status ? 'No employees match this search.' : 'No employees yet.'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <nav className="hr-pager" aria-label="Employee pages">
              <button type="button" className="uc01-admin-button uc01-admin-button--compact" disabled={page === 0 || list.isFetching} onClick={() => setPage((p) => p - 1)}>Previous</button>
              <span>Page {page + 1} of {pages}</span>
              <button type="button" className="uc01-admin-button uc01-admin-button--compact" disabled={page + 1 >= pages || list.isFetching} onClick={() => setPage((p) => p + 1)}>Next</button>
            </nav>
          )}
        </>
      )}
    </section>
  );
}
