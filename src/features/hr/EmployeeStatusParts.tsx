import { useState } from 'react';
import { Link } from 'react-router-dom';

import { hrErrorMessage } from '../../services/hr/client';
import {
  decideStatusChange,
  requestStatusChange,
  type EmploymentStatus,
  type StatusChange,
} from '../../services/hr/employees';
import Field from './Field';
import { formatDate, formatDateTime, loginOutcomeLabels, statusLabels } from './hrLabels';
import { canSendRequest, statusChangeActions, statusChoices } from './statusChange';

interface RequestProps {
  accessToken: string;
  employeeId: string;
  employeeName: string;
  current: EmploymentStatus;
  onClose: () => void;
  onAsked: (change: StatusChange) => void;
}

/** HR asks for a status change. Sent once; the CEO decides. */
export function StatusRequestDialog({ accessToken, employeeId, employeeName, current, onClose, onAsked }: RequestProps) {
  const [toStatus, setToStatus] = useState<string>('');
  const [date, setDate] = useState(() => new Date().toLocaleDateString('en-CA'));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const send = async () => {
    setBusy(true);
    setError('');
    try {
      const change = await requestStatusChange(accessToken, employeeId, { to_status: toStatus as EmploymentStatus, effective_date: date || undefined, reason: reason.trim() });
      onAsked(change);
    } catch (problem) {
      setError(hrErrorMessage(problem));
      setBusy(false);
    }
  };

  return (
    <div className="uc01-admin-dialog-backdrop" role="presentation">
      <section className="uc01-admin-dialog" role="dialog" aria-modal="true" aria-labelledby="hr-status-title" style={{ maxWidth: 520 }}>
        <p className="uc01-admin-dialog__eyebrow">HR</p>
        <h2 id="hr-status-title">Change status of {employeeName}</h2>
        <p>Now: <strong>{statusLabels[current]}</strong>. The CEO must approve the change. The status changes only after that. If the new status is not Active, the Verigence login is suspended when it is approved.</p>
        <div className="hr-form-grid">
          <Field label="New status" htmlFor="hr-new-status" required>
            <select id="hr-new-status" value={toStatus} onChange={(e) => setToStatus(e.target.value)}>
              <option value="">Choose…</option>
              {statusChoices(current).map((s) => <option key={s} value={s}>{statusLabels[s]}</option>)}
            </select>
          </Field>
          <Field label="Date it applies from" htmlFor="hr-status-date">
            <input id="hr-status-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Reason" htmlFor="hr-status-reason" required wide>
            <textarea id="hr-status-reason" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        </div>
        {error && <div className="uc01-admin-message uc01-admin-message--error" role="alert">{error}</div>}
        <div className="uc01-admin-dialog__actions">
          <button type="button" className="uc01-admin-button" disabled={busy} onClick={onClose}>Cancel</button>
          <button type="button" className="uc01-admin-button uc01-admin-button--primary" disabled={busy || !canSendRequest({ toStatus, reason })} onClick={() => void send()}>
            {busy ? 'Sending…' : 'Ask for approval'}
          </button>
        </div>
      </section>
    </div>
  );
}

interface RowProps {
  accessToken: string;
  change: StatusChange;
  userId: string | null;
  canApprove: boolean;
  canManage: boolean;
  showEmployee?: boolean;
  /** Called after any decision so the lists reload. */
  onDecided: (change: StatusChange) => void;
}

/** One request, with Approve / Reject for the CEO and Cancel for the person who asked. */
export function StatusChangeRow({ accessToken, change, userId, canApprove, canManage, showEmployee = false, onDecided }: RowProps) {
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const can = statusChangeActions(change, { userId, canApprove, canManage });

  const act = async (action: 'approve' | 'reject' | 'cancel') => {
    setBusy(true);
    setError('');
    try {
      onDecided(await decideStatusChange(accessToken, change.changeId, action, note.trim() || undefined));
    } catch (problem) {
      setError(hrErrorMessage(problem));
      setBusy(false);
    }
  };

  return (
    <li className="hr-status-row">
      <strong>
        {showEmployee ? <><Link to={`/hr/employees/${change.employeeId}`}>{change.employeeName}</Link> ({change.employeeCode}): </> : null}
        {statusLabels[change.fromStatus]} → {statusLabels[change.toStatus]}
      </strong>
      <span>From {formatDate(change.effectiveDate)}. Asked {formatDateTime(change.requestedAt)}{userId && change.requestedBy === userId ? ' by you' : ''}.</span>
      <span>Reason: {change.reason}</span>
      {change.status !== 'PENDING' && (
        <span>
          {change.status === 'APPROVED' ? 'Approved' : change.status === 'REJECTED' ? 'Rejected' : 'Cancelled'}
          {change.decidedAt ? ` ${formatDateTime(change.decidedAt)}` : ''}{change.decisionNote ? `: ${change.decisionNote}` : '.'}
          {change.loginOutcome ? ` ${loginOutcomeLabels[change.loginOutcome] ?? ''}` : ''}
        </span>
      )}
      {error && <span className="hr-status-row__error" role="alert">{error}</span>}
      {rejecting && (
        <label className="hr-status-row__note">
          <span>Why is it rejected?</span>
          <input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
        </label>
      )}
      {(can.approve || can.reject || can.cancel) && (
        <span className="hr-status-row__buttons">
          {can.approve && !rejecting && <button type="button" className="uc01-admin-button uc01-admin-button--primary uc01-admin-button--compact" disabled={busy} onClick={() => void act('approve')}>{busy ? 'Working…' : 'Approve'}</button>}
          {can.reject && !rejecting && <button type="button" className="uc01-admin-button uc01-admin-button--compact" disabled={busy} onClick={() => setRejecting(true)}>Reject</button>}
          {can.reject && rejecting && <button type="button" className="uc01-admin-button uc01-admin-button--primary uc01-admin-button--compact" disabled={busy || note.trim().length < 3} onClick={() => void act('reject')}>{busy ? 'Working…' : 'Confirm reject'}</button>}
          {can.reject && rejecting && <button type="button" className="uc01-admin-button uc01-admin-button--compact" disabled={busy} onClick={() => setRejecting(false)}>Back</button>}
          {can.cancel && <button type="button" className="uc01-admin-button uc01-admin-button--compact" disabled={busy} onClick={() => void act('cancel')}>Cancel request</button>}
        </span>
      )}
    </li>
  );
}
