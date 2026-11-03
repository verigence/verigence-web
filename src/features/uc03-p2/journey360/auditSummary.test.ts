import { describe, expect, it } from 'vitest';

import { conclusionLabel } from './AuditSummaryTab';

describe('audit summary conclusions (2026-10-29)', () => {
  it('names who an exception costs', () => {
    expect(conclusionLabel({ conclusion: 'EXCEPTION', impact: 'CUSTOMER' })).toBe('Exception · customer pays more');
    expect(conclusionLabel({ conclusion: 'EXCEPTION', impact: 'COMPANY' })).toBe('Exception · dealership gives more');
  });
  it('labels the other conclusions plainly', () => {
    expect(conclusionLabel({ conclusion: 'OK', impact: null })).toBe('OK');
    expect(conclusionLabel({ conclusion: 'DISPUTED', impact: null })).toBe('Documents disagree');
    expect(conclusionLabel({ conclusion: 'CANNOT_DETERMINE', impact: null })).toBe('Cannot conclude');
    expect(conclusionLabel({ conclusion: 'UNSUPPORTED', impact: 'CUSTOMER' })).toBe('Unsupported');
  });
});

describe('balanceText', () => {
  it('says due or excess in words, never a bare minus (2026-11-03)', async () => {
    const { balanceText } = await import('./j360Format');
    expect(balanceText('-1858')).toBe(`${balanceText('1858').replace(' due', '')} excess received`);
    expect(balanceText('5000')).toMatch(/ due$/);
    expect(balanceText('0')).toBe('Settled');
    expect(balanceText(null)).toBe('—');
  });
});
