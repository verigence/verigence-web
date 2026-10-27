import { describe, expect, it } from 'vitest';

import type { P2Template } from '../../../services/audit-core/uc03P2';
import { documentTypeOptions, OTHER_DOCUMENT_TEMPLATE, othersNameProblem } from '../workspace/DocumentTypePicker';
import { OTHER_DOCUMENT_TEMPLATE as LIST_OTHER } from '../workspace/P2DocumentList';
import { resendPages, typeName, unclassifiedPage } from './documentTaskActions';

const template = (key: string, displayName: string, requirement = 'REQUIRED', diTypes = [key]) =>
  ({ key, displayName, requirement, diTypes, stage: 'BOOKING' }) as unknown as P2Template;

describe('"What is this document?" on the task card (2026-10-27)', () => {
  it('asks about the page of an open "Set the document type" task only', () => {
    const task = { task_type: 'PC_VERIFY_UNRECOGNIZED_DOCUMENT', task_status: 'READY', reference: { queueId: 'q1' } };
    expect(unclassifiedPage(task)).toBe('q1');
    expect(unclassifiedPage({ ...task, task_status: 'RETURNED' })).toBe('q1');
    expect(unclassifiedPage({ ...task, task_status: 'VERIFIED_COMPLETE' })).toBeUndefined();
    expect(unclassifiedPage({ ...task, reference: {} })).toBeUndefined();
    expect(unclassifiedPage({ ...task, task_type: 'DOCUMENT_RESUBMIT' })).toBeUndefined();
  });

  it('offers the same types as the Upload / Edit Documents card', () => {
    const options = documentTypeOptions([
      template('pan_card', 'PAN Card'), template('aadhaar', 'Aadhaar'),
      template(OTHER_DOCUMENT_TEMPLATE, 'Supporting', 'SUPPORTING', []), template('upi_screenshot', 'UPI', 'SUPPORTING'),
      template('photo_only', 'Photo', 'OPTIONAL', []),
    ]);
    expect(options.map((o) => o.key)).toEqual(['aadhaar', 'pan_card', 'upi_screenshot']);
    expect(LIST_OTHER).toBe(OTHER_DOCUMENT_TEMPLATE);
  });

  it('keeps a page as Others only with a name', () => {
    expect(othersNameProblem(' a ')).toMatch(/name/);
    expect(othersNameProblem('Employer letter')).toBeUndefined();
  });
});

describe('"Document to resubmit": send a failed page again (2026-10-27)', () => {
  const task = (pages: unknown, status = 'READY') => ({ task_type: 'DOCUMENT_RESUBMIT', task_status: status, reference: { pages } });

  it('sends again a page of known type, and asks the type of one that was never identified', () => {
    expect(resendPages(task([
      { queueId: 'q1', pageNumbers: [1], templateKey: 'aadhaar', code: 'NOT_READ_IN_30_MIN' },
      { queueId: 'q2', pageNumbers: [2, 3], templateKey: null, code: 'NOT_READ_IN_30_MIN' },
      { queueId: 'q3', pageNumbers: [4] },
    ]))).toEqual([
      { queueId: 'q1', pages: [1], templateKey: 'aadhaar' },
      { queueId: 'q2', pages: [2, 3], templateKey: null },
      { queueId: 'q3', pages: [4], templateKey: null },
    ]);
  });

  it('never offers a page refused for scan quality, a malformed entry, or anything on a closed task', () => {
    expect(resendPages(task([
      { queueId: 'q1', pageNumbers: [1], code: 'DI_QUALITY_IMAGE_BLUR_SCORE' },
      { queueId: 'q2', pageNumbers: [] },
      { pageNumbers: [3] },
      null,
    ]))).toEqual([]);
    expect(resendPages(task([{ queueId: 'q1', pageNumbers: [1] }], 'VERIFIED_COMPLETE'))).toEqual([]);
    expect(resendPages({ task_type: 'PC_PAGE_QUALITY_REJECTED', task_status: 'READY',
      reference: { pages: [{ queueId: 'q1', pageNumbers: [1] }] } })).toEqual([]);
    expect(resendPages(task(undefined))).toEqual([]);
  });

  it('names the known type', () => {
    expect(typeName('aadhaar', [template('aadhaar', 'Aadhaar Card')])).toBe('Aadhaar Card');
    expect(typeName('cost_sheet', [])).toBe('cost sheet');
    expect(typeName(null, [])).toBeUndefined();
  });
});
