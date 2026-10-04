import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import PageHeader from '../../components/PageHeader';
import SectionCard from '../../components/SectionCard';
import { getTemplates, listStructures, PAYROLL_PERMISSION, payrollKeys, type SalaryStructureListItem } from '../../services/hr/payroll';
import { useSessionStore } from '../../store/sessionStore';
import { useHrAccess } from '../../features/hr/hrQueries';
import DecisionDialog from '../../features/hr/payroll/DecisionDialog';
import EmployeePicker, { type PickedEmployee } from '../../features/hr/payroll/EmployeePicker';
import { payrollErrorMessage } from '../../features/hr/payroll/payrollErrors';
import { EmptyState, ErrorState, LoadingState, NoAccess } from '../../features/hr/payroll/PayrollStates';
import ProposeSalaryForm from '../../features/hr/payroll/ProposeSalaryForm';
import StructureCard from '../../features/hr/payroll/StructureCard';
import '../../styles/hr-payroll.css';

const queryDefaults = { retry: false, refetchOnWindowFocus: false } as const;

export default function HrSalariesPage() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const access = useHrAccess();
  const canPropose = access.can(PAYROLL_PERMISSION.salaryPropose);
  const canDecide = access.can(PAYROLL_PERMISSION.salaryApprove);
  const canRead = canPropose || canDecide || access.can(PAYROLL_PERMISSION.payrollRead);
  const canSeeRuns = access.can(PAYROLL_PERMISSION.payrollRead);

  const [notice, setNotice] = useState('');
  const [deciding, setDeciding] = useState<{ item: SalaryStructureListItem; decision: 'APPROVE' | 'REJECT' } | null>(null);
  const [historyOf, setHistoryOf] = useState<PickedEmployee | null>(null);
  const historyRef = useRef<HTMLDivElement>(null);

  const templates = useQuery({
    queryKey: payrollKeys.templates,
    queryFn: () => getTemplates(accessToken!),
    enabled: Boolean(accessToken) && canPropose,
    ...queryDefaults,
  });
  const waiting = useQuery({
    queryKey: payrollKeys.structures('PROPOSED'),
    queryFn: () => listStructures(accessToken!, { status: 'PROPOSED' }),
    enabled: Boolean(accessToken) && canRead,
    ...queryDefaults,
  });
  const history = useQuery({
    queryKey: payrollKeys.structures(`person:${historyOf?.employeeId ?? ''}`),
    queryFn: () => listStructures(accessToken!, { employeeId: historyOf!.employeeId }),
    enabled: Boolean(accessToken) && canRead && Boolean(historyOf),
    ...queryDefaults,
  });

  if (access.loading) return <LoadingState />;
  if (!canRead) return <NoAccess title="Salaries" message="You do not have access to salary structures." />;

  const showHistory = (item: SalaryStructureListItem) => {
    setHistoryOf({ employeeId: item.employeeId, fullName: item.employeeName, employeeCode: item.employeeCode });
    window.setTimeout(() => historyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  const proposals = waiting.data?.items ?? [];

  return (
    <section className="uc01-admin-page hr-page hr-pay-page" aria-label="Salaries">
      <PageHeader
        eyebrow="HR · Payroll"
        title="Salaries"
        description="Salary structures are proposed by HR and approved by Finance. Nobody can approve their own proposal or their own salary."
        actions={(
          <>
            {canSeeRuns && <Link className="uc01-admin-button hr-pay-button" to="/hr/payroll">Payroll runs</Link>}
            <Link className="uc01-admin-button hr-pay-button" to="/hr/payroll/settings">Templates and settings</Link>
          </>
        )}
      />

      {notice && <div className="uc01-admin-message uc01-admin-message--success" role="status">{notice}</div>}

      {canPropose && (
        <ProposeSalaryForm
          templates={templates.data?.items ?? []}
          templatesLoading={templates.isLoading}
          templatesError={templates.isError ? payrollErrorMessage(templates.error) : ''}
          onProposed={() => setNotice('')}
        />
      )}

      <SectionCard
        title={`Waiting for approval${waiting.isSuccess ? ` (${proposals.length})` : ''}`}
        description={canDecide ? 'Approve or reject. A rejection needs a reason.' : 'These proposals are with Finance.'}
        action={<button type="button" className="uc01-admin-button hr-pay-button" onClick={() => waiting.refetch()} disabled={waiting.isFetching}>{waiting.isFetching ? 'Refreshing…' : 'Refresh'}</button>}
      >
        {waiting.isLoading && <LoadingState>Loading proposals…</LoadingState>}
        {waiting.isError && <ErrorState title="The proposals could not be loaded." error={waiting.error} onRetry={() => waiting.refetch()} busy={waiting.isFetching} />}
        {waiting.isSuccess && proposals.length === 0 && <EmptyState>No salary proposals are waiting.</EmptyState>}
        {proposals.length > 0 && (
          <div className="hr-pay-cards">
            {proposals.map((item) => (
              <StructureCard
                key={item.structureId}
                item={item}
                showPerson
                actions={(
                  <>
                    {canDecide && <button type="button" className="uc01-admin-button uc01-admin-button--primary hr-pay-button" onClick={() => { setNotice(''); setDeciding({ item, decision: 'APPROVE' }); }}>Approve</button>}
                    {canDecide && <button type="button" className="uc01-admin-button uc01-admin-button--danger hr-pay-button" onClick={() => { setNotice(''); setDeciding({ item, decision: 'REJECT' }); }}>Reject</button>}
                    <button type="button" className="uc01-admin-button hr-pay-button" onClick={() => showHistory(item)}>History</button>
                  </>
                )}
              />
            ))}
          </div>
        )}
      </SectionCard>

      <div ref={historyRef}>
        <SectionCard title="Salary history" description="Every version for a person, newest first. Nothing is ever deleted.">
          <div className="hr-pay-history-picker">
            <EmployeePicker id="history-person" label="Person" value={historyOf} onChange={setHistoryOf} includeInactive />
          </div>
          {historyOf && history.isLoading && <LoadingState>Loading history…</LoadingState>}
          {historyOf && history.isError && <ErrorState title="The history could not be loaded." error={history.error} onRetry={() => history.refetch()} busy={history.isFetching} />}
          {historyOf && history.isSuccess && history.data.items.length === 0 && <EmptyState>No salary has been proposed for this person yet.</EmptyState>}
          {history.data && history.data.items.length > 0 && historyOf && (
            <div className="hr-pay-cards">
              {history.data.items.map((item) => <StructureCard key={item.structureId} item={item} />)}
            </div>
          )}
        </SectionCard>
      </div>

      {deciding && (
        <DecisionDialog
          item={deciding.item}
          decision={deciding.decision}
          onClose={() => setDeciding(null)}
          onDone={(message) => { setDeciding(null); setNotice(message); }}
        />
      )}
    </section>
  );
}
