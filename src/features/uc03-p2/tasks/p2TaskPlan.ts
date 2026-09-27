import type { P2Task } from '../../../services/audit-core/uc03P2';

export type TaskAction = {
  label: string;
  action?: string;
  to?: string;
  requiresComment?: boolean;
  tone: 'primary' | 'secondary' | 'confirm' | 'danger' | 'ghost';
};

export type TaskPlan = { primary?: TaskAction; secondary: TaskAction[]; waiting?: string };

const WAITING: Record<string, string> = {
  VERIFYING: 'Checking your fix automatically…',
  ACTION_COMPLETED: 'Checking your fix automatically…',
  AWAITING_REQUESTER_REVIEW: 'Waiting for the requester to accept.',
};

const DONE = new Set(['VERIFIED_COMPLETE', 'CANCELLED']);

function referenceDocument(task: P2Task): { documentId?: string; fieldKey?: string } {
  const ref = task.reference ?? {};
  const ids = Array.isArray(ref.documentIds) ? (ref.documentIds as string[]) : [];
  const documentId = (typeof ref.documentId === 'string' ? ref.documentId : undefined) ?? ids[0];
  const keys = Array.isArray(ref.fieldKeys) ? (ref.fieldKeys as string[]) : [];
  const fields = Array.isArray(ref.fields) ? (ref.fields as Array<{ fieldKey?: string }>) : [];
  const fieldKey = (typeof ref.fieldKey === 'string' ? ref.fieldKey : undefined) ?? keys[0] ?? fields[0]?.fieldKey;
  return { documentId, fieldKey };
}

export function documentLink(task: P2Task): string | undefined {
  const { documentId, fieldKey } = referenceDocument(task);
  if (!documentId) return undefined;
  const base = `/p2/journeys/${task.journey_id}/documents/${documentId}`;
  return fieldKey ? `${base}?field=${encodeURIComponent(fieldKey)}` : base;
}

/**
 * What the person in front of the task can do next, most useful first.
 * Machine-raised tasks are never closed by a click: "I've fixed it" asks
 * the audit to re-check, and the task closes itself when the check passes.
 */
export function taskPlan(task: P2Task, operatingRole?: string | null): TaskPlan {
  if (task.source_system === 'LEGACY') {
    return { primary: { label: 'Open in legacy queue', to: task.legacy_queue_url || '/reviews', tone: 'secondary' }, secondary: [] };
  }
  const allowed = new Set(task.allowed_actions ?? []);
  const secondary: TaskAction[] = [];
  const canComment = allowed.has('ADD_COMMENT');
  const supervisor = operatingRole === 'TL' || operatingRole === 'PM';
  if (DONE.has(task.task_status)) {
    return { secondary: canComment ? [{ label: 'Comment', action: 'ADD_COMMENT', requiresComment: true, tone: 'ghost' }] : [] };
  }
  const waiting = WAITING[task.task_status];
  if (waiting) {
    return { waiting, secondary: canComment ? [{ label: 'Comment', action: 'ADD_COMMENT', requiresComment: true, tone: 'ghost' }] : [] };
  }

  if (allowed.has('APPROVE_CORRECTION')) {
    return {
      primary: { label: 'Approve correction', action: 'APPROVE_CORRECTION', tone: 'confirm' },
      secondary: [
        { label: 'Reject', action: 'REJECT_CORRECTION', requiresComment: true, tone: 'danger' },
        ...(documentLink(task) ? [{ label: 'Open document', to: documentLink(task), tone: 'ghost' as const }] : []),
      ],
    };
  }
  if (allowed.has('ACCEPT') && allowed.has('REJECT')) {
    return {
      primary: { label: 'Accept', action: 'ACCEPT', tone: 'confirm' },
      secondary: [{ label: 'Send back', action: 'REJECT', requiresComment: true, tone: 'danger' }],
    };
  }

  const link = documentLink(task);
  const completion = ['CORRECT_EXTRACTED_FIELD', 'REVIEW_DOCUMENT', 'UPLOAD_DOCUMENT', 'REUPLOAD_DOCUMENT', 'ADD_EVIDENCE', 'COMPLETE_ACTION']
    .find((action) => allowed.has(action));
  let primary: TaskAction | undefined;
  if (link) primary = { label: task.source_type === 'DOCUMENT_FIELD' ? 'Verify fields' : 'Open document', to: link, tone: 'primary' };
  else if (allowed.has('UPLOAD_DOCUMENT') || allowed.has('REUPLOAD_DOCUMENT')) {
    primary = { label: 'Upload document', to: `/p2/journeys/${task.journey_id}/documents`, tone: 'primary' };
  }
  if (completion) {
    const done: TaskAction = {
      label: task.completion_protocol === 'MACHINE_VERIFIED' ? "I've fixed it — re-check" : 'Mark as done',
      action: completion,
      requiresComment: task.completion_protocol !== 'MACHINE_VERIFIED',
      tone: primary ? 'secondary' : 'primary',
    };
    if (primary) secondary.push(done); else primary = done;
  }
  if (allowed.has('PROVIDE_FEEDBACK')) secondary.push({ label: 'Give feedback', action: 'PROVIDE_FEEDBACK', requiresComment: true, tone: 'ghost' });
  if (supervisor && allowed.has('ACCEPT_EXCEPTION')) {
    secondary.push({ label: 'Accept as exception', action: 'ACCEPT_EXCEPTION', requiresComment: true, tone: 'ghost' });
  }
  if (canComment) secondary.push({ label: 'Comment', action: 'ADD_COMMENT', requiresComment: true, tone: 'ghost' });
  return { primary, secondary };
}

const PRIORITY_RANK: Record<string, number> = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 };
const STATUS_RANK: Record<string, number> = { RETURNED: 0, READY: 1, IN_PROGRESS: 2, VERIFYING: 3, AWAITING_REQUESTER_REVIEW: 4 };

/** Worklist order: returned work, then priority, then overdue/SLA, then age. */
export function compareTasks(a: P2Task, b: P2Task, now = Date.now()): number {
  const returned = Number(b.task_status === 'RETURNED') - Number(a.task_status === 'RETURNED');
  if (returned) return returned;
  const priority = (PRIORITY_RANK[a.priority ?? 'NORMAL'] ?? 2) - (PRIORITY_RANK[b.priority ?? 'NORMAL'] ?? 2);
  if (priority) return priority;
  const due = (value?: string | null) => (value ? new Date(value).getTime() : Number.POSITIVE_INFINITY);
  const overdue = Number(due(b.due_at_utc) < now) - Number(due(a.due_at_utc) < now);
  if (overdue) return overdue;
  const byDue = due(a.due_at_utc) - due(b.due_at_utc);
  if (byDue) return byDue;
  const status = (STATUS_RANK[a.task_status] ?? 9) - (STATUS_RANK[b.task_status] ?? 9);
  if (status) return status;
  return new Date(a.created_at_utc).getTime() - new Date(b.created_at_utc).getTime();
}
