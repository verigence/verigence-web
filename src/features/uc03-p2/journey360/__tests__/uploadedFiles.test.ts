import { describe, expect, it } from 'vitest';

import { photoKind, sizeText } from '../UploadedFilesTab';

describe('Uploaded files in Journey 360 (2026-11-06)', () => {
  it('shows a file size the way a person reads it', () => {
    expect(sizeText(512)).toBe('512 B');
    expect(sizeText(307_342)).toBe('300 KB');
    expect(sizeText(4_718_592)).toBe('4.5 MB');
  });
});

describe('Photos and other documents under Uploaded files (2026-11-12)', () => {
  it('says what each one is, an Extra being a page the system did not understand', () => {
    expect(photoKind({ viewCode: 'EXTRA', contentType: 'application/pdf', filename: 'scan.pdf - page 3' }))
      .toBe('Extra: not understood by the system, not read');
    expect(photoKind({ viewCode: 'FRONT', contentType: 'image/jpeg', filename: 'a.jpg' })).toBe('Photo · Front');
    expect(photoKind({ viewCode: null, contentType: 'application/pdf', filename: 'rc.pdf' })).toBe('PDF');
  });
});
