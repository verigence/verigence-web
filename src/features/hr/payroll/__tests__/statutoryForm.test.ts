import { describe, expect, it } from 'vitest';

import { formFromConfig, formSignature, newSlab, validateStatutory } from '../statutoryForm';

describe('statutory form', () => {
  it('starts empty when the service has no numbers: nothing is prefilled', () => {
    const form = formFromConfig({ pf: { enabled: false, rounding: 'NEAREST' }, esi: { enabled: false }, pt: { enabled: false, slabs: [] } });
    expect(form.pf).toEqual({ enabled: false, employeeRate: '', employerRate: '', wageCeiling: '', rounding: 'NEAREST' });
    expect(form.esi.employeeRate).toBe('');
    expect(form.esi.grossThreshold).toBe('');
    expect(form.pt.slabs).toEqual([]);
    expect(formFromConfig(undefined).pf.employeeRate).toBe('');
  });

  it('shows exactly what the service returned', () => {
    const form = formFromConfig({
      pf: { enabled: true, employee_rate_pct: '3.5', employer_rate_pct: 4, wage_ceiling: null, rounding: 'UP' },
      pt: { enabled: true, state: 'X', slabs: [{ from: '0', to: null, monthly: '7' }] },
    });
    expect(form.pf).toMatchObject({ enabled: true, employeeRate: '3.5', employerRate: '4', wageCeiling: '', rounding: 'UP' });
    expect(form.pt.slabs.map(({ from, to, monthly }) => ({ from, to, monthly }))).toEqual([{ from: '0', to: '', monthly: '7' }]);
  });

  it('turns an enabled scheme with a missing number into an error', () => {
    const form = formFromConfig({ pf: { enabled: true } });
    const { errors } = validateStatutory(form);
    expect(errors['pf.employeeRate']).toBeTruthy();
    expect(errors['pf.employerRate']).toBeTruthy();
  });

  it('does not demand numbers for a scheme that is switched off', () => {
    const { errors, input } = validateStatutory(formFromConfig({}));
    expect(errors).toEqual({});
    expect(input.pf).toEqual({ enabled: false, rounding: 'NEAREST', wage_ceiling: null });
    expect(input.pt).toEqual({ enabled: false, state: null, slabs: [] });
  });

  it('needs a slab when professional tax is on, and validates slab numbers', () => {
    const form = formFromConfig({});
    form.pt.enabled = true;
    expect(validateStatutory(form).errors['pt.slabs']).toBeTruthy();
    form.pt.slabs = [newSlab('100', '50', '10'), newSlab('', '', 'x')];
    const { errors } = validateStatutory(form);
    expect(errors['pt.0.to']).toMatch(/below/);
    expect(errors['pt.1.from']).toBeTruthy();
    expect(errors['pt.1.monthly']).toBeTruthy();
  });

  it('sends numbers as text and an empty upper limit as null', () => {
    const form = formFromConfig({});
    form.pt.enabled = true;
    form.pt.slabs = [newSlab('0', '', '10')];
    form.pf = { enabled: true, employeeRate: '1.5', employerRate: '2', wageCeiling: '5,000', rounding: 'DOWN' };
    const { errors, input } = validateStatutory(form);
    expect(errors).toEqual({});
    expect(input.pf).toEqual({ enabled: true, rounding: 'DOWN', employee_rate_pct: '1.5', employer_rate_pct: '2', wage_ceiling: '5000' });
    expect(input.pt.slabs).toEqual([{ from: '0', to: null, monthly: '10' }]);
  });

  it('refuses a percentage above 100 and non-numbers', () => {
    const form = formFromConfig({});
    form.esi = { enabled: true, employeeRate: '101', employerRate: 'a', grossThreshold: '', rounding: 'NEAREST' };
    const { errors } = validateStatutory(form);
    expect(errors['esi.employeeRate']).toMatch(/100/);
    expect(errors['esi.employerRate']).toBeTruthy();
    expect(errors['esi.grossThreshold']).toBeTruthy();
  });

  it('notices unsaved edits but ignores row keys', () => {
    const config = { pt: { enabled: true, slabs: [{ from: '0', to: null, monthly: '1' }] } };
    const a = formFromConfig(config);
    const b = formFromConfig(config);
    expect(formSignature(a)).toBe(formSignature(b));
    b.pt.slabs[0].monthly = '2';
    expect(formSignature(a)).not.toBe(formSignature(b));
  });
});
