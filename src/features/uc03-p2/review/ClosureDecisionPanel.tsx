import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  CLOSURE_KIND_LABEL,
  decideClosure,
  type ClosureItem,
} from '../../../services/audit-core/reviewerClosure';

const MIN_REASON = 10;

/**
 * The Team Lead's decision on a Reviewer's closure (product owner 2026-11-04):
 * every item the Reviewer closed, with the Reviewer's answer. Accept it all, or
 * tick the items to reject and say why for each; those go back to the Reviewer.
 * Not decided within 96 hours, it is accepted automatically.
 */
export default function ClosureDecisionPanel({ tenantId, journeyId, closureId, items, comment, autoAcceptAtUtc,
  accessToken, onDone }: {
  tenantId: string;
  journeyId: string;
  closureId: string;
  items: ClosureItem[];
  comment?: string | null;
  autoAcceptAtUtc?: string | null;
  accessToken?: string;
  onDone: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const [rejecting, setRejecting] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const chosen = Object.entries(rejecting);
  const decide = useMutation({
    mutationFn: (decision: 'ACCEPT' | 'REJECT') => decideClosure(tenantId, journeyId, closureId, decision,
      decision === 'REJECT' ? chosen.map(([key, reason]) => ({ key, reason: reason.trim() })) : [], accessToken),
    onSuccess: (_, decision) => {
      setError(undefined);
      for (const key of ['p2-tasks', 'p2-closures', 'p2-reviewer-closure', 'p2-360']) {
        void queryClient.invalidateQueries({ queryKey: [key, tenantId] });
      }
      onDone(decision === 'ACCEPT'
        ? 'Closure accepted.'
        : `${chosen.length} item${chosen.length === 1 ? '' : 's'} rejected and sent back to the Reviewer.`);
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : 'The decision could not be saved.'),
  });

  const rejectProblem = !chosen.length
    ? 'Tick the items to reject.'
    : chosen.some(([, reason]) => reason.trim().length < MIN_REASON)
      ? `Say why each ticked item is rejected (at least ${MIN_REASON} characters).` : undefined;

  return (
    <div className="p2w-review" style={{ display: 'grid', gap: 10 }}>
      {comment ? <p style={{ margin: 0 }}>Reviewer: “{comment}”</p> : null}
      {autoAcceptAtUtc ? (
        <small className="p2w-muted">Accepted automatically on {new Date(autoAcceptAtUtc).toLocaleString('en-IN')} if not decided.</small>
      ) : null}
      {!items.length ? <p className="p2w-muted">Nothing was open when the Reviewer closed it.</p> : null}
      {items.map((item) => {
        const ticked = item.key in rejecting;
        return (
          <div key={item.key} style={{ borderTop: '1px solid var(--color-border, #ddd)', paddingTop: 6 }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <input type="checkbox" checked={ticked} onChange={(event) => {
                const next = { ...rejecting };
                if (event.target.checked) next[item.key] = ''; else delete next[item.key];
                setRejecting(next);
              }} />
              <span>
                <small className="p2w-muted">{CLOSURE_KIND_LABEL[item.kind]}</small><br />
                <strong>{item.label}</strong><br />
                <span>{item.answer}</span>
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
      {error ? <div className="form-alert form-alert--error">{error}</div> : null}
      <div className="p2w-row" style={{ gap: 8 }}>
        <button type="button" className="p2w-button p2w-button--primary" disabled={decide.isPending || chosen.length > 0}
          title={chosen.length ? 'Untick the items to accept the whole closure' : undefined}
          onClick={() => decide.mutate('ACCEPT')}>
          Accept closure
        </button>
        <button type="button" className="p2w-button p2w-button--secondary" disabled={decide.isPending}
          onClick={() => (rejectProblem ? setError(rejectProblem) : decide.mutate('REJECT'))}>
          Reject ticked items{chosen.length ? ` (${chosen.length})` : ''}
        </button>
      </div>
    </div>
  );
}
