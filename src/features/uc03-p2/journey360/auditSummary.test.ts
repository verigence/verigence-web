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
