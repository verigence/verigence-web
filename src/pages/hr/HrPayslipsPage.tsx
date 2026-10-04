import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import PageHeader from '../../components/PageHeader';
import { fetchPayslipPdf, listMyPayslips, payrollKeys, type MyPayslip } from '../../services/hr/payroll';
import { useSessionStore } from '../../store/sessionStore';
import { formatDateTime } from '../../features/hr/hrLabels';
import { useHrAccess } from '../../features/hr/hrQueries';
import Modal from '../../features/hr/payroll/Modal';
import { compareDecimal, formatPayMonth, formatRupees } from '../../features/hr/payroll/money';
import { payrollErrorMessage } from '../../features/hr/payroll/payrollErrors';
import { downloadPdf, payslipFileName, releasePdfUrl, viewPdf } from '../../features/hr/payroll/pdf';
import { EmptyState, ErrorState, LoadingState, NoAccess } from '../../features/hr/payroll/PayrollStates';
import '../../styles/hr-payroll.css';

type Busy = { id: string; action: 'view' | 'download' } | null;

export default function HrPayslipsPage() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const access = useHrAccess();
  const [busy, setBusy] = useState<Busy>(null);
  const [problem, setProblem] = useState('');
  const [blockedUrl, setBlockedUrl] = useState<string | null>(null);

  const list = useQuery({
    queryKey: payrollKeys.myPayslips,
    queryFn: () => listMyPayslips(accessToken!),
    enabled: Boolean(accessToken) && access.isEmployee,
    retry: false,
    refetchOnWindowFocus: false,
  });

  if (access.loading) return <LoadingState />;
  if (!access.isEmployee) {
    return <NoAccess title="Payslips" message="Payslips are shown to people who have an employee record in HR." />;
  }

  const run = async (slip: MyPayslip, action: 'view' | 'download') => {
    setBusy({ id: slip.payslipId, action });
    setProblem('');
    const load = () => fetchPayslipPdf(accessToken!, slip.payslipId);
    try {
      if (action === 'view') setBlockedUrl(await viewPdf(load));
      else await downloadPdf(load, payslipFileName(slip.month));
    } catch (error) {
      setProblem(payrollErrorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const closeBlocked = () => {
    const url = blockedUrl;
    setBlockedUrl(null);
    window.setTimeout(() => releasePdfUrl(url), 30_000);
  };

  const items = list.data?.items ?? [];

  return (
    <section className="uc01-admin-page hr-page hr-pay-page" aria-label="Payslips">
      <PageHeader eyebrow="HR" title="My payslips" description="One payslip for each month your pay was processed. Only you can see these." />

      {list.isLoading && <LoadingState>Loading your payslips…</LoadingState>}
      {list.isError && <ErrorState title="Your payslips could not be loaded." error={list.error} onRetry={() => list.refetch()} busy={list.isFetching} />}
      {problem && <div className="uc01-admin-message uc01-admin-message--error" role="alert">{problem}</div>}

      {list.isSuccess && items.length === 0 && <EmptyState>No payslips yet. A payslip appears here once the month's payroll is approved.</EmptyState>}

      {items.length > 0 && (
        <ul className="hr-pay-slips" aria-label="Payslips by month">
          {items.map((slip) => {
            const rowBusy = busy?.id === slip.payslipId;
            const hasReimbursement = compareDecimal(slip.payable, slip.netPay) !== 0;
            return (
              <li key={slip.payslipId} className="hr-pay-slip">
                <div className="hr-pay-slip__head">
                  <strong>{formatPayMonth(slip.month)}</strong>
                  <small>Issued {formatDateTime(slip.issuedAt)}</small>
                </div>
                <dl className="hr-pay-slip__figures">
                  <div>
                    <dt>Net pay</dt>
                    <dd className="hr-pay-money">{formatRupees(slip.netPay)}</dd>
                  </div>
                  <div>
                    <dt>{hasReimbursement ? 'Payable with reimbursements' : 'Payable'}</dt>
                    <dd className="hr-pay-money hr-pay-money--strong">{formatRupees(slip.payable)}</dd>
                  </div>
                </dl>
                <div className="hr-pay-slip__actions">
                  <button type="button" className="uc01-admin-button uc01-admin-button--primary hr-pay-button" disabled={rowBusy} onClick={() => void run(slip, 'view')}>
                    {rowBusy && busy?.action === 'view' ? 'Opening…' : 'Open PDF'}
                  </button>
                  <button type="button" className="uc01-admin-button hr-pay-button" disabled={rowBusy} onClick={() => void run(slip, 'download')}>
                    {rowBusy && busy?.action === 'download' ? 'Preparing…' : 'Download'}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {blockedUrl && (
        <Modal title="Your payslip is ready" titleId="payslip-ready" onClose={closeBlocked}>
          <p>Your browser did not open a new tab by itself. Use the button to open the payslip.</p>
          <div className="uc01-admin-dialog__actions">
            <button type="button" className="uc01-admin-button hr-pay-button" onClick={closeBlocked}>Close</button>
            <a className="uc01-admin-button uc01-admin-button--primary hr-pay-button" href={blockedUrl} target="_blank" rel="noopener noreferrer">Open payslip</a>
          </div>
        </Modal>
      )}
    </section>
  );
}
