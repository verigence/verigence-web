import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import PageHeader from '../../components/PageHeader';
import { listRuns, PAYROLL_PERMISSION, payrollKeys } from '../../services/hr/payroll';
import { useSessionStore } from '../../store/sessionStore';
import { formatDateTime } from '../../features/hr/hrLabels';
import { useHrAccess } from '../../features/hr/hrQueries';
import { formatPayMonth, formatRupees } from '../../features/hr/payroll/money';
import { EmptyState, ErrorState, LoadingState, NoAccess } from '../../features/hr/payroll/PayrollStates';
import { RunStatusPill } from '../../features/hr/payroll/RunStatus';
import StartRunForm from '../../features/hr/payroll/StartRunForm';
import StatutoryBanner from '../../features/hr/payroll/StatutoryBanner';
import '../../styles/hr-payroll.css';

export default function HrPayrollPage() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const access = useHrAccess();
  const canRead = access.can(PAYROLL_PERMISSION.payrollRead);
  const canPrepare = access.can(PAYROLL_PERMISSION.payrollPrepare);

  const runs = useQuery({
    queryKey: payrollKeys.runs,
    queryFn: () => listRuns(accessToken!),
    enabled: Boolean(accessToken) && canRead,
    retry: false,
    refetchOnWindowFocus: false,
  });

  if (access.loading) return <LoadingState />;
  if (!canRead) return <NoAccess title="Payroll" message="You do not have access to payroll." />;

  const items = runs.data?.items ?? [];

  return (
    <section className="uc01-admin-page hr-page hr-pay-page" aria-label="Payroll">
      <PageHeader
        eyebrow="HR"
        title="Payroll"
        description="One run a month. HR prepares it, the CEO approves it, then it is marked paid."
        actions={(
          <>
            <Link className="uc01-admin-button hr-pay-button" to="/hr/payroll/salaries">Salaries</Link>
            <Link className="uc01-admin-button hr-pay-button" to="/hr/payroll/settings">Templates and settings</Link>
          </>
        )}
      />

      <StatutoryBanner enabled={canRead} />
      {canPrepare && <StartRunForm />}

      <div className="hr-pay-listhead">
        <h2>Runs</h2>
        <button type="button" className="uc01-admin-button hr-pay-button" onClick={() => runs.refetch()} disabled={runs.isFetching}>{runs.isFetching ? 'Refreshing…' : 'Refresh'}</button>
      </div>
      {runs.isLoading && <LoadingState>Loading payroll runs…</LoadingState>}
      {runs.isError && <ErrorState title="The payroll runs could not be loaded." error={runs.error} onRetry={() => runs.refetch()} busy={runs.isFetching} />}
      {runs.isSuccess && items.length === 0 && <EmptyState>{`No payroll runs yet. ${canPrepare ? 'Start the first one above.' : 'HR starts a run each month.'}`}</EmptyState>}

      {items.length > 0 && (
        <div className="uc01-admin-table-wrap">
          <table className="uc01-admin-table hr-pay-table">
            <thead>
              <tr>
                <th>Month</th>
                <th>Status</th>
                <th className="hr-pay-num">People</th>
                <th className="hr-pay-num">Net pay</th>
                <th className="hr-pay-num">Payable</th>
                <th>Statutory settings</th>
                <th>Started</th>
              </tr>
            </thead>
            <tbody>
              {items.map((run) => (
                <tr key={run.runId}>
                  <td data-label="Month"><Link className="hr-pay-runlink" to={`/hr/payroll/runs/${run.runId}`}>{formatPayMonth(run.payMonth)}</Link></td>
                  <td data-label="Status"><RunStatusPill status={run.status} /></td>
                  <td data-label="People" className="hr-pay-num">{run.totals.people}</td>
                  <td data-label="Net pay" className="hr-pay-num">{formatRupees(run.totals.netPay)}</td>
                  <td data-label="Payable" className="hr-pay-num"><strong>{formatRupees(run.totals.payable)}</strong></td>
                  <td data-label="Statutory settings">
                    <span className={`hr-pay-pill hr-pay-pill--${run.statutoryConfirmed ? 'approved' : 'pending'}`}>{run.statutoryConfirmed ? 'Confirmed' : 'Not confirmed'}</span>
                  </td>
                  <td data-label="Started"><span>{formatDateTime(run.createdAt)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
