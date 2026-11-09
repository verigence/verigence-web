import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  closeJourneyAsReviewer,
  CLOSURE_KIND_LABEL,
  getReviewerClosure,
  incompleteAdded,
  initialChoices,
  recheckBeforeClosing,
  SEVERITIES,
  SEVERITY_LABEL,
  standingCounts,
  undecidedItems,
  type AddedObservation,
  type ClosureItem,
  type ClosureItemKind,
  type ObservationChoice,
  type ObservationSeverity,
} from '../../../services/audit-core/reviewerClosure';

const KINDS: ClosureItemKind[] = ['MISSING_DOCUMENT', 'OPEN_FINDING', 'CONFIRMED_FINDING', 'OPEN_TASK', 'NOTE'];

function SeverityPicker({ name, value, onChange }: {
  name: string; value?: ObservationSeverity | null; onChange: (severity: ObservationSeverity) => void;
}) {
  return (
    <div className="p2w-obs__severity" role="radiogroup" aria-label="Severity">
      {SEVERITIES.map((severity) => (
        <label key={severity} className={`p2w-obs__sev is-${severity.toLowerCase()}${value === severity ? ' is-on' : ''}`}>
          <input type="radio" name={name} checked={value === severity} onChange={() => onChange(severity)} />
          {SEVERITY_LABEL[severity]}
        </label>
      ))}
    </div>
  );
}

/**
 * "Close journey" for a Reviewer (product owner 2026-11-04, observations
 * 2026-11-09). Every missing document, unresolved finding, confirmed breach,
 * open task and note is listed with a suggested severity. The Reviewer marks
 * each as an observation (High / Medium / Low, an optional note) or not one
 * (with a justification), adds observations of their own and any additional
 * remarks. The Delivery is then completed and the Team Lead accepts or rejects
 * items; it all goes into the journey's audit report.
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
  const [remarks, setRemarks] = useState('');
  const [choices, setChoices] = useState<Record<string, ObservationChoice>>({});
  const [added, setAdded] = useState<AddedObservation[]>([]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();
  const preview = useQuery({
    queryKey: ['p2-reviewer-closure', tenantId, journeyId],
    queryFn: () => getReviewerClosure(tenantId, journeyId, accessToken),
    enabled: open,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  const items = preview.data?.items;

  // Each item starts from the suggestion; an item that appears later (a
  // re-check reopened a task) gets its own, without touching the decisions made.
  useEffect(() => {
    if (!items) return;
    setChoices((current) => {
      const missing = items.filter((item) => !(item.key in current));
      return missing.length ? { ...current, ...initialChoices(missing) } : current;
    });
  }, [items]);

  if (!open) {
    return (
      <button type="button" className="p2w-button p2w-button--secondary" onClick={() => setOpen(true)}
        title="Close the journey: decide each item as an observation or not. It is added to the audit report.">
        Close journey
      </button>
    );
  }

  const data = preview.data;
  const min = data?.minAnswerLength ?? 10;
  const list = items ?? [];
  const undecided = data ? undecidedItems(list, choices, min) : [];
  const addedProblems = incompleteAdded(added);
  const commentShort = comment.trim().length < min;
  const counts = standingCounts(
    Object.fromEntries(list.filter((item) => choices[item.key]).map((item) => [item.key, choices[item.key]])), added);
  const notObservations = list.filter((item) => choices[item.key] && !choices[item.key].stands).length;

  const choose = (key: string, change: Partial<ObservationChoice>) =>
    setChoices((current) => ({ ...current, [key]: { ...current[key], ...change } as ObservationChoice }));

  const submit = async () => {
    if (!data || undecided.length || addedProblems || commentShort) return;
    setBusy(true);
    setProblem(undefined);
    try {
      // What is open can change while the Reviewer works (a re-check reopens a
      // task, a new finding). Read it again first: a new item is shown here
      // to decide instead of the close being refused (SHI-SS-261027-013).
      const fresh = await preview.refetch();
      const recheck = fresh.data
        ? recheckBeforeClosing(list.map((item) => item.key), fresh.data, {}, { ...initialChoices(fresh.data.items.filter((i) => !(i.key in choices))), ...choices })
        : undefined;
      if (recheck) {
        setProblem(recheck);
        return;
      }
      const result = await closeJourneyAsReviewer(tenantId, journeyId, {
        comment, remarks, added,
        observations: Object.fromEntries(list.map((item) => [item.key, choices[item.key]])),
      }, accessToken);
      for (const key of ['p2-documents', 'p2-stage', 'p2-360', 'p2-tasks', 'p2-journeys', 'p2-reviewer-closure']) {
        void queryClient.invalidateQueries({ queryKey: [key, tenantId] });
        void queryClient.invalidateQueries({ queryKey: [key, tenantId, journeyId] });
      }
      const by = result.severityCounts ?? counts;
      onDone?.(`Journey closed: ${by.HIGH} high, ${by.MEDIUM} medium and ${by.LOW} low observation(s). `
        + `The Team Lead accepts it or rejects items; it is accepted automatically after ${data.acceptanceWindowHours} hours.`, 'success');
      setOpen(false);
      setChoices({});
      setAdded([]);
      setComment('');
      setRemarks('');
    } catch (cause) {
      setProblem(cause instanceof Error && cause.message ? cause.message : 'The journey could not be closed.');
      void preview.refetch();
    } finally {
      setBusy(false);
    }
  };

  const itemCard = (item: ClosureItem) => {
    const choice = choices[item.key];
    if (!choice) return null;
    return (
      <li key={item.key} className={`p2w-obs__item${choice.stands ? ' is-observation' : ''}`}>
        <div className="p2w-obs__head">
          <strong>{item.label}</strong>
          <span className="p2w-muted">
            {item.stage ? `${item.stage.toLowerCase()} · ` : ''}suggested {SEVERITY_LABEL[item.suggestedSeverity ?? 'MEDIUM'].toLowerCase()}
          </span>
        </div>
        {item.detail ? <p className="p2w-obs__detail">{item.detail}</p> : null}
        {item.rejection ? (
          <p className="p2w-tone p2w-tone--danger p2w-obs__detail">Rejected by the Team Lead: {item.rejection.reason}
            {item.rejection.previousAnswer ? ` (your answer was: ${item.rejection.previousAnswer})` : ''}</p>
        ) : null}
        <div className="p2w-segment p2w-obs__switch" role="radiogroup" aria-label={`Is “${item.label}” an observation?`}>
          <button type="button" role="radio" aria-checked={choice.stands} className={choice.stands ? 'is-active' : ''}
            onClick={() => choose(item.key, { stands: true, severity: choice.severity ?? item.suggestedSeverity ?? 'MEDIUM' })}>
            Observation
          </button>
          <button type="button" role="radio" aria-checked={!choice.stands} className={!choice.stands ? 'is-active' : ''}
            onClick={() => choose(item.key, { stands: false })}>
            Not an observation
          </button>
        </div>
        {choice.stands ? (
          <div className="p2w-obs__fields">
            <SeverityPicker name={`sev-${item.key}`} value={choice.severity}
              onChange={(severity) => choose(item.key, { severity })} />
            <input className="p2w-obs__input" maxLength={2000} value={choice.note ?? ''}
              placeholder="Note for the report (optional)" aria-label={`Note on ${item.label}`}
              onChange={(event) => choose(item.key, { note: event.target.value })} />
          </div>
        ) : (
          <div className="p2w-obs__fields">
            <textarea className="p2w-obs__input" rows={2} maxLength={2000} value={choice.justification ?? ''}
              aria-label={`Justification for ${item.label}`}
              placeholder={item.prefilledAnswer ?? `Justification: why this is not an observation (at least ${min} characters)`}
              onChange={(event) => choose(item.key, { justification: event.target.value })} />
            {item.prefilledAnswer && !(choice.justification ?? '').trim() ? (
              <small className="p2w-muted">{item.carried
                ? 'Accepted by the Team Lead last time: kept unless you write a new one.'
                : 'Justified by the accepted not-mandatory claim unless you write your own.'}</small>
            ) : null}
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="p2w-review p2w-obs" role="dialog" aria-label="Close journey">
      <div className="p2w-obs__title">
        <strong>Close this journey</strong>
        <span className="p2w-obs__counts" aria-label="Observations by severity">
          {SEVERITIES.map((severity) => (
            <span key={severity} className={`p2w-chip p2w-obs__count is-${severity.toLowerCase()}`}>
              {SEVERITY_LABEL[severity]} {counts[severity]}
            </span>
          ))}
          <span className="p2w-chip p2w-chip--neutral">Not observations {notObservations}</span>
        </span>
      </div>
      {preview.isLoading ? <p className="p2w-muted">Reading what is open…</p> : null}
      {preview.isError ? <div className="form-alert form-alert--error">What is open could not be read.</div> : null}
      {data?.reviewed ? (
        <p className="p2w-muted">This journey is already closed and reviewed
          {data.lastClosure ? ` (closure ${data.lastClosure.acceptanceStatus === 'PENDING' ? 'awaiting the Team Lead' : data.lastClosure.acceptanceStatus.toLowerCase().replace('_', '-')})` : ''}.</p>
      ) : null}
      {data?.blockers.length ? (
        <div className="form-alert form-alert--error">{data.blockers.map((b) => <div key={b}>{b}</div>)}</div>
      ) : null}
      {data && !list.length ? <p className="p2w-muted">Nothing is open on this journey.</p> : null}

      {KINDS.map((kind) => {
        const group = list.filter((item) => item.kind === kind);
        if (!group.length) return null;
        return (
          <section key={kind} className="p2w-obs__group">
            <h4>{CLOSURE_KIND_LABEL[kind]} ({group.length})</h4>
            <ul>{group.map(itemCard)}</ul>
          </section>
        );
      })}

      <section className="p2w-obs__group">
        <h4>Additional observations ({added.length})</h4>
        {added.length ? (
          <ul>
            {added.map((entry, index) => (
              <li key={index} className="p2w-obs__item is-observation">
                <div className="p2w-obs__fields">
                  <input className="p2w-obs__input" maxLength={300} value={entry.title} placeholder="Observation (at least 5 characters)"
                    aria-label={`Additional observation ${index + 1}`}
                    onChange={(event) => setAdded(added.map((a, i) => (i === index ? { ...a, title: event.target.value } : a)))} />
                  <SeverityPicker name={`added-${index}`} value={entry.severity}
                    onChange={(severity) => setAdded(added.map((a, i) => (i === index ? { ...a, severity } : a)))} />
                  <input className="p2w-obs__input" maxLength={2000} value={entry.detail ?? ''} placeholder="Detail (optional)"
                    aria-label={`Detail of additional observation ${index + 1}`}
                    onChange={(event) => setAdded(added.map((a, i) => (i === index ? { ...a, detail: event.target.value } : a)))} />
                  <button type="button" className="p2w-button p2w-button--ghost" onClick={() => setAdded(added.filter((_, i) => i !== index))}>
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
        <div>
          <button type="button" className="p2w-button p2w-button--ghost" disabled={added.length >= 30}
            onClick={() => setAdded([...added, { title: '', severity: 'MEDIUM' }])}>+ Add an observation</button>
        </div>
      </section>

      <label className="p2w-field">
        <span>Additional remarks (optional)</span>
        <textarea rows={2} maxLength={4000} value={remarks} onChange={(event) => setRemarks(event.target.value)}
          placeholder="Anything else the report should say." />
      </label>
      <label className="p2w-field">
        <span>Closing comment</span>
        <textarea rows={2} maxLength={4000} value={comment} onChange={(event) => setComment(event.target.value)}
          placeholder="For example: delivery confirmed with the outlet; every item decided above." />
      </label>
      {data && (undecided.length || addedProblems || commentShort) ? (
        <small className="p2w-muted">
          {undecided.length ? `${undecided.length} item${undecided.length === 1 ? '' : 's'} still need${undecided.length === 1 ? 's' : ''} a decision: a severity, or a justification. ` : ''}
          {addedProblems ? 'Each added observation needs a title and a severity. ' : ''}
          {commentShort ? 'Write the closing comment.' : ''}
        </small>
      ) : null}
      {problem ? <div className="form-alert form-alert--error">{problem}</div> : null}
      <div className="p2w-row" style={{ gap: 8 }}>
        <button type="button" className="uc02-button uc02-button--primary"
          disabled={busy || !data?.canClose || undecided.length > 0 || addedProblems > 0 || commentShort} onClick={() => void submit()}>
          {busy ? 'Closing…' : 'Close journey'}
        </button>
        <button type="button" className="p2w-button p2w-button--ghost" disabled={busy} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}
