import { auditCoreRequest } from './client';

/**
 * "Uploads paused for maintenance" (product owner, 2026-10-31, month end):
 * while bookings that hold other customers' files are corrected, PCs do not
 * upload documents but still open bookings, read everything and work their
 * tasks. Audit Core refuses a new upload with 503 VAC-MAINT-001 while paused.
 *
 * GET /p2/v1/tenants/{t}/upload-pause   the signed-in user's Project
 * GET /v1/admin/upload-pause             SuperAdmin: every pause row
 * PUT /v1/admin/upload-pause             SuperAdmin: set or clear one
 */
export type UploadPauseStatus = { paused: boolean; message: string | null; untilUtc: string | null };

export type UploadPauseRow = {
  /** null: all Projects. */
  tenantId: string | null;
  paused: boolean;
  /** Paused and not yet past its until time. */
  active: boolean;
  message: string | null;
  untilUtc: string | null;
  setByActorId: string | null;
  setAtUtc: string;
};

export type UploadPauseRows = { items: UploadPauseRow[]; serverTimeUtc: string };

export type UploadPauseCommand = { tenantId: string | null; paused: boolean; message?: string | null; untilUtc?: string | null };

export function getUploadPause(tenantId: string, accessToken?: string): Promise<UploadPauseStatus> {
  return auditCoreRequest<UploadPauseStatus>(`/p2/v1/tenants/${encodeURIComponent(tenantId)}/upload-pause`, {
    accessToken, cache: 'no-store',
  });
}

export function getUploadPauses(accessToken: string): Promise<UploadPauseRows> {
  return auditCoreRequest<UploadPauseRows>('/v1/admin/upload-pause', { accessToken, cache: 'no-store' });
}

export function setUploadPause(command: UploadPauseCommand, accessToken: string): Promise<UploadPauseRows> {
  return auditCoreRequest<UploadPauseRows>('/v1/admin/upload-pause', {
    method: 'PUT', accessToken, body: JSON.stringify(command),
  });
}
