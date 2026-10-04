import type { Rounding, StatutoryConfig, StatutoryInput } from '../../../services/hr/payroll';
import { compareDecimal } from './money';

/**
 * The statutory form holds what the HR service returned and nothing else: no rate, ceiling or slab
 * is ever filled in here. A field the service has no value for stays empty for HR to enter.
 */
export interface SlabRow {
  key: string;
  from: string;
  to: string;
  monthly: string;
}

export interface StatutoryForm {
  pf: { enabled: boolean; employeeRate: string; employerRate: string; wageCeiling: string; rounding: Rounding };
  esi: { enabled: boolean; employeeRate: string; employerRate: string; grossThreshold: string; rounding: Rounding };
  pt: { enabled: boolean; state: string; slabs: SlabRow[] };
}

export type StatutoryErrors = Record<string, string>;

export const ROUNDING_LABELS: Record<Rounding, string> = {
  NEAREST: 'To the nearest rupee',
  UP: 'Up to the next rupee',
  DOWN: 'Down to the rupee below',
};
export const ROUNDINGS = Object.keys(ROUNDING_LABELS) as Rounding[];

let counter = 0;
export const newSlab = (from = '', to = '', monthly = ''): SlabRow => ({ key: `slab-${(counter += 1)}`, from, to, monthly });

const text = (value: unknown): string => (value === null || value === undefined ? '' : String(value));
const rounding = (value: unknown): Rounding => (value === 'UP' || value === 'DOWN' || value === 'NEAREST' ? value : 'NEAREST');

export function formFromConfig(config: StatutoryConfig | null | undefined): StatutoryForm {
  const pf = config?.pf ?? {};
  const esi = config?.esi ?? {};
  const pt = config?.pt ?? {};
  return {
    pf: {
      enabled: Boolean(pf.enabled),
      employeeRate: text(pf.employee_rate_pct),
      employerRate: text(pf.employer_rate_pct),
      wageCeiling: text(pf.wage_ceiling),
      rounding: rounding(pf.rounding),
    },
    esi: {
      enabled: Boolean(esi.enabled),
      employeeRate: text(esi.employee_rate_pct),
      employerRate: text(esi.employer_rate_pct),
      grossThreshold: text(esi.gross_threshold),
      rounding: rounding(esi.rounding),
    },
    pt: {
      enabled: Boolean(pt.enabled),
      state: text(pt.state),
      slabs: (pt.slabs ?? []).map((s) => newSlab(text(s.from), text(s.to), text(s.monthly))),
    },
  };
}

/** Compare what is on screen with what was loaded, ignoring row keys. */
export function formSignature(form: StatutoryForm): string {
  return JSON.stringify({ ...form, pt: { ...form.pt, slabs: form.pt.slabs.map(({ from, to, monthly }) => ({ from, to, monthly })) } });
}

const NUMBER = /^\d+(\.\d+)?$/;
const clean = (v: string) => v.replace(/[,\s]/g, '');

function checkNumber(errors: StatutoryErrors, key: string, raw: string, required: boolean, percent: boolean): string | null {
  const value = clean(raw);
  if (!value) {
    if (required) errors[key] = 'Enter this number, or turn the scheme off.';
    return null;
  }
  if (!NUMBER.test(value)) {
    errors[key] = 'Enter a number.';
    return null;
  }
  if (percent && (compareDecimal(value, '100') ?? 0) > 0) {
    errors[key] = 'A percentage cannot be above 100.';
    return null;
  }
  return value;
}

export function validateStatutory(form: StatutoryForm): { errors: StatutoryErrors; input: StatutoryInput } {
  const errors: StatutoryErrors = {};
  const pf = form.pf;
  const employeePf = checkNumber(errors, 'pf.employeeRate', pf.employeeRate, pf.enabled, true);
  const employerPf = checkNumber(errors, 'pf.employerRate', pf.employerRate, pf.enabled, true);
  const ceiling = checkNumber(errors, 'pf.wageCeiling', pf.wageCeiling, false, false);

  const esi = form.esi;
  const employeeEsi = checkNumber(errors, 'esi.employeeRate', esi.employeeRate, esi.enabled, true);
  const employerEsi = checkNumber(errors, 'esi.employerRate', esi.employerRate, esi.enabled, true);
  const threshold = checkNumber(errors, 'esi.grossThreshold', esi.grossThreshold, esi.enabled, false);

  const slabs: Array<{ from: string; to: string | null; monthly: string }> = [];
  form.pt.slabs.forEach((slab, index) => {
    const from = checkNumber(errors, `pt.${index}.from`, slab.from, true, false);
    const monthly = checkNumber(errors, `pt.${index}.monthly`, slab.monthly, true, false);
    const to = checkNumber(errors, `pt.${index}.to`, slab.to, false, false);
    if (from !== null && to !== null && (compareDecimal(to, from) ?? 0) < 0) errors[`pt.${index}.to`] = 'Must not be below "from".';
    if (from !== null && monthly !== null) slabs.push({ from, to, monthly });
  });
  if (form.pt.enabled && form.pt.slabs.length === 0) errors['pt.slabs'] = 'Add at least one slab, or turn professional tax off.';

  const input: StatutoryInput = {
    pf: {
      enabled: pf.enabled,
      rounding: pf.rounding,
      ...(employeePf !== null ? { employee_rate_pct: employeePf } : {}),
      ...(employerPf !== null ? { employer_rate_pct: employerPf } : {}),
      wage_ceiling: ceiling,
    },
    esi: {
      enabled: esi.enabled,
      rounding: esi.rounding,
      ...(employeeEsi !== null ? { employee_rate_pct: employeeEsi } : {}),
      ...(employerEsi !== null ? { employer_rate_pct: employerEsi } : {}),
      ...(threshold !== null ? { gross_threshold: threshold } : {}),
    },
    pt: { enabled: form.pt.enabled, state: form.pt.state.trim() || null, slabs },
  };
  return { errors, input };
}
