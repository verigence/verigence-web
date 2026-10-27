import type { P2Template } from '../../../services/audit-core/uc03P2';

/** What the task card needs to know about a document task (product owner
 * 2026-10-27): its type, status and reference. */
type DocumentTask = { task_type: string; task_status: string; reference?: Record<string, unknown> | null };

/** A failed page of a "Document to resubmit" task that can be sent again. */
export type ResendPage = { queueId: string; pages: number[]; templateKey: string | null };

const CLOSED = new Set(['VERIFIED_COMPLETE', 'CANCELLED', 'FAILED', 'DEAD_LETTER']);

function isOpen(task: DocumentTask): boolean {
  return !CLOSED.has(task.task_status);
}

/** The page an open "Set the document type" task asks about, or undefined. */
export function unclassifiedPage(task: DocumentTask): string | undefined {
  if (task.task_type !== 'PC_VERIFY_UNRECOGNIZED_DOCUMENT' || !isOpen(task)) return undefined;
  const queueId = task.reference?.queueId;
  return typeof queueId === 'string' && queueId ? queueId : undefined;
}

/**
 * The pages of an open "Document to resubmit" task that can be sent again:
 * "Send again" when the page's type is known, "Set type and send" when it is
 * not. A page refused for scan quality is never offered (the same scan is
 * refused again whatever its type).
 */
export function resendPages(task: DocumentTask): ResendPage[] {
  if (task.task_type !== 'DOCUMENT_RESUBMIT' || !isOpen(task)) return [];
  const units = task.reference?.pages;
  if (!Array.isArray(units)) return [];
  const found: ResendPage[] = [];
  for (const item of units) {
    const entry = item as { queueId?: unknown; pageNumbers?: unknown; templateKey?: unknown; code?: unknown } | null;
    if (!entry || typeof entry !== 'object' || typeof entry.queueId !== 'string' || !Array.isArray(entry.pageNumbers)) continue;
    if (typeof entry.code === 'string' && entry.code.startsWith('DI_QUALITY_')) continue;
    const pages = entry.pageNumbers.filter((n): n is number => typeof n === 'number');
    if (!pages.length) continue;
    const templateKey = typeof entry.templateKey === 'string' && entry.templateKey ? entry.templateKey : null;
    found.push({ queueId: entry.queueId, pages, templateKey });
  }
  return found;
}

/** The name of a page's known type, for "Send again as …". */
export function typeName(templateKey: string | null, templates: P2Template[] | undefined): string | undefined {
  if (!templateKey) return undefined;
  return templates?.find((t) => t.key === templateKey)?.displayName ?? templateKey.replace(/_/g, ' ');
}
