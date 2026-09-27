import { auditCoreRequest } from './client';

export interface BookingStageView {
  businessStatus: string | null;
  closureDisposition?: string | null;
  auditState: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETE';
  auditStatus: 'NOT_EVALUATED' | 'NO_FLAGS' | 'FLAGS_RAISED';
  closeReasonCode?: string | null;
  closureRemarks?: string | null;
}

export interface BookingDocumentView {
  requirementKey: string;
  documentTypeKey: string;
  requirementLevel: 'REQUIRED' | 'CONDITIONAL' | 'OPTIONAL';
  requirementStatus: string;
  applicabilityState: 'APPLICABLE' | 'NOT_APPLICABLE' | 'UNRESOLVED';
  applicabilityReason: string | null;
  answer: 'YES' | 'NO' | 'NA' | 'UNANSWERED';
  evidenceId: string | null;
  processingStatus: string | null;
  verificationStatus: string | null;
  updatedAtUtc: string | null;
}

export interface EvidenceRegion {
  type: string;
  coordinateSystem: string;
  box: [number, number, number, number];
}

export interface ExtractionProposalView {
  proposalId: string;
  fieldKey: string;
  sourceEvidenceId: string;
  sourceFactId: string;
  sourceFactVersion: number;
  sourceDocumentTypeKey: string | null;
  valueSource: string | null;
  proposedValue: unknown;
  confidence: number | null;
  pageNo?: number | null;
  evidenceRegion?: EvidenceRegion | null;
  status: 'PENDING' | 'ACCEPTED' | 'CORRECTED' | 'REJECTED' | 'SUPERSEDED';
  acceptedValue: unknown;
  canAccept: boolean;
  owningDomainKey: string | null;
  owningRecordReference: string | null;
  version: number;
}

export interface BookingFlagView {
  flagId: string;
  category: string | null;
  severity: string;
  status: string;
  title: string;
  description: string | null;
  originKind: 'MACHINE' | 'HUMAN' | null;
  originActorId: string | null;
  originRole: string | null;
  ruleKey: string | null;
  blockingCompletion: boolean;
  createdAtUtc: string;
  updatedAtUtc: string;
}

export interface BookingCompletionView {
  ready: boolean;
  blockers: Array<{ code: string; label: string }>;
  documentCount?: number;
  addressedDocumentCount?: number;
  pendingProposalCount?: number;
  blockingFlagCount?: number;
}

export interface BookingWorkspace {
  journeyId: string;
  bookingStage: BookingStageView;
  capture: Record<string, unknown>;
  documents: BookingDocumentView[];
  proposals: ExtractionProposalView[];
  flags: BookingFlagView[];
  completion: BookingCompletionView;
  processingSummary?: {
    pendingCount: number;
    failedCount: number;
    readyProposalCount: number;
  };
  flagSummary?: { openCount: number; totalCount: number };
  permittedActions: string[];
  aggregateVersion: number;
  operatingRole: string;
}

export interface BookingCommandResult {
  journeyId: string;
  businessStatus: string;
  closureDisposition: string | null;
  auditState: string;
  auditStatus: string;
  aggregateVersion: number;
}

function token(accessToken?: string): string {
  const value = accessToken?.trim();
  if (!value) throw new Error('A Security human access token is required.');
  return value;
}

function commandHeaders(idempotencyKey: string, version: number): HeadersInit {
  return {
    'Idempotency-Key': idempotencyKey,
    'If-Match': `"${version}"`,
  };
}

function base(tenantId: string, journeyId: string): string {
  return `/v1/tenants/${encodeURIComponent(tenantId)}/journeys/${encodeURIComponent(journeyId)}`;
}

export function newIdempotencyKey(prefix: string): string {
  const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${random}`;
}

export async function getBookingWorkspace(
  tenantId: string,
  journeyId: string,
  accessToken?: string,
): Promise<BookingWorkspace> {
  return auditCoreRequest<BookingWorkspace>(`${base(tenantId, journeyId)}/uc03-workspace`, {
    accessToken: token(accessToken),
    cache: 'no-store',
  });
}

export async function startBooking(
  tenantId: string,
  journeyId: string,
  version: number,
  accessToken?: string,
): Promise<BookingCommandResult> {
  return auditCoreRequest(`${base(tenantId, journeyId)}/booking/start`, {
    method: 'POST',
    accessToken: token(accessToken),
    headers: commandHeaders(newIdempotencyKey('uc03-booking-start'), version),
  });
}
