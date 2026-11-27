import { AuditCoreHttpError } from '../../../services/audit-core/client';

/**
 * A 409 on a task action means the task moved on after this page loaded: it
 * closed itself (the values were corrected on the document, the upload was
 * read) or went for verification. The card on screen is stale, so the page
 * reloads the task and says so in plain words instead of leaving the old
 * buttons up with an error code (2026-11-27, VAC-CONFLICT-000 on a GST task
 * the PC had already corrected).
 */
export function staleTaskMessage(cause: unknown): string | undefined {
  if (!(cause instanceof AuditCoreHttpError) || cause.status !== 409) return undefined;
  const detail = String(cause.problem?.detail ?? '');
  if (/already (verified complete|cancelled)/i.test(detail)) {
    return 'This task is already closed: it closed itself when the work was done (for example, the values were corrected on the document). Nothing more to do here.';
  }
  if (/waiting for verification/i.test(detail)) {
    return 'This task is already being checked. It closes itself once the check passes.';
  }
  return 'This task changed since the page was opened. It has been reloaded.';
}
