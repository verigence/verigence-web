import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  CLOSURE_KIND_LABEL,
  decideClosure,
  incompleteAdded,
  SEVERITIES,
  SEVERITY_LABEL,
  SEVERITY_TONE,
  type AddedObservation,
  type ClosureItem,
} from '../../../services/audit-core/reviewerClosure';

const MIN_REASON = 10;

/**
 * The Team Lead's decision on a Reviewer's closure (product owner 2026-11-04,
 * observations 2026-11-09): every item with the Reviewer's decision -- an
 * observation with its severity, or why it is not one -- and the Reviewer's
 * added observations. Accept it, or tick the items to reject and say why for
 * each; those go back to the Reviewer. The Team Lead may add observations of
 * their own either way. Not decided within 96 hours, it is accepted
 * automatically.
 */
export default function ClosureDecisionPanel({ tenantId, journeyId, closureId, items, added = [], remarks,
  comment, autoAcceptAtUtc, accessToken, onDone }: {
  tenantId: string;
  journeyId: string;
  closureId: string;
  items: ClosureItem[];
  /** The Reviewer's own observations. */
  added?: ClosureItem[];
  remarks?: string | null;
  comment?: string | null;
  autoAcceptAtUtc?: string | null;
  accessToken?: string;
  onDone: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const [rejecting, setRejecting] = useState<Record<string, string>>({});
  const [mine, setMine] = useState<AddedObservation[]>([]);
  const [error, setError] = useState<string>();
  const chosen = Object.entries(rejecting);
  const decide = useMutation({
    mutationFn: (decision: 'ACCEPT' | 'REJECT') => decideClosure(tenantId, journeyId, closureId, decision,
      decision === 'REJECT' ? chosen.map(([key, reason]) => ({ key, reason: reason.trim() })) : [], accessToken, mine),
    onSuccess: (_, decision) => {
      setError(undefined);
      for (const key of ['p2-tasks', 'p2-closures', 'p2-reviewer-closure', 'p2-360']) {
        void queryClient.invalidateQueries({ queryKey: [key, tenantId] });
      }
      const extra = mine.length ? ` ${mine.length} observation${mine.length === 1 ? '' : 's'} added.` : '';
      onDone(decision === 'ACCEPT'
        ? `Closure accepted.${extra}`
        : `${chosen.length} item${chosen.length === 1 ? '' : 's'} rejected and sent back to the Reviewer.${extra}`);
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : 'The decision could not be saved.'),
  });

  const rejectProblem = !chosen.length
    ? 'Tick the items to reject.'
    : chosen.some(([, reason]) => reason.trim().length < MIN_REASON)
      ? `Say why each ticked item is rejected (at least ${MIN_REASON} characters).` : undefined;
  const mineProblem = incompleteAdded(mine) ? 'Each observation you add needs a title (5+ characters) and a severity.' : undefined;
  const all = [...items, ...added];

  const decision = (item: ClosureItem) => {
    if (item.kind === 'ADDED' || item.stands) {
      const severity = item.observationSeverity ?? null;
      return (
        <span>
          {severity ? <span className={`p2w-chip p2w-chip--${SEVERITY_TONE[severity]}`}>{SEVERITY_LABEL[severity]}</span> : null}
          {' '}Observation{item.kind === 'ADDED' ? ' added by the Reviewer' : ''}{item.note ? `: ${item.note}` : ''}
          {item.kind === 'ADDED' && item.detail ? ` · ${item.detail}` : ''}
        </span>
      );
    }
    return <span>Not an observation: {item.justification ?? item.answer}</span>;
  };

  return (
    <div className="p2w-review p2w-obs" style={{ display: 'grid', gap: 10 }}>
      {comment ? <p style={{ margin: 0 }}>Reviewer: “{comment}”</p> : null}
      {remarks ? <p style={{ margin: 0 }} className="p2w-muted">Additional remarks: {remarks}</p> : null}
      {autoAcceptAtUtc ? (
        <small className="p2w-muted">Accepted automatically on {new Date(autoAcceptAtUtc).toLocaleString('en-IN')} if not decided.</small>
      ) : null}
      {!all.length ? <p className="p2w-muted">Nothing was open when the Reviewer closed it.</p> : null}
      {all.map((item) => {
        const ticked = item.key in rejecting;
        return (
          <div key={item.key} style={{ borderTop: '1px solid var(--color-border, #ddd)', paddingTop: 6 }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <input type="checkbox" checked={ticked} aria-label={`Reject ${item.label}`} onChange={(event) => {
                const next = { ...rejecting };
                if (event.target.checked) next[item.key] = ''; else delete next[item.key];
                setRejecting(next);
              }} />
              <span>
                <small className="p2w-muted">{CLOSURE_KIND_LABEL[item.kind] ?? item.kind}</small><br />
                <strong>{item.label}</strong><br />
                {decision(item)}
              </span>
            </label>
            {ticked ? (
              <textarea rows={2} maxLength={2000} value={rejecting[item.key]} style={{ width: '100%', marginTop: 4 }}
                placeholder="Why this is rejected (sent to the Reviewer)" aria-label={`Reason for rejecting ${item.label}`}
                onChange={(event) => setRejecting({ ...rejecting, [item.key]: event.target.value })} />
            ) : null}
          </div>
        );
      })}

      <section className="p2w-obs__group">
        <h4>Your observations ({mine.length})</h4>
        {mine.map((entry, index) => (
          <div key={index} className="p2w-obs__fields">
            <input className="p2w-obs__input" maxLength={300} value={entry.title} placeholder="Observation (at least 5 characters)"
              aria-label={`Your observation ${index + 1}`}
              onChange={(event) => setMine(mine.map((m, i) => (i === index ? { ...m, title: event.target.value } : m)))} />
            <div className="p2w-obs__severity" role="radiogroup" aria-label="Severity">
              {SEVERITIES.map((severity) => (
                <label key={severity} className={`p2w-obs__sev is-${severity.toLowerCase()}${entry.severity === severity ? ' is-on' : ''}`}>
                  <input type="radio" name={`tl-${closureId}-${index}`} checked={entry.severity === severity}
                    onChange={() => setMine(mine.map((m, i) => (i === index ? { ...m, severity } : m)))} />
                  {SEVERITY_LABEL[severity]}
                </label>
              ))}
            </div>
            <input className="p2w-obs__input" maxLength={2000} value={entry.detail ?? ''} placeholder="Detail (optional)"
              aria-label={`Detail of your observation ${index + 1}`}
              onChange={(event) => setMine(mine.map((m, i) => (i === index ? { ...m, detail: event.target.value } : m)))} />
            <button type="button" className="p2w-button p2w-button--ghost" onClick={() => setMine(mine.filter((_, i) => i !== index))}>Remove</button>
          </div>
        ))}
        <div>
          <button type="button" className="p2w-button p2w-button--ghost" disabled={mine.length >= 30}
            onClick={() => setMine([...mine, { title: '', severity: 'MEDIUM' }])}>+ Add an observation</button>
        </div>
      </section>

      {error ? <div className="form-alert form-alert--error">{error}</div> : null}
      <div className="p2w-row" style={{ gap: 8 }}>
        <button type="button" className="p2w-button p2w-button--primary" disabled={decide.isPending || chosen.length > 0}
          title={chosen.length ? 'Untick the items to accept the whole closure' : undefined}
          onClick={() => (mineProblem ? setError(mineProblem) : decide.mutate('ACCEPT'))}>
          Accept closure
        </button>
        <button type="button" className="p2w-button p2w-button--secondary" disabled={decide.isPending}
          onClick={() => (rejectProblem ?? mineProblem ? setError(rejectProblem ?? mineProblem) : decide.mutate('REJECT'))}>
          Reject ticked items{chosen.length ? ` (${chosen.length})` : ''}
        </button>
      </div>
    </div>
  );
}
