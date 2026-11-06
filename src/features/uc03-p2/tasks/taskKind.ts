import type { P2Task } from '../../../services/audit-core/uc03P2';

import { documentCategoryLabel } from './documentGroups';

/** What kind of work a task is, for the colour on its card: document work
 * (by its Documents category), a value to confirm, data the audit could not
 * find, or a check that failed. */
// Review and closure work is not a failed check (2026-11-06: the Team Lead's
// "Reviewer closed the journey" task was labelled "Check failed").
const REVIEW_KINDS: Record<string, string> = {
  CLOSURE_ACCEPTANCE: 'Closure to accept',
  CLOSURE_REWORK: 'Closure items rejected',
  DELIVERY_REVIEW: 'Delivery review',
  NOT_MANDATORY_REVIEW: 'Claims to decide',
  REVIEWER_CORRECTIONS_INFO: 'Information',
};

export function taskKind(task: Pick<P2Task, 'task_type' | 'category' | 'document_category' | 'queue_tab'>):
  { key: 'documents' | 'verify' | 'data' | 'check'; label: string } {
  if (REVIEW_KINDS[task.task_type]) return { key: 'verify', label: REVIEW_KINDS[task.task_type] };
  if (task.task_type === 'TL_MANAGEMENT_REFERRAL') return { key: 'check', label: 'System task' };
  if (task.task_type === 'TL_DATA_VIOLATION') return { key: 'check', label: 'Data violation' };
  if (task.task_type === 'MODEL_CHANGED_BY_INVOICE') return { key: 'check', label: 'Information' };
  if (task.document_category) {
    return {
      key: task.document_category === 'MANUAL_VERIFICATION' ? 'verify' : 'documents',
      label: documentCategoryLabel(task.document_category),
    };
  }
  if (task.queue_tab === 'MANUAL_VERIFICATION') return { key: 'verify', label: 'Confirmation' };
  if (task.queue_tab === 'DOCUMENTS') return { key: 'documents', label: 'Document' };
  const text = `${task.task_type} ${task.category}`.toUpperCase();
  if (/MISSING|GAP|EMPTY|DATA/.test(text)) return { key: 'data', label: 'Data missing' };
  return { key: 'check', label: 'Check failed' };
}
