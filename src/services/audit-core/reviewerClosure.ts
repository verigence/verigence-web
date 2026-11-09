import { auditCoreRequest } from './client';

/**
 * A Reviewer closes a journey with a closure summary (product owner
 * 2026-11-04). Audit Core lists what is open -- required documents not on
 * file, open findings, other open tasks -- the same way every time; each needs
 * its own answer before the close goes through.
 */
export type ClosureItemKind = 'MISSING_DOCUMENT' | 'OPEN_FINDING' | 'OPEN_TASK' | 'CONFIRMED_FINDING' | 'NOTE' | 'ADDED';

/** Observation severity (product owner 2026-11-09). */
export type ObservationSeverity = 'HIGH' | 'MEDIUM' | 'LOW';
export const SEVERITIES: ObservationSeverity[] = ['HIGH', 'MEDIUM', 'LOW'];
export const SEVERITY_LABEL: Record<ObservationSeverity, string> = { HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low' };
export const SEVERITY_TONE: Record<ObservationSeverity, 'danger' | 'warning' | 'neutral'> = {
  HIGH: 'danger', MEDIUM: 'warning', LOW: 'neutral',
};

/** The Reviewer's decision on one item: an observation (with its severity), or not (with why). */
export type ObservationChoice = {
  stands: boolean;
  severity?: ObservationSeverity | null;
  justification?: string;
  note?: string;
};

/** An observation a Reviewer or Team Lead adds of their own. */
export type AddedObservation = { title: string; detail?: string; severity: ObservationSeverity };

/** One observation of a closure as the report shows it (older closures included). */
export type ClosureObservation = {
  key: string;
  kind: ClosureItemKind;
  stage?: string | null;
  label: string;
  detail?: string | null;
  stands: boolean;
  severity: ObservationSeverity | null;
  justification: string | null;
  note: string | null;
  source: 'SYSTEM' | 'REVIEWER' | 'TL' | 'PM';
  tlRejection: string | null;
};

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
  /** Offered for the item (2026-11-09); absent from an older Audit Core. */
  suggestedSeverity?: ObservationSeverity;
  suggestedStands?: boolean;
  /** Kept from the last closure: it stood as an observation. */
  previousDecision?: { stands: boolean; severity?: ObservationSeverity | null; note?: string | null } | null;
  /** On a closed item: the decision taken. */
  stands?: boolean;
  observationSeverity?: ObservationSeverity | null;
  justification?: string | null;
  note?: string | null;
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
  /** 2026-11-09: every observation in one shape, and the counts by severity. */
  observations?: ClosureObservation[];
  severityCounts?: Record<ObservationSeverity, number>;
  added?: ClosureItem[];
  tlAdded?: ClosureItem[];
  remarks?: string | null;
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
  severities?: ObservationSeverity[];
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

export type ClosureSubmission = {
  comment: string;
  observations: Record<string, ObservationChoice>;
  added: AddedObservation[];
  remarks?: string;
};

export function closeJourneyAsReviewer(tenantId: string, journeyId: string, submission: ClosureSubmission,
  accessToken?: string) {
  const observations = Object.fromEntries(Object.entries(submission.observations).map(([key, choice]) => [key, {
    stands: choice.stands,
    severity: choice.stands ? choice.severity ?? null : null,
    justification: choice.stands ? undefined : (choice.justification ?? '').trim() || undefined,
    note: choice.stands ? (choice.note ?? '').trim() || undefined : undefined,
  }]));
  return auditCoreRequest<{ closureId: string; deliveryOutcome: string; itemCount: number;
    severityCounts?: Record<ObservationSeverity, number> }>(path(tenantId, journeyId), {
    method: 'POST', accessToken,
    body: JSON.stringify({
      comment: submission.comment.trim(), observations,
      added: submission.added.map((a) => ({ title: a.title.trim(), detail: a.detail?.trim() || undefined, severity: a.severity })),
      remarks: submission.remarks?.trim() || undefined,
    }),
  });
}

export const CLOSURE_KIND_LABEL: Record<ClosureItemKind, string> = {
  MISSING_DOCUMENT: 'Mandatory document not on file',
  OPEN_FINDING: 'Reported violation / finding not resolved',
  OPEN_TASK: 'Open task',
  CONFIRMED_FINDING: 'Breach confirmed by the Team Lead',
  NOTE: 'For information',
  ADDED: 'Added observation',
};

/** The form's starting decision for each item: what Audit Core suggests,
 * or what the last closure kept. */
export function initialChoices(items: ClosureItem[]): Record<string, ObservationChoice> {
  return Object.fromEntries(items.map((item) => {
    if (item.previousDecision?.stands) {
      return [item.key, { stands: true, severity: item.previousDecision.severity ?? item.suggestedSeverity ?? 'MEDIUM',
        note: item.previousDecision.note ?? '' }];
    }
    const stands = item.suggestedStands ?? !item.prefilledAnswer;
    return [item.key, { stands, severity: stands ? item.suggestedSeverity ?? 'MEDIUM' : null,
      justification: '', note: '' }];
  }));
}

/** Items whose decision is not complete: an observation needs a severity; an
 * item that is not one needs a justification (an accepted claim's counts). */
export function undecidedItems(items: ClosureItem[], choices: Record<string, ObservationChoice>, min: number): ClosureItem[] {
  return items.filter((item) => {
    const choice = choices[item.key];
    if (!choice) return true;
    if (choice.stands) return !choice.severity;
    return ((choice.justification ?? '').trim() || (item.prefilledAnswer ?? '')).trim().length < min;
  });
}

/** Added observations that are incomplete: a title of 5+ characters and a severity. */
export function incompleteAdded(added: AddedObservation[]): number {
  return added.filter((a) => a.title.trim().length < 5 || !a.severity).length;
}

/** The counts by severity of what will stand. */
export function standingCounts(choices: Record<string, ObservationChoice>, added: AddedObservation[]):
Record<ObservationSeverity, number> {
  const counts: Record<ObservationSeverity, number> = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const choice of Object.values(choices)) if (choice.stands && choice.severity) counts[choice.severity] += 1;
  for (const a of added) if (a.severity) counts[a.severity] += 1;
  return counts;
}

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
  answers: Record<string, string>, choices?: Record<string, ObservationChoice>,
): string | undefined {
  const shown = new Set(shownKeys);
  const min = fresh.minAnswerLength ?? 10;
  const stillOpen = choices ? undecidedItems(fresh.items, choices, min) : unansweredItems(fresh.items, answers, min);
  const added = fresh.items.filter((item) => !shown.has(item.key));
  if (added.length) {
    return `${added.length === 1 ? 'An item' : `${added.length} items`} opened while this form was open: `
      + `${added.map((item) => item.label).join('; ')}. Decide ${added.length === 1 ? 'it' : 'each'} below.`;
  }
  if (fresh.blockers.length) return fresh.blockers.join(' ');
  if (stillOpen.length) return `Decide: ${stillOpen.map((item) => item.label).join('; ')}.`;
  if (!fresh.canClose) return 'This journey cannot be closed now.';
  return undefined;
}

/** The Team Lead accepts the closure, or rejects specific items, each with a reason (2026-11-04). */
export function decideClosure(
  tenantId: string, journeyId: string, closureId: string, decision: 'ACCEPT' | 'REJECT',
  rejections: Array<{ key: string; reason: string }>, accessToken?: string, added: AddedObservation[] = [],
) {
  return auditCoreRequest<{ closureId: string; acceptanceStatus: ClosureAcceptance }>(
    `${path(tenantId, journeyId)}/${encodeURIComponent(closureId)}/decision`,
    { method: 'POST', accessToken, body: JSON.stringify({ decision, rejections,
      added: added.map((a) => ({ title: a.title.trim(), detail: a.detail?.trim() || undefined, severity: a.severity })) }) },
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
