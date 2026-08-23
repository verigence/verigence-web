import { auditCoreRequest } from './client';
import { newIdempotencyKey } from './uc03Booking';

export type Uc03StageCode = 'BOOKING' | 'DELIVERY';
export type Uc03FlagAction = 'ACKNOWLEDGE' | 'REVIEW' | 'RESOLVE' | 'REOPEN' | 'VOID';

export interface Uc03StageAuditView {
  stage: Uc03StageCode;
  businessStatus: string | null;
  auditState: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETE';
  auditStatus: 'NOT_EVALUATED' | 'NO_FLAGS' | 'FLAGS_RAISED';
  aggregateVersion: number;
  openFlagCount: number;
  totalHistoricalFlagCount: number;
  blockingOpenFlagCount: number;
}

export interface Uc03AuditSummary {
  journeyId: string;
  operatingRole: string;
  booking: Uc03StageAuditView | null;
  delivery: Uc03StageAuditView | null;
  openFlagCount: number;
  totalHistoricalFlagCount: number;
  highestOpenSeverity: string | null;
  machineFlagCount: number;
  humanFlagCount: number;
  permittedActions: string[];
}

export interface Uc03AuditFlag {
  flagId: string;
  stage: Uc03StageCode;
  category: string | null;
  severity: string;
  status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' | 'VOIDED';
  title: string;
  description: string | null;
  expectedSummary: string | null;
  observedSummary: string | null;
  resolutionReason: string | null;
  originKind: 'MACHINE' | 'HUMAN' | null;
  originRole: string | null;
  ruleKey: string | null;
  ruleVersionId: string | null;
  blockingCompletion: boolean;
  evidenceCount: number;
  version: number;
  createdAtUtc: string;
  updatedAtUtc: string;
}

export interface Uc03TimelineItem {
  kind: 'WORKFLOW' | 'FLAG' | 'REVIEW';
  stage: string | null;
  eventType: string;
  summary: string;
  actorRole: string | null;
  remarks: string | null;
  occurredAtUtc: string;
}

export interface FlagMutationResult {
  flag: Uc03AuditFlag;
  eventId: string;
  idempotent: boolean;
}

function token(accessToken?: string): string {
  const value = accessToken?.trim();
  if (!value) throw new Error('A Security human access token is required.');
  return value;
}

function base(tenantId: string, journeyId: string): string {
  return `/v1/tenants/${encodeURIComponent(tenantId)}/journeys/${encodeURIComponent(journeyId)}/uc03`;
}

function commandHeaders(prefix: string, version: number): HeadersInit {
  return {
    'Idempotency-Key': newIdempotencyKey(prefix),
    'If-Match': `"${version}"`,
  };
}

export function getAuditSummary(
  tenantId: string,
  journeyId: string,
  accessToken?: string,
): Promise<Uc03AuditSummary> {
  return auditCoreRequest(`${base(tenantId, journeyId)}/audit-summary`, {
    accessToken: token(accessToken),
    cache: 'no-store',
  });
}

export function listAuditFlags(
  tenantId: string,
  journeyId: string,
  accessToken?: string,
  stage?: Uc03StageCode,
): Promise<Uc03AuditFlag[]> {
  const query = stage ? `?stage=${stage}` : '';
  return auditCoreRequest(`${base(tenantId, journeyId)}/flags${query}`, {
    accessToken: token(accessToken),
    cache: 'no-store',
  });
}

export function getAuditTimeline(
  tenantId: string,
  journeyId: string,
  accessToken?: string,
): Promise<Uc03TimelineItem[]> {
  return auditCoreRequest(`${base(tenantId, journeyId)}/timeline?limit=150`, {
    accessToken: token(accessToken),
    cache: 'no-store',
  });
}

export function raiseAuditFlag(
  tenantId: string,
  journeyId: string,
  stage: Uc03StageCode,
  version: number,
  payload: {
    category: string;
    severity: string;
    summary: string;
    remarks?: string;
    evidenceIds?: string[];
  },
  accessToken?: string,
): Promise<FlagMutationResult> {
  return auditCoreRequest(`${base(tenantId, journeyId)}/flags`, {
    method: 'POST',
    accessToken: token(accessToken),
    headers: commandHeaders('uc03-audit-flag', version),
    body: JSON.stringify({
      stage,
      category: payload.category,
      severity: payload.severity,
      summary: payload.summary,
      remarks: payload.remarks || null,
      evidenceIds: payload.evidenceIds || [],
    }),
  });
}

export function actOnAuditFlag(
  tenantId: string,
  journeyId: string,
  flag: Uc03AuditFlag,
  action: Uc03FlagAction,
  remarks: string,
  accessToken?: string,
  evidenceIds: string[] = [],
): Promise<FlagMutationResult> {
  return auditCoreRequest(`${base(tenantId, journeyId)}/flags/${encodeURIComponent(flag.flagId)}/actions`, {
    method: 'POST',
    accessToken: token(accessToken),
    headers: commandHeaders(`uc03-audit-${action.toLowerCase()}`, flag.version),
    body: JSON.stringify({
      action,
      remarks: remarks || null,
      resolutionReason: ['RESOLVE', 'REOPEN', 'VOID'].includes(action) ? remarks : null,
      evidenceIds,
    }),
  });
}

export function addAuditFlagRemark(
  tenantId: string,
  journeyId: string,
  flag: Uc03AuditFlag,
  remarks: string,
  accessToken?: string,
  evidenceIds: string[] = [],
): Promise<FlagMutationResult> {
  return auditCoreRequest(`${base(tenantId, journeyId)}/flags/${encodeURIComponent(flag.flagId)}/remarks`, {
    method: 'POST',
    accessToken: token(accessToken),
    headers: commandHeaders('uc03-audit-remark', flag.version),
    body: JSON.stringify({ remarks, evidenceIds }),
  });
}

export function completeStageAudit(
  tenantId: string,
  journeyId: string,
  stage: Uc03StageAuditView,
  remarks: string,
  accessToken?: string,
): Promise<{ auditState: string; auditStatus: string; aggregateVersion: number }> {
  return auditCoreRequest(`${base(tenantId, journeyId)}/stages/${stage.stage}/audit/complete`, {
    method: 'POST',
    accessToken: token(accessToken),
    headers: commandHeaders(`uc03-${stage.stage.toLowerCase()}-audit-complete`, stage.aggregateVersion),
    body: JSON.stringify({ remarks: remarks || null }),
  });
}
