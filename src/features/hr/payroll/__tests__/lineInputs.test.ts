import { describe, expect, it } from 'vitest';

import { buildInputs, formFromLine, hasInputErrors, newAdjustment, validateInputs } from '../lineInputs';

describe('loss of pay and adjustments', () => {
  it('starts from what the line already has', () => {
    const f = formFromLine(1.5, [{ label: 'Festival bonus', amount: '1000', taxable: true, note: null }]);
    expect(f.extraLop).toBe('1.5');
    expect(f.adjustments[0]).toMatchObject({ label: 'Festival bonus', amount: '1000', taxable: true, note: '' });
    expect(formFromLine(0, []).extraLop).toBe('0');
  });

  it('accepts days from 0 to 31 with one decimal', () => {
    for (const ok of ['0', '3', '1.5', '31', '']) expect(validateInputs({ extraLop: ok, adjustments: [] }).extraLop).toBeUndefined();
    for (const bad of ['32', '1.55', '-1', 'x', '31.5']) expect(validateInputs({ extraLop: bad, adjustments: [] }).extraLop).toBeTruthy();
  });

  it('refuses a zero adjustment and accepts a negative one', () => {
    const row = (amount: string) => ({ ...newAdjustment(), label: 'Advance', amount });
    expect(validateInputs({ extraLop: '0', adjustments: [row('0')] }).rows[0].amount).toMatch(/zero/);
    expect(validateInputs({ extraLop: '0', adjustments: [row('0.00')] }).rows[0].amount).toMatch(/zero/);
    expect(hasInputErrors(validateInputs({ extraLop: '0', adjustments: [row('-500')] }))).toBe(false);
    expect(validateInputs({ extraLop: '0', adjustments: [row('1.234')] }).rows[0].amount).toBeTruthy();
  });

  it('sends amounts as text and leaves an empty note out', () => {
    const built = buildInputs({ extraLop: '', adjustments: [{ ...newAdjustment(), label: ' Bonus ', amount: '1,000', note: '' }] });
    expect(built).toEqual({ extra_lop_days: '0', adjustments: [{ label: 'Bonus', amount: '1000', taxable: true }] });
  });
});
