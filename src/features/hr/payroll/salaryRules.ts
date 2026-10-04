import { compareDecimal } from './money';

/** From the HR service: a gross in this band (inclusive) is covered by the MID_21K_25K template, which HR creates. */
export const BAND_LOW = '21001';
export const BAND_HIGH = '24999.99';
export const MID_TEMPLATE_CODE = 'MID_21K_25K';
export const TEMPLATE_PENDING_HINT = 'Needs the ₹21,001–₹24,999 template first';
export const MAX_GROSS = '10000000';
/** From this gross upwards Provident Fund is optional; below it, it always applies. */
export const PF_OPTIONAL_FROM = '25000';

export type GrossResult = { ok: true; value: string } | { ok: false; error: string };

/** The monthly gross as typed: digits with up to two decimals, more than zero, within the service limit. */
export function parseGross(input: string): GrossResult {
  const text = input.replace(/[,\s]/g, '');
  if (!text) return { ok: false, error: 'Enter the monthly gross.' };
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(text)) return { ok: false, error: 'Use digits with at most two decimals, for example 30000 or 30000.50.' };
  if ((compareDecimal(text, '0') ?? 0) <= 0) return { ok: false, error: 'The monthly gross must be more than zero.' };
  if ((compareDecimal(text, MAX_GROSS) ?? 0) > 0) return { ok: false, error: 'That is above the largest amount the system accepts.' };
  return { ok: true, value: text };
}

/** True when an active template with the reserved band code exists: the service then picks it, so nobody has to choose. */
export const hasMidTemplate = (templates: Array<{ code: string; active: boolean }>) =>
  templates.some((t) => t.active && t.code === MID_TEMPLATE_CODE);

/** Whether the "Provident Fund applies" choice is offered for the gross as typed. */
export function pfIsOptional(gross: string): boolean {
  const parsed = parseGross(gross);
  return parsed.ok && (compareDecimal(parsed.value, PF_OPTIONAL_FROM) ?? -1) >= 0;
}

export function isInBand(gross: string): boolean {
  const low = compareDecimal(gross, BAND_LOW);
  const high = compareDecimal(gross, BAND_HIGH);
  return low !== null && high !== null && low >= 0 && high <= 0;
}

export interface ProposalForm {
  employeeId: string;
  gross: string;
  effectiveFrom: string;
  templateId: string;
  bandConfirmed: boolean;
  /** Provident Fund applies (the default). Only ever sent as false, and only for a gross of 25,000 or more. */
  pfApplicable: boolean;
  note: string;
}

export type ProposalErrors = Partial<Record<'employeeId' | 'gross' | 'effectiveFrom' | 'templateId' | 'bandConfirmed' | 'pfApplicable' | 'note', string>>;

/** `bandNeedsChoice` is false when the band template exists and the service picks it. */
export function validateProposal(form: ProposalForm, bandNeedsChoice = true): ProposalErrors {
  const errors: ProposalErrors = {};
  if (!form.employeeId) errors.employeeId = 'Choose the person.';
  const gross = parseGross(form.gross);
  if (!gross.ok) errors.gross = gross.error;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.effectiveFrom)) errors.effectiveFrom = 'Choose the date it starts from.';
  if (form.note.trim().length > 300) errors.note = 'Keep the note within 300 characters.';
  if (gross.ok && isInBand(gross.value) && bandNeedsChoice) {
    if (!form.templateId) errors.templateId = 'This salary needs a template. Choose one yourself.';
    else if (!form.bandConfirmed) errors.bandConfirmed = 'Tick the box to confirm you chose this template on purpose.';
  }
  return errors;
}

export function buildProposal(form: ProposalForm, bandNeedsChoice = true): {
  employee_id: string;
  gross_monthly: string;
  effective_from: string;
  template_id?: string;
  band_confirmed?: boolean;
  pf_applicable?: boolean;
  note?: string;
} {
  const gross = parseGross(form.gross);
  const body: ReturnType<typeof buildProposal> = {
    employee_id: form.employeeId,
    gross_monthly: gross.ok ? gross.value : form.gross.trim(),
    effective_from: form.effectiveFrom,
  };
  const picked = gross.ok && isInBand(gross.value) && !bandNeedsChoice ? '' : form.templateId; // the service picks the band template
  if (picked) body.template_id = picked;
  if (gross.ok && isInBand(gross.value) && bandNeedsChoice && form.bandConfirmed) body.band_confirmed = true;
  if (!form.pfApplicable && pfIsOptional(form.gross)) body.pf_applicable = false;
  if (form.note.trim()) body.note = form.note.trim();
  return body;
}
