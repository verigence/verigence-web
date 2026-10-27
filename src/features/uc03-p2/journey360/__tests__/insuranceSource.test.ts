import { describe, expect, it } from 'vitest';

import { insuranceDecidedText } from '../insuranceSource';

describe('insurance source label', () => {
  it('says who or what decided it', () => {
    expect(insuranceDecidedText({ decidedBy: 'PC' })).toContain('confirmed by PC');
    expect(insuranceDecidedText({ decidedBy: 'DOCUMENT' })).toContain('shown by the documents');
    expect(insuranceDecidedText({ decidedBy: 'UNCONFIRMED' })).toContain('PC task raised');
    expect(insuranceDecidedText({ decidedBy: 'DEFAULT' })).toContain('assumed');
  });
});
