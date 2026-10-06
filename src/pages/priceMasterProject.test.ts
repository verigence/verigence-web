import { describe, expect, it } from 'vitest';

import { formatRupees } from '../services/audit-core/priceMasters';
import { priceMasterAllowed } from './priceMasterProject';

describe('price master access', () => {
  it('lets PC, TL, PM and SuperAdmin browse', () => {
    expect(priceMasterAllowed('browse', 'PC', 'PC')).toBe(true);
    expect(priceMasterAllowed('browse', 'PC', 'TL')).toBe(true);
    expect(priceMasterAllowed('browse', 'PC', 'PM')).toBe(true);
    expect(priceMasterAllowed('browse', 'SUPER_ADMIN')).toBe(true);
    expect(priceMasterAllowed('browse', 'PC', 'CRM')).toBe(false);
    expect(priceMasterAllowed('browse', 'PC', undefined)).toBe(false);
  });

  it('lets only TL, PM and SuperAdmin upload', () => {
    expect(priceMasterAllowed('upload', 'PC', 'TL')).toBe(true);
    expect(priceMasterAllowed('upload', 'PC', 'PM')).toBe(true);
    expect(priceMasterAllowed('upload', 'SUPER_ADMIN')).toBe(true);
    expect(priceMasterAllowed('upload', 'PC', 'PC')).toBe(false);
    expect(priceMasterAllowed('upload', 'PC', 'EXECUTIVE')).toBe(false);
  });
});

describe('formatRupees', () => {
  it('keeps exact rupees and paise, and shows a dash for a missing amount, never a zero', () => {
    expect(formatRupees('1005900.00')).toContain('10,05,900');
    expect(formatRupees('1005900.00')).not.toContain('.00');
    expect(formatRupees('1234.50')).toContain('1,234.50');
    expect(formatRupees(null)).toBe('—');
    expect(formatRupees('')).toBe('—');
    expect(formatRupees('0.00')).toContain('0');
  });
});
