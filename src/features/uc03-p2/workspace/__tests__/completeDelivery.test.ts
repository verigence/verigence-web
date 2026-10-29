import { describe, expect, it } from 'vitest';

import { completionReasonError } from '../P2CompleteDeliveryButton';

describe('completing a delivery by hand', () => {
  it('needs a reason of a few words', () => {
    expect(completionReasonError('')).toBeDefined();
    expect(completionReasonError('  ok ')).toBeDefined();
    expect(completionReasonError('Delivered on 24 Oct, photos not taken')).toBeUndefined();
  });
});
