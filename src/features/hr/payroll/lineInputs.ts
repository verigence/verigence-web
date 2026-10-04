import type { LineInputsInput, RunAdjustment } from '../../../services/hr/payroll';
import { compareDecimal } from './money';

export const MAX_ADJUSTMENTS = 10;

export interface AdjustmentRow {
  key: string;
  label: string;
  amount: string;
  taxable: boolean;
  note: string;
}

export interface InputsForm {
  extraLop: string;
  adjustments: AdjustmentRow[];
}

export interface InputsErrors {
  extraLop?: string;
  general?: string;
  rows: Record<number, { label?: string; amount?: string; note?: string }>;
}

let counter = 0;
export const newAdjustment = (): AdjustmentRow => ({ key: `adj-${(counter += 1)}`, label: '', amount: '', taxable: true, note: '' });

export function formFromLine(extraLopDays: number, adjustments: RunAdjustment[]): InputsForm {
  return {
    extraLop: extraLopDays ? String(extraLopDays) : '0',
    adjustments: adjustments.map((a) => ({
      key: `adj-${(counter += 1)}`,
      label: a.label,
      amount: String(a.amount),
      taxable: a.taxable !== false,
      note: a.note ?? '',
    })),
  };
}

export function hasInputErrors(errors: InputsErrors): boolean {
  return Boolean(errors.extraLop || errors.general || Object.keys(errors.rows).length > 0);
}

export function validateInputs(form: InputsForm): InputsErrors {
  const errors: InputsErrors = { rows: {} };
  const lop = form.extraLop.trim() || '0';
  if (!/^\d{1,2}(\.\d)?$/.test(lop) || (compareDecimal(lop, '31') ?? 0) > 0) {
    errors.extraLop = 'Enter days from 0 to 31, with at most one decimal (for example 1.5).';
  }
  if (form.adjustments.length > MAX_ADJUSTMENTS) errors.general = `At most ${MAX_ADJUSTMENTS} adjustments.`;
  form.adjustments.forEach((row, index) => {
    const rowErrors: { label?: string; amount?: string; note?: string } = {};
    const label = row.label.trim();
    if (label.length < 2 || label.length > 80) rowErrors.label = '2 to 80 characters.';
    const amount = row.amount.replace(/[,\s]/g, '');
    if (!/^-?\d{1,10}(\.\d{1,2})?$/.test(amount)) rowErrors.amount = 'Enter an amount, with a minus sign for a deduction.';
    else if (compareDecimal(amount, '0') === 0) rowErrors.amount = 'An adjustment cannot be zero.';
    if (row.note.trim().length > 200) rowErrors.note = 'Within 200 characters.';
    if (Object.keys(rowErrors).length > 0) errors.rows[index] = rowErrors;
  });
  return errors;
}

export function buildInputs(form: InputsForm): LineInputsInput {
  return {
    extra_lop_days: form.extraLop.trim() || '0',
    adjustments: form.adjustments.map((a) => ({
      label: a.label.trim(),
      amount: a.amount.replace(/[,\s]/g, ''),
      taxable: a.taxable,
      ...(a.note.trim() ? { note: a.note.trim() } : {}),
    })),
  };
}
