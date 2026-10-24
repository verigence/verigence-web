import type { P2DocumentCategory, P2DocumentCounts, P2Task, P2TaskTab } from '../../../services/audit-core/uc03P2';

/**
 * The Documents group of the Task Queue (product owner 2026-10-21): every
 * piece of document work in one place, in four categories. Which category a
 * task is in is decided by Audit Core (document_category on each task); the
 * screen only shows and filters.
 */
export const DOCUMENT_CATEGORIES: Array<{ key: P2DocumentCategory; label: string; rowLabel: string; hint: string }> = [
  { key: 'MANUAL_VERIFICATION', label: 'Manual verification', rowLabel: 'Manual verification', hint: 'Values read from a document to check or correct' },
  { key: 'FAILED_TO_READ', label: 'Failed to read', rowLabel: 'Failed to read', hint: 'Pages or files that were not read' },
  { key: 'IMAGE_QUALITY', label: 'Image quality', rowLabel: 'Image quality', hint: 'Pages refused as blurred, faded (low contrast) or too small: re-scan them' },
  { key: 'MISSING_DOCUMENT', label: 'Missing documents', rowLabel: 'Missing document', hint: 'Checklist documents not on file yet' },
];

export type DocumentFilter = 'ALL' | P2DocumentCategory;

export function documentFilter(value: string | null | undefined): DocumentFilter {
  const wanted = String(value ?? '').toUpperCase();
  return DOCUMENT_CATEGORIES.some((item) => item.key === wanted) ? (wanted as P2DocumentCategory) : 'ALL';
}

/** The label on one task row ("Missing document", not "Missing documents"). */
export function documentCategoryLabel(category: P2DocumentCategory): string {
  return DOCUMENT_CATEGORIES.find((item) => item.key === category)?.rowLabel ?? 'Document';
}

/** The tasks a tab (and, on Documents, a category) shows. */
export function visibleTasks(all: P2Task[], tab: P2TaskTab, filter: DocumentFilter): P2Task[] {
  if (tab === 'ALL') return all;
  const onTab = all.filter((task) => task.queue_tab === tab);
  if (tab !== 'DOCUMENTS' || filter === 'ALL') return onTab;
  return onTab.filter((task) => task.document_category === filter);
}

/** Counts per category, from the server when it sent them, else from the items. */
export function documentCounts(all: P2Task[], fromServer?: P2DocumentCounts): P2DocumentCounts {
  if (fromServer) return fromServer;
  const counts: P2DocumentCounts = { TOTAL: 0, MANUAL_VERIFICATION: 0, FAILED_TO_READ: 0, IMAGE_QUALITY: 0, MISSING_DOCUMENT: 0 };
  for (const task of all) {
    if (!task.document_category) continue;
    counts.TOTAL += 1;
    counts[task.document_category] += 1;
  }
  return counts;
}

/** "Page 3", "Pages 5 and 7", "Pages 2, 3 and 4". */
export function pagesText(pages: number[] | undefined | null): string | null {
  const list = (pages ?? []).filter((page) => Number.isFinite(page));
  if (!list.length) return null;
  if (list.length === 1) return `Page ${list[0]}`;
  return `Pages ${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

/** The document a task is about, to open, when one was read. */
export function documentOpenLink(task: P2Task): string | undefined {
  const documentId = task.document?.documentId;
  return documentId ? `/p2/journeys/${task.journey_id}/documents/${documentId}` : undefined;
}
