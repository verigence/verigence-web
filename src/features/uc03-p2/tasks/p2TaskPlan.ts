import type { P2Task } from '../../../services/audit-core/uc03P2';

export type TaskAction = {
  label: string;
  action?: string;
  to?: string;
  requiresComment?: boolean;
  /** Sent with the action: a question's answer, a form's values. */
  details?: Record<string, unknown>;
  tone: 'primary' | 'secondary' | 'confirm' | 'danger' | 'ghost';
};

type Answer = { value: string; label: string; requiresComment?: boolean };

/** The answers a check offers when it needs the PC to confirm something. */
export function taskAnswers(task: P2Task): Answer[] {
  const raw = task.reference?.answers;
  if (!Array.isArray(raw)) return [];
  return raw.filter((a): a is Answer => Boolean(a) && typeof a === 'object'
    && typeof (a as Answer).value === 'string' && typeof (a as Answer).label === 'string');
}

export type TaskPlan = {
  primary?: TaskAction; secondary: TaskAction[]; waiting?: string; vehicleId?: boolean;
  /** The Enable MR task: a Team Lead completes it with the amount and reason (form in TaskDetail). */
  managementReferral?: boolean;
};

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
    // An existing (Phase 1) task: fix it on the booking's documents; its own
    // action buttons still live in the Phase 1 queue.
    return {
      primary: { label: 'Open documents', to: `/p2/journeys/${task.journey_id}/documents`, tone: 'primary' },
      secondary: [{ label: 'Open in old Task Queue', to: task.legacy_queue_url || '/reviews', tone: 'ghost' }],
    };
  }
  const allowed = new Set(task.allowed_actions ?? []);
  const ref = task.reference ?? {};
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

  const answers = taskAnswers(task);
  if (answers.length && allowed.has('COMPLETE_ACTION') && ref.uploadFirst === true) {
    // The check wants a document first (the insurance invoice); its answer
    // is the way out when there is none to upload.
    return {
      primary: { label: 'Upload document', to: `/p2/journeys/${task.journey_id}/documents`, tone: 'primary' },
      secondary: [
        ...answers.map((item): TaskAction => ({
          label: item.label, action: 'COMPLETE_ACTION', details: { answer: item.value },
          requiresComment: Boolean(item.requiresComment), tone: 'danger',
        })),
        ...(canComment ? [{ label: 'Comment', action: 'ADD_COMMENT', requiresComment: true, tone: 'ghost' as const }] : []),
      ],
    };
  }
  if (answers.length && allowed.has('COMPLETE_ACTION')) {
    // A yes/no question from a check (cash intimated? declaration on file?
    // NDC signed in your presence?): each answer is one button, "yes" first.
    const [first, ...rest] = answers;
    const answer = (item: Answer, tone: TaskAction['tone']): TaskAction => ({
      label: item.label, action: 'COMPLETE_ACTION', details: { answer: item.value },
      requiresComment: Boolean(item.requiresComment), tone,
    });
    return {
      primary: answer(first, 'confirm'),
      secondary: [
        ...rest.map((item) => answer(item, 'danger')),
        ...(canComment ? [{ label: 'Comment', action: 'ADD_COMMENT', requiresComment: true, tone: 'ghost' as const }] : []),
      ],
    };
  }
  if (allowed.has('CONFIRM_BREACH') && typeof ref.findingId === 'string') {
    // A violation for the Team Lead: give the verdict on its finding, or fix
    // the facts and let the check pass.
    return {
      primary: { label: 'Confirm breach', action: 'CONFIRM_BREACH', requiresComment: true, tone: 'danger' },
      secondary: [
        { label: 'Reject as false positive', action: 'MARK_FALSE_POSITIVE', requiresComment: true, tone: 'secondary',
          details: { rejectionCategory: 'OTHER' } },
        { label: 'Open Journey 360', to: `/p2/journeys/${task.journey_id}/overview`, tone: 'ghost' },
        ...(supervisor && allowed.has('ACCEPT_EXCEPTION')
          ? [{ label: 'Accept as exception', action: 'ACCEPT_EXCEPTION', requiresComment: true, tone: 'ghost' as const }] : []),
        ...(canComment ? [{ label: 'Comment', action: 'ADD_COMMENT', requiresComment: true, tone: 'ghost' as const }] : []),
      ],
    };
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

  if (task.task_type === 'DELIVERY_REVIEW') {
    // The Team Lead's review of a completed delivery: look, then mark it reviewed.
    return {
      primary: { label: 'Mark delivery reviewed', action: 'COMPLETE_ACTION', tone: 'confirm' },
      secondary: [
        { label: 'Open Journey 360', to: `/p2/journeys/${task.journey_id}/overview`, tone: 'secondary' },
        { label: 'Compliance report', to: `/p2/journeys/${task.journey_id}/compliance-report`, tone: 'ghost' },
        ...(canComment ? [{ label: 'Comment', action: 'ADD_COMMENT', requiresComment: true, tone: 'ghost' as const }] : []),
      ],
    };
  }
  if (task.task_type === 'TL_MANAGEMENT_REFERRAL') {
    return {
      secondary: [
        { label: 'Open Journey 360', to: `/p2/journeys/${task.journey_id}/overview?tab=deal`, tone: 'ghost' },
        ...(canComment ? [{ label: 'Comment', action: 'ADD_COMMENT', requiresComment: true, tone: 'ghost' as const }] : []),
      ],
      managementReferral: supervisor,
    };
  }
  if (allowed.has('PROVIDE_VEHICLE_ID')) {
    // No pictures of the car: upload them, or enter the VIN / engine number
    // in the form under the description (TaskDetail).
    return {
      primary: { label: 'Add car photos', to: `/p2/journeys/${task.journey_id}/documents?tab=photos`, tone: 'primary' },
      secondary: canComment ? [{ label: 'Comment', action: 'ADD_COMMENT', requiresComment: true, tone: 'ghost' }] : [],
      vehicleId: true,
    };
  }

  const link = documentLink(task);
  const completion = ['CORRECT_EXTRACTED_FIELD', 'REVIEW_DOCUMENT', 'UPLOAD_DOCUMENT', 'REUPLOAD_DOCUMENT', 'ADD_EVIDENCE', 'COMPLETE_ACTION']
    .find((action) => allowed.has(action));
  let primary: TaskAction | undefined;
  if (link) {
    // The booking date task opens the booking form on that field.
    const label = task.task_type === 'PC_BOOKING_DATE_MISSING' ? 'Enter booking date'
      : task.source_type === 'DOCUMENT_FIELD' ? 'Verify fields' : 'Open document';
    primary = { label, to: link, tone: 'primary' };
  }
  else if (task.task_type === 'PC_VERIFY_UNRECOGNIZED_DOCUMENT') {
    // A page DI could not classify: its type is set on the card in Upload /
    // Edit Documents, and the task closes itself once it is.
    primary = { label: 'Set document type', to: `/p2/journeys/${task.journey_id}/documents`, tone: 'primary' };
  } else if (allowed.has('UPLOAD_DOCUMENT') || allowed.has('REUPLOAD_DOCUMENT')) {
    primary = { label: 'Upload document', to: `/p2/journeys/${task.journey_id}/documents`, tone: 'primary' };
  }
  if (completion) {
    const done: TaskAction = {
      label: task.task_type === 'DOCUMENT_MISSING' ? "I've uploaded it — re-check"
        : task.completion_protocol === 'MACHINE_VERIFIED' ? "I've fixed it — re-check" : 'Mark as done',
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

export type TaskGroup = {
  journeyId: string;
  customerName?: string | null;
  reference?: string | null;
  vehicle?: string | null;
  outletName?: string | null;
  tasks: P2Task[];
  overdue: number;
};

/** Tasks grouped by Journey, as in the Phase 1 queue: a Journey with anything
 * overdue first, then the earliest due task; tasks inside keep worklist order. */
export function groupByJourney(tasks: P2Task[], now = Date.now()): TaskGroup[] {
  const groups = new Map<string, TaskGroup>();
  for (const task of [...tasks].sort((a, b) => compareTasks(a, b, now))) {
    let group = groups.get(task.journey_id);
    if (!group) {
      group = { journeyId: task.journey_id, customerName: task.customer_name, reference: task.journey_reference,
        vehicle: task.vehicle, outletName: task.outlet_name, tasks: [], overdue: 0 };
      groups.set(task.journey_id, group);
    }
    group.tasks.push(task);
    if (task.due_at_utc && new Date(task.due_at_utc).getTime() < now) group.overdue += 1;
  }
  const earliest = (g: TaskGroup) => Math.min(...g.tasks.map((t) => (t.due_at_utc ? new Date(t.due_at_utc).getTime() : Infinity)));
  return [...groups.values()].sort((a, b) => Number(b.overdue > 0) - Number(a.overdue > 0) || earliest(a) - earliest(b));
}

export type VehicleIdentity = { vin: string; chassisNumber: string; engineNumber: string };

const cleanId = (value: string) => value.replace(/[^a-z0-9]/gi, '').toUpperCase();

/** Same rule as the server: at least one value, 5-25 letters or digits
 * each, and a VIN is exactly 17 characters. */
export function vehicleIdentityError(values: VehicleIdentity): string | undefined {
  const vin = cleanId(values.vin);
  const all = [vin, cleanId(values.chassisNumber), cleanId(values.engineNumber)];
  if (!all.some(Boolean)) return 'Enter the VIN, chassis number or engine number.';
  if (all.some((v) => v && (v.length < 5 || v.length > 25))) return 'Each number has 5 to 25 letters or digits.';
  if (vin && vin.length !== 17) return 'A VIN has 17 characters.';
  return undefined;
}
