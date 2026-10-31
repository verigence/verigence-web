import { istInputToIso } from '../../announcements/announcementLogic';
import type { UploadPauseCommand, UploadPauseRow } from '../../../services/audit-core/uploadPause';

/** SuperAdmin "Uploads paused for maintenance" control (2026-10-31). */
export const UPLOAD_PAUSE_MESSAGE_MAX = 500;

export type UploadPauseForm = { message: string; until: string };

/** The PUT that pauses uploads for all Projects, or the first problem with the form. */
export function pauseAllCommand(
  form: UploadPauseForm,
  now: Date = new Date(),
): { command: UploadPauseCommand; error?: undefined } | { command?: undefined; error: string } {
  const message = form.message.trim().replace(/\s+/g, ' ');
  if (message.length > UPLOAD_PAUSE_MESSAGE_MAX) {
    return { error: `Keep the message within ${UPLOAD_PAUSE_MESSAGE_MAX} characters.` };
  }
  let untilUtc: string | null = null;
  if (form.until.trim()) {
    const iso = istInputToIso(form.until);
    if (!iso) return { error: 'Enter the time uploads are back as a date and time (IST).' };
    if (new Date(iso).getTime() <= now.getTime()) return { error: 'That time has already passed. Choose a later time.' };
    untilUtc = iso;
  }
  return { command: { tenantId: null, paused: true, message: message || null, untilUtc } };
}

export const RESUME_ALL_COMMAND: UploadPauseCommand = { tenantId: null, paused: false };

/** The all-Projects row (tenantId null), if one was ever set. */
export function allProjectsRow(rows: readonly UploadPauseRow[] | undefined): UploadPauseRow | undefined {
  return rows?.find((row) => row.tenantId === null);
}

/** Projects paused on their own (not by the all-Projects switch), still in force. */
export function projectPauses(rows: readonly UploadPauseRow[] | undefined): UploadPauseRow[] {
  return (rows ?? []).filter((row) => row.tenantId !== null && row.active);
}
