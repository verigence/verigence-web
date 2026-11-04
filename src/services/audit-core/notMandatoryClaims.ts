import { auditCoreRequest } from './client';

/**
 * A PC's "this document is not mandatory" claims on a journey, and the
 * Reviewer's accept / reject of each (product owner 2026-11-04). Audit Core
 * decides who may decide (Reviewer, Team Lead or Project Manager).
 */
export type NotMandatoryClaim = {
  taskId: string;
  requirementKey?: string | null;
  document: string;
  stage?: string | null;
  state: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  round: number;
  pcReason?: string | null;
  claimedBy?: string | null;
  claimedAt?: string | null;
  decidedBy?: string | null;
  decidedRole?: string | null;
  decidedAt?: string | null;
  decisionReason?: string | null;
};

function path(tenantId: string, journeyId: string, suffix = '') {
  return `/p2/v1/tenants/${encodeURIComponent(tenantId)}/journeys/${encodeURIComponent(journeyId)}/not-mandatory-claims${suffix}`;
}

export function getNotMandatoryClaims(tenantId: string, journeyId: string, accessToken?: string) {
  return auditCoreRequest<{ journeyId: string; claims: NotMandatoryClaim[] }>(path(tenantId, journeyId), { accessToken });
}

export function decideNotMandatoryClaim(
  tenantId: string, journeyId: string, taskId: string, decision: 'ACCEPT' | 'REJECT', reason: string, accessToken?: string,
) {
  return auditCoreRequest<{ taskId: string; status: string; outcome: string }>(
    path(tenantId, journeyId, `/${encodeURIComponent(taskId)}/decision`),
    { method: 'POST', accessToken, body: JSON.stringify({ decision, reason: reason.trim() || null }) },
  );
}

/** The PC's reason must say something beyond the button's own words; mirrors Audit Core. */
export const MIN_CLAIM_REASON = 10;
