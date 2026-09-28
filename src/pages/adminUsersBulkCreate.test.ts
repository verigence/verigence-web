import { describe, expect, it } from 'vitest';

import type { GlobalUserDirectoryItem } from '../services/security/onboardingAdmin';
import { normalizeIndianMobile, planBulkCreate } from './adminUsersBulkCreate';

const existing = (primaryEmail: string, primaryMobile: string, status: string) =>
  ({ userId: primaryEmail, displayName: 'Existing', primaryEmail, primaryMobile, status }) as unknown as GlobalUserDirectoryItem;

describe('normalizeIndianMobile', () => {
  it('accepts spaced, 91- and 0-prefixed numbers', () => {
    expect(normalizeIndianMobile('90000 00001')).toBe('+919000000001');
    expect(normalizeIndianMobile('+91 90000-00001')).toBe('+919000000001');
    expect(normalizeIndianMobile('09000000001')).toBe('+919000000001');
    expect(normalizeIndianMobile('5000000001')).toBeNull();
    expect(normalizeIndianMobile('12345')).toBeNull();
  });
});

describe('planBulkCreate', () => {
  it('parses Excel rows, splits names and skips repeated people', () => {
    const text = [
      'Name\tMobile\tEmail\tPassword',
      'Sample Person One\t90000 00001\tone@example.test \tpw-1',
      'Sample Person One\t9000000001\tONE@example.test\tpw-1',
      'Two\t9000000002\ttwo@example.test\tpw-2',
      '',
    ].join('\n');
    const rows = planBulkCreate(text, []);
    expect(rows.map((r) => r.status)).toEqual(['NEW', 'DUPLICATE', 'NEW']);
    expect(rows[0].input).toEqual({ firstName: 'Sample', lastName: 'Person One', email: 'one@example.test',
      mobile: '+919000000001', password: 'pw-1' });
    expect(rows[1].message).toContain('line 2');
    expect(rows[2].input?.lastName).toBe('');
  });

  it('reports invalid rows, conflicting repeats and existing users', () => {
    const text = [
      'Bad\t12345\tnot-an-email\t',
      'A\t9000000003\ta@example.test\tpw',
      'B\t9000000003\tb@example.test\tpw',
      'C\t9000000004\tactive@example.test\tpw',
      'D\t9000000005\td@example.test\tpw',
    ].join('\n');
    const rows = planBulkCreate(text, [
      existing('active@example.test', '+919000000099', 'ACTIVE'),
      existing('someone@example.test', '9000000005', 'PENDING'),
    ]);
    expect(rows.map((r) => r.status)).toEqual(['ERROR', 'NEW', 'ERROR', 'EXISTS', 'PENDING']);
    expect(rows[0].message).toContain('Mobile');
    expect(rows[0].message).toContain('Email');
    expect(rows[0].message).toContain('Password');
    expect(rows.filter((r) => r.input)).toHaveLength(1);
  });
});
