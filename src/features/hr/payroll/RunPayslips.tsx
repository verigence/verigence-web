import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import SectionCard from '../../../components/SectionCard';
import { fetchPayslipPdf, listRunPayslips, payrollKeys, type RunPayslip } from '../../../services/hr/payroll';
import { useSessionStore } from '../../../store/sessionStore';
import Modal from './Modal';
import { payrollErrorMessage } from './payrollErrors';
import { downloadPdf, payslipFileName, releasePdfUrl, viewPdf } from './pdf';
import { EmptyState, ErrorState, LoadingState } from './PayrollStates';

/** After approval: one payslip per person. Opening someone else's payslip is recorded in the audit log by the server. */
export default function RunPayslips({ runId, month }: { runId: string; month: string }) {
  const accessToken = useSessionStore((s) => s.accessToken);
  const [busy, setBusy] = useState<{ id: string; action: 'view' | 'download' } | null>(null);
  const [problem, setProblem] = useState('');
  const [blockedUrl, setBlockedUrl] = useState<string | null>(null);

  const list = useQuery({
    queryKey: payrollKeys.runPayslips(runId),
    queryFn: () => listRunPayslips(accessToken!, runId),
    enabled: Boolean(accessToken),
    retry: false,
    refetchOnWindowFocus: false,
  });

  const run = async (slip: RunPayslip, action: 'view' | 'download') => {
    setBusy({ id: slip.payslipId, action });
    setProblem('');
    const load = () => fetchPayslipPdf(accessToken!, slip.payslipId);
    try {
      if (action === 'view') setBlockedUrl(await viewPdf(load));
      else await downloadPdf(load, payslipFileName(month, `-${slip.employeeCode}`));
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
    <SectionCard title={`Payslips${list.isSuccess ? ` (${items.length})` : ''}`} description="Each time you open someone's payslip, it is recorded in the audit log.">
      {list.isLoading && <LoadingState>Loading payslips…</LoadingState>}
      {list.isError && <ErrorState title="The payslips could not be loaded." error={list.error} onRetry={() => list.refetch()} busy={list.isFetching} />}
      {list.isSuccess && items.length === 0 && <EmptyState>No payslips were made for this run.</EmptyState>}
      {problem && <div className="uc01-admin-message uc01-admin-message--error" role="alert">{problem}</div>}
      {items.length > 0 && (
        <ul className="hr-pay-payslips">
          {items.map((slip) => {
            const rowBusy = busy?.id === slip.payslipId;
            return (
              <li key={slip.payslipId}>
                <span><strong>{slip.employeeName}</strong><small>{slip.employeeCode}</small></span>
                <span className="hr-pay-payslips__actions">
                  <button type="button" className="uc01-admin-button uc01-admin-button--primary hr-pay-button" disabled={rowBusy} onClick={() => void run(slip, 'view')}>
                    {rowBusy && busy?.action === 'view' ? 'Opening…' : 'Open PDF'}
                  </button>
                  <button type="button" className="uc01-admin-button hr-pay-button" disabled={rowBusy} onClick={() => void run(slip, 'download')}>
                    {rowBusy && busy?.action === 'download' ? 'Preparing…' : 'Download'}
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {blockedUrl && (
        <Modal title="The payslip is ready" titleId="run-payslip-ready" onClose={closeBlocked}>
          <p>Your browser did not open a new tab by itself. Use the button to open the payslip.</p>
          <div className="uc01-admin-dialog__actions">
            <button type="button" className="uc01-admin-button hr-pay-button" onClick={closeBlocked}>Close</button>
            <a className="uc01-admin-button uc01-admin-button--primary hr-pay-button" href={blockedUrl} target="_blank" rel="noopener noreferrer">Open payslip</a>
          </div>
        </Modal>
      )}
    </SectionCard>
  );
}
