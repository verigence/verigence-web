import SectionCard from '../../../components/SectionCard';
import {
  channelText,
  countLabel,
  reasonLabel,
  resultStatusClass,
  resultStatusText,
  summariseSend,
  templateText,
} from './messagePlan';
import { notFinishedIds, notSentIds, type RunBatch, type RunState } from './useSendRun';

interface Props {
  run: RunState;
  onStop: () => void;
  onSendRest: (ids: string[]) => void;
  onSelectNotSent: (ids: string[]) => void;
  onClear: () => void;
}

function peopleDone(run: RunState): number {
  return run.batches.filter((b) => b.status === 'done').reduce((n, b) => n + b.ids.length, 0);
}

function groupTitle(batch: RunBatch, index: number, total: number): string {
  return total === 1 ? 'Results' : `Group ${index + 1} of ${total}`;
}

const batchStatusText: Record<RunBatch['status'], string> = {
  waiting: 'Waiting',
  sending: 'Sending…',
  done: 'Finished',
  failed: 'Did not finish',
};
const batchStatusClass: Record<RunBatch['status'], string> = {
  waiting: 'rejected',
  sending: 'pending',
  done: 'active',
  failed: 'suspended',
};

export default function SendRunPanel({ run, onStop, onSendRest, onSelectNotSent, onClear }: Props) {
  const total = run.batches.reduce((n, b) => n + b.ids.length, 0);
  const done = peopleDone(run);
  const running = run.phase === 'running';
  const allResults = run.batches.flatMap((b) => b.results);
  const summary = summariseSend(allResults);
  const rest = notFinishedIds(run);
  const notSent = notSentIds(run);
  const current = run.batches.findIndex((b) => b.status === 'sending');
  const nameOf = (id: string, fallback: string | null) => run.people[id]?.name ?? fallback ?? 'Unknown user';

  return (
    <SectionCard
      title={running ? 'Sending…' : 'Send results'}
      description={`${templateText[run.template]} by ${channelText[run.channel] ?? run.channel}`}
      className="hrm-run"
    >
      <div className="hr-progress" role="status" aria-live="polite">
        <progress max={total} value={done} aria-label="Sending progress" />
        <span>
          {running
            ? `${done} of ${countLabel(total, 'user', 'users')} done${current >= 0 ? ` (sending group ${current + 1} of ${run.batches.length})` : ''}. Please keep this page open.`
            : `${done} of ${countLabel(total, 'user', 'users')} were processed.`}
        </span>
      </div>

      {running && (
        <div className="hr-actions">
          <button type="button" className="uc01-admin-button" onClick={onStop}>Stop after this group</button>
        </div>
      )}

      {allResults.length > 0 && (
        <div className="hrm-summary" aria-label="Totals so far">
          <span className="uc01-admin-status uc01-admin-status--active">{summary.sent} sent</span>
          <span className="uc01-admin-status uc01-admin-status--pending">{summary.skipped} skipped</span>
          <span className="uc01-admin-status uc01-admin-status--suspended">{summary.failed} not sent</span>
        </div>
      )}

      {run.phase === 'failed' && (
        <div className="uc01-admin-message uc01-admin-message--error" role="alert">
          The run stopped because a request failed. Nothing more was sent. {countLabel(rest.length, 'user was', 'users were')} not
          confirmed as sent (listed below). You decide whether to send to them again.
        </div>
      )}
      {run.phase === 'stopped' && (
        <div className="uc01-admin-message uc01-admin-message--info" role="status">
          You stopped the run. {countLabel(rest.length, 'user was', 'users were')} not sent yet.
        </div>
      )}
      {run.phase === 'done' && notSent.length === 0 && (
        <div className="uc01-admin-message uc01-admin-message--success" role="status">Everyone received the message.</div>
      )}

      <ol className="hrm-groups">
        {run.batches.map((batch, index) => (
          <li key={batch.ids.join(',')} className="hrm-group">
            <div className="hrm-group__head">
              <strong>{groupTitle(batch, index, run.batches.length)}</strong>
              <span className={`uc01-admin-status uc01-admin-status--${batchStatusClass[batch.status]}`}>{batchStatusText[batch.status]}</span>
            </div>
            {batch.status === 'failed' && (
              <div className="hrm-group__error" role="alert">
                <p>{batch.error}</p>
                <p>
                  {batch.maybeSent
                    ? 'We cannot tell whether some of these users were sent. Check the History tab before sending to them again.'
                    : 'Nothing was sent to these users.'}
                </p>
              </div>
            )}
            {batch.results.length > 0 ? (
              <ul className="hrm-results">
                {batch.results.map((r) => (
                  <li key={r.userId} className="hrm-result">
                    <div className="hrm-result__top">
                      <strong>{nameOf(r.userId, r.name)}</strong>
                      <span className={`uc01-admin-status uc01-admin-status--${resultStatusClass[r.status]}`}>{resultStatusText[r.status]}</span>
                    </div>
                    {r.message && <p className="hrm-result__message">{r.message}</p>}
                    {r.code && (
                      <small className="hrm-result__code">{reasonLabel(r.code)} <span>({r.code})</span></small>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="hrm-results">
                {batch.ids.map((id) => (
                  <li key={id} className="hrm-result hrm-result--plain">
                    <strong>{nameOf(id, null)}</strong>
                    <span className="hr-muted">
                      {batch.status === 'waiting' ? 'Not sent yet' : batch.status === 'sending' ? 'Being sent…' : batch.maybeSent ? 'Not confirmed' : 'Not sent'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>

      {!running && (
        <div className="hr-actions hrm-run__actions">
          {rest.length > 0 && (
            <button type="button" className="uc01-admin-button uc01-admin-button--primary" onClick={() => onSendRest(rest)}>
              Send to the {countLabel(rest.length, 'user', 'users')} not finished
            </button>
          )}
          {notSent.length > 0 && (
            <button type="button" className="uc01-admin-button" onClick={() => onSelectNotSent(notSent)}>
              Select the {countLabel(notSent.length, 'user', 'users')} not sent
            </button>
          )}
          <button type="button" className="uc01-admin-button" onClick={onClear}>Clear results</button>
        </div>
      )}
    </SectionCard>
  );
}
