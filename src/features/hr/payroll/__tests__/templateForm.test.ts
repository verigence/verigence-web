import { describe, expect, it } from 'vitest';

import {
  blankRow,
  blankTemplateForm,
  buildTemplateInput,
  describeComponent,
  formFromTemplate,
  hasTemplateErrors,
  validateTemplate,
  type ComponentRow,
  type TemplateForm,
} from '../templateForm';

const row = (over: Partial<ComponentRow>): ComponentRow => ({ ...blankRow('PERCENT_GROSS'), code: 'BASIC', label: 'Basic', value: '40', ...over });

const valid = (): TemplateForm => ({
  code: 'SALES_TEAM',
  name: 'Sales team',
  description: '',
  active: true,
  components: [
    row({}),
    row({ code: 'HRA', label: 'HRA', basis: 'PERCENT_BASIC', value: '50' }),
    row({ code: 'OTHER', label: 'Other', basis: 'REMAINDER', value: '' }),
  ],
});

describe('template validation', () => {
  it('accepts a template with exactly one remainder', () => {
    expect(hasTemplateErrors(validateTemplate(valid(), 'create'))).toBe(false);
  });

  it('needs exactly one remainder', () => {
    const none = valid();
    none.components[2] = row({ code: 'OTHER', label: 'Other', value: '10' });
    expect(validateTemplate(none, 'create').general).toMatch(/remainder/);
    const two = valid();
    two.components[0] = row({ basis: 'REMAINDER', value: '' });
    expect(validateTemplate(two, 'create').general).toMatch(/remainder/);
  });

  it('needs a number for every component except the remainder', () => {
    const f = valid();
    f.components[0].value = '';
    const e = validateTemplate(f, 'create');
    expect(e.rows[0].value).toBeTruthy();
    expect(e.rows[2]).toBeUndefined();
  });

  it('rejects repeated codes and bad code shapes', () => {
    const f = valid();
    f.components[1].code = 'BASIC';
    f.components[2].code = '1X';
    const e = validateTemplate(f, 'create');
    expect(e.rows[1].code).toMatch(/twice/);
    expect(e.rows[2].code).toBeTruthy();
  });

  it('needs a BASIC component for a percent-of-Basic one', () => {
    const f = valid();
    f.components[0].code = 'WAGE';
    expect(validateTemplate(f, 'create').general).toMatch(/BASIC/);
  });

  it('checks the new template code only when creating', () => {
    const f = valid();
    f.code = 'ab';
    expect(validateTemplate(f, 'create').code).toBeTruthy();
    expect(validateTemplate(f, 'edit').code).toBeUndefined();
  });

  it('limits the number of components and the percentages', () => {
    const f = valid();
    f.components = [f.components[0]];
    expect(validateTemplate(f, 'create').general).toMatch(/2 to 15/);
    const big = valid();
    big.components[0].value = '120';
    expect(validateTemplate(big, 'create').rows[0].value).toMatch(/100/);
  });

  it('starts a new template with an empty percent row and the remainder', () => {
    const f = blankTemplateForm();
    expect(f.components.map((c) => c.basis)).toEqual(['PERCENT_GROSS', 'REMAINDER']);
    expect(hasTemplateErrors(validateTemplate(f, 'create'))).toBe(true);
  });
});

describe('what is sent', () => {
  it('leaves the value off for the remainder and sends numbers as text', () => {
    const input = buildTemplateInput(valid());
    expect(input.components[0]).toEqual({ code: 'BASIC', label: 'Basic', basis: 'PERCENT_GROSS', value: '40', pf_wage: false, esi_wage: true });
    expect(input.components[2]).not.toHaveProperty('value');
    expect(input.description).toBeNull();
  });

  it('round-trips a template from the server', () => {
    const form = formFromTemplate({
      templateId: 't', code: 'ABOVE_25K', name: 'Above', description: null, active: true,
      components: [{ code: 'BASIC', label: 'Basic', basis: 'PERCENT_GROSS', value: 40, pf_wage: true, esi_wage: false }, { code: 'X', label: 'X', basis: 'REMAINDER', value: null, pf_wage: false, esi_wage: true }],
    });
    expect(form.components[0]).toMatchObject({ value: '40', pfWage: true, esiWage: false });
    expect(form.components[1].value).toBe('');
    expect(describeComponent({ label: 'Basic', basis: 'PERCENT_GROSS', value: 40 })).toBe('Basic: 40% of gross');
  });
});
