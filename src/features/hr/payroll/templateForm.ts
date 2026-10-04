import type { ComponentBasis, SalaryTemplate, TemplateInput } from '../../../services/hr/payroll';
import { compareDecimal } from './money';

export const BASIS_LABELS: Record<ComponentBasis, string> = {
  PERCENT_GROSS: '% of gross',
  PERCENT_BASIC: '% of Basic',
  FIXED: 'Fixed amount (₹)',
  REMAINDER: 'Remainder',
};
export const BASES = Object.keys(BASIS_LABELS) as ComponentBasis[];

export const COMPONENT_CODE = /^[A-Z][A-Z0-9_]{1,19}$/;
export const TEMPLATE_CODE = /^[A-Z][A-Z0-9_]{2,29}$/;
export const MAX_COMPONENTS = 15;
const MAX_VALUE = '10000000';

export interface ComponentRow {
  key: string;
  code: string;
  label: string;
  basis: ComponentBasis;
  value: string;
  pfWage: boolean;
  esiWage: boolean;
}

export interface TemplateForm {
  code: string;
  name: string;
  description: string;
  active: boolean;
  components: ComponentRow[];
}

export interface RowErrors {
  code?: string;
  label?: string;
  value?: string;
}

export interface TemplateErrors {
  code?: string;
  name?: string;
  description?: string;
  general?: string;
  rows: Record<number, RowErrors>;
}

let rowCounter = 0;
export const newRowKey = () => `row-${(rowCounter += 1)}`;

export function blankRow(basis: ComponentBasis = 'PERCENT_GROSS'): ComponentRow {
  return { key: newRowKey(), code: '', label: '', basis, value: '', pfWage: false, esiWage: true };
}

/** A new template starts with two empty rows: one worked out from the gross and the remainder. */
export function blankTemplateForm(): TemplateForm {
  return { code: '', name: '', description: '', active: true, components: [blankRow('PERCENT_GROSS'), blankRow('REMAINDER')] };
}

export function formFromTemplate(template: SalaryTemplate): TemplateForm {
  return {
    code: template.code,
    name: template.name,
    description: template.description ?? '',
    active: template.active,
    components: template.components.map((c) => ({
      key: newRowKey(),
      code: c.code,
      label: c.label,
      basis: c.basis,
      value: c.value === null || c.value === undefined ? '' : String(c.value),
      pfWage: Boolean(c.pf_wage),
      esiWage: Boolean(c.esi_wage),
    })),
  };
}

export function hasTemplateErrors(errors: TemplateErrors): boolean {
  return Boolean(errors.code || errors.name || errors.description || errors.general || Object.keys(errors.rows).length > 0);
}

/** The same rules the HR service applies, so mistakes are shown next to the field. The service still decides. */
export function validateTemplate(form: TemplateForm, mode: 'create' | 'edit'): TemplateErrors {
  const errors: TemplateErrors = { rows: {} };
  if (mode === 'create' && !TEMPLATE_CODE.test(form.code)) {
    errors.code = 'Use 3 to 30 capital letters, digits or underscores, starting with a letter.';
  }
  const name = form.name.trim();
  if (name.length < 3 || name.length > 100) errors.name = 'The name needs 3 to 100 characters.';
  if (form.description.trim().length > 300) errors.description = 'Keep the description within 300 characters.';

  const count = form.components.length;
  if (count < 2 || count > MAX_COMPONENTS) errors.general = `A template needs 2 to ${MAX_COMPONENTS} components.`;
  const remainders = form.components.filter((c) => c.basis === 'REMAINDER').length;
  if (!errors.general && remainders !== 1) errors.general = 'Exactly one component must be the remainder, which takes whatever is left of the gross.';

  const seen = new Set<string>();
  form.components.forEach((row, index) => {
    const rowErrors: RowErrors = {};
    if (!COMPONENT_CODE.test(row.code)) rowErrors.code = '2 to 20 capitals, digits or underscores.';
    else if (seen.has(row.code)) rowErrors.code = 'This code is used twice.';
    seen.add(row.code);
    const label = row.label.trim();
    if (label.length < 2 || label.length > 60) rowErrors.label = '2 to 60 characters.';
    if (row.basis !== 'REMAINDER') {
      const value = row.value.trim();
      if (!/^\d+(\.\d+)?$/.test(value)) rowErrors.value = 'Enter a number.';
      else if ((compareDecimal(value, MAX_VALUE) ?? 0) > 0) rowErrors.value = 'Too large.';
      else if ((row.basis === 'PERCENT_GROSS' || row.basis === 'PERCENT_BASIC') && (compareDecimal(value, '100') ?? 0) > 0) {
        rowErrors.value = 'A percentage cannot be above 100.';
      }
    }
    if (Object.keys(rowErrors).length > 0) errors.rows[index] = rowErrors;
  });

  if (!errors.general && form.components.some((c) => c.basis === 'PERCENT_BASIC')) {
    const basic = form.components.find((c) => c.code === 'BASIC');
    if (!basic || (basic.basis !== 'PERCENT_GROSS' && basic.basis !== 'FIXED')) {
      errors.general = 'A "% of Basic" component needs a component with the code BASIC, set as % of gross or a fixed amount.';
    }
  }
  return errors;
}

export function buildTemplateInput(form: TemplateForm): TemplateInput {
  return {
    name: form.name.trim(),
    description: form.description.trim() || null,
    active: form.active,
    components: form.components.map((c) => ({
      code: c.code,
      label: c.label.trim(),
      basis: c.basis,
      ...(c.basis === 'REMAINDER' ? {} : { value: c.value.trim() }),
      pf_wage: c.pfWage,
      esi_wage: c.esiWage,
    })),
  };
}

/** One short line for lists: "Basic 40% of gross" and so on. */
export function describeComponent(c: { label: string; basis: ComponentBasis; value: string | number | null }): string {
  const value = c.value === null || c.value === undefined ? '' : String(c.value);
  switch (c.basis) {
    case 'PERCENT_GROSS': return `${c.label}: ${value}% of gross`;
    case 'PERCENT_BASIC': return `${c.label}: ${value}% of Basic`;
    case 'FIXED': return `${c.label}: fixed ₹${value}`;
    default: return `${c.label}: the remainder`;
  }
}
