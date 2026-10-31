import { AuditCoreHttpError } from '../../../services/audit-core/client';
import type { UploadPauseStatus } from '../../../services/audit-core/uploadPause';

/**
 * "Uploads paused for maintenance" (product owner, 2026-10-31): while the
 * switch is on, the documents screen says so and offers no way to upload;
 * everything else (opening bookings, reading, tasks) works as usual.
 */
export const UPLOAD_PAUSED_ERROR_CODE = 'VAC-MAINT-001';

export type UploadPauseState =
  | { paused: false }
  | { paused: true; message: string | null; untilUtc: string | null; notice: string };

const NOT_PAUSED: UploadPauseState = { paused: false };

/** "31 Oct, 11:30 pm IST". */
export function istTime(iso: string): string | null {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return null;
  return `${when.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata',
  })} IST`;
}

export function pauseNotice(untilUtc: string | null): string {
  const until = untilUtc ? istTime(untilUtc) : null;
  return `Uploads are paused for maintenance${until ? ` until ${until}` : ''}. You can still open bookings and work your tasks.`;
}

/**
 * What the screen does with the status it read. Unknown (not read yet, or the
 * read failed) means not paused: the server still refuses an upload while
 * paused, so the worst case is the server's message instead of this notice.
 * A pause whose time has passed is over without waiting for the next read.
 */
export function uploadPauseState(
  status: UploadPauseStatus | undefined,
  failed: boolean,
  now: Date = new Date(),
): UploadPauseState {
  if (failed || !status?.paused) return NOT_PAUSED;
  if (status.untilUtc) {
    const until = Date.parse(status.untilUtc);
    if (!Number.isNaN(until) && until <= now.getTime()) return NOT_PAUSED;
  }
  return { paused: true, message: status.message, untilUtc: status.untilUtc, notice: pauseNotice(status.untilUtc) };
}

/** Audit Core refused an upload because uploads are paused. */
export function isUploadPausedError(cause: unknown): cause is AuditCoreHttpError {
  return cause instanceof AuditCoreHttpError && cause.errorCode === UPLOAD_PAUSED_ERROR_CODE;
}

/** The server's own words for a paused refusal; otherwise the usual message. */
export function uploadErrorText(cause: unknown, fallback: string): string {
  if (isUploadPausedError(cause)) return cause.problem?.detail || cause.problem?.title || fallback;
  return cause instanceof Error && cause.message ? cause.message : fallback;
}
