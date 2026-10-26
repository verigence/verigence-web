import { describe, expect, it } from 'vitest';

import type { P2DailyUploadedFile } from '../../../services/audit-core/uc03P2';
import { actionLabel, filterFiles, needsAttention, personLabel, reviewText } from './dailyReportLabels';

const file = (over: Partial<P2DailyUploadedFile> = {}): P2DailyUploadedFile => ({
  batchId: 'b', journeyId: 'j', journeyReference: null, customerName: 'A', dealerName: null, outletName: null,
  outletCode: null, pcActorId: 'pc-1', pcName: 'Asha', filename: 'packet.pdf', pages: 3, state: 'READ',
  failureReason: null, uploadedAtUtc: null, documents: { read: 3, waiting: 0, failed: 0, rejected: 0 },
  large: false, review: null, openUrl: 'https://x', filePath: '/p', ...over,
});

describe('daily processing report labels', () => {
  it('flags a large file, a failed file and a file that never arrived, but not a clean one', () => {
    expect(needsAttention(file())).toBe(false);
    expect(needsAttention(file({ large: true, pages: 40 }))).toBe(true);
    expect(needsAttention(file({ state: 'PARTLY_FAILED', documents: { read: 1, waiting: 0, failed: 2, rejected: 0 } }))).toBe(true);
    expect(needsAttention(file({ state: 'NOT_UPLOADED', openUrl: null, filePath: null }))).toBe(true);
    expect(needsAttention(file({ documents: { read: 2, waiting: 0, failed: 1, rejected: 1 } }))).toBe(true);
  });

  it('filters the files by what the Team Lead is looking for', () => {
    const files = [file(), file({ batchId: 'big', large: true, pages: 30 }), file({ batchId: 'lost', state: 'NOT_UPLOADED' }),
      file({ batchId: 'wait', state: 'UPLOAD_PENDING' })];
    expect(filterFiles(files, 'ALL')).toHaveLength(4);
    expect(filterFiles(files, 'LARGE').map((f) => f.batchId)).toEqual(['big']);
    expect(filterFiles(files, 'NOT_UPLOADED').map((f) => f.batchId)).toEqual(['lost', 'wait']);
    expect(filterFiles(files, 'ATTENTION')).toHaveLength(3);
  });

  it('says what the PC answered on a large file', () => {
    expect(reviewText(file({ review: null }))).toBe('No notice');
    expect(reviewText(file({ review: { status: 'OPEN', comment: null } }))).toBe('Not reviewed yet');
    expect(reviewText(file({ review: { status: 'OPEN', comment: 'Checking' } }))).toBe('Not closed yet — “Checking”');
    expect(reviewText(file({ review: { status: 'CLOSED', comment: 'Full KYC set' } }))).toBe('Reviewed — “Full KYC set”');
  });

  it('names a person, falling back to their role and account when no name is stored', () => {
    expect(personLabel('Asha', 'PC', 'pc-1')).toBe('Asha');
    expect(personLabel(null, 'TL', 'tl-9f3a21c4')).toBe('TL ••••3a21c4');
    expect(personLabel(null, null, null)).toBe('User not recorded');
  });

  it('describes task actions in plain words', () => {
    expect(actionLabel('CLOSE_TASK')).toBe('Closed the task');
    expect(actionLabel('SOMETHING_NEW')).toBe('something new');
  });
});
