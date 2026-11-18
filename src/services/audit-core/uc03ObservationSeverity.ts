import { auditCoreRequest } from './client';

/**
 * Observation severity (product owner 2026-11-18): every journey has one — High,
 * Medium, Low or none. The system sets it from the Deal (a FASTag an invoice
 * charges and the NDC does not is High); a Reviewer, Team Lead or Project Manager
 * may set it over the system's, with a reason. Audit Core
 * /p2/v1/tenants/{tenantId}/journeys/{journeyId}/observation-severity.
 */
export type ObservationSeverity = 'HIGH' | 'MEDIUM' | 'LOW';

export type JourneySeverityState = {
  severity: ObservationSeverity | null;
  system: ObservationSeverity | null;
  reasons: Array<{ code: string; severity: ObservationSeverity; text: string }>;
  override: null | { severity: ObservationSeverity; reason: string; by: string | null; role: string | null; at: string | null };
  canChange: boolean;
};

export const SEVERITY_LABEL: Record<ObservationSeverity, string> = { HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low' };

const path = (tenantId: string, journeyId: string) =>
  `/p2/v1/tenants/${encodeURIComponent(tenantId)}/journeys/${encodeURIComponent(journeyId)}/observation-severity`;

export function getJourneySeverity(tenantId: string, journeyId: string, accessToken?: string) {
  return auditCoreRequest<JourneySeverityState>(path(tenantId, journeyId), { accessToken, cache: 'no-store' });
}

/** Set the severity (null: back to the system's), with a reason. */
export function setJourneySeverity(tenantId: string, journeyId: string, severity: ObservationSeverity | null,
  reason: string, accessToken?: string) {
  return auditCoreRequest<JourneySeverityState>(path(tenantId, journeyId),
    { method: 'PUT', body: JSON.stringify({ severity, reason }), accessToken });
}
