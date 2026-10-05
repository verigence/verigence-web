import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { hrErrorMessage } from '../../services/hr/client';
import {
  createMissingLogins,
  syncEmployeeUsers,
  type EmployeeSyncItem,
  type EmployeeSyncResult,
  type LoginCreateResult,
} from '../../services/hr/employees';
import { blockedLabel, creatable, inGroups, shouldStop, totals } from './loginSync';

const ATTENTION: Record<string, string> = {
  EMPLOYEE_ACTIVE_USER_SUSPENDED: 'The employee is active but the login is suspended. Not changed; reinstate it yourself if that is right.',
  USER_PENDING_APPROVAL: 'The login is waiting for you to allow it (Pending Approvals).',
  EMPLOYEE_NOT_ACTIVE_USER_PENDING: 'The employee is not active but the login is still pending. Not changed.',
};
const UNMATCHED: Record<string, string> = {
  NO_LOGIN: 'No Verigence user has this email.',
  LINKED_USER_MISSING: 'The linked Verigence user no longer exists.',
  LOGIN_IN_USE: 'The matching user is already linked to another employee.',
};

function actions(item: EmployeeSyncItem): string {
  const parts: string[] = [];
  if (item.link) parts.push('link to the employee record');
  if (item.tick) parts.push('tick Is employee');
  if (item.suspend) parts.push('suspend the user (employee is not active)');
  return parts.join(', ');
}

function done(item: EmployeeSyncItem): string {
  if (!item.done) return '';
  const parts: string[] = [];
  if (item.done.linked) parts.push('linked');
  if (item.done.ticked) parts.push('Is employee ticked');
  if (item.done.suspended) parts.push('suspended');
  if (item.done.note === 'SUPER_ADMIN_PROTECTED') parts.push('not suspended: this is the SuperAdmin');
  if (item.done.note === 'NOT_ACTIVE') parts.push('not suspended: user was not active');
  return parts.join(', ') || 'no change needed';
}

interface Props {
  accessToken: string;
  onClose: () => void;
  /** Called after changes were applied so the user list can reload. */
  onApplied: () => void;
}

/**
 * Sync Employee Information. First a preview of what would change; nothing is changed until the
 * person presses Apply. One request per press, never retried automatically.
 */
export default function EmployeeSyncDialog({ accessToken, onClose, onApplied }: Props) {
  const [result, setResult] = useState<EmployeeSyncResult | null>(null);
  const [busy, setBusy] = useState<'preview' | 'apply' | 'create' | null>('preview');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const [createResults, setCreateResults] = useState<LoginCreateResult[] | null>(null);
  // Leaving the page stops the next group from starting; a request already sent is not taken back.
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const run = async (apply: boolean) => {
    setBusy(apply ? 'apply' : 'preview');
    setError('');
    try {
      const data = await syncEmployeeUsers(accessToken, apply);
      setResult(data);
      if (apply) onApplied();
    } catch (problem) {
      setError(hrErrorMessage(problem));
    } finally {
      setBusy(null);
    }
  };

  /** Creates the missing logins, five employees per request, one attempt each, never repeated. */
  const createLogins = async () => {
    if (!result) return;
    const people = creatable(result.unmatched);
    const names = new Map(people.map((p) => [p.employeeId, p.name]));
    const done: LoginCreateResult[] = [];
    setBusy('create');
    setError('');
    setCreateResults([]);
    try {
      for (const group of inGroups(people.map((p) => p.employeeId))) {
        if (!alive.current) return;
        setProgress(`Creating logins… ${done.length} of ${people.length} done`);
        const data = await createMissingLogins(accessToken, group);
        done.push(...data.results.map((r) => ({ ...r, name: r.name ?? names.get(r.employeeId) ?? null })));
        setCreateResults([...done]);
        if (shouldStop(data.results)) break;
      }
    } catch (problem) {
      setError(`${hrErrorMessage(problem)} ${done.length} of ${people.length} were handled. Nothing was repeated; press Check again to see what is left.`);
    } finally {
      if (alive.current) {
        setBusy(null);
        setProgress('');
      }
      if (done.length > 0) onApplied();
    }
  };

  useEffect(() => {
    void run(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const s = result?.summary;
  const nothingToDo = Boolean(s && s.toLink === 0 && s.toTick === 0 && s.toSuspend === 0);

  return (
    <div className="uc01-admin-dialog-backdrop" role="presentation">
      <section className="uc01-admin-dialog" role="dialog" aria-modal="true" aria-labelledby="hr-sync-title" style={{ maxWidth: 720, maxHeight: '92vh', overflowY: 'auto' }}>
        <p className="uc01-admin-dialog__eyebrow">HR</p>
        <h2 id="hr-sync-title">Sync Employee Information</h2>
        <p>
          Matches HR employees with Verigence users by email. Matched users get <strong>Is employee</strong> ticked and are linked to the
          employee record. If an employee is not active, their active user is <strong>suspended</strong>. Nobody is reactivated, and the
          SuperAdmin is never suspended. Users who are not employees are left alone.
        </p>
        <p>
          An active employee who has no Verigence user can be given one here. The login is ready to use and needs no approval. The password
          is made by the system and is not shown; send the Welcome email afterwards.
        </p>

        {busy === 'preview' && <div className="uc01-admin-state">Checking HR and the user list…</div>}
        {error && <div className="uc01-admin-message uc01-admin-message--error" role="alert">{error}</div>}

        {result && s && (
          <>
            <div className="uc01-admin-message uc01-admin-message--success" role="status">
              {result.applied
                ? 'Done. The changes below were applied.'
                : nothingToDo
                  ? 'Everything is already in sync. Nothing to change.'
                  : 'This is a preview. Nothing has been changed yet.'}
            </div>
            <dl className="uc01-admin-dialog__facts">
              <div><dt>Employees in HR</dt><dd>{s.employees}</dd></div>
              <div><dt>Matched to a Verigence user</dt><dd>{s.matched}</dd></div>
              <div><dt>{result.applied ? 'Linked' : 'To link'}</dt><dd>{s.toLink}</dd></div>
              <div><dt>{result.applied ? 'Is employee ticked' : 'To tick Is employee'}</dt><dd>{s.toTick}</dd></div>
              <div><dt>{result.applied ? 'Suspended' : 'To suspend'}</dt><dd>{s.toSuspend}</dd></div>
              <div><dt>Employees with no usable login</dt><dd>{s.unmatched}</dd></div>
              <div><dt>Need your attention</dt><dd>{s.needAttention}</dd></div>
              <div><dt>Login email is not the HR email</dt><dd>{s.emailDiffers}</dd></div>
              <div><dt>Logins that can be created</dt><dd>{s.toCreate}</dd></div>
            </dl>

            {result.items.length > 0 && (
              <div style={{ maxHeight: '32vh', overflow: 'auto', border: '1px solid #e4e7ec', borderRadius: 10 }}>
                <ul className="uc01-admin-bulklist" style={{ maxHeight: 'none', border: 0 }}>
                  {result.items.map((item) => (
                    <li key={item.employeeId} style={{ flexDirection: 'column', gap: 2 }}>
                      <strong>{item.name} <small>({item.code}, {item.employmentStatus.toLowerCase()}, user {item.userStatus.toLowerCase()})</small></strong>
                      {result.applied ? <span style={{ textAlign: 'left' }}>{done(item)}</span> : actions(item) && <span style={{ textAlign: 'left' }}>Will {actions(item)}</span>}
                      {item.emailDiffers && <span style={{ textAlign: 'left', color: '#93370d' }}>The login email is {item.userEmail}. HR has a different email for this employee.</span>}
                      {item.attention.map((a) => <span key={a} style={{ textAlign: 'left', color: '#93370d' }}>{ATTENTION[a] ?? a}</span>)}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {result.unmatched.length > 0 && (
              <details>
                <summary>{result.unmatched.length} employee(s) without a usable login</summary>
                <ul className="uc01-admin-bulklist">
                  {result.unmatched.map((u) => (
                    <li key={u.employeeId}>
                      <strong>{u.name} ({u.code})</strong>
                      <span>{UNMATCHED[u.reason] ?? u.reason}{u.blocked ? ` ${blockedLabel(u.blocked)}` : ''}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {createResults && (
              <div className="uc01-admin-message uc01-admin-message--success" role="status">
                {(() => {
                  const t = totals(createResults);
                  return `Logins created: ${t.created}. Not created: ${t.skipped + t.failed}.`;
                })()}
                {createResults.some((r) => r.outcome === 'CREATED') && (
                  <> Next, send them the Welcome email from <Link to="/hr/messages">Messages</Link>.</>
                )}
                <ul className="uc01-admin-bulklist" style={{ maxHeight: 'none', border: 0 }}>
                  {createResults.filter((r) => r.outcome !== 'CREATED').map((r) => (
                    <li key={r.employeeId}><strong>{r.name ?? r.employeeId}{r.code ? ` (${r.code})` : ''}</strong><span>{blockedLabel(r.reason)}</span></li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
        {busy === 'create' && progress && <div className="uc01-admin-state" role="status">{progress}</div>}

        <div className="uc01-admin-dialog__actions">
          <button type="button" className="uc01-admin-button" disabled={busy !== null} onClick={onClose}>
            {result?.applied ? 'Close' : 'Cancel'}
          </button>
          {!result?.applied && (
            <button type="button" className="uc01-admin-button" disabled={busy !== null} onClick={() => void run(false)}>
              Check again
            </button>
          )}
          {result && !result.applied && s && s.toCreate > 0 && !createResults && (
            <button type="button" className="uc01-admin-button uc01-admin-button--primary" disabled={busy !== null} onClick={() => void createLogins()}>
              {busy === 'create' ? 'Creating…' : `Create ${s.toCreate} ${s.toCreate === 1 ? 'login' : 'logins'}`}
            </button>
          )}
          {result && !result.applied && !nothingToDo && (
            <button type="button" className="uc01-admin-button uc01-admin-button--primary" disabled={busy !== null} onClick={() => void run(true)}>
              {busy === 'apply' ? 'Applying…' : 'Apply changes'}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
