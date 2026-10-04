import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  approveRun,
  cancelRun,
  markRunPaid,
  payrollKeys,
  recomputeRun,
  sendBackRun,
  submitRun,
  type PayrollRun,
} from '../../../services/hr/payroll';
import { useSessionStore } from '../../../store/sessionStore';
import Modal from './Modal';
import { formatPayMonth, formatRupees, todayInIndia } from './money';
import { payrollErrorMessage, STATUTORY_UNCONFIRMED_TEXT } from './payrollErrors';

type Action =
  | { kind: 'recompute' }
  | { kind: 'submit' }
  | { kind: 'cancel' }
  | { kind: 'approve' }
  | { kind: 'sendBack'; note: string }
  | { kind: 'paid'; date: string };

type Dialog = 'approve' | 'sendBack' | 'cancel' | 'paid' | null;

interface Props {
  run: PayrollRun;
  canPrepare: boolean;
  canApprove: boolean;
  onDone: (message: string) => void;
}

function perform(token: string, run: PayrollRun, action: Action): Promise<PayrollRun> {
  switch (action.kind) {
    case 'recompute': return recomputeRun(token, run.runId);
    case 'submit': return submitRun(token, run.runId);
    case 'cancel': return cancelRun(token, run.runId);
    case 'approve': return approveRun(token, run.runId);
    case 'sendBack': return sendBackRun(token, run.runId, action.note);
    case 'paid': return markRunPaid(token, run.runId, action.date);
  }
}

const DONE: Record<Action['kind'], string> = {
  recompute: 'The run was worked out again. Your loss-of-pay days and adjustments were kept.',
  submit: 'Submitted. It now waits for the CEO to approve it.',
  cancel: 'The run was cancelled.',
  approve: 'Approved. The run is locked and a payslip was made for each person.',
  sendBack: 'Sent back to draft.',
  paid: 'Marked as paid.',
};

export default function RunActions({ run, canPrepare, canApprove, onDone }: Props) {
  const accessToken = useSessionStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [problem, setProblem] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(() => todayInIndia());
  const [understood, setUnderstood] = useState(false);

  const act = useMutation({
    mutationFn: (action: Action) => perform(accessToken!, run, action),
    onSuccess: (updated, action) => {
      queryClient.setQueryData<PayrollRun>(payrollKeys.run(run.runId), (old) => ({ ...(old as PayrollRun), ...updated, lines: updated.lines ?? old?.lines }));
      queryClient.removeQueries({ queryKey: ['hr', 'payroll', 'run', run.runId, 'line'] });
      void queryClient.invalidateQueries({ queryKey: payrollKeys.runs });
      if (action.kind === 'approve') void queryClient.invalidateQueries({ queryKey: payrollKeys.runPayslips(run.runId) });
      setDialog(null);
      setProblem('');
      setNote('');
      setUnderstood(false);
      onDone(DONE[action.kind]);
    },
    onError: (error) => setProblem(payrollErrorMessage(error)),
  });

  const open = (next: Dialog) => {
    setProblem('');
    setNote('');
    setUnderstood(false);
    setDate(todayInIndia());
    setDialog(next);
  };
  const close = () => { if (!act.isPending) setDialog(null); };
  const busy = act.isPending;
  const unconfirmed = !run.statutoryConfirmed;

  const showPrepare = canPrepare && (run.status === 'DRAFT' || run.status === 'SUBMITTED');
  const buttons = (
    <>
      {canPrepare && run.status === 'DRAFT' && (
        <>
          <button type="button" className="uc01-admin-button hr-pay-button" disabled={busy} onClick={() => { setProblem(''); act.mutate({ kind: 'recompute' }); }}>
            {busy && act.variables?.kind === 'recompute' ? 'Working out…' : 'Recompute'}
          </button>
          <button type="button" className="uc01-admin-button uc01-admin-button--primary hr-pay-button" disabled={busy} onClick={() => { setProblem(''); act.mutate({ kind: 'submit' }); }}>
            {busy && act.variables?.kind === 'submit' ? 'Submitting…' : 'Submit for approval'}
          </button>
        </>
      )}
      {canApprove && run.status === 'SUBMITTED' && (
        <button type="button" className="uc01-admin-button uc01-admin-button--primary hr-pay-button" disabled={busy} onClick={() => open('approve')}>Approve…</button>
      )}
      {(canApprove || canPrepare) && run.status === 'SUBMITTED' && (
        <button type="button" className="uc01-admin-button hr-pay-button" disabled={busy} onClick={() => open('sendBack')}>Send back…</button>
      )}
      {canPrepare && run.status === 'APPROVED' && (
        <button type="button" className="uc01-admin-button uc01-admin-button--primary hr-pay-button" disabled={busy} onClick={() => open('paid')}>Mark paid…</button>
      )}
      {showPrepare && (
        <button type="button" className="uc01-admin-button uc01-admin-button--danger hr-pay-button" disabled={busy} onClick={() => open('cancel')}>Cancel run…</button>
      )}
    </>
  );

  const hasAny = (canPrepare && ['DRAFT', 'SUBMITTED', 'APPROVED'].includes(run.status)) || (canApprove && run.status === 'SUBMITTED');
  if (!hasAny) return null;

  return (
    <>
      <div className="hr-pay-actions" role="group" aria-label="Run actions">{buttons}</div>
      {!dialog && problem && <div className="uc01-admin-message uc01-admin-message--error" role="alert">{problem}</div>}

      {dialog === 'approve' && (
        <Modal eyebrow="Payroll" title={`Approve payroll for ${formatPayMonth(run.payMonth)}?`} titleId="run-approve" busy={busy} onClose={close}>
          <p><strong>Approval is final.</strong> The run is locked and cannot be edited, cancelled or recomputed. A payslip PDF is made for each of the {run.totals.people} people, and approved reimbursements are handed to payroll. Any mistake is corrected in next month's adjustments.</p>
          <dl className="uc01-admin-dialog__facts">
            <div><dt>People</dt><dd>{run.totals.people}</dd></div>
            <div><dt>Net pay</dt><dd>{formatRupees(run.totals.netPay)}</dd></div>
            <div><dt>Payable</dt><dd>{formatRupees(run.totals.payable)}</dd></div>
          </dl>
          {unconfirmed && <div className="hr-pay-warning" role="alert"><strong>This run cannot be approved yet.</strong><p>{STATUTORY_UNCONFIRMED_TEXT}</p></div>}
          <label className="hr-check">
            <input type="checkbox" checked={understood} disabled={busy || unconfirmed} onChange={(e) => setUnderstood(e.target.checked)} />
            <span>I have reviewed this run and understand that approving it is final.</span>
          </label>
          {problem && <div className="uc01-admin-message uc01-admin-message--error" role="alert">{problem}</div>}
          <div className="uc01-admin-dialog__actions">
            <button type="button" className="uc01-admin-button hr-pay-button" disabled={busy} onClick={close}>Not now</button>
            <button type="button" className="uc01-admin-button uc01-admin-button--primary hr-pay-button" disabled={busy || !understood || unconfirmed} onClick={() => act.mutate({ kind: 'approve' })}>
              {busy ? 'Approving…' : 'Approve and lock the run'}
            </button>
          </div>
        </Modal>
      )}

      {dialog === 'sendBack' && (
        <Modal eyebrow="Payroll" title="Send this run back?" titleId="run-sendback" busy={busy} onClose={close}>
          <p>The run goes back to draft so HR can correct it. Say what needs to change.</p>
          <label className="uc01-admin-reason">
            <span>What needs to change (required)</span>
            <textarea rows={3} maxLength={300} value={note} disabled={busy} onChange={(e) => { setNote(e.target.value); setProblem(''); }} />
          </label>
          {problem && <div className="uc01-admin-message uc01-admin-message--error" role="alert">{problem}</div>}
          <div className="uc01-admin-dialog__actions">
            <button type="button" className="uc01-admin-button hr-pay-button" disabled={busy} onClick={close}>Cancel</button>
            <button type="button" className="uc01-admin-button uc01-admin-button--primary hr-pay-button" disabled={busy}
              onClick={() => { if (!note.trim()) { setProblem('Say what needs to change.'); return; } act.mutate({ kind: 'sendBack', note: note.trim() }); }}>
              {busy ? 'Sending back…' : 'Send back'}
            </button>
          </div>
        </Modal>
      )}

      {dialog === 'cancel' && (
        <Modal eyebrow="Payroll" title="Cancel this run?" titleId="run-cancel" busy={busy} onClose={close}>
          <p>The run for {formatPayMonth(run.payMonth)} is cancelled and its figures are discarded from use. You can start a new run for the month afterwards.</p>
          {problem && <div className="uc01-admin-message uc01-admin-message--error" role="alert">{problem}</div>}
          <div className="uc01-admin-dialog__actions">
            <button type="button" className="uc01-admin-button hr-pay-button" disabled={busy} onClick={close}>Keep the run</button>
            <button type="button" className="uc01-admin-button uc01-admin-button--danger-primary hr-pay-button" disabled={busy} onClick={() => act.mutate({ kind: 'cancel' })}>
              {busy ? 'Cancelling…' : 'Cancel the run'}
            </button>
          </div>
        </Modal>
      )}

      {dialog === 'paid' && (
        <Modal eyebrow="Payroll" title="Mark this run as paid?" titleId="run-paid" busy={busy} onClose={close}>
          <p>Record the day the money was paid out. Reimbursements in this run are then marked as paid too. The date cannot be in the future.</p>
          <label className="hr-field">
            <span className="hr-pay-label">Payment date</span>
            <input type="date" value={date} max={todayInIndia()} disabled={busy} onChange={(e) => { setDate(e.target.value); setProblem(''); }} />
          </label>
          {problem && <div className="uc01-admin-message uc01-admin-message--error" role="alert">{problem}</div>}
          <div className="uc01-admin-dialog__actions">
            <button type="button" className="uc01-admin-button hr-pay-button" disabled={busy} onClick={close}>Cancel</button>
            <button type="button" className="uc01-admin-button uc01-admin-button--primary hr-pay-button" disabled={busy}
              onClick={() => {
                if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { setProblem('Choose the payment date.'); return; }
                if (date > todayInIndia()) { setProblem('The payment date cannot be in the future.'); return; }
                act.mutate({ kind: 'paid', date });
              }}>
              {busy ? 'Saving…' : 'Mark as paid'}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
