import { useState } from 'react';

/** Why the Remove button is disabled, or undefined when the reason will do. */
export function removeReasonProblem(reason: string): string | undefined {
  return reason.trim().length < 3 ? 'Say in a few words why the page is removed.' : undefined;
}

export type RemovablePage = { page: number; queueId: string; pages: number[] };

/**
 * The pages a task can take off the booking, from its reference: the image-quality
 * task lists `pageQueues` (2026-10-21); the "Document to resubmit" task lists its
 * failed units in `pages`, each with its queue id and page numbers (a unit may
 * span several pages). The day-end sweep hides a failed page from the page list,
 * so this is how the PC removes it afterwards (2026-10-22).
 */
export function removablePages(reference: Record<string, unknown> | null | undefined): RemovablePage[] {
  const found: RemovablePage[] = [];
  const queues = reference?.pageQueues;
  if (Array.isArray(queues)) {
    for (const item of queues) {
      const entry = item as { page?: unknown; queueId?: unknown } | null;
      if (entry && typeof entry === 'object' && typeof entry.page === 'number' && typeof entry.queueId === 'string') {
        found.push({ page: entry.page, queueId: entry.queueId, pages: [entry.page] });
      }
    }
  }
  const units = reference?.pages;
  if (Array.isArray(units)) {
    for (const item of units) {
      const entry = item as { queueId?: unknown; pageNumbers?: unknown } | null;
      if (!entry || typeof entry !== 'object' || typeof entry.queueId !== 'string' || !Array.isArray(entry.pageNumbers)) continue;
      const numbers = entry.pageNumbers.filter((n): n is number => typeof n === 'number');
      if (numbers.length) found.push({ page: numbers[0], queueId: entry.queueId, pages: numbers });
    }
  }
  return found;
}

/**
 * What a task card offers for taking pages off the booking: a Remove button per
 * page; for the image-quality task, a link to the page list when its reference
 * lists none (a task raised before they were kept). Nothing on a closed task.
 */
export function removeOptions(task: { task_type: string; task_status: string; reference?: Record<string, unknown> | null },
  hasPrimary: boolean): { pages: RemovablePage[]; fallbackLink: boolean } {
  const quality = task.task_type === 'PC_PAGE_QUALITY_REJECTED';
  const open = !['VERIFIED_COMPLETE', 'CANCELLED'].includes(task.task_status);
  const pages = (quality || task.task_type === 'DOCUMENT_RESUBMIT') && open ? removablePages(task.reference) : [];
  return { pages, fallbackLink: open && quality && hasPrimary && !pages.length };
}

/** "page 2", "pages 2 and 3", "pages 2, 3 and 4". */
export function removalPagesText(pages: number[]): string {
  if (pages.length <= 1) return `page ${pages[0] ?? ''}`.trim();
  return `pages ${pages.slice(0, -1).join(', ')} and ${pages[pages.length - 1]}`;
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
        <p>Use this once the re-scan has been uploaded. The page is taken off this booking and its task
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
