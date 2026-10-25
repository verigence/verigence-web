import type { JourneyReviewRow, ReviewInvoice } from '../../../services/audit-core/adminReports';

type Cell = string | number | null;

export const INVOICE_COLUMNS = [
  'type', 'assoc', 'inv_no', 'inv_date', 'gross', 'discount', 'taxable', 'cgst_rate', 'sgst_rate',
  'igst_rate', 'tcs', 'round_off', 'grand_total', 'model_raw', 'variant_raw', 'chassis', 'dup_field_rows',
] as const;

export const cell = (value: Cell | ReviewInvoice[] | undefined): string =>
  value === null || value === undefined || Array.isArray(value) ? '' : String(value);

function invoiceSummary(invoice: ReviewInvoice): string {
  return INVOICE_COLUMNS.map((c) => `${c}=${cell(invoice[c])}`).join('; ');
}

const csvCell = (value: string): string => {
  // Spreadsheet formulas are neutralised; a plain negative number is left as it is.
  const isNumber = /^-?\d+(\.\d+)?$/.test(value);
  const safe = !isNumber && /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function reviewCsv(rows: readonly JourneyReviewRow[]): string {
  const fields = [...new Set(rows.flatMap((r) => Object.keys(r)))].filter((k) => k !== 'invoices');
  const header = [...fields, 'invoices'];
  const lines = rows.map((r) => [
    ...fields.map((f) => cell(r[f])),
    r.invoices.map(invoiceSummary).join(' || '),
  ]);
  return [header, ...lines].map((line) => line.map(csvCell).join(',')).join('\r\n');
}

