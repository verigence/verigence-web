import { auditCoreRequest } from './client';
import { newIdempotencyKey } from './uc03Booking';
import type { CaptureV2Document, CaptureV2Requirement } from './uc03DocumentCaptureV2';
import { invalidateUnifiedCaptureReadState } from './uc03UnifiedDocumentCapture';

export interface DeliveryCaptureV2 {
  journeyId: string;
  externalContextRef: string;
  phase: 'DELIVERY';
  requirements: CaptureV2Requirement[];
  uploads: CaptureV2Document[];
  canSubmit: boolean;
  submitted: boolean;
}

export interface DeliveryCaptureV2Submission {
  journeyId: string;
  phase: 'DELIVERY';
  status: 'SUBMITTED';
  aggregateVersion: number;
  raisedFlagIds: string[];
}

/**
 * Phase 4 unification: this module's own GET/upload/finalize/delete/resync
 * (getDeliveryCaptureV2, uploadDeliveryCaptureV2Files,
 * deleteDeliveryCaptureV2Document, resyncDeliveryCaptureV2,
 * deliveryCaptureV2IsProcessing, and their shared read cache) are gone --
 * their backend endpoints no longer exist. Every screen reads/writes
 * documents through uc03UnifiedDocumentCapture.ts now, which covers both
 * Booking and Delivery in one call. This file keeps only the shared
 * response type (still used by DeliveryCaptureV2WorkspacePage.tsx and the
 * unified module itself) and submitDeliveryCaptureV2 -- genuinely different
 * from Booking's completeBookingCaptureV2 (idempotent/re-enterable, VIN-
 * reconciliation gate instead of SKU, its own workflow-task/TL-review side
 * effects), not stage-duplicated logic.
 */

function token(accessToken?: string): string {
  const value = accessToken?.trim();
  if (!value) throw new Error('A Security human access token is required.');
  return value;
}

function base(tenantId: string, journeyId: string): string {
  return `/v2/tenants/${encodeURIComponent(tenantId)}/journeys/${encodeURIComponent(journeyId)}/delivery`;
}

export async function submitDeliveryCaptureV2(
  tenantId: string,
  journeyId: string,
  accessToken?: string,
): Promise<DeliveryCaptureV2Submission> {
  const result = await auditCoreRequest<DeliveryCaptureV2Submission>(`${base(tenantId, journeyId)}/submit`, {
    method: 'POST',
    accessToken: token(accessToken),
    headers: { 'Idempotency-Key': newIdempotencyKey('uc03-v2-delivery-submit') },
  });
  invalidateUnifiedCaptureReadState(tenantId, journeyId);
  return result;
}
