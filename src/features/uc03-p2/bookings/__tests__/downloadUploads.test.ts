import { describe, expect, it } from 'vitest';

import type { P2UploadedFile } from '../../../../services/audit-core/uc03P2';
import { pickUpload } from '../DownloadUploadsAction';

const file = (batchId: string, status = 'COMPLETED') => ({ batchId, status }) as P2UploadedFile;

describe('Download uploaded PDF from the Actions menu', () => {
  it('downloads the only upload straight away', () => {
    expect(pickUpload([file('b1')])).toEqual({ batchId: 'b1' });
  });
  it('leaves out removed or repeated uploads', () => {
    expect(pickUpload([file('b1', 'CANCELLED'), file('b2')])).toEqual({ batchId: 'b2' });
  });
  it('asks which file when the PC uploaded several', () => {
    expect(pickUpload([file('b1'), file('b2', 'FAILED')])).toBe('choose');
  });
  it('says nothing is uploaded yet', () => {
    expect(pickUpload([])).toBe('none');
    expect(pickUpload([file('b1', 'CANCELLED')])).toBe('none');
  });
});
