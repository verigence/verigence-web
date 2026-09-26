import { auditCoreRequest } from './client';
import { newIdempotencyKey } from './uc03Booking';

export type CaptureV2Applicability = 'APPLICABLE' | 'NOT_APPLICABLE' | 'UNRESOLVED';

export interface CaptureV2Declaration {
  conditionKey: string;
  applicable: boolean;
  documentAvailable: boolean | null;
  source: 'PC' | 'DOCUMENT';
}

export interface CaptureV2Document {
  documentId: string;
  clientUploadId: string;
  state: string;
  classifiedDocumentTypeKey: string | null;
  originalFilename: string;
  contentUrl: string | null;
  processingStatus: string | null;
}

export interface CaptureV2Requirement {
  requirementKey: string;
  label: string;
  documentTypeKey: string;
  requirementLevel: 'REQUIRED' | 'CONDITIONAL' | 'OPTIONAL' | string;
  conditionKey: string | null;
  applicabilityState: CaptureV2Applicability;
  state: string;
  document: CaptureV2Document | null;
  canView: boolean;
  canDelete: boolean;
  needsDecision: boolean;
  blocksContinue: boolean;
}

export interface BookingCaptureV2 {
  journeyId: string;
  externalContextRef: string;
  phase: 'BOOKING';
  requirements: CaptureV2Requirement[];
  uploads: CaptureV2Document[];
  declarations: CaptureV2Declaration[];
  canContinue: boolean;
}

export interface BookingCaptureV2Completion {
  journeyId: string;
  phase: 'BOOKING';
  status: 'COMPLETED';
  aggregateVersion: number;
}

/**
 * Phase 4 unification: this module's own GET/upload/finalize/delete/resync
 * (getBookingCaptureV2, uploadBookingCaptureV2Files, deleteBookingCaptureV2Document,
 * resyncBookingCaptureV2, captureV2HasPendingClassification, and their shared
 * read cache) are gone -- their backend endpoints no longer exist. Every
 * screen reads/writes documents through uc03UnifiedDocumentCapture.ts now,
 * which covers both Booking and Delivery in one call. This file keeps only
 * the shared response types (still used by CaptureUploadInventory.tsx,
 * CaptureDocumentCard.tsx, uc03CreateBooking.ts and the unified module
 * itself) and the two Booking-specific actions that are genuinely different
 * from Delivery's, not stage-duplicated logic: completeBookingCaptureV2
 * (strict optimistic-concurrency, one-shot -- see its own docstring on the
 * backend) and setBookingCaptureV2Declaration (conditional-document
 * declarations, a Booking-only concept with no Delivery counterpart).
 */

function token(accessToken?: string): string {
  const value = accessToken?.trim();
  if (!value) throw new Error('A Security human access token is required.');
  return value;
}

function base(tenantId: string, journeyId: string): string {
  return `/v2/tenants/${encodeURIComponent(tenantId)}/journeys/${encodeURIComponent(journeyId)}/booking`;
}

export async function setBookingCaptureV2Declaration(
  tenantId: string,
  journeyId: string,
  conditionKey: string,
  applicable: boolean,
  documentAvailable: boolean | null,
  accessToken?: string,
): Promise<BookingCaptureV2> {
  return auditCoreRequest<BookingCaptureV2>(
    `${base(tenantId, journeyId)}/declarations/${encodeURIComponent(conditionKey)}`,
    {
      method: 'PUT',
      accessToken: token(accessToken),
      body: JSON.stringify({ applicable, documentAvailable }),
    },
  );
}

export async function completeBookingCaptureV2(
  tenantId: string,
  journeyId: string,
  aggregateVersion: number,
  accessToken?: string,
): Promise<BookingCaptureV2Completion> {
  return auditCoreRequest<BookingCaptureV2Completion>(`${base(tenantId, journeyId)}/complete`, {
    method: 'POST',
    accessToken: token(accessToken),
    headers: {
      'Idempotency-Key': newIdempotencyKey('uc03-v2-booking-complete'),
      'If-Match': `"${aggregateVersion}"`,
    },
  });
}
