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
  answer?: string;
  answerSource?: 'REVIEWER' | 'ACCEPTED_CLAIM';
};

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
};

export type ReviewerClosurePreview = {
  journeyId: string;
  canClose: boolean;
  minAnswerLength: number;
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
