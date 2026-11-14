import { auditCoreRawRequest, auditCoreRequest } from './client';

/**
 * The dealership's own bank account statements (product owner 14 Nov 2026), uploaded on the
 * Data uploads tab per dealership or per outlet, any bank, PDF or Excel. Audit Core reads every
 * transaction and checks the payment receipts dated within the statement's period +/- 5 days
 * against its credits: which receipts are found in the bank, which are not, and per journey what
 * is verified and what is left. Audit Core /p2/v1/tenants/{t}/bank-statements.
 */

export type ReceiptOutcome = 'MATCHED' | 'AMBIGUOUS' | 'NOT_FOUND' | 'OUTSIDE_DATES' | 'CASH' | 'CARD';
export type JourneyStatus = 'VERIFIED' | 'PARTIAL' | 'NOT_VERIFIED' | 'CASH_ONLY';

export type BankSetup = {
  dealers: { dealerId: string; dealerName: string; outlets: { outletId: string; outletName: string }[] }[];
  canUpload: boolean;
  today: string;
  windowDays: number;
  formats: string[];
};

export type BankCounts = Partial<{
  receipts: number; receiptsAmount: string; matched: number; matchedAmount: string;
  notFound: number; notFoundAmount: string; ambiguous: number; ambiguousAmount: string;
  outsideDates: number; outsideDatesAmount: string; cash: number; cashAmount: string; card: number; cardAmount: string;
  journeys: number; journeysVerified: number; journeysPartial: number; journeysNotVerified: number; journeysCashOnly: number;
  verifiedAmount: string; leftAmount: string; credits: number; creditsMatched: number; creditsUnidentified: number;
  creditsUnidentifiedAmount: string; creditsNamingCustomer: number; creditsNamingCustomerAmount: string;
}>;

export type BankStatement = {
  statementId: string;
  dealerId: string;
  dealerName: string | null;
  outletId: string | null;
  outletName: string | null;
  bankName: string | null;
  accountNumber: string | null;
  accountHolder: string | null;
  ifsc: string | null;
  periodFrom: string;
  periodTo: string;
  checkFrom: string;
  checkTo: string;
  openingBalance: string | null;
  closingBalance: string | null;
  creditCount: number;
  creditTotal: string;
  debitCount: number;
  debitTotal: string;
  printedCreditTotal: string | null;
  printedDebitTotal: string | null;
  readingCheck: 'VERIFIED' | 'UNCHECKED' | 'MISMATCH';
  fileName: string;
  format: string;
  status: 'ACTIVE' | 'SUPERSEDED';
  counts: BankCounts;
  uploadedBy: string;
  uploadedAtUtc: string;
  reconciledAtUtc: string | null;
};

export type BankReceipt = {
  journeyId: string;
  journeyReference: string | null;
  customer: string | null;
  outletName: string | null;
  source: 'RECEIPT' | 'LEDGER';
  receiptKey: string;
  receiptNumber: string | null;
  receiptDate: string | null;
  amount: string;
  mode: string | null;
  reference: string | null;
  outcome: ReceiptOutcome;
  outcomeLabel: string;
  basis: string | null;
  basisLabel: string | null;
  note: string | null;
  credits: { date: string | null; amount: string | null; narration: string | null; onThisStatement: boolean }[];
  candidates: number;
};

export type BankJourney = {
  journeyId: string;
  journeyReference: string | null;
  customer: string | null;
  outletName: string | null;
  receipts: number;
  bankReceipts: string;
  verified: string;
  left: string;
  notFound: string;
  ambiguous: string;
  outsideDates: string;
  cash: string;
  card: string;
  status: JourneyStatus;
  statusLabel: string;
  /** The journey as a whole (every receipt, any date): Bank verified once each bank receipt is found. */
  bankVerified: boolean;
  journeyBankStatus: 'BANK_VERIFIED' | 'PARTIAL' | 'NOT_VERIFIED' | 'CASH_ONLY' | null;
  journeyLeft: string | null;
};

export type BankTransaction = {
  rowNo: number;
  date: string | null;
  narration: string;
  reference: string | null;
  amount: string;
  direction: 'CR' | 'DR';
  balance: string | null;
  kind: string | null;
  kindLabel: string | null;
  outcome: 'MATCHED' | 'UNIDENTIFIED' | 'OWN_TRANSFER' | 'DUPLICATE' | null;
  basis: string | null;
  basisLabel: string | null;
  journeyId: string | null;
  journeyReference: string | null;
  namedJourneyId: string | null;
  namedJourneyReference: string | null;
  namedCustomer: string | null;
  receipts: number;
};

export type BankStatementDetail = BankStatement & {
  receipts: BankReceipt[];
  journeys: BankJourney[];
  transactions: BankTransaction[];
};

export const RECEIPT_OUTCOMES: Record<ReceiptOutcome, { label: string; tone: 'ok' | 'warn' | 'bad' | 'open' }> = {
  NOT_FOUND: { label: 'Not found in bank', tone: 'bad' },
  AMBIGUOUS: { label: 'Several possible credits', tone: 'warn' },
  OUTSIDE_DATES: { label: 'Outside statement dates', tone: 'open' },
  MATCHED: { label: 'Found in bank', tone: 'ok' },
  CASH: { label: 'Cash', tone: 'open' },
  CARD: { label: 'Card', tone: 'open' },
};

export const JOURNEY_STATUSES: Record<JourneyStatus, { label: string; tone: 'ok' | 'warn' | 'bad' | 'open' }> = {
  NOT_VERIFIED: { label: 'Not verified', tone: 'bad' },
  PARTIAL: { label: 'Partly verified', tone: 'warn' },
  VERIFIED: { label: 'Fully verified', tone: 'ok' },
  CASH_ONLY: { label: 'Cash only', tone: 'open' },
};

const base = (tenantId: string) => `/p2/v1/tenants/${encodeURIComponent(tenantId)}`;

export function getBankSetup(tenantId: string, accessToken?: string) {
  return auditCoreRequest<BankSetup>(`${base(tenantId)}/bank-statements/setup`, { accessToken, cache: 'no-store' });
}

export function listBankStatements(tenantId: string, month: string, accessToken?: string, dealerId?: string) {
  const query = new URLSearchParams({ month });
  if (dealerId) query.set('dealer_id', dealerId);
  return auditCoreRequest<{ month: string; items: BankStatement[] }>(`${base(tenantId)}/bank-statements?${query}`,
    { accessToken, cache: 'no-store' });
}

export function getBankStatement(tenantId: string, statementId: string, accessToken?: string) {
  return auditCoreRequest<BankStatementDetail>(`${base(tenantId)}/bank-statements/${encodeURIComponent(statementId)}`,
    { accessToken, cache: 'no-store' });
}

export function uploadBankStatement(tenantId: string, input: { file: File; dealerId: string; outletId?: string },
  accessToken?: string) {
  const form = new FormData();
  form.append('file', input.file);
  form.append('dealerId', input.dealerId);
  if (input.outletId) form.append('outletId', input.outletId);
  return auditCoreRequest<BankStatement>(`${base(tenantId)}/bank-statements`, { method: 'POST', body: form, accessToken });
}

export function rematchBankStatement(tenantId: string, statementId: string, accessToken?: string) {
  return auditCoreRequest<BankStatement>(`${base(tenantId)}/bank-statements/${encodeURIComponent(statementId)}/rematch`,
    { method: 'POST', accessToken });
}

export async function downloadBankReport(tenantId: string, month: string, accessToken?: string, statementId?: string): Promise<Blob> {
  const query = new URLSearchParams({ month });
  if (statementId) query.set('statement_id', statementId);
  const response = await auditCoreRawRequest(`${base(tenantId)}/bank-statements/report/file?${query}`, { accessToken });
  return response.blob();
}

/** Rupees as the statements print them (Indian grouping), or '—'. */
export function rupees(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return '—';
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
}

/** The dealership a file is for, from its name ("AXIS-4051_ADITYA.pdf"), else ''. */
export function dealerFromStatementName(name: string, dealers: { dealerId: string; dealerName: string }[]): string {
  const words = name.toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 4);
  const found = dealers.filter((d) => words.some((w) => d.dealerName.toLowerCase().includes(w)));
  return found.length === 1 ? found[0].dealerId : '';
}
