import { describe, expect, it } from 'vitest';

import { AuditCoreHttpError } from '../../../../services/audit-core/client';
import { replacedCopyOf } from '../P2DocumentEditor';

// UTK-SA-261103-044 (2026-11-16): the booking date task opened the page copy of
// the Booking Docket that was later read again as one document with its other
// pages, and the editor stopped at "Document was not found" (VAC-NF-000).
describe('a link to a replaced copy of a document', () => {
  it('names the copy in use when Audit Core says the copy was replaced', () => {
    const error = new AuditCoreHttpError(404, {
      errorCode: 'VAC-NF-034', title: 'Document replaced', status: 404,
      detail: 'This copy was replaced by a newer reading of the same document. Open the current copy.',
      currentDocumentId: 'df98d1e0-c12f-4c8c-b653-f74b635c9fa0',
    });
    expect(replacedCopyOf(error)).toBe('df98d1e0-c12f-4c8c-b653-f74b635c9fa0');
  });

  it('leaves every other failure as it is', () => {
    expect(replacedCopyOf(new AuditCoreHttpError(404, { errorCode: 'VAC-NF-000', detail: 'Document was not found.' }))).toBeUndefined();
    expect(replacedCopyOf(new AuditCoreHttpError(503, { errorCode: 'VAC-SYS-002', currentDocumentId: 'x' }))).toBeUndefined();
    expect(replacedCopyOf(new Error('network'))).toBeUndefined();
    expect(replacedCopyOf(undefined)).toBeUndefined();
  });
});
