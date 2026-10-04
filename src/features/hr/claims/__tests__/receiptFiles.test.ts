import { describe, expect, it } from 'vitest';

import { MAX_RECEIPT_BYTES } from '../../../../services/hr/claims';
import { receiptFileProblem, receiptSendProblem, scaledSize } from '../receiptFiles';

describe('receipt files', () => {
  it('only takes images that are not empty', () => {
    expect(receiptFileProblem({ type: 'application/pdf', size: 10 })).toBeTruthy();
    expect(receiptFileProblem({ type: 'image/heic', size: 0 })).toBeTruthy();
    expect(receiptFileProblem({ type: 'image/heic', size: 10 })).toBeNull();
  });
  it('sends only types and sizes the service accepts', () => {
    expect(receiptSendProblem({ type: 'image/jpeg', size: MAX_RECEIPT_BYTES })).toBeNull();
    expect(receiptSendProblem({ type: 'image/jpeg', size: MAX_RECEIPT_BYTES + 1 })).toMatch(/5 MB/);
    expect(receiptSendProblem({ type: 'image/heic', size: 10 })).toMatch(/JPEG, PNG or WebP/);
  });
  it('shrinks the long side to 1600 and never enlarges', () => {
    expect(scaledSize(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(scaledSize(3000, 4000)).toEqual({ width: 1200, height: 1600 });
    expect(scaledSize(800, 600)).toEqual({ width: 800, height: 600 });
  });
});
