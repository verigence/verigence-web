import { hrRawRequest, hrRequest } from './client';

/** Permission keys from HRMgmt (src/hrmgmt/permissions.py). The server checks every request again. */
export const PAYROLL_PERMISSION = {
  salaryPropose: 'hr.salary.propose',
  salaryApprove: 'hr.salary.approve',
  payrollRead: 'hr.payroll.read',
  payrollPrepare: 'hr.payroll.prepare',
  payrollApprove: 'hr.payroll.approve',
  settingsManage: 'hr.settings.manage',
} as const;

/** Money arrives as strings (exact) or, for a few fields, JSON numbers. It is only ever displayed. */
export type MoneyValue = string | number;

// ---- salary templates -----------------------------------------------------------------------

export type ComponentBasis = 'PERCENT_GROSS' | 'PERCENT_BASIC' | 'FIXED' | 'REMAINDER';

export interface TemplateComponent {
  code: string;
  label: string;
  basis: ComponentBasis;
  value: MoneyValue | null;
  pf_wage: boolean;
  esi_wage: boolean;
}

export interface SalaryTemplate {
  templateId: string;
  code: string;
  name: string;
  description: string | null;
  components: TemplateComponent[];
  active: boolean;
}

export interface TemplateList {
  items: SalaryTemplate[];
  bandNote: string;
}

/** What HR sends. A REMAINDER component has no value. */
export interface TemplateInput {
  name: string;
  description: string | null;
  components: Array<{
    code: string;
    label: string;
    basis: ComponentBasis;
    value?: string;
    pf_wage: boolean;
    esi_wage: boolean;
  }>;
  active: boolean;
}

// ---- salary structures ----------------------------------------------------------------------

export type StructureStatus = 'PROPOSED' | 'APPROVED' | 'REJECTED' | 'SUPERSEDED';

export interface StructureComponent {
  code: string;
  label: string;
  amount: string;
  pf_wage: boolean;
  esi_wage: boolean;
}

export interface SalaryStructure {
  structureId: string;
  employeeId: string;
  templateId: string | null;
  grossMonthly: MoneyValue;
  components: StructureComponent[];
  effectiveFrom: string;
  status: StructureStatus;
  note: string | null;
  proposedAt: string;
  decidedAt: string | null;
  decisionNote: string | null;
}

export interface SalaryStructureListItem extends SalaryStructure {
  employeeCode: string;
  employeeName: string;
}

export interface ProposeStructureInput {
  employee_id: string;
  gross_monthly: string;
  effective_from: string;
  template_id?: string;
  band_confirmed?: boolean;
  note?: string;
}

// ---- statutory settings ---------------------------------------------------------------------

export type Rounding = 'NEAREST' | 'UP' | 'DOWN';

/** The stored configuration, exactly as the server returns it. Every field may be missing or empty. */
export interface StatutoryConfig {
  pf?: {
    enabled?: boolean;
    employee_rate_pct?: MoneyValue | null;
    employer_rate_pct?: MoneyValue | null;
    wage_ceiling?: MoneyValue | null;
    rounding?: string;
  };
  esi?: {
    enabled?: boolean;
    employee_rate_pct?: MoneyValue | null;
    employer_rate_pct?: MoneyValue | null;
    gross_threshold?: MoneyValue | null;
    rounding?: string;
  };
  pt?: {
    enabled?: boolean;
    state?: string | null;
    slabs?: Array<{ from?: MoneyValue | null; to?: MoneyValue | null; monthly?: MoneyValue | null }>;
  };
}

export interface StatutoryView {
  config: StatutoryConfig;
  updatedAt: string;
  confirmed: boolean;
  confirmedAt: string | null;
  confirmationNote: string | null;
  note: string;
}

/** What HR sends when saving. Numbers travel as text so nothing is rounded on the way. */
export interface StatutoryInput {
  pf: { enabled: boolean; rounding: Rounding; employee_rate_pct?: string; employer_rate_pct?: string; wage_ceiling?: string | null };
  esi: { enabled: boolean; rounding: Rounding; employee_rate_pct?: string; employer_rate_pct?: string; gross_threshold?: string };
  pt: { enabled: boolean; state: string | null; slabs: Array<{ from: string; to: string | null; monthly: string }> };
}

// ---- payroll runs ---------------------------------------------------------------------------

export type RunStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'PAID' | 'CANCELLED';

export interface SkippedPerson {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  reason: string;
}

export interface RunAdjustment {
  label: string;
  amount: MoneyValue;
  taxable: boolean;
  note?: string | null;
}

export interface RunLine {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  designation: string | null;
  paidDays: string;
  lopDays: string;
  absentDays: string;
  extraLopDays: number;
  grossEarned: string;
  totalDeductions: string;
  netPay: string;
  reimbursements: string;
  payableTotal: string;
  adjustments: RunAdjustment[];
}

export interface PayrollRun {
  runId: string;
  payMonth: string;
  status: RunStatus;
  statutoryConfirmed: boolean;
  skipped: SkippedPerson[];
  createdAt: string;
  submittedAt: string | null;
  approvedAt: string | null;
  paidAt: string | null;
  paymentDate: string | null;
  note: string | null;
  totals: { people: number; netPay: string; payable: string };
  /** Present on the run detail and on the actions that return the whole run; absent in the list. */
  lines?: RunLine[];
}

export interface FigureAmount {
  code: string;
  label: string;
  amount: string;
}

export interface LineFigures {
  days: {
    inMonth: number;
    workingDays: number;
    presentDays: string;
    paidLeaveDays: string;
    unpaidLeaveDays: string;
    extraLopDays: string;
    beforeJoiningDays: number;
    absentDays: string;
    lopDays: string;
    paidDays: string;
  };
  earnings: Array<FigureAmount & { monthly: string }>;
  deductions: FigureAmount[];
  employer: FigureAmount[];
  adjustments: Array<{ label: string; amount: string; taxable: boolean; note: string | null }>;
  reimbursements: Array<{ claimId: string; label: string; date: string; amount: string; taxable: boolean }>;
  gross_full: string;
  gross_earned: string;
  total_deductions: string;
  net_pay: string;
  reimbursement_total: string;
  payable_total: string;
}

export interface RunLineDetail extends RunLine {
  figures: LineFigures;
}

export interface LineInputsInput {
  extra_lop_days: string;
  adjustments: Array<{ label: string; amount: string; taxable: boolean; note?: string }>;
}

export interface MyPayslip {
  payslipId: string;
  month: string;
  issuedAt: string;
  netPay: string;
  payable: string;
}

export interface RunPayslip {
  payslipId: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
}

// ---- keys -----------------------------------------------------------------------------------

export const payrollKeys = {
  all: ['hr', 'payroll'] as const,
  templates: ['hr', 'payroll', 'templates'] as const,
  structures: (filter: string) => ['hr', 'payroll', 'structures', filter] as const,
  structuresAll: ['hr', 'payroll', 'structures'] as const,
  statutory: ['hr', 'payroll', 'statutory'] as const,
  runs: ['hr', 'payroll', 'runs'] as const,
  run: (id: string) => ['hr', 'payroll', 'run', id] as const,
  line: (runId: string, employeeId: string) => ['hr', 'payroll', 'run', runId, 'line', employeeId] as const,
  runPayslips: (id: string) => ['hr', 'payroll', 'run', id, 'payslips'] as const,
  myPayslips: ['hr', 'payslips'] as const,
  pickEmployees: (q: string) => ['hr', 'payroll', 'pick-employees', q] as const,
};

// ---- requests: one attempt each, the token passed in ----------------------------------------

const base = '/hr/v1';
const json = (body: unknown) => body as Record<string, unknown>;

export const getTemplates = (token: string) => hrRequest<TemplateList>(`${base}/payroll/templates`, { accessToken: token });

export const createTemplate = (token: string, code: string, input: TemplateInput) =>
  hrRequest<SalaryTemplate>(`${base}/payroll/templates?code=${encodeURIComponent(code)}`, {
    accessToken: token,
    method: 'POST',
    body: json(input),
  });

export const updateTemplate = (token: string, templateId: string, input: TemplateInput) =>
  hrRequest<SalaryTemplate>(`${base}/payroll/templates/${templateId}`, {
    accessToken: token,
    method: 'PUT',
    body: json(input),
  });

export const listStructures = (token: string, params: { employeeId?: string; status?: StructureStatus } = {}) => {
  const query = new URLSearchParams();
  if (params.employeeId) query.set('employee_id', params.employeeId);
  if (params.status) query.set('status', params.status);
  const suffix = query.toString();
  return hrRequest<{ items: SalaryStructureListItem[] }>(`${base}/payroll/structures${suffix ? `?${suffix}` : ''}`, {
    accessToken: token,
  });
};

export const proposeStructure = (token: string, input: ProposeStructureInput) =>
  hrRequest<SalaryStructure>(`${base}/payroll/structures`, { accessToken: token, method: 'POST', body: json(input) });

export const decideStructure = (token: string, structureId: string, decision: 'APPROVE' | 'REJECT', note: string) =>
  hrRequest<{ structureId: string; status: 'APPROVED' | 'REJECTED' }>(`${base}/payroll/structures/${structureId}/decision`, {
    accessToken: token,
    method: 'POST',
    body: json(note.trim() ? { decision, note: note.trim() } : { decision }),
  });

export const getStatutory = (token: string) => hrRequest<StatutoryView>(`${base}/payroll/statutory`, { accessToken: token });

export const putStatutory = (token: string, input: StatutoryInput) =>
  hrRequest<StatutoryView>(`${base}/payroll/statutory`, { accessToken: token, method: 'PUT', body: json(input) });

export const confirmStatutory = (token: string, note: string) =>
  hrRequest<StatutoryView>(`${base}/payroll/statutory/confirm`, { accessToken: token, method: 'POST', body: { note } });

export const listRuns = (token: string) => hrRequest<{ items: PayrollRun[] }>(`${base}/payroll/runs`, { accessToken: token });

export const createRun = (token: string, month: string) =>
  hrRequest<PayrollRun>(`${base}/payroll/runs`, { accessToken: token, method: 'POST', body: { month } });

export const getRun = (token: string, runId: string) => hrRequest<PayrollRun>(`${base}/payroll/runs/${runId}`, { accessToken: token });

export const getRunLine = (token: string, runId: string, employeeId: string) =>
  hrRequest<RunLineDetail>(`${base}/payroll/runs/${runId}/lines/${employeeId}`, { accessToken: token });

export const recomputeRun = (token: string, runId: string) =>
  hrRequest<PayrollRun>(`${base}/payroll/runs/${runId}/recompute`, { accessToken: token, method: 'POST' });

export const setLineInputs = (token: string, runId: string, employeeId: string, input: LineInputsInput) =>
  hrRequest<RunLineDetail>(`${base}/payroll/runs/${runId}/lines/${employeeId}/inputs`, {
    accessToken: token,
    method: 'PUT',
    body: json(input),
  });

export const submitRun = (token: string, runId: string) =>
  hrRequest<PayrollRun>(`${base}/payroll/runs/${runId}/submit`, { accessToken: token, method: 'POST' });

export const sendBackRun = (token: string, runId: string, note: string) =>
  hrRequest<PayrollRun>(`${base}/payroll/runs/${runId}/send-back`, { accessToken: token, method: 'POST', body: { note } });

export const cancelRun = (token: string, runId: string) =>
  hrRequest<PayrollRun>(`${base}/payroll/runs/${runId}/cancel`, { accessToken: token, method: 'POST' });

export const approveRun = (token: string, runId: string) =>
  hrRequest<PayrollRun>(`${base}/payroll/runs/${runId}/approve`, { accessToken: token, method: 'POST', timeoutMs: 90_000 });

export const markRunPaid = (token: string, runId: string, paymentDate: string) =>
  hrRequest<PayrollRun>(`${base}/payroll/runs/${runId}/mark-paid`, {
    accessToken: token,
    method: 'POST',
    body: { payment_date: paymentDate },
  });

// ---- payslips -------------------------------------------------------------------------------

export const listMyPayslips = (token: string) => hrRequest<{ items: MyPayslip[] }>(`${base}/payslips`, { accessToken: token });

export const listRunPayslips = (token: string, runId: string) =>
  hrRequest<{ items: RunPayslip[] }>(`${base}/payroll/runs/${runId}/payslips`, { accessToken: token });

/** The PDF as a blob; the caller opens it through an object URL and releases that URL afterwards. */
export async function fetchPayslipPdf(token: string, payslipId: string): Promise<Blob> {
  const response = await hrRawRequest(`${base}/payslips/${payslipId}/pdf`, { accessToken: token });
  const blob = await response.blob();
  return blob.type === 'application/pdf' ? blob : new Blob([blob], { type: 'application/pdf' });
}
