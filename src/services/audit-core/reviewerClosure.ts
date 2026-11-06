import { auditCoreRequest } from './client';

/**
 * A Reviewer closes a journey with a closure summary (product owner
 * 2026-11-04). Audit Core lists what is open -- required documents not on
 * file, open findings, other open tasks -- the same way every time; each needs
 * its own answer before the close goes through.
 */
export type ClosureItemKind = 'MISSING_DOCUMENT' | 'OPEN_FINDING' | 'OPEN_TASK';

export type ClosureItem = {
  key: string;
  kind: ClosureItemKind;
  stage?: string | null;
  label: string;
  detail?: string | null;
  severity?: string | null;
  status?: string | null;
  requirement?: 'MANDATORY' | 'CONDITIONAL';
  findingClass?: string | null;
  assignedRole?: string | null;
  /** From an accepted "not mandatory" claim; used when nothing else is typed. */
  prefilledAnswer?: string | null;
  /** Kept from the last closure: the Team Lead accepted this item. */
  carried?: boolean;
  /** The Team Lead rejected this item of the last closure. */
  rejection?: { reason: string; previousAnswer?: string | null } | null;
  answer?: string;
  answerSource?: 'REVIEWER' | 'ACCEPTED_CLAIM' | 'PREVIOUS_CLOSURE';
};

export type ClosureAcceptance = 'PENDING' | 'ACCEPTED' | 'AUTO_ACCEPTED' | 'REJECTED';
export type ClosureRejection = { key: string; label?: string; kind?: ClosureItemKind; reason: string };

export type ReviewerClosureRecord = {
  closureId: string;
  closedBy: string;
  closedRole: string;
  comment: string;
  itemCount: number;
  items: ClosureItem[];
  counts: Partial<Record<ClosureItemKind, number>>;
  deliveryOutcome: string;
  closedAtUtc: string;
  journeyId?: string;
  acceptanceStatus: ClosureAcceptance;
  acceptanceDueUtc?: string | null;
  acceptanceTaskId?: string | null;
  decidedBy?: string | null;
  decidedRole?: string | null;
  decidedAtUtc?: string | null;
  rejections: ClosureRejection[];
};

export type ClosureListRow = ReviewerClosureRecord & {
  journeyReference?: string | null;
  customerName?: string | null;
  outletName?: string | null;
  dealerName?: string | null;
};

export type ReviewerClosurePreview = {
  journeyId: string;
  canClose: boolean;
  reviewed: boolean;
  minAnswerLength: number;
  acceptanceWindowHours: number;
  items: ClosureItem[];
  blockers: string[];
  lastClosure: ReviewerClosureRecord | null;
};

function path(tenantId: string, journeyId: string) {
  return `/p2/v1/tenants/${encodeURIComponent(tenantId)}/journeys/${encodeURIComponent(journeyId)}/reviewer-closure`;
}

export function getReviewerClosure(tenantId: string, journeyId: string, accessToken?: string) {
  return auditCoreRequest<ReviewerClosurePreview>(path(tenantId, journeyId), { accessToken });
}

export function closeJourneyAsReviewer(
  tenantId: string, journeyId: string, comment: string, answers: Record<string, string>, accessToken?: string,
) {
  return auditCoreRequest<{ closureId: string; deliveryOutcome: string; itemCount: number }>(path(tenantId, journeyId), {
    method: 'POST', accessToken, body: JSON.stringify({ comment: comment.trim(), answers }),
  });
}

export const CLOSURE_KIND_LABEL: Record<ClosureItemKind, string> = {
  MISSING_DOCUMENT: 'Mandatory document not on file',
  OPEN_FINDING: 'Reported violation / finding not resolved',
  OPEN_TASK: 'Open task',
};

/** Items still needing an answer: typed answers first, an accepted claim's otherwise. */
export function unansweredItems(items: ClosureItem[], answers: Record<string, string>, min: number): ClosureItem[] {
  return items.filter((item) => ((answers[item.key] ?? '').trim() || (item.prefilledAnswer ?? '')).trim().length < min);
}

/**
 * Read again just before closing: what still needs an answer, and which of
 * those items opened after the form was loaded (a task reopened by a re-check,
 * a new finding -- SHI-SS-261027-013, 2026-11-06). Nothing to say means the
 * close can be sent.
 */
export function recheckBeforeClosing(
  shownKeys: string[], fresh: Pick<ReviewerClosurePreview, 'items' | 'blockers' | 'canClose' | 'minAnswerLength'>,
  answers: Record<string, string>,
): string | undefined {
  const shown = new Set(shownKeys);
  const stillOpen = unansweredItems(fresh.items, answers, fresh.minAnswerLength ?? 10);
  const added = stillOpen.filter((item) => !shown.has(item.key));
  if (added.length) {
    return `${added.length === 1 ? 'An item' : `${added.length} items`} opened while this form was open: `
      + `${added.map((item) => item.label).join('; ')}. Give a reason for ${added.length === 1 ? 'it' : 'each'} below.`;
  }
  if (fresh.blockers.length) return fresh.blockers.join(' ');
  if (stillOpen.length) return `Give a reason for: ${stillOpen.map((item) => item.label).join('; ')}.`;
  if (!fresh.canClose) return 'This journey cannot be closed now.';
  return undefined;
}

/** The Team Lead accepts the closure, or rejects specific items, each with a reason (2026-11-04). */
export function decideClosure(
  tenantId: string, journeyId: string, closureId: string, decision: 'ACCEPT' | 'REJECT',
  rejections: Array<{ key: string; reason: string }>, accessToken?: string,
) {
  return auditCoreRequest<{ closureId: string; acceptanceStatus: ClosureAcceptance }>(
    `${path(tenantId, journeyId)}/${encodeURIComponent(closureId)}/decision`,
    { method: 'POST', accessToken, body: JSON.stringify({ decision, rejections }) },
  );
}

export function listClosures(tenantId: string, status: ClosureAcceptance | undefined, accessToken?: string) {
  const query = status ? `?status=${status}` : '';
  return auditCoreRequest<{ status: string | null; counts: Record<ClosureAcceptance, number>; closures: ClosureListRow[] }>(
    `/p2/v1/tenants/${encodeURIComponent(tenantId)}/reviewer-closures${query}`, { accessToken },
  );
}

export const ACCEPTANCE_LABEL: Record<ClosureAcceptance, string> = {
  PENDING: 'Awaiting the Team Lead',
  ACCEPTED: 'Accepted',
  AUTO_ACCEPTED: 'Auto-approved',
  REJECTED: 'Rejected (back with the Reviewer)',
};
