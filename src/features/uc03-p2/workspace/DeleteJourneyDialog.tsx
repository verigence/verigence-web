import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { deleteP2Journey } from '../../../services/audit-core/uc03P2';
import { deleteReasonProblem } from './deleteJourney';

/**
 * Team Lead deletes a journey (2026-10-23). The reason is mandatory and is kept,
 * with the journey's basic details, in an audit record that outlives the journey.
 * Audit Core refuses a reviewed or closed journey and says why; the message is
 * shown as it is.
 */
export default function DeleteJourneyDialog({ tenantId, journeyId, journeyLabel, accessToken, onClose, onDeleted }: {
  tenantId: string;
  journeyId: string;
  journeyLabel: string;
  accessToken?: string;
  onClose: () => void;
  onDeleted: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const problem = deleteReasonProblem(reason);

  const remove = useMutation({
    mutationFn: () => deleteP2Journey(tenantId, journeyId, reason.trim(), accessToken),
    onSuccess: (result) => {
      // Every Phase 2 list and count (journeys, bookings summary, reviewer board, tasks) has changed.
      void queryClient.invalidateQueries({
        predicate: (query) => typeof query.queryKey[0] === 'string' && query.queryKey[0].startsWith('p2-'),
      });
      onDeleted(`Journey ${result.journeyReference ?? journeyLabel} deleted. ${result.diDocumentsDeleted} document${result.diDocumentsDeleted === 1 ? '' : 's'} and ${result.storageObjectsDeleted} stored file${result.storageObjectsDeleted === 1 ? '' : 's'} removed; the reason is on record.`);
    },
  });

  return (
    <div className="p2w-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !remove.isPending) onClose(); }}>
      <form className="p2w-dialog p2w-raise" role="dialog" aria-modal="true" aria-labelledby="p2w-delete-title"
        onSubmit={(event) => { event.preventDefault(); if (!problem) remove.mutate(); }}>
        <h3 id="p2w-delete-title">Delete this journey?</h3>
        <p>
          <strong>{journeyLabel}</strong> will be removed together with its documents, its photos and every file stored for it.
          This cannot be undone. A record of the deletion, with your reason, is kept.
        </p>
        <p>A journey that a reviewer has marked reviewed, or that is closed, cannot be deleted.</p>
        <label className="p2w-raise__field">
          <span>Reason for deleting</span>
          <textarea rows={3} value={reason} maxLength={2000} autoFocus placeholder="For example: uploaded against the wrong customer"
            onChange={(event) => setReason(event.target.value)} />
        </label>
        {reason && problem ? <div className="p2w-muted" role="status">{problem}</div> : null}
        {remove.isError ? (
          <div className="p2w-alert p2w-alert--error" role="alert">
            {remove.error instanceof Error && remove.error.message ? remove.error.message : 'The journey could not be deleted.'}
          </div>
        ) : null}
        <div className="p2w-dialog__actions">
          <button type="button" className="p2w-button p2w-button--ghost" disabled={remove.isPending} onClick={onClose}>Cancel</button>
          <button type="submit" className="p2w-button p2w-button--danger" disabled={Boolean(problem) || remove.isPending}>
            {remove.isPending ? 'Deleting…' : 'Delete journey'}
          </button>
        </div>
      </form>
    </div>
  );
}
