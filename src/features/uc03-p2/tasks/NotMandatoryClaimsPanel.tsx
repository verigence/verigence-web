import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  decideNotMandatoryClaim,
  getNotMandatoryClaims,
  MIN_CLAIM_REASON,
  type NotMandatoryClaim,
} from '../../../services/audit-core/notMandatoryClaims';

/**
 * The Reviewer's combined task (NOT_MANDATORY_REVIEW): every document the PC
 * closed as not mandatory on this journey, with the PC's reason. Each is
 * accepted, or rejected with a reason -- a rejected one goes back to the PC
 * (product owner 2026-11-04).
 */
export default function NotMandatoryClaimsPanel({ tenantId, journeyId, accessToken, onlyTaskId, onDone }: {
  tenantId: string;
  journeyId: string;
  accessToken?: string;
  /** On the PC's own claimed task: decide just that claim, in place. */
  onlyTaskId?: string;
  onDone: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const claims = useQuery({
    queryKey: ['p2-not-mandatory', tenantId, journeyId],
    queryFn: () => getNotMandatoryClaims(tenantId, journeyId, accessToken),
    staleTime: 5_000,
  });
  const decide = useMutation({
    mutationFn: ({ claim, decision }: { claim: NotMandatoryClaim; decision: 'ACCEPT' | 'REJECT' }) =>
      decideNotMandatoryClaim(tenantId, journeyId, claim.taskId, decision, reasons[claim.taskId] ?? '', accessToken),
    onSuccess: (_, { claim, decision }) => {
      setError(undefined);
      void queryClient.invalidateQueries({ queryKey: ['p2-not-mandatory', tenantId, journeyId] });
      void queryClient.invalidateQueries({ queryKey: ['p2-tasks', tenantId] });
      void queryClient.invalidateQueries({ queryKey: ['p2-task', tenantId] });
      onDone(decision === 'ACCEPT'
        ? `${claim.document}: accepted as not mandatory.`
        : `${claim.document}: rejected. It is back with the PC with your reason.`);
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : 'The decision could not be saved.'),
  });

  const pending = (claims.data?.claims ?? []).filter((claim) => claim.state === 'PENDING'
    && (!onlyTaskId || claim.taskId === onlyTaskId));
  if (claims.isLoading) return <p className="p2w-muted">Reading the claims…</p>;
  if (!pending.length) return <p className="p2w-muted">No claim is waiting for a decision.</p>;

  return (
    <div className="p2w-review" style={{ display: 'grid', gap: 12 }}>
      {pending.map((claim) => {
        const reason = reasons[claim.taskId] ?? '';
        const busy = decide.isPending && decide.variables?.claim.taskId === claim.taskId;
        return (
          <div key={claim.taskId} style={{ borderTop: '1px solid var(--color-border, #ddd)', paddingTop: 8 }}>
            <strong>{claim.document}</strong>
            {claim.stage ? <span className="p2w-muted"> · {claim.stage.toLowerCase()}</span> : null}
            {claim.round > 1 ? <span className="p2w-muted"> · answered again (round {claim.round})</span> : null}
            <p style={{ margin: '4px 0' }}>PC: “{claim.pcReason || '—'}”</p>
            <textarea
              rows={2}
              value={reason}
              maxLength={2000}
              onChange={(event) => setReasons({ ...reasons, [claim.taskId]: event.target.value })}
              placeholder="Your reason (required to reject)"
              aria-label={`Reason for ${claim.document}`}
              style={{ width: '100%' }}
            />
            <div className="p2w-row" style={{ gap: 8, marginTop: 6 }}>
              <button type="button" className="p2w-button p2w-button--primary" disabled={busy}
                onClick={() => decide.mutate({ claim, decision: 'ACCEPT' })}>
                Accept: not mandatory
              </button>
              <button type="button" className="p2w-button p2w-button--secondary" disabled={busy}
                onClick={() => {
                  if (reason.trim().length < MIN_CLAIM_REASON) {
                    setError(`Say why ${claim.document} is mandatory (at least ${MIN_CLAIM_REASON} characters).`);
                    return;
                  }
                  decide.mutate({ claim, decision: 'REJECT' });
                }}>
                Reject: send back to PC
              </button>
            </div>
          </div>
        );
      })}
      {error ? <div className="form-alert form-alert--error">{error}</div> : null}
    </div>
  );
}
