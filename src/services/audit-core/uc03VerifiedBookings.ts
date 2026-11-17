import { auditCoreRequest } from './client';

/**
 * Verified bookings (product owner 2026-11-17): a Team Lead or Reviewer marks a
 * booking verified once its figures were checked against its papers; every night,
 * after each deploy and on demand Audit Core works them out again and says Matches
 * or Changed (and whether the papers changed since). Audit Core
 * /p2/v1/tenants/{tenantId}/journeys/{journeyId}/verified and /verified-bookings.
 */

export type VerifiedResult = 'MATCHES' | 'CHANGED' | 'PAPERS_CHANGED' | 'ERROR';

export type VerifiedChange = { field: string; verified: unknown; now: unknown };

export type JourneyVerified = {
  verifiedBy: string;
  verifiedRole: string | null;
  verifiedAt: string;
  comment: string | null;
  lastResult: VerifiedResult | null;
  lastCheckedAt: string | null;
  papersChanged: boolean | null;
  changes: VerifiedChange[];
};

export type JourneyVerifiedState = { verified: JourneyVerified | null; canMark: boolean; canSee: boolean };

export type VerifiedBooking = {
  journeyId: string;
  reference: string;
  customer: string | null;
  dealer: string;
  outlet: string;
  verifiedBy: string;
  verifiedRole: string | null;
  verifiedAt: string | null;
  comment: string | null;
  payable: string | null;
  received: string | null;
  lastCheck: null | {
    at: string;
    trigger: 'DAILY' | 'DEPLOY' | 'ON_DEMAND' | 'MARKED';
    result: VerifiedResult;
    papersChanged: boolean;
    changes: VerifiedChange[];
    error: string | null;
    codeVersion: string | null;
  };
};

export type VerifiedBookings = {
  items: VerifiedBooking[];
  counts: Record<VerifiedResult, number>;
  canCheck: boolean;
};

const base = (tenantId: string) => `/p2/v1/tenants/${encodeURIComponent(tenantId)}`;

export function getJourneyVerified(tenantId: string, journeyId: string, accessToken?: string) {
  return auditCoreRequest<JourneyVerifiedState>(
    `${base(tenantId)}/journeys/${encodeURIComponent(journeyId)}/verified`, { accessToken, cache: 'no-store' });
}

export function markJourneyVerified(tenantId: string, journeyId: string, comment: string, accessToken?: string) {
  return auditCoreRequest<{ reference: string; verified: boolean }>(
    `${base(tenantId)}/journeys/${encodeURIComponent(journeyId)}/verified`,
    { method: 'POST', body: JSON.stringify({ comment }), accessToken });
}

export function withdrawJourneyVerified(tenantId: string, journeyId: string, reason: string, accessToken?: string) {
  return auditCoreRequest<{ verified: boolean }>(
    `${base(tenantId)}/journeys/${encodeURIComponent(journeyId)}/verified/withdraw`,
    { method: 'POST', body: JSON.stringify({ reason }), accessToken });
}

export function listVerifiedBookings(tenantId: string, accessToken?: string) {
  return auditCoreRequest<VerifiedBookings>(`${base(tenantId)}/verified-bookings`, { accessToken, cache: 'no-store' });
}

export function checkVerifiedBookingsNow(tenantId: string, accessToken?: string) {
  return auditCoreRequest<{ queued: boolean; jobId: string }>(
    `${base(tenantId)}/verified-bookings/check`, { method: 'POST', accessToken });
}

export const RESULT_LABEL: Record<VerifiedResult, string> = {
  MATCHES: 'Matches',
  CHANGED: 'Changed by the system',
  PAPERS_CHANGED: 'Papers changed: verify again',
  ERROR: 'Could not be worked out',
};

/** "deal.payable" -> "Deal · payable": the field a change is about, readable. */
export function fieldLabel(path: string): string {
  const [head, ...rest] = path.split('.');
  const section: Record<string, string> = {
    deal: 'Deal', money: 'Money received', ndcPayments: 'NDC vs receipts', auditSummary: 'Audit summary',
    openTasks: 'Open tasks',
  };
  const words = rest.join(' · ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return [section[head] ?? head, words].filter(Boolean).join(' · ');
}

export function shown(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}
