import { auditCoreRequest } from './client';

/**
 * Journey files taken from the Project's Google Drive (product owner 7 and 12 Nov 2026). The PC
 * keeps a customer's files in one folder, <Project> / <Dealership> / <Outlet> / <Name-Number>, in
 * the Project's own Google account; Verigence takes what is new when the PC submits, at 21:00
 * every day, or on demand for a Team Lead, PM, Executive or Reviewer. Audit Core
 * /p2/v1/tenants/{t}/integrations/google-drive and /p2/v1/tenants/{t}/drive.
 */

export type DriveConnection = {
  configured: boolean;
  connected: boolean;
  status: 'NOT_CONNECTED' | 'CONNECTED' | 'DISCONNECTED' | 'ERROR';
  account: string | null;
  folderUrl: string | null;
  retentionDays: number | null;
  lastCheckedAtUtc: string | null;
  problem: string | null;
  canConnect: boolean;
  canRun: boolean;
  waitingByOutlet: Record<string, number>;
  waiting: number;
};

export type DriveFileState =
  | 'WAITING' | 'TAKEN' | 'READING' | 'DUPLICATE' | 'NEW_BOOKING' | 'ADDED_TO_BOOKING' | 'KEPT_FOR_REVIEW'
  | 'SET_ASIDE' | 'FAILED';

export type DriveRescan = { pages: number[]; reason: string; code: string | null };

export type DriveFile = {
  filename: string;
  kind: 'DOCUMENT' | 'PHOTO';
  state: DriveFileState;
  detail: string | null;
  uploadDate: string | null;
  seenAtUtc: string | null;
  pages: number;
  pagesRead: number;
  rescan: DriveRescan[];
};

export type DriveListedFile = DriveFile & {
  outletId: string;
  customerFolder: string | null;
  bookingNumber: string | null;
  journeyId: string | null;
  journeyReference: string | null;
};

export type DriveTotals = {
  files: number; documents: number; photos: number; taken: number; duplicates: number; setAside: number;
  failed: number; waiting: number; reading: number; newBookings: number; addedToBookings: number;
  keptForReview: number; pages: number; pagesRead: number; pagesToRescan: number; pagesReading: number;
  manualVerificationTasks: number;
};

export type DriveRun = {
  runId: string;
  trigger: 'PC_SUBMIT' | 'END_OF_DAY' | 'ON_DEMAND';
  mode: 'NOW' | 'BATCH';
  status: 'REQUESTED' | 'RUNNING' | 'READING' | 'DONE' | 'FAILED';
  requestedBy: string;
  requestedByRole: string | null;
  requestedByName: string | null;
  dealerId: string | null;
  outletId: string | null;
  date: string | null;
  summary: { totals?: DriveTotals; taken?: Record<string, number>; found?: Record<string, number> };
  detail: string | null;
  requestedAtUtc: string | null;
  startedAtUtc: string | null;
  finishedAtUtc: string | null;
};

export type DriveCustomer = {
  outletId: string | null;
  outletName: string | null;
  dealerName: string | null;
  customerFolder: string | null;
  bookingNumber: string | null;
  journeyId: string | null;
  journeyReference: string | null;
  files: DriveFile[];
  pages: number;
  pagesRead: number;
  pagesToRescan: number;
  manualVerificationTasks: number;
};

export type DriveRunReport = { run: DriveRun; totals: DriveTotals; customers: DriveCustomer[] };
export type DriveRunList = { items: DriveRun[]; inProgress: number };
export type DriveFileList = { date: string; totals: DriveTotals; files: DriveListedFile[] };

const base = (tenantId: string) => `/p2/v1/tenants/${encodeURIComponent(tenantId)}`;

export function getDriveConnection(tenantId: string, accessToken?: string) {
  return auditCoreRequest<DriveConnection>(`${base(tenantId)}/integrations/google-drive`, { accessToken, cache: 'no-store' });
}

/** Where to send the browser to approve as the Project's Google account (an administrator). */
export function connectDrive(tenantId: string, accessToken?: string) {
  return auditCoreRequest<{ authUrl: string }>(`${base(tenantId)}/integrations/google-drive/connect`,
    { method: 'POST', accessToken });
}

export function setDriveRetention(tenantId: string, retentionDays: number, accessToken?: string) {
  return auditCoreRequest<{ retentionDays: number }>(`${base(tenantId)}/integrations/google-drive/settings`,
    { method: 'PUT', accessToken, body: JSON.stringify({ retentionDays }) });
}

export function startDriveRun(
  tenantId: string,
  command: { outletId?: string | null; dealerId?: string | null; date?: string | null; requestedByName?: string | null },
  accessToken?: string,
) {
  return auditCoreRequest<DriveRun>(`${base(tenantId)}/drive/runs`, { method: 'POST', accessToken, body: JSON.stringify(command) });
}

export function listDriveRuns(tenantId: string, accessToken?: string, limit = 20) {
  return auditCoreRequest<DriveRunList>(`${base(tenantId)}/drive/runs?limit=${limit}`, { accessToken, cache: 'no-store' });
}

export function getDriveRun(tenantId: string, runId: string, accessToken?: string) {
  return auditCoreRequest<DriveRunReport>(`${base(tenantId)}/drive/runs/${encodeURIComponent(runId)}`,
    { accessToken, cache: 'no-store' });
}

export function listWaitingDriveFiles(tenantId: string, accessToken?: string) {
  return auditCoreRequest<DriveFileList>(`${base(tenantId)}/drive/files?waitingOnly=true`, { accessToken, cache: 'no-store' });
}

export const DRIVE_STATE_LABELS: Record<DriveFileState, { label: string; tone: 'ok' | 'warn' | 'bad' | 'open' }> = {
  WAITING: { label: 'Waiting to be taken', tone: 'open' },
  TAKEN: { label: 'Kept on the booking', tone: 'ok' },
  READING: { label: 'Being read', tone: 'open' },
  DUPLICATE: { label: 'Exact duplicate — not read', tone: 'warn' },
  NEW_BOOKING: { label: 'New booking', tone: 'ok' },
  ADDED_TO_BOOKING: { label: 'Added to booking', tone: 'ok' },
  KEPT_FOR_REVIEW: { label: 'Kept for review', tone: 'warn' },
  SET_ASIDE: { label: 'Not taken', tone: 'warn' },
  FAILED: { label: 'Failed', tone: 'bad' },
};

export const DRIVE_TRIGGER_LABELS: Record<DriveRun['trigger'], string> = {
  PC_SUBMIT: 'Submitted by the PC',
  END_OF_DAY: 'End of day',
  ON_DEMAND: 'On demand',
};

export const DRIVE_RETURN_MESSAGES: Record<string, { text: string; ok: boolean }> = {
  connected: { text: 'Google Drive is connected. The Project’s folders are being made.', ok: true },
  declined: { text: 'The approval was not given on Google’s screen. Google Drive is not connected.', ok: false },
  expired: { text: 'The approval took too long. Press Connect Google Drive again.', ok: false },
  'no-offline-access': { text: 'Google did not give ongoing access. Press Connect Google Drive again and allow it.', ok: false },
  failed: { text: 'Google Drive could not be connected. Try again; if it repeats, tell the administrator.', ok: false },
};

export function driveRunInProgress(run: DriveRun): boolean {
  return run.status === 'REQUESTED' || run.status === 'RUNNING' || run.status === 'READING';
}

/** "page 3", "pages 2, 5" or "the whole file". */
export function rescanPages(rescan: DriveRescan): string {
  if (!rescan.pages.length) return 'the whole file';
  return `page${rescan.pages.length === 1 ? '' : 's'} ${rescan.pages.join(', ')}`;
}
