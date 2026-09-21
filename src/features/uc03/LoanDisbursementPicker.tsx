import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { getLoanDisbursementCandidates, putLoanDisbursement } from '../../services/audit-core/operations';
// Deliberately reusing the SKU picker's list/radio/price layout classes --
// same visual language ("pick one of these candidates, most-relevant first,
// amount right-aligned"), not SKU-specific in what they render.
import '../../styles/uc03-journey-documents.css';
// Same modal chrome as ModifyModelModal, reused by LoanDisbursementModal below.
import '../../styles/uc03-modify-model-modal.css';

function formatMoney(amount: string): string {
  const value = Number(amount);
  if (Number.isNaN(value)) return amount;
  return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function readableMode(code: string | null): string {
  return code ? code.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : 'Payment';
}

/**
 * The one radio-list-and-confirm UI for "which payment is the actual loan
 * disbursement" -- deliberately shared between the Task Queue's inline
 * FINANCE_DISBURSEMENT_REVIEW card and the standalone correction on Journey
 * Documents, per explicit instruction that both entry points must use the
 * same picker rather than diverging screens. The candidate list itself
 * (auditcore's own eligible_loan_disbursement_candidates -- payments after
 * the minimum booking amount, restricted to modes an institutional
 * disbursement could actually use) is exactly what the system's automatic
 * resolver already considered and could not confidently pick between; a
 * human is only ever asked to choose from that same narrowed set, never a
 * free-form entry.
 */
export default function LoanDisbursementPicker({
  tenantId,
  journeyId,
  accessToken,
  onConfirm,
  onConfirmed,
  confirmLabel = 'Confirm as loan disbursement',
  showSuccessMessage = true,
}: {
  tenantId: string;
  journeyId: string;
  accessToken?: string;
  onConfirm: (paymentId: string) => Promise<unknown>;
  onConfirmed?: () => void;
  confirmLabel?: string;
  showSuccessMessage?: boolean;
}) {
  const [selectedPaymentId, setSelectedPaymentId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState(false);

  const query = useQuery({
    queryKey: ['uc03-loan-disbursement-candidates', tenantId, journeyId],
    queryFn: () => getLoanDisbursementCandidates(tenantId, journeyId, accessToken),
    enabled: Boolean(tenantId && journeyId && accessToken),
    retry: false,
    refetchOnWindowFocus: false,
  });

  const candidates = query.data ?? [];

  const confirm = async () => {
    if (!selectedPaymentId) return;
    setBusy(true);
    setError(undefined);
    try {
      await onConfirm(selectedPaymentId);
      setDone(true);
      onConfirmed?.();
    } catch (confirmError) {
      setError(confirmError instanceof Error ? confirmError.message : 'That payment could not be confirmed. Try again.');
    } finally {
      setBusy(false);
    }
  };

  if (done && showSuccessMessage) {
    return <div className="uc03-jd-success" role="status">Confirmed as the loan disbursement amount.</div>;
  }

  if (query.isPending) {
    return <p className="uc03-jd-empty">Loading the payment receipts…</p>;
  }

  if (query.isError) {
    return <p className="uc03-jd-empty">The payment receipts could not be loaded. Try again.</p>;
  }

  if (candidates.length === 0) {
    return (
      <p className="uc03-jd-empty">
        No eligible payment was found after the minimum booking amount. A loan disbursement can only be an RTGS/NEFT/cheque/DD-style
        payment (never Cash, UPI, Card or a wallet) — upload or verify the missing receipt first.
      </p>
    );
  }

  return (
    <>
      <ul className="uc03-jd-sku-candidates">
        {candidates.map((candidate) => (
          <li key={candidate.paymentId}>
            <label className={selectedPaymentId === candidate.paymentId ? 'is-selected' : ''}>
              <input
                type="radio"
                name={`loan-disbursement-${journeyId}`}
                value={candidate.paymentId}
                checked={selectedPaymentId === candidate.paymentId}
                onChange={() => setSelectedPaymentId(candidate.paymentId)}
              />
              <span className="uc03-jd-sku-candidate__label">
                <strong>{formatMoney(candidate.amount)}</strong>
                {formatDate(candidate.paymentAtUtc) ? (
                  <span className="uc03-jd-sku-candidate__colour">{formatDate(candidate.paymentAtUtc)}</span>
                ) : null}
                <span className="uc03-jd-sku-candidate__code">{readableMode(candidate.paymentMethodCode)}</span>
              </span>
              <span className="uc03-jd-sku-candidate__price">
                {candidate.bankName ? <span>{candidate.bankName}</span> : null}
                {candidate.paymentReference ? (
                  <span className="uc03-jd-sku-candidate__total">Ref {candidate.paymentReference}</span>
                ) : null}
              </span>
            </label>
          </li>
        ))}
      </ul>

      {error ? <div className="uc03-jd-error" role="alert">{error}</div> : null}

      <div className="uc03-jd-sku-picker__actions">
        <button type="button" className="uc03-c3-primary" disabled={!selectedPaymentId || busy} onClick={() => void confirm()}>
          {busy ? 'Confirming…' : confirmLabel}
        </button>
      </div>
    </>
  );
}

/**
 * The Journey Documents standalone entry point -- same picker, this time
 * hosted in the "Modify Model"-style popup rather than inline in a Task
 * card. Available at any time, not just while a FINANCE_DISBURSEMENT_REVIEW
 * task is open: a PC can also use this to change a loan amount the system
 * already auto-resolved, if it turns out to be wrong.
 */
export function LoanDisbursementModal({
  tenantId,
  journeyId,
  accessToken,
  onClose,
  onUpdated,
}: {
  tenantId: string;
  journeyId: string;
  accessToken?: string;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [done, setDone] = useState(false);

  return (
    <div className="uc03-mm-backdrop" role="presentation" onClick={onClose}>
      <div className="uc03-mm-modal" role="dialog" aria-modal="true" aria-label="Update loan disbursement amount" onClick={(event) => event.stopPropagation()}>
        <header className="uc03-mm-modal__header">
          <h3>Update loan disbursement amount</h3>
          <button type="button" className="uc03-mm-modal__close" onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="uc03-mm-modal__body">
          {done ? (
            <>
              <div className="uc03-jd-success" role="status">Confirmed as the loan disbursement amount.</div>
              <div className="uc03-mm-actions">
                <button type="button" className="uc03-c3-primary" onClick={onClose}>Done</button>
              </div>
            </>
          ) : (
            <>
              <p className="uc03-mm-intro">
                Pick the payment that is the actual loan disbursement from the lender, then confirm. This replaces any amount the
                system resolved automatically.
              </p>
              <LoanDisbursementPicker
                tenantId={tenantId}
                journeyId={journeyId}
                accessToken={accessToken}
                confirmLabel="Update loan amount"
                showSuccessMessage={false}
                onConfirm={(paymentId) => putLoanDisbursement(tenantId, journeyId, paymentId, accessToken)}
                onConfirmed={() => { setDone(true); onUpdated(); }}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
