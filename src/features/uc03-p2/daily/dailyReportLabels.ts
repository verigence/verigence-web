import type { P2DailyUploadedFile, P2UploadedFileState } from '../../../services/audit-core/uc03P2';

/** A file's state in the words the report shows. `tone` drives the colour. */
export const FILE_STATE_LABELS: Record<P2UploadedFileState, { label: string; tone: 'ok' | 'warn' | 'bad' | 'muted' }> = {
  READ: { label: 'Read', tone: 'ok' },
  READING: { label: 'Being read', tone: 'warn' },
  PARTLY_FAILED: { label: 'Some pages failed', tone: 'bad' },
  NOT_UPLOADED: { label: 'Not uploaded', tone: 'bad' },
  UPLOAD_PENDING: { label: 'Upload not finished', tone: 'warn' },
  NOT_SPLIT: { label: 'Could not be split', tone: 'bad' },
  DUPLICATE: { label: 'Repeat of an earlier file', tone: 'muted' },
  CANCELLED: { label: 'Replaced or removed', tone: 'muted' },
};

/** What a person did on a task, in plain words. */
const ACTION_LABELS: Record<string, string> = {
  UPLOAD_DOCUMENT: 'Uploaded a document',
  REUPLOAD_DOCUMENT: 'Uploaded again',
  REVIEW_DOCUMENT: 'Reviewed a document',
  CORRECT_EXTRACTED_FIELD: 'Corrected a value',
  ADD_EVIDENCE: 'Added evidence',
  ADD_COMMENT: 'Commented',
  PROVIDE_FEEDBACK: 'Gave feedback',
  REQUEST_CLARIFICATION: 'Asked for clarification',
  COMPLETE_ACTION: 'Marked as done',
  APPROVE_CORRECTION: 'Approved a correction',
  REJECT_CORRECTION: 'Rejected a correction',
  ACCEPT: 'Accepted',
  REJECT: 'Sent back',
  ACCEPT_EXCEPTION: 'Accepted as exception',
  PROVIDE_VEHICLE_ID: 'Entered the vehicle id',
  CONFIRM_BREACH: 'Confirmed a breach',
  MARK_FALSE_POSITIVE: 'Marked false positive',
  CLOSE_TASK: 'Closed the task',
  COMPLETED: 'Completed',
  VERDICT: 'Gave a verdict',
};

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action.toLowerCase().replace(/_/g, ' ');
}

/** "Subhakanta Jena", else the role and the last six characters of the account id. */
export function personLabel(name: string | null, role: string | null, actorId: string | null): string {
  if (name?.trim()) return name.trim();
  const tail = (actorId ?? '').replace(/[^a-zA-Z0-9]/g, '').slice(-6);
  return `${role ?? 'User'}${tail ? ` ••••${tail}` : ' not recorded'}`;
}

export type FileFilter = 'ALL' | 'ATTENTION' | 'LARGE' | 'NOT_UPLOADED';

/** A file the TL should look at: failed, unfinished or not uploaded, rejected pages, or a large file. */
export function needsAttention(file: P2DailyUploadedFile): boolean {
  return file.large || file.documents.rejected > 0 || file.documents.failed > 0
    || ['PARTLY_FAILED', 'NOT_UPLOADED', 'UPLOAD_PENDING', 'NOT_SPLIT'].includes(file.state);
}

export function filterFiles(files: P2DailyUploadedFile[], filter: FileFilter): P2DailyUploadedFile[] {
  switch (filter) {
    case 'ATTENTION': return files.filter(needsAttention);
    case 'LARGE': return files.filter((f) => f.large);
    case 'NOT_UPLOADED': return files.filter((f) => f.state === 'NOT_UPLOADED' || f.state === 'UPLOAD_PENDING');
    default: return files;
  }
}

/** What the PC answered on a large file's notice. */
export function reviewText(file: P2DailyUploadedFile): string {
  if (!file.review) return 'No notice';
  if (file.review.status === 'OPEN') return file.review.comment ? `Not closed yet — “${file.review.comment}”` : 'Not reviewed yet';
  return file.review.comment ? `Reviewed — “${file.review.comment}”` : 'Reviewed';
}
