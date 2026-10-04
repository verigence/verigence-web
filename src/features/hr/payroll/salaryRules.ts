import { compareDecimal } from './money';

/** From the HR service: a gross in this band (inclusive) has no default template. */
export const BAND_LOW = '21001';
export const BAND_HIGH = '25000';
export const MAX_GROSS = '10000000';

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
  note: string;
}

export type ProposalErrors = Partial<Record<'employeeId' | 'gross' | 'effectiveFrom' | 'templateId' | 'bandConfirmed' | 'note', string>>;

export function validateProposal(form: ProposalForm): ProposalErrors {
  const errors: ProposalErrors = {};
  if (!form.employeeId) errors.employeeId = 'Choose the person.';
  const gross = parseGross(form.gross);
  if (!gross.ok) errors.gross = gross.error;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.effectiveFrom)) errors.effectiveFrom = 'Choose the date it starts from.';
  if (form.note.trim().length > 300) errors.note = 'Keep the note within 300 characters.';
  if (gross.ok && isInBand(gross.value)) {
    if (!form.templateId) errors.templateId = 'This salary needs a template. Choose one yourself.';
    else if (!form.bandConfirmed) errors.bandConfirmed = 'Tick the box to confirm you chose this template on purpose.';
  }
  return errors;
}

export function buildProposal(form: ProposalForm): {
  employee_id: string;
  gross_monthly: string;
  effective_from: string;
  template_id?: string;
  band_confirmed?: boolean;
  note?: string;
} {
  const gross = parseGross(form.gross);
  const body: ReturnType<typeof buildProposal> = {
    employee_id: form.employeeId,
    gross_monthly: gross.ok ? gross.value : form.gross.trim(),
    effective_from: form.effectiveFrom,
  };
  if (form.templateId) body.template_id = form.templateId;
  if (gross.ok && isInBand(gross.value) && form.bandConfirmed) body.band_confirmed = true;
  if (form.note.trim()) body.note = form.note.trim();
  return body;
}
