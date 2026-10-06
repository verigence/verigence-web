import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import SectionCard from '../../components/SectionCard';
import { hrErrorMessage } from '../../services/hr/client';
import {
  cancelMyContactChange,
  decideContactChange,
  listMyContactChanges,
  requestContactChange,
  type ContactChange,
  type ContactField,
} from '../../services/hr/contactChanges';
import { checkNewContact, contactChangeActions, contactFieldLabels, contactLoginNote, contactStatusLabels } from './contactChange';
import Field from './Field';
import { formatDateTime } from './hrLabels';

const myChangesKey = ['hr', 'my-contact-changes'] as const;

interface PanelProps {
  accessToken: string;
  email: string;
  mobile: string | null;
}

/** The employee asks HR to change their email or mobile. HR approves; nothing changes before that. */
export function ContactChangePanel({ accessToken, email, mobile }: PanelProps) {
  const queryClient = useQueryClient();
  const [asking, setAsking] = useState<ContactField | null>(null);
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const changes = useQuery({
    queryKey: myChangesKey,
    queryFn: () => listMyContactChanges(accessToken),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const items = changes.data?.items ?? [];
  const waiting = (field: ContactField) => items.find((c) => c.field === field && c.status === 'PENDING');
  const refresh = () => queryClient.invalidateQueries({ queryKey: myChangesKey });

  const open = (field: ContactField) => {
    setAsking(field);
    setValue('');
    setError('');
    setNotice('');
  };

  const send = async () => {
    if (!asking) return;
    const checked = checkNewContact(asking, value, asking === 'EMAIL' ? email : mobile);
    if (checked.error !== null) {
      setError(checked.error);
      return;
    }
    setBusy(true);
    setError('');
    try {
      await requestContactChange(accessToken, asking, checked.value);
      setNotice('Your request is sent to HR. Your details change only after HR approves.');
      setAsking(null);
      await refresh();
    } catch (problem) {
      setError(hrErrorMessage(problem));
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (change: ContactChange) => {
    setBusy(true);
    setError('');
    try {
      await cancelMyContactChange(accessToken, change.changeId);
      await refresh();
    } catch (problem) {
      setError(hrErrorMessage(problem));
    } finally {
      setBusy(false);
    }
  };

  const rows: { field: ContactField; current: string }[] = [
    { field: 'EMAIL', current: email },
    { field: 'MOBILE', current: mobile || '—' },
  ];

  return (
    <SectionCard title="Change email or mobile" description="HR must approve a change of email or mobile. Your Verigence login follows the new email after approval.">
      <ul className="hr-status-list">
        {rows.map(({ field, current }) => {
          const pending = waiting(field);
          return (
            <li key={field} className="hr-status-row">
              <strong>{contactFieldLabels[field]}: {current}</strong>
              {pending ? (
                <>
                  <span>Waiting for HR: {pending.oldValue || '—'} → {pending.newValue}. Asked {formatDateTime(pending.requestedAt)}.</span>
                  <span className="hr-status-row__buttons">
                    <button type="button" className="uc01-admin-button uc01-admin-button--compact" disabled={busy} onClick={() => void cancel(pending)}>Cancel request</button>
                  </span>
                </>
              ) : asking === field ? (
                <>
                  <Field label={`New ${contactFieldLabels[field].toLowerCase()}`} htmlFor={`me-new-${field}`} error={error}>
                    <input
                      id={`me-new-${field}`}
                      type={field === 'EMAIL' ? 'email' : 'tel'}
                      inputMode={field === 'EMAIL' ? 'email' : 'tel'}
                      value={value}
                      autoComplete="off"
                      onChange={(e) => { setValue(e.target.value); setError(''); }}
                    />
                  </Field>
                  <span className="hr-status-row__buttons">
                    <button type="button" className="uc01-admin-button uc01-admin-button--primary uc01-admin-button--compact" disabled={busy || !value.trim()} onClick={() => void send()}>{busy ? 'Sending…' : 'Send to HR'}</button>
                    <button type="button" className="uc01-admin-button uc01-admin-button--compact" disabled={busy} onClick={() => setAsking(null)}>Back</button>
                  </span>
                </>
              ) : (
                <span className="hr-status-row__buttons">
                  <button type="button" className="uc01-admin-button uc01-admin-button--compact" disabled={busy} onClick={() => open(field)}>Ask HR to change</button>
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {notice && <div className="uc01-admin-message uc01-admin-message--success" role="status">{notice}</div>}
      {error && asking === null && <div className="uc01-admin-message uc01-admin-message--error" role="alert">{error}</div>}
      {items.some((c) => c.status !== 'PENDING') && (
        <>
          <strong>Earlier requests</strong>
          <ul className="hr-status-list">
            {items.filter((c) => c.status !== 'PENDING').slice(0, 5).map((c) => (
              <li key={c.changeId} className="hr-status-row">
                <strong>{contactFieldLabels[c.field]}: {c.oldValue || '—'} → {c.newValue}</strong>
                <span>{contactStatusLabels[c.status]}{c.decidedAt ? ` ${formatDateTime(c.decidedAt)}` : ''}{c.decisionNote ? `: ${c.decisionNote}` : '.'}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </SectionCard>
  );
}

interface RowProps {
  accessToken: string;
  change: ContactChange;
  userId: string | null;
  canManage: boolean;
  onDecided: () => void;
}

/** One waiting request for HR: old value, new value, Approve or Reject with a reason. */
export function ContactChangeRow({ accessToken, change, userId, canManage, onDecided }: RowProps) {
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState<ContactChange | null>(null);
  const can = contactChangeActions(change, { userId, canManage });

  const act = async (action: 'approve' | 'reject') => {
    setBusy(true);
    setError('');
    try {
      const result = await decideContactChange(accessToken, change.changeId, action, note.trim() || undefined);
      setDone(result);
      onDecided();
    } catch (problem) {
      setError(hrErrorMessage(problem));
      setBusy(false);
    }
  };

  return (
    <li className="hr-status-row">
      <strong>
        <Link to={`/hr/employees/${change.employeeId}`}>{change.employeeName}</Link> ({change.employeeCode}): {contactFieldLabels[change.field]}
      </strong>
      <span>Old: {change.oldValue || '—'}</span>
      <span>New: {change.newValue}</span>
      <span>Asked {formatDateTime(change.requestedAt)}.</span>
      {done && <span role="status">{contactStatusLabels[done.status]}. {contactLoginNote(done)}</span>}
      {error && <span className="hr-status-row__error" role="alert">{error}</span>}
      {rejecting && (
        <label className="hr-status-row__note">
          <span>Why is it rejected?</span>
          <input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
        </label>
      )}
      {!done && (can.approve || can.reject) && (
        <span className="hr-status-row__buttons">
          {!rejecting && <button type="button" className="uc01-admin-button uc01-admin-button--primary uc01-admin-button--compact" disabled={busy} onClick={() => void act('approve')}>{busy ? 'Working…' : 'Approve'}</button>}
          {!rejecting && <button type="button" className="uc01-admin-button uc01-admin-button--compact" disabled={busy} onClick={() => setRejecting(true)}>Reject</button>}
          {rejecting && <button type="button" className="uc01-admin-button uc01-admin-button--primary uc01-admin-button--compact" disabled={busy || note.trim().length < 3} onClick={() => void act('reject')}>{busy ? 'Working…' : 'Confirm reject'}</button>}
          {rejecting && <button type="button" className="uc01-admin-button uc01-admin-button--compact" disabled={busy} onClick={() => setRejecting(false)}>Back</button>}
        </span>
      )}
    </li>
  );
}
