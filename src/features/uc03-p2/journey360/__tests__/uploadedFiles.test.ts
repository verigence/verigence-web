import { describe, expect, it } from 'vitest';

import { sizeText } from '../UploadedFilesTab';

describe('Uploaded files in Journey 360 (2026-11-06)', () => {
  it('shows a file size the way a person reads it', () => {
    expect(sizeText(512)).toBe('512 B');
    expect(sizeText(307_342)).toBe('300 KB');
    expect(sizeText(4_718_592)).toBe('4.5 MB');
  });
});
