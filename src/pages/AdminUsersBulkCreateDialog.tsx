import { useMemo, useState } from 'react';

import { createGlobalUser, type GlobalUserDirectoryItem } from '../services/security/onboardingAdmin';
import { planBulkCreate, type BulkCreateRow, type BulkCreateStatus } from './adminUsersBulkCreate';

type Outcome = { status: 'CREATED' | 'FAILED'; message: string };

const STATUS_LABEL: Record<BulkCreateStatus, string> = {
  NEW: 'New', DUPLICATE: 'Repeated', EXISTS: 'Exists', PENDING: 'Pending', ERROR: 'Error',
};

/**
 * Paste rows from Excel (Name, Mobile, Email, Password), check the preview, create.
 * Users are created ACTIVE by Security without self-registration OTP.
 */
export default function AdminUsersBulkCreateDialog({ accessToken, existingUsers, onClose, onCreated }: {
  accessToken: string;
  existingUsers: GlobalUserDirectoryItem[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [text, setText] = useState('');
  const [plan, setPlan] = useState<BulkCreateRow[] | null>(null);
  const [outcomes, setOutcomes] = useState<Record<number, Outcome>>({});
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const running = Boolean(progress && progress.done < progress.total);
  const finished = Boolean(progress && progress.done === progress.total);

  const toCreate = useMemo(() => (plan ?? []).filter((row) => row.input), [plan]);
  const counts = useMemo(() => {
    const result: Partial<Record<BulkCreateStatus, number>> = {};
    (plan ?? []).forEach((row) => { result[row.status] = (result[row.status] ?? 0) + 1; });
    return result;
  }, [plan]);
  const created = Object.values(outcomes).filter((o) => o.status === 'CREATED').length;
  const failed = Object.values(outcomes).filter((o) => o.status === 'FAILED').length;

  const preview = () => {
    setOutcomes({});
    setProgress(null);
    setPlan(planBulkCreate(text, existingUsers));
  };

  const create = async () => {
    const queue = toCreate.filter((row) => outcomes[row.line]?.status !== 'CREATED');
    if (!queue.length) return;
    setProgress({ done: 0, total: queue.length });
    for (const [index, row] of queue.entries()) {
      let outcome: Outcome;
      try {
        await createGlobalUser(accessToken, row.input!);
        outcome = { status: 'CREATED', message: 'Created — can sign in now.' };
      } catch (error) {
        outcome = { status: 'FAILED', message: error instanceof Error ? error.message : 'Create failed.' };
      }
      setOutcomes((current) => ({ ...current, [row.line]: outcome }));
      setProgress({ done: index + 1, total: queue.length });
    }
    onCreated();
  };

  const pending = toCreate.filter((row) => outcomes[row.line]?.status !== 'CREATED').length;

  return (
    <div className="uc01-admin-dialog-backdrop" role="presentation">
      <section className="uc01-admin-dialog uc01-admin-dialog--wide" role="dialog" aria-modal="true"
        aria-labelledby="uc01-bulk-create-title">
        <div>
          <span className="eyebrow">User Lifecycle</span>
          <h2 id="uc01-bulk-create-title">Bulk create users</h2>
          <p>
            Copy the rows from Excel — columns <strong>Name, Mobile, Email, Password</strong> — and paste them below.
            Users are created <strong>Active</strong> with a verified email, without the registration OTP, and can
            sign in straight away. Repeated rows are skipped; existing users are not changed.
          </p>
        </div>

        {!plan && (
          <label className="uc01-admin-reason">
            <span>Rows from Excel</span>
            <textarea
              className="uc01-admin-bulkpaste"
              value={text}
              spellCheck={false}
              autoComplete="off"
              onChange={(event) => setText(event.target.value)}
              placeholder={'Name\tMobile\tEmail\tPassword'}
            />
          </label>
        )}

        {plan && (
          <>
            <div className="uc01-admin-bulksummary" role="status" aria-live="polite">
              <span><strong>{toCreate.length}</strong> to create</span>
              {(['DUPLICATE', 'EXISTS', 'PENDING', 'ERROR'] as const).map((status) => counts[status]
                ? <span key={status}>{counts[status]} {STATUS_LABEL[status].toLowerCase()}</span> : null)}
              {progress && <span>{progress.done} of {progress.total} processed · {created} created{failed ? ` · ${failed} failed` : ''}</span>}
            </div>
            {progress && <progress className="uc01-admin-bulkbar-progress" max={progress.total} value={progress.done} />}
            <div className="uc01-admin-table-wrap uc01-admin-bulkpreview">
              <table className="uc01-admin-table">
                <thead>
                  <tr><th>Line</th><th>Name</th><th>Mobile</th><th>Email</th><th>Result</th></tr>
                </thead>
                <tbody>
                  {plan.map((row) => {
                    const outcome = outcomes[row.line];
                    const tone = outcome ? outcome.status.toLowerCase() : row.status.toLowerCase();
                    return (
                      <tr key={row.line}>
                        <td data-label="Line">{row.line}</td>
                        <td data-label="Name"><strong>{row.name || '—'}</strong></td>
                        <td data-label="Mobile">{row.mobile || '—'}</td>
                        <td data-label="Email">{row.email || '—'}</td>
                        <td data-label="Result">
                          <span className={`uc01-admin-bulktag uc01-admin-bulktag--${tone}`}>
                            {outcome ? (outcome.status === 'CREATED' ? 'Created' : 'Failed') : STATUS_LABEL[row.status]}
                          </span>
                          {(outcome?.message || row.message) && <small>{outcome?.message || row.message}</small>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="uc01-admin-dialog__actions">
          {!plan && (
            <>
              <button type="button" className="uc01-admin-button" onClick={onClose}>Cancel</button>
              <button type="button" className="uc01-admin-button uc01-admin-button--primary" disabled={!text.trim()}
                onClick={preview}>Check rows</button>
            </>
          )}
          {plan && (
            <>
              <button type="button" className="uc01-admin-button" disabled={running}
                onClick={() => { setPlan(null); setProgress(null); setOutcomes({}); }}>
                Edit rows
              </button>
              {finished && pending === 0 ? (
                <button type="button" className="uc01-admin-button uc01-admin-button--primary" onClick={onClose}>Done</button>
              ) : (
                <button type="button" className="uc01-admin-button uc01-admin-button--primary"
                  disabled={running || pending === 0} onClick={() => void create()}>
                  {running ? 'Creating…' : finished ? `Retry ${pending} failed` : `Create ${pending} user${pending === 1 ? '' : 's'}`}
                </button>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
