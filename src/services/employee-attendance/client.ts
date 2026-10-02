const configuredBaseUrl =
  import.meta.env.VITE_EMPLOYEE_ATTENDANCE_BASE_URL?.trim()
  || import.meta.env.VITE_ATTENDANCE_BASE_URL?.trim();
const DEV_WEB_HOST = 'verigence-web-dev.jbrconsulting-it.workers.dev';
const DEV_ATTENDANCE_BASE_URL = 'https://attendance-dev.up.railway.app';
const REQUEST_TIMEOUT_MS = 12_000;

export type EmployeeProfile = {
  employeeId: string;
  securityUserId: string;
  employeeCode: string;
  displayName: string;
  primaryEmail?: string | null;
  mobile?: string | null;
  joiningDate: string;
  employmentStatus: string;
  tlUserId?: string | null;
  pmoUserId?: string | null;
  projectTenantId?: string | null;
  workLocationId?: string | null;
  workLocationName?: string | null;
};

export type AttendanceEvent = {
  attendanceEventId: string;
  attendanceDate: string;
  eventType: 'CHECK_IN' | 'CHECK_OUT';
  capturedAtUtc: string;
  distanceMeters?: number | null;
  geofenceRadiusMeters?: number | null;
  geofenceResult: 'WITHIN' | 'OUTSIDE' | 'UNVERIFIABLE';
  hrReviewRequired: boolean;
};

export type AttendanceDay = {
  attendanceDayId: string;
  attendanceDate: string;
  status: string;
  presentFraction: string | number;
  checkInAtUtc?: string | null;
  checkOutAtUtc?: string | null;
  hrReviewStatus: string;
  hrReviewComment?: string | null;
};

export type TeamAttendance = {
  employeeId: string;
  employeeName: string;
  attendanceDate: string;
  status: string;
  presentFraction: string | number;
  checkInAtUtc?: string | null;
  checkOutAtUtc?: string | null;
  hrReviewStatus: string;
};

export type AttendanceFlag = {
  attendanceFlagId: string;
  flagType: 'OUTSIDE_GEOFENCE' | 'LATE_CHECK_IN' | 'EARLY_CHECK_OUT';
  flagDetail?: string | null;
  employeeReason?: string | null;
  resolutionStatus: string;
  createdAtUtc: string;
};

export type AttendanceHrReview = {
  attendanceDayId: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  attendanceDate: string;
  presentFraction: string | number;
  checkInAtUtc?: string | null;
  checkOutAtUtc?: string | null;
  hrReviewStatus: string;
  hrReviewComment?: string | null;
  flags: AttendanceFlag[];
};

export type LeaveBalance = {
  leaveTypeId: string;
  leaveCode: string;
  leaveName: string;
  isPaid: boolean;
  allowHalfDay: boolean;
  openingDays: string | number;
  entitledDays: string | number;
  adjustmentDays: string | number;
  usedDays: string | number;
  availableDays: string | number;
};

export type LeaveRequest = {
  leaveRequestId: string;
  employeeId: string;
  employeeName: string;
  leaveTypeId: string;
  leaveTypeName: string;
  startDate: string;
  endDate: string;
  requestedDays: string | number;
  calculatedDays: string | number;
  dayMode: 'FULL_DAY' | 'HALF_DAY';
  halfDaySession?: 'FIRST_HALF' | 'SECOND_HALF' | null;
  approvedDays?: string | number | null;
  approvalOutcome?: 'APPROVED' | 'ADJUSTED' | 'REJECTED' | null;
  reason?: string | null;
  status: string;
  createdAtUtc: string;
};

export type LeaveType = {
  leaveTypeId: string;
  leaveCode: string;
  leaveName: string;
  isPaid: boolean;
  defaultEntitlementDays: string | number;
  allowHalfDay: boolean;
  minNoticeDays: number;
  maxConsecutiveDays?: string | number | null;
  requiresReason: boolean;
  allowNegativeBalance: boolean;
  status: string;
};

export type ReimbursementLineReview = {
  stage: 'HR' | 'FINANCE';
  decision: 'APPROVE' | 'ADJUST' | 'REJECT';
  previousAmount?: string | number | null;
  approvedAmount: string | number;
  actorRole: string;
  comment?: string | null;
  decidedAtUtc: string;
};

export type ReimbursementClaimLine = {
  reimbursementItemId: string;
  lineNumber: number;
  expenseDate: string;
  category: 'TRAVEL' | 'FOOD' | 'LODGING' | 'LOCAL_CONVEYANCE' | 'OTHER';
  claimedAmount: string | number;
  approvedAmount?: string | number | null;
  vendorName?: string | null;
  description?: string | null;
  receiptUrl?: string | null;
  travelFrom?: string | null;
  travelTo?: string | null;
  transportMode?: string | null;
  distanceKm?: string | number | null;
  ticketReference?: string | null;
  mealType?: string | null;
  lineStatus: string;
  reviews: ReimbursementLineReview[];
};

export type ReimbursementClaim = {
  claimId: string;
  claimNumber: string;
  employeeId: string;
  employeeName: string;
  purpose: string;
  claimMonth: string;
  status: string;
  approvalOutcome?: 'APPROVED' | 'PARTIALLY_APPROVED' | 'REJECTED' | null;
  financeApprovalRequired: boolean;
  claimedTotal: string | number;
  approvedTotal?: string | number | null;
  adjustedTotal: string | number;
  paymentStatus?: 'PENDING_PAYMENT' | 'PROCESSED' | null;
  paidAtUtc?: string | null;
  paidAmount?: string | number | null;
  paymentMode?: string | null;
  paymentReference?: string | null;
  paymentComment?: string | null;
  submittedAtUtc: string;
  lines: ReimbursementClaimLine[];
};

export type ReimbursementClaimLineInput = {
  expenseDate: string;
  category: 'TRAVEL' | 'FOOD' | 'LODGING' | 'LOCAL_CONVEYANCE' | 'OTHER';
  claimedAmount: number;
  vendorName?: string;
  description?: string;
  receipt?: File;
  travelFrom?: string;
  travelTo?: string;
  transportMode?: 'AIR' | 'RAIL' | 'CAB' | 'AUTO' | 'BUS' | 'METRO' | 'PERSONAL_CAR' | 'PERSONAL_BIKE' | 'OTHER';
  distanceKm?: number;
  ticketReference?: string;
  mealType?: 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACKS' | 'OTHER';
};

export type Reimbursement = {
  claimId: string;
  employeeId: string;
  employeeName: string;
  expenseDate: string;
  category: string;
  amount: string | number;
  description?: string | null;
  status: string;
  financeApprovalRequired: boolean;
  receiptUrl?: string | null;
  paymentStatus?: 'PENDING_PAYMENT' | 'PROCESSED' | null;
  paidAtUtc?: string | null;
  paidAmount?: string | number | null;
  paymentMode?: string | null;
  paymentReference?: string | null;
  paymentComment?: string | null;
  createdAtUtc: string;
};

export type Payslip = {
  payslipId: string;
  payrollMonth: string;
  netAmount: string | number;
  generatedAtUtc: string;
  downloadUrl: string;
};

export type AdminCapabilities = {
  employeeManage: boolean;
  attendanceReview: boolean;
  leaveHrApprove: boolean;
  reimbursementHrApprove: boolean;
  reimbursementFinanceApprove: boolean;
  reimbursementPaymentManage: boolean;
  payrollManage: boolean;
  reportRead: boolean;
  configManage: boolean;
};

export type BulkImport = {
  importId: string;
  filename: string;
  status: string;
  counts: Record<string, number>;
  rows: Array<{
    rowNumber: number;
    employeeCode?: string | null;
    action: 'CREATE' | 'UPDATE' | 'UNCHANGED' | 'ERROR';
    messages: string[];
    applied: boolean;
  }>;
};

export type PayrollSummary = {
  payrollRunId: string;
  payrollMonth: string;
  status: string;
  employeeCount: number;
  totalNetAmount: string | number;
  generatedAtUtc: string;
  finalizedAtUtc?: string | null;
};

export type PayrollItem = {
  payrollItemId: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  scheduledDays: string | number;
  presentDays: string | number;
  paidLeaveDays: string | number;
  unpaidLeaveDays: string | number;
  payableDays: string | number;
  basicAmount: string | number;
  hraAmount: string | number;
  allowancesAmount: string | number;
  otherEarningsAmount: string | number;
  lopAmount: string | number;
  grossAmount: string | number;
  employeePf: string | number;
  employeeEsi: string | number;
  professionalTax: string | number;
  tdsAmount: string | number;
  otherDeductions: string | number;
  deductionAmount: string | number;
  netAmount: string | number;
  employerPf: string | number;
  employerEps: string | number;
  employerEsi: string | number;
  gratuityProvision: string | number;
  employerCost: string | number;
};

export type PayrollProfile = {
  employeeId: string;
  employeeCode?: string | null;
  employeeName?: string | null;
  effectiveFrom: string;
  effectiveTo?: string | null;
  pfApplicable: boolean;
  pfOnActualWages: boolean;
  esiApplicable: boolean;
  professionalTaxState?: string | null;
  professionalTaxMonthly: string | number;
  tdsMonthly: string | number;
  taxRegime: 'NEW' | 'OLD';
  gratuityApplicable: boolean;
  uanMasked?: string | null;
  esicNumberMasked?: string | null;
};

export class EmployeeAttendanceHttpError extends Error {
  status: number;
  code?: string;

  constructor(status: number, detail: string, code?: string) {
    super(detail);
    this.name = 'EmployeeAttendanceHttpError';
    this.status = status;
    this.code = code;
  }
}

function baseUrl(): string {
  if (configuredBaseUrl) return configuredBaseUrl.replace(/\/$/, '');

  // Employee/HR/payroll APIs are hosted by the existing isolated Attendance service.
  // Reuse the same DEV fallback as the legacy Attendance client so Web DEV needs no
  // second service or second runtime setting.
  if (typeof window !== 'undefined' && window.location.hostname === DEV_WEB_HOST) {
    return DEV_ATTENDANCE_BASE_URL;
  }

  throw new Error('Employee Attendance service is not configured.');
}

async function request<T>(
  path: string,
  accessToken: string,
  init: RequestInit = {},
): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  try {
    const response = await fetch(`${baseUrl()}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
      credentials: 'include',
    });
    if (!response.ok) {
      let detail = 'Employee Attendance request failed.';
      let code: string | undefined;
      try {
        const problem = await response.clone().json() as { detail?: string; code?: string };
        detail = problem.detail || detail;
        code = problem.code;
      } catch {
        // Keep the safe fallback.
      }
      throw new EmployeeAttendanceHttpError(response.status, detail, code);
    }
    if (response.status === 204) return undefined as T;
    return await response.json() as T;
  } catch (error) {
    if (error instanceof EmployeeAttendanceHttpError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Employee Attendance request timed out. Normal Verigence work is unaffected.');
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function download(path: string, accessToken: string): Promise<Blob> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl()}${path}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
      credentials: 'include',
    });
    if (!response.ok) throw new EmployeeAttendanceHttpError(response.status, 'Download failed.');
    return await response.blob();
  } finally {
    window.clearTimeout(timeout);
  }
}

export const getMyProfile = (token: string) =>
  request<EmployeeProfile>('/employee-attendance/v1/me', token);

export const getMyAttendance = (token: string) =>
  request<AttendanceDay[]>('/employee-attendance/v1/me/attendance?limit=31', token);

export async function recordAttendance(
  token: string,
  action: 'check-in' | 'check-out',
  input: {
    latitude: number;
    longitude: number;
    accuracyMeters: number;
    capturedAt: string;
    photo: Blob;
    filename: string;
    exceptionReason?: string;
  },
) {
  const body = new FormData();
  body.set('latitude', String(input.latitude));
  body.set('longitude', String(input.longitude));
  body.set('accuracyMeters', String(input.accuracyMeters));
  body.set('capturedAt', input.capturedAt);
  body.set('photo', input.photo, input.filename);
  if (input.exceptionReason?.trim()) body.set('exceptionReason', input.exceptionReason.trim());
  return request<AttendanceEvent>(
    `/employee-attendance/v1/me/attendance/${action}`,
    token,
    { method: 'POST', body },
  );
}

export const getHrAttendanceReviewQueue = (token: string) =>
  request<AttendanceHrReview[]>('/employee-attendance/v1/admin/attendance/reviews', token);

export const decideHrAttendanceReview = (
  token: string,
  attendanceDayId: string,
  input: {
    decision: 'APPROVE' | 'ADJUST' | 'REJECT';
    presentFraction?: number;
    comment?: string;
  },
) => request<AttendanceHrReview>(
  `/employee-attendance/v1/admin/attendance/${attendanceDayId}/review`,
  token,
  { method: 'POST', body: JSON.stringify(input) },
);

export const getLeaveBalances = (token: string) =>
  request<LeaveBalance[]>('/employee-attendance/v1/me/leave-balances', token);

export const getMyLeave = (token: string) =>
  request<LeaveRequest[]>('/employee-attendance/v1/me/leave', token);

export const applyLeave = (
  token: string,
  body: {
    leaveTypeId: string;
    startDate: string;
    endDate: string;
    dayMode: 'FULL_DAY' | 'HALF_DAY';
    halfDaySession?: 'FIRST_HALF' | 'SECOND_HALF';
    reason?: string;
  },
) => request<LeaveRequest>('/employee-attendance/v1/me/leave', token, {
  method: 'POST',
  body: JSON.stringify(body),
});

export const getTeamAttendance = (token: string, attendanceDate?: string) =>
  request<TeamAttendance[]>(
    `/employee-attendance/v1/team/attendance${attendanceDate ? `?attendanceDate=${encodeURIComponent(attendanceDate)}` : ''}`,
    token,
  );

export const getTeamLeave = (token: string) =>
  request<LeaveRequest[]>('/employee-attendance/v1/team/leave', token);

export const decideTeamLeave = (
  token: string,
  leaveId: string,
  decision: 'APPROVE' | 'REJECT',
  comment?: string,
) => request<LeaveRequest>(
  `/employee-attendance/v1/team/leave/${leaveId}/decision`,
  token,
  { method: 'POST', body: JSON.stringify({ decision, comment }) },
);

export const getMyReimbursementClaims = (token: string) =>
  request<ReimbursementClaim[]>('/employee-attendance/v1/me/reimbursement-claims', token);

export const getTeamReimbursementClaims = (token: string) =>
  request<ReimbursementClaim[]>('/employee-attendance/v1/team/reimbursement-claims', token);

export async function submitReimbursementClaim(
  token: string,
  input: { purpose: string; lines: ReimbursementClaimLineInput[] },
) {
  const receipts: File[] = [];
  const lines = input.lines.map((line) => {
    const receiptIndex = line.receipt ? receipts.push(line.receipt) - 1 : undefined;
    return {
      expenseDate: line.expenseDate,
      category: line.category,
      claimedAmount: line.claimedAmount,
      vendorName: line.vendorName || undefined,
      description: line.description || undefined,
      receiptIndex,
      travelFrom: line.travelFrom || undefined,
      travelTo: line.travelTo || undefined,
      transportMode: line.transportMode || undefined,
      distanceKm: line.distanceKm,
      ticketReference: line.ticketReference || undefined,
      mealType: line.mealType || undefined,
    };
  });
  const body = new FormData();
  body.set('payload', JSON.stringify({ purpose: input.purpose, lines }));
  receipts.forEach((receipt) => body.append('receipts', receipt, receipt.name));
  return request<ReimbursementClaim>(
    '/employee-attendance/v1/me/reimbursement-claims',
    token,
    { method: 'POST', body },
  );
}

export const getReimbursementClaimQueue = (
  token: string,
  stage: 'HR' | 'FINANCE',
) => request<ReimbursementClaim[]>(
  `/employee-attendance/v1/admin/reimbursement-claims?stage=${stage}`,
  token,
);

export const reviewReimbursementClaim = (
  token: string,
  claimId: string,
  stage: 'HR' | 'FINANCE',
  lineDecisions: Array<{
    reimbursementItemId: string;
    decision: 'APPROVE' | 'ADJUST' | 'REJECT';
    approvedAmount: number;
    comment?: string;
  }>,
  comment?: string,
) => request<ReimbursementClaim>(
  `/employee-attendance/v1/admin/reimbursement-claims/${claimId}/review?stage=${stage}`,
  token,
  { method: 'POST', body: JSON.stringify({ lineDecisions, comment }) },
);

export const getMyReimbursements = (token: string) =>
  request<Reimbursement[]>('/employee-attendance/v1/me/reimbursements', token);

export const getTeamReimbursements = (token: string) =>
  request<Reimbursement[]>('/employee-attendance/v1/team/reimbursements', token);

export async function submitReimbursement(
  token: string,
  input: {
    expenseDate: string;
    category: string;
    amount: number;
    description?: string;
    receipt?: File | Blob;
    filename?: string;
  },
) {
  const body = new FormData();
  body.set('expenseDate', input.expenseDate);
  body.set('category', input.category);
  body.set('amount', String(input.amount));
  if (input.description) body.set('description', input.description);
  if (input.receipt) body.set('receipt', input.receipt, input.filename || 'receipt');
  return request<Reimbursement>('/employee-attendance/v1/me/reimbursements', token, {
    method: 'POST',
    body,
  });
}

export const getMyPayslips = (token: string) =>
  request<Payslip[]>('/employee-attendance/v1/me/payslips', token);

export const getAdminCapabilities = (token: string) =>
  request<AdminCapabilities>('/employee-attendance/v1/admin/capabilities', token);

export const listAdminEmployees = (token: string) =>
  request<EmployeeProfile[]>('/employee-attendance/v1/admin/employees', token);

export const getHrLeaveQueue = (token: string) =>
  request<LeaveRequest[]>('/employee-attendance/v1/admin/leave', token);

export const decideHrLeave = (
  token: string,
  leaveId: string,
  input: {
    decision: 'APPROVE' | 'ADJUST' | 'REJECT';
    approvedDays?: number;
    comment?: string;
  },
) => request<LeaveRequest>(
  `/employee-attendance/v1/admin/leave/${leaveId}/decision`,
  token,
  { method: 'POST', body: JSON.stringify(input) },
);

export const getReimbursementQueue = (token: string, stage: 'HR' | 'FINANCE') =>
  request<Reimbursement[]>(
    `/employee-attendance/v1/admin/reimbursements?stage=${stage}`,
    token,
  );

export const decideReimbursement = (
  token: string,
  claimId: string,
  stage: 'HR' | 'FINANCE',
  decision: 'APPROVE' | 'REJECT',
  comment?: string,
) => request<Reimbursement>(
  `/employee-attendance/v1/admin/reimbursements/${claimId}/decision?stage=${stage}`,
  token,
  { method: 'POST', body: JSON.stringify({ decision, comment }) },
);

export const getReimbursementPaymentQueue = (
  token: string,
  paymentStatus: 'PENDING_PAYMENT' | 'PROCESSED' = 'PENDING_PAYMENT',
) => request<ReimbursementClaim[]>(
  `/employee-attendance/v1/admin/reimbursements/payments?paymentStatus=${paymentStatus}`,
  token,
);

export const updateReimbursementPayment = (
  token: string,
  claimId: string,
  input: {
    paidAmount: number;
    paidAtUtc: string;
    paymentMode: string;
    paymentReference: string;
    comment?: string;
  },
) => request<ReimbursementClaim>(
  `/employee-attendance/v1/admin/reimbursements/${claimId}/payment`,
  token,
  { method: 'POST', body: JSON.stringify(input) },
);

export const downloadEmployeeTemplate = (token: string) =>
  download('/employee-attendance/v1/admin/employees/import-template', token);

export async function previewEmployeeImport(token: string, file: File) {
  const body = new FormData();
  body.set('workbook', file, file.name);
  return request<BulkImport>(
    '/employee-attendance/v1/admin/employees/imports/preview',
    token,
    { method: 'POST', body },
  );
}

export const applyEmployeeImport = (token: string, importId: string) =>
  request<BulkImport>(
    `/employee-attendance/v1/admin/employees/imports/${importId}/apply`,
    token,
    { method: 'POST' },
  );

export const getPayrollProfiles = (token: string) =>
  request<PayrollProfile[]>('/employee-attendance/v1/admin/payroll-profiles', token);

export const updatePayrollProfile = (
  token: string,
  employeeId: string,
  input: {
    effectiveFrom: string;
    pfApplicable: boolean;
    pfOnActualWages: boolean;
    esiApplicable: boolean;
    professionalTaxState?: string;
    professionalTaxMonthly: number;
    tdsMonthly: number;
    taxRegime: 'NEW' | 'OLD';
    gratuityApplicable: boolean;
    uanMasked?: string;
    esicNumberMasked?: string;
  },
) => request<PayrollProfile>(
  `/employee-attendance/v1/admin/payroll-profiles/${employeeId}`,
  token,
  { method: 'PUT', body: JSON.stringify(input) },
);

export const calculatePayroll = (token: string, month: string) =>
  request<PayrollSummary>(
    `/employee-attendance/v1/admin/payroll/calculate?month=${encodeURIComponent(month)}`,
    token,
    { method: 'POST' },
  );

export const getPayrollItems = (token: string, runId: string) =>
  request<PayrollItem[]>(`/employee-attendance/v1/admin/payroll/${runId}/items`, token);

export const finalizePayroll = (token: string, runId: string) =>
  request<PayrollSummary>(
    `/employee-attendance/v1/admin/payroll/${runId}/finalize`,
    token,
    { method: 'POST' },
  );

export const downloadAttendanceReport = (
  token: string,
  startDate: string,
  endDate: string,
) => download(
  `/employee-attendance/v1/admin/reports/attendance?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`,
  token,
);

export const downloadPayrollReport = (token: string, runId: string) =>
  download(`/employee-attendance/v1/admin/reports/payroll/${runId}`, token);

export const getModuleConfig = (token: string) =>
  request<Record<string, unknown>>('/employee-attendance/v1/admin/config', token);

export const getWorkLocations = (token: string) =>
  request<Array<Record<string, unknown>>>('/employee-attendance/v1/admin/work-locations', token);

export const getLeaveTypes = (token: string) =>
  request<LeaveType[]>('/employee-attendance/v1/admin/leave-types', token);

export const getHolidays = (token: string) =>
  request<Array<Record<string, unknown>>>('/employee-attendance/v1/admin/holidays', token);


export const createAdminEmployee = (
  token: string,
  body: {
    securityUserId: string;
    employeeCode: string;
    displayName: string;
    primaryEmail?: string;
    mobile?: string;
    joiningDate: string;
    tlUserId?: string;
    pmoUserId?: string;
    projectTenantId?: string;
    workLocationId?: string;
    basicSalary: number;
    hra: number;
    allowances: number;
    otherEarnings: number;
    fixedDeductions: number;
    bankAccountMasked?: string;
    panMasked?: string;
    aadhaarMasked?: string;
  },
) => request<EmployeeProfile>('/employee-attendance/v1/admin/employees', token, {
  method: 'POST',
  body: JSON.stringify(body),
});

export const updateModuleConfig = (token: string, key: string, value: unknown) =>
  request<Record<string, unknown>>(
    `/employee-attendance/v1/admin/config/${encodeURIComponent(key)}`,
    token,
    { method: 'PUT', body: JSON.stringify({ value }) },
  );

export const createWorkLocation = (
  token: string,
  body: {
    locationCode: string;
    locationName: string;
    addressText?: string;
    latitude: number;
    longitude: number;
    geofenceRadiusMeters: number;
  },
) => request<Record<string, unknown>>('/employee-attendance/v1/admin/work-locations', token, {
  method: 'POST',
  body: JSON.stringify(body),
});

export const createLeaveType = (
  token: string,
  body: {
    leaveCode: string;
    leaveName: string;
    isPaid: boolean;
    defaultEntitlementDays: number;
    allowHalfDay: boolean;
    minNoticeDays: number;
    maxConsecutiveDays?: number;
    requiresReason: boolean;
    allowNegativeBalance: boolean;
  },
) => request<Record<string, unknown>>('/employee-attendance/v1/admin/leave-types', token, {
  method: 'POST',
  body: JSON.stringify(body),
});

export const createHoliday = (
  token: string,
  body: {
    holidayDate: string;
    holidayName: string;
    workLocationId?: string;
  },
) => request<Record<string, unknown>>('/employee-attendance/v1/admin/holidays', token, {
  method: 'POST',
  body: JSON.stringify(body),
});
