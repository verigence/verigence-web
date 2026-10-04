import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';

import PageHeader from '../../components/PageHeader';
import SectionCard from '../../components/SectionCard';
import { HrHttpError } from '../../services/hr/client';
import { getRun, PAYROLL_PERMISSION, payrollKeys, type RunLine } from '../../services/hr/payroll';
import { useSessionStore } from '../../store/sessionStore';
import { useHrAccess } from '../../features/hr/hrQueries';
import LineDialog from '../../features/hr/payroll/LineDialog';
import { formatPayMonth, formatRupees } from '../../features/hr/payroll/money';
import { STATUTORY_UNCONFIRMED_TEXT } from '../../features/hr/payroll/payrollErrors';
import { EmptyState, ErrorState, LoadingState, NoAccess } from '../../features/hr/payroll/PayrollStates';
import RunActions from '../../features/hr/payroll/RunActions';
import RunLinesTable from '../../features/hr/payroll/RunLinesTable';
import RunPayslips from '../../features/hr/payroll/RunPayslips';
import { RunStepper } from '../../features/hr/payroll/RunStatus';
import '../../styles/hr-payroll.css';

export default function HrPayrollRunPage() {
  const { runId = '' } = useParams();
  const accessToken = useSessionStore((s) => s.accessToken);
  const access = useHrAccess();
  const canRead = access.can(PAYROLL_PERMISSION.payrollRead);
  const canPrepare = access.can(PAYROLL_PERMISSION.payrollPrepare);
  const canApprove = access.can(PAYROLL_PERMISSION.payrollApprove);
  const [notice, setNotice] = useState('');
  const [openLine, setOpenLine] = useState<RunLine | null>(null);

  const query = useQuery({
    queryKey: payrollKeys.run(runId),
    queryFn: () => getRun(accessToken!, runId),
    enabled: Boolean(accessToken) && canRead && Boolean(runId),
    retry: false,
    refetchOnWindowFocus: false,
  });

  if (access.loading) return <LoadingState />;
  if (!canRead) return <NoAccess title="Payroll run" message="You do not have access to payroll." />;

  const back = <Link className="uc01-admin-button hr-pay-button" to="/hr/payroll">All runs</Link>;
  if (query.isLoading) return <LoadingState>Loading the payroll run…</LoadingState>;
  if (query.isError || !query.data) {
    const missing = query.error instanceof HrHttpError && query.error.status === 404;
    return (
      <section className="uc01-admin-page" aria-label="Payroll run">
        <PageHeader eyebrow="HR · Payroll" title="Payroll run" actions={back} />
        {missing
          ? <div className="uc01-admin-state uc01-admin-state--error" role="alert"><strong>This payroll run was not found.</strong></div>
          : <ErrorState title="The payroll run could not be loaded." error={query.error} onRetry={() => query.refetch()} busy={query.isFetching} />}
      </section>
    );
  }

  const run = query.data;
  const lines = run.lines ?? [];
  const live = run.status === 'DRAFT' || run.status === 'SUBMITTED';
  const editable = canPrepare && run.status === 'DRAFT';

  return (
    <section className="uc01-admin-page hr-page hr-pay-page" aria-label="Payroll run">
      <PageHeader
        eyebrow="HR · Payroll"
        title={`Payroll for ${formatPayMonth(run.payMonth)}`}
        description={`${run.totals.people} ${run.totals.people === 1 ? 'person' : 'people'} in this run.`}
        actions={back}
      />

      <RunStepper run={run} />

      {notice && <div className="uc01-admin-message uc01-admin-message--success" role="status">{notice}</div>}
      {run.status === 'DRAFT' && run.note && (
        <div className="uc01-admin-message uc01-admin-message--info" role="status"><strong>Sent back:</strong> {run.note}</div>
      )}
      {live && !run.statutoryConfirmed && (
        <div className="hr-pay-warning" role="alert">
          <strong>The statutory settings were not confirmed by the CA when this run was worked out.</strong>
          <p>{STATUTORY_UNCONFIRMED_TEXT}</p>
          <Link className="uc01-admin-button hr-pay-button" to="/hr/payroll/settings">Open the statutory settings</Link>
        </div>
      )}

      <div className="uc01-admin-metrics hr-pay-metrics">
        <div><span>People</span><strong>{run.totals.people}</strong></div>
        <div><span>Net pay</span><strong>{formatRupees(run.totals.netPay)}</strong></div>
        <div><span>Payable</span><strong>{formatRupees(run.totals.payable)}</strong><small>Net pay plus reimbursements</small></div>
        <div><span>Left out</span><strong>{run.skipped.length}</strong></div>
      </div>

      <RunActions run={run} canPrepare={canPrepare} canApprove={canApprove} onDone={setNotice} />

      {run.skipped.length > 0 && (
        <SectionCard title={`Left out of this run (${run.skipped.length})`} description="These people have no pay line, so nothing is paid to them in this run.">
          <ul className="hr-pay-skipped">
            {run.skipped.map((s) => (
              <li key={s.employeeId}>
                <span><strong>{s.employeeName}</strong><small>{s.employeeCode}</small></span>
                <span>{s.reason}</span>
              </li>
            ))}
          </ul>
          {editable && <p className="hr-pay-sub">Once their salary is approved, use Recompute to add them.</p>}
        </SectionCard>
      )}

      <SectionCard title="Pay lines" description="Tap a person to see how their pay is worked out.">
        {lines.length === 0 ? <EmptyState>Nobody is in this run yet. Approve salary structures, then recompute.</EmptyState> : <RunLinesTable lines={lines} onOpen={setOpenLine} />}
      </SectionCard>

      {(run.status === 'APPROVED' || run.status === 'PAID') && <RunPayslips runId={run.runId} month={run.payMonth} />}

      {openLine && <LineDialog runId={run.runId} line={openLine} canEdit={editable} onClose={() => setOpenLine(null)} />}
    </section>
  );
}
