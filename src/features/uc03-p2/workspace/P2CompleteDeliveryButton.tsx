import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { completeP2Delivery } from '../../../services/audit-core/uc03P2';

/** At least a few words: the reason is kept with the completion. */
export function completionReasonError(reason: string): string | undefined {
  return reason.trim().length < 3 ? 'Say in a few words why the delivery is complete.' : undefined;
}

/**
 * "Complete delivery" for a Reviewer (product owner 2026-10-29): a delivery the
 * rules have not completed -- documents or vehicle pictures still missing --
 * is completed by hand, with a reason. The Team Lead's review follows as for
 * any completed delivery, and what was still pending is recorded with it.
 */
export default function P2CompleteDeliveryButton({ tenantId, journeyId, accessToken, onDone }: {
  tenantId: string;
  journeyId: string;
  accessToken?: string;
  onDone?: (message: string, tone: 'success' | 'error') => void;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const error = completionReasonError(reason);

  const submit = async () => {
    if (error) return;
    setBusy(true);
    try {
      const result = await completeP2Delivery(tenantId, journeyId, reason.trim(), accessToken);
      for (const key of ['p2-documents', 'p2-stage', 'p2-360', 'p2-tasks', 'p2-journeys']) {
        void queryClient.invalidateQueries({ queryKey: [key, tenantId] });
        void queryClient.invalidateQueries({ queryKey: [key, tenantId, journeyId] });
      }
      const pending = result.pendingAtCompletion ?? [];
      onDone?.(pending.length
        ? `Delivery completed. Recorded as still pending: ${pending.join(', ')}. The Team Lead reviews it next.`
        : 'Delivery completed. The Team Lead reviews it next.', 'success');
      setOpen(false);
      setReason('');
    } catch (cause) {
      onDone?.(cause instanceof Error && cause.message ? cause.message : 'The delivery could not be completed.', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button type="button" className="p2w-button p2w-button--secondary" onClick={() => setOpen(true)}
        title="Complete a delivery the rules have not completed. Your reason is recorded; the Team Lead reviews it.">
        Complete delivery
      </button>
    );
  }
  return (
    <div className="p2w-review" role="dialog" aria-label="Complete delivery">
      <strong>Complete this delivery by hand</strong>
      <p className="p2w-muted">
        What is still missing is recorded with your reason, and the Team Lead reviews the delivery next.
      </p>
      <label className="p2w-field">
        <span>Reason</span>
        <textarea rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)}
          placeholder="For example: vehicle delivered on 24 Oct, confirmed with the outlet; photos not taken." />
      </label>
      {reason && error ? <small className="p2w-muted">{error}</small> : null}
      <div className="p2w-row" style={{ gap: 8 }}>
        <button type="button" className="uc02-button uc02-button--primary" disabled={busy || Boolean(error)}
          onClick={() => void submit()}>
          {busy ? 'Completing…' : 'Complete delivery'}
        </button>
        <button type="button" className="p2w-button p2w-button--ghost" disabled={busy} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}
