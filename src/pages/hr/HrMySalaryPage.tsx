import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import PageHeader from '../../components/PageHeader';
import SectionCard from '../../components/SectionCard';
import { HrHttpError } from '../../services/hr/client';
import { getMySalary, payrollKeys } from '../../services/hr/payroll';
import { useSessionStore } from '../../store/sessionStore';
import { formatDate } from '../../features/hr/hrLabels';
import { useHrAccess } from '../../features/hr/hrQueries';
import { formatRupees } from '../../features/hr/payroll/money';
import { EmptyState, ErrorState, LoadingState, NoAccess } from '../../features/hr/payroll/PayrollStates';
import '../../styles/hr-payroll.css';

/** The signed-in employee's own approved salary. The server returns nobody else's, and this page asks for nobody else's. */
export default function HrMySalaryPage() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const access = useHrAccess();

  const query = useQuery({
    queryKey: payrollKeys.mySalary,
    queryFn: () => getMySalary(accessToken!),
    enabled: Boolean(accessToken) && access.isEmployee,
    retry: false,
    refetchOnWindowFocus: false,
  });

  if (access.loading) return <LoadingState />;
  if (!access.isEmployee) {
    return <NoAccess title="My salary" message="Salary is shown to people who have an employee record in HR." />;
  }

  const current = query.data?.current ?? null;
  const upcomingFrom = query.data?.upcomingFrom ?? null;
  const notLinked = query.error instanceof HrHttpError && query.error.status === 404;

  return (
    <section className="uc01-admin-page hr-page hr-pay-page" aria-label="My salary">
      <PageHeader
        eyebrow="HR"
        title="My salary"
        description="Your approved monthly salary. Only you can see this."
        actions={<Link className="uc01-admin-button hr-pay-button" to="/hr/payslips">Payslips</Link>}
      />

      {query.isLoading && <LoadingState>Loading your salary…</LoadingState>}
      {query.isError && (
        <ErrorState
          title={notLinked ? 'No employee record is linked to your login.' : 'Your salary could not be loaded.'}
          error={query.error}
          onRetry={notLinked ? undefined : () => query.refetch()}
          busy={query.isFetching}
        />
      )}

      {query.isSuccess && !current && <EmptyState>No salary has been approved for you yet. HR will add it.</EmptyState>}

      {current && (
        <>
          <div className="hr-pay-salary" aria-label="Current salary">
            <span className="hr-pay-salary__label">Gross salary per month</span>
            <strong className="hr-pay-salary__gross hr-pay-money">{formatRupees(current.grossMonthly)}</strong>
            <small className="hr-muted">Effective from {formatDate(current.effectiveFrom)}</small>
            {upcomingFrom && <small className="hr-pay-salary__upcoming">A new salary applies from {formatDate(upcomingFrom)}.</small>}
          </div>
          <SectionCard title="Breakdown" description="How your monthly gross is made up.">
            <ul className="hr-pay-salary__components" aria-label="Salary components">
              {current.components.map((c) => (
                <li key={c.code}>
                  <span>{c.label}</span>
                  <span className="hr-pay-money">{formatRupees(c.amount)}</span>
                </li>
              ))}
            </ul>
          </SectionCard>
        </>
      )}
    </section>
  );
}
