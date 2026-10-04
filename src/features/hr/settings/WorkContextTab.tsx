import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import SectionCard from '../../../components/SectionCard';
import { hrErrorMessage, HrHttpError } from '../../../services/hr/client';
import { getWorkContextStatus, refreshWorkContext } from '../../../services/hr/hrSettings';
import { formatWhen } from './settingsForm';
import { settingsKeys } from './settingsKeys';

interface Props {
  accessToken: string;
}

function statusClass(status: string | null): string {
  if (status === 'OK') return 'active';
  if (status === 'FAILED') return 'suspended';
  return 'rejected';
}

function statusText(status: string | null): string {
  if (status === 'OK') return 'Working';
  if (status === 'FAILED') return 'Last attempt failed';
  return 'Not run yet';
}

export default function WorkContextTab({ accessToken }: Props) {
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState('');
  const [problem, setProblem] = useState('');

  const query = useQuery({
    queryKey: settingsKeys.workContext,
    queryFn: () => getWorkContextStatus(accessToken),
    retry: false,
    refetchOnWindowFocus: false,
  });

  // One attempt per click. When the service says it is too soon, its message is shown as it is.
  const refresh = useMutation({
    mutationFn: () => refreshWorkContext(accessToken),
    onSuccess: (result) => {
      if (result.ok) {
        setProblem('');
        setNotice(result.assignmentsSeen === 1 ? 'Refreshed. 1 assignment seen.' : `Refreshed. ${result.assignmentsSeen} assignments seen.`);
      } else {
        setNotice('');
        setProblem(result.error ? `Audit Core could not be read: ${result.error}` : 'Audit Core could not be read.');
      }
    },
    onError: (error) => {
      setNotice('');
      setProblem(
        error instanceof HrHttpError && error.code === 'WORK_CONTEXT_TOO_SOON'
          ? error.message
          : hrErrorMessage(error),
      );
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: settingsKeys.workContext }),
  });

  const s = query.data;

  return (
    <div className="hr-sections">
      <p className="hrs-intro">
        HR keeps a copy of who works on which project and outlet, taken from Audit Core. It is set to refresh by
        itself about once a day. You can refresh it now, but the service allows one refresh every five minutes.
      </p>

      {query.isLoading && <div className="uc01-admin-state">Loading status…</div>}
      {query.isError && (
        <div className="uc01-admin-state uc01-admin-state--error" role="alert">
          <strong>The sync status could not be loaded.</strong>
          <span>{hrErrorMessage(query.error)}</span>
          <button type="button" className="uc01-admin-button" onClick={() => query.refetch()} disabled={query.isFetching}>Try again</button>
        </div>
      )}

      {s && (
        <SectionCard
          title="Sync from Audit Core"
          action={<span className={`uc01-admin-status uc01-admin-status--${statusClass(s.lastStatus)}`}>{statusText(s.lastStatus)}</span>}
        >
          <dl className="hrs-facts">
            <div><dt>Last successful refresh</dt><dd>{formatWhen(s.lastSuccessAt)}</dd></div>
            <div><dt>Last attempt</dt><dd>{formatWhen(s.lastAttemptAt)}</dd></div>
            <div><dt>Assignments seen</dt><dd>{s.assignmentsSeen ?? '—'}</dd></div>
          </dl>
          {s.lastError && (
            <div className="uc01-admin-message uc01-admin-message--error hrs-last-error">
              <strong>Last error</strong>
              <span>{s.lastError}</span>
            </div>
          )}
          {!s.lastError && s.lastStatus === null && <p className="hr-muted">The copy has not been refreshed yet.</p>}
        </SectionCard>
      )}

      {notice && <div className="uc01-admin-message uc01-admin-message--success" role="status">{notice}</div>}
      {problem && <div className="uc01-admin-message uc01-admin-message--error" role="alert">{problem}</div>}

      <div className="hr-actions">
        <button type="button" className="uc01-admin-button uc01-admin-button--primary hrs-touch" disabled={refresh.isPending} onClick={() => { setNotice(''); setProblem(''); refresh.mutate(); }}>
          {refresh.isPending ? 'Refreshing…' : 'Refresh now'}
        </button>
        <button type="button" className="uc01-admin-button hrs-touch" disabled={query.isFetching || refresh.isPending} onClick={() => query.refetch()}>
          {query.isFetching ? 'Checking…' : 'Reload status'}
        </button>
      </div>
    </div>
  );
}
