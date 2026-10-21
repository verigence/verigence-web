import { useState } from 'react';

/** Why the Remove button is disabled, or undefined when the reason will do. */
export function removeReasonProblem(reason: string): string | undefined {
  return reason.trim().length < 3 ? 'Say in a few words why the page is removed.' : undefined;
}

/** The pages a refused-page task can remove, from its reference (2026-10-21). */
export function removablePages(reference: Record<string, unknown> | null | undefined): Array<{ page: number; queueId: string }> {
  const raw = reference?.pageQueues;
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is { page: number; queueId: string } => Boolean(item) && typeof item === 'object'
    && typeof (item as { page?: unknown }).page === 'number' && typeof (item as { queueId?: unknown }).queueId === 'string');
}

/**
 * Confirm taking a refused or failed page off the booking (2026-10-21). A
 * re-scan never replaces the refused page (it is a different scan), so once
 * the re-scan is uploaded the PC removes the old page; its task then closes.
 */
export default function RemovePageDialog({ pageLabel, busy, onCancel, onConfirm }: {
  pageLabel: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('Re-scan uploaded');
  const problem = removeReasonProblem(reason);
  return (
    <div className="p2w-dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onCancel();
    }}>
      <div className="p2w-dialog" role="alertdialog" aria-modal="true" aria-labelledby="p2w-remove-page-title">
        <h3 id="p2w-remove-page-title">Remove {pageLabel}?</h3>
        <p>Use this once the re-scan has been uploaded. The refused page is taken off this booking and its task
          closes. It stays in the audit history.</p>
        <label className="p2w-task__comment">
          <span>Why</span>
          <textarea rows={2} value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} />
        </label>
        <div className="p2w-dialog__actions">
          <button type="button" className="p2w-button p2w-button--ghost" autoFocus onClick={onCancel}>Keep</button>
          <button type="button" className="p2w-button p2w-button--danger" disabled={busy || Boolean(problem)}
            title={problem} onClick={() => onConfirm(reason.trim())}>{busy ? 'Removing…' : 'Remove page'}</button>
        </div>
      </div>
    </div>
  );
}
