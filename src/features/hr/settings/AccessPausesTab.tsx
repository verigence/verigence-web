import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import SectionCard from '../../../components/SectionCard';
import { hrErrorMessage } from '../../../services/hr/client';
import { listApproverPauses, restoreApproverPause, type ApproverPause } from '../../../services/hr/hrSettings';
import { formatWhen } from './settingsForm';
import { settingsKeys } from './settingsKeys';

interface Props {
  accessToken: string;
}

const TYPE_LABEL: Record<string, string> = { ATTENDANCE: 'Attendance', LEAVE: 'Leave', CLAIM: 'Reimbursement' };

/**
 * SuperAdmin: Team Leads whose Verigence access was paused at 09:00 IST on a Monday because requests
 * from the week before were still waiting on them. Restoring needs a short note and is recorded.
 */
export default function AccessPausesTab({ accessToken }: Props) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [notice, setNotice] = useState('');
  const [problem, setProblem] = useState('');

  const query = useQuery({
    queryKey: settingsKeys.approverPauses,
    queryFn: () => listApproverPauses(accessToken),
    retry: false,
    refetchOnWindowFocus: false,
  });

  const restore = useMutation({
    mutationFn: (pause: ApproverPause) => restoreApproverPause(accessToken, pause.pauseId, note.trim()),
    onSuccess: (pause) => {
      setProblem('');
      setNotice(`${pause.name}'s access is restored.`);
      setOpen(null);
      setNote('');
    },
    onError: (error) => {
      setNotice('');
      setProblem(hrErrorMessage(error));
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: settingsKeys.approverPauses }),
  });

  const items = query.data?.items ?? [];
  const active = items.filter((p) => !p.restoredAt);
  const past = items.filter((p) => p.restoredAt);

  return (
    <div className="hr-sections">
      <p className="hrs-intro">
        Requests raised in a week (Monday to Sunday) must be decided by 09:00 on the following Monday. A Team Lead
        with any still waiting then is paused from all of Verigence until you restore them here.
      </p>

      {query.isLoading && <div className="uc01-admin-state">Loading…</div>}
      {query.isError && (
        <div className="uc01-admin-state uc01-admin-state--error" role="alert">
          <strong>The paused Team Leads could not be loaded.</strong>
          <span>{hrErrorMessage(query.error)}</span>
          <button type="button" className="uc01-admin-button" onClick={() => query.refetch()} disabled={query.isFetching}>Try again</button>
        </div>
      )}

      {notice && <div className="uc01-admin-message uc01-admin-message--success" role="status">{notice}</div>}
      {problem && <div className="uc01-admin-message uc01-admin-message--error" role="alert">{problem}</div>}

      {query.isSuccess && active.length === 0 && <p className="hr-muted">No Team Lead is paused.</p>}

      {active.map((p) => (
        <SectionCard
          key={p.pauseId}
          title={p.employeeCode ? `${p.name} (${p.employeeCode})` : p.name}
          action={<span className="uc01-admin-status uc01-admin-status--suspended">Paused</span>}
        >
          <dl className="hrs-facts">
            <div><dt>Missed deadline</dt><dd>{formatWhen(p.deadlineAt)}</dd></div>
            <div><dt>Requests late</dt><dd>{p.overdueCount}</dd></div>
            <div><dt>Paused at</dt><dd>{formatWhen(p.pausedAt)}</dd></div>
          </dl>
          {!p.pausedInSecurity && (
            <div className="uc01-admin-message uc01-admin-message--error hrs-last-error">
              <strong>Security did not apply the pause</strong>
              <span>{p.securityError ?? 'Unknown reason'}. This person can still sign in.</span>
            </div>
          )}
          <ul className="hrs-pause-items">
            {p.overdueItems.map((i) => (
              <li key={`${i.type}-${i.id}`}>
                {TYPE_LABEL[i.type] ?? i.type}: {i.employeeName}, {i.detail.replace(/_/g, ' ').toLowerCase()} for {i.forDate}
              </li>
            ))}
          </ul>
          {open === p.pauseId ? (
            <div className="hr-field">
              <label htmlFor={`hrs-restore-${p.pauseId}`}>Note<span className="hr-field__required"> *</span></label>
              <textarea
                id={`hrs-restore-${p.pauseId}`}
                rows={2}
                maxLength={500}
                value={note}
                placeholder="Why you are restoring access, e.g. spoke to them, requests cleared"
                onChange={(e) => setNote(e.target.value)}
              />
              <div className="hr-actions">
                <button
                  type="button"
                  className="uc01-admin-button uc01-admin-button--primary hrs-touch"
                  disabled={restore.isPending || note.trim().length < 3}
                  onClick={() => restore.mutate(p)}
                >
                  {restore.isPending ? 'Restoring…' : 'Restore access'}
                </button>
                <button type="button" className="uc01-admin-button hrs-touch" disabled={restore.isPending} onClick={() => { setOpen(null); setNote(''); }}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="hr-actions">
              <button type="button" className="uc01-admin-button hrs-touch" onClick={() => { setOpen(p.pauseId); setNote(''); setNotice(''); setProblem(''); }}>
                Restore access…
              </button>
            </div>
          )}
        </SectionCard>
      ))}

      {past.length > 0 && (
        <SectionCard title="Restored in the last 60 days">
          <ul className="hrs-pause-items">
            {past.map((p) => (
              <li key={p.pauseId}>
                {p.name}: paused {formatWhen(p.pausedAt)}, restored {formatWhen(p.restoredAt)}
                {p.restoreNote ? ` (“${p.restoreNote}”)` : ''}
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </div>
  );
}
