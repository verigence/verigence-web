import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  closeJourneyAsReviewer,
  CLOSURE_KIND_LABEL,
  getReviewerClosure,
  unansweredItems,
  type ClosureItemKind,
} from '../../../services/audit-core/reviewerClosure';

const KINDS: ClosureItemKind[] = ['MISSING_DOCUMENT', 'OPEN_FINDING', 'OPEN_TASK'];

/**
 * "Close journey" for a Reviewer (product owner 2026-11-04). Lists every
 * mandatory document not on file, every reported violation not resolved and
 * every other open task, each with its own answer box; the close goes through
 * only when each has a specific answer. The Delivery is then completed and the
 * Team Lead reviews it; the summary is added to the compliance report.
 */
export default function ReviewerCloseJourney({ tenantId, journeyId, accessToken, onDone }: {
  tenantId: string;
  journeyId: string;
  accessToken?: string;
  onDone?: (message: string, tone: 'success' | 'error') => void;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();
  const preview = useQuery({
    queryKey: ['p2-reviewer-closure', tenantId, journeyId],
    queryFn: () => getReviewerClosure(tenantId, journeyId, accessToken),
    enabled: open,
    staleTime: 0,
  });

  if (!open) {
    return (
      <button type="button" className="p2w-button p2w-button--secondary" onClick={() => setOpen(true)}
        title="Close the journey with a reason for every open item. The summary is added to the audit report.">
        Close journey
      </button>
    );
  }

  const data = preview.data;
  const min = data?.minAnswerLength ?? 10;
  const items = data?.items ?? [];
  const missing = data ? unansweredItems(items, answers, min) : [];
  const commentShort = comment.trim().length < min;

  const submit = async () => {
    if (!data || missing.length || commentShort) return;
    setBusy(true);
    setProblem(undefined);
    try {
      const result = await closeJourneyAsReviewer(tenantId, journeyId, comment, answers, accessToken);
      for (const key of ['p2-documents', 'p2-stage', 'p2-360', 'p2-tasks', 'p2-journeys', 'p2-reviewer-closure']) {
        void queryClient.invalidateQueries({ queryKey: [key, tenantId] });
        void queryClient.invalidateQueries({ queryKey: [key, tenantId, journeyId] });
      }
      onDone?.(`Journey closed with ${result.itemCount} answered item${result.itemCount === 1 ? '' : 's'}. `
        + `The Team Lead accepts it or rejects items; it is accepted automatically after ${data.acceptanceWindowHours} hours.`, 'success');
      setOpen(false);
      setAnswers({});
      setComment('');
    } catch (cause) {
      setProblem(cause instanceof Error && cause.message ? cause.message : 'The journey could not be closed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p2w-review" role="dialog" aria-label="Close journey" style={{ display: 'grid', gap: 12 }}>
      <strong>Close this journey</strong>
      {preview.isLoading ? <p className="p2w-muted">Reading what is open…</p> : null}
      {preview.isError ? <div className="form-alert form-alert--error">What is open could not be read.</div> : null}
      {data?.reviewed ? (
        <p className="p2w-muted">This journey is already closed and reviewed
          {data.lastClosure ? ` (closure ${data.lastClosure.acceptanceStatus === 'PENDING' ? 'awaiting the Team Lead' : data.lastClosure.acceptanceStatus.toLowerCase().replace('_', '-')})` : ''}.</p>
      ) : null}
      {data?.blockers.length ? (
        <div className="form-alert form-alert--error">{data.blockers.map((b) => <div key={b}>{b}</div>)}</div>
      ) : null}
      {data && !items.length ? <p className="p2w-muted">Nothing is open on this journey.</p> : null}
      {KINDS.map((kind) => {
        const group = items.filter((item) => item.kind === kind);
        if (!group.length) return null;
        return (
          <section key={kind} style={{ display: 'grid', gap: 8 }}>
            <h4 style={{ margin: 0 }}>{CLOSURE_KIND_LABEL[kind]} ({group.length})</h4>
            {group.map((item) => (
              <label key={item.key} className="p2w-field">
                <span>
                  <strong>{item.label}</strong>
                  {item.stage ? <span className="p2w-muted"> · {item.stage.toLowerCase()}</span> : null}
                  {item.severity ? <span className="p2w-muted"> · {item.severity.toLowerCase()}</span> : null}
                  {item.detail ? <small className="p2w-muted" style={{ display: 'block' }}>{item.detail}</small> : null}
                  {item.rejection ? (
                    <small className="p2w-tone p2w-tone--danger" style={{ display: 'block' }}>
                      Rejected by the Team Lead: {item.rejection.reason}
                      {item.rejection.previousAnswer ? ` (your answer was: ${item.rejection.previousAnswer})` : ''}
                    </small>
                  ) : null}
                </span>
                <textarea rows={2} maxLength={2000} value={answers[item.key] ?? ''}
                  placeholder={item.prefilledAnswer ?? `Why this was not acted on (at least ${min} characters)`}
                  onChange={(event) => setAnswers({ ...answers, [item.key]: event.target.value })} />
                {item.prefilledAnswer && !(answers[item.key] ?? '').trim()
                  ? <small className="p2w-muted">{item.carried
                    ? 'Accepted by the Team Lead last time: kept unless you write a new answer.'
                    : 'Answered by the accepted claim unless you write your own.'}</small> : null}
              </label>
            ))}
          </section>
        );
      })}
      <label className="p2w-field">
        <span>Closing comment</span>
        <textarea rows={2} maxLength={4000} value={comment} onChange={(event) => setComment(event.target.value)}
          placeholder="For example: delivery confirmed with the outlet; every open item answered above." />
      </label>
      {data && (missing.length || commentShort) ? (
        <small className="p2w-muted">
          {missing.length ? `${missing.length} item${missing.length === 1 ? '' : 's'} still need${missing.length === 1 ? 's' : ''} an answer. ` : ''}
          {commentShort ? 'Write the closing comment.' : ''}
        </small>
      ) : null}
      {problem ? <div className="form-alert form-alert--error">{problem}</div> : null}
      <div className="p2w-row" style={{ gap: 8 }}>
        <button type="button" className="uc02-button uc02-button--primary"
          disabled={busy || !data?.canClose || missing.length > 0 || commentShort} onClick={() => void submit()}>
          {busy ? 'Closing…' : 'Close journey'}
        </button>
        <button type="button" className="p2w-button p2w-button--ghost" disabled={busy} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}
