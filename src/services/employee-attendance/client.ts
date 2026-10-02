const configuredBaseUrl = import.meta.env.VITE_EMPLOYEE_ATTENDANCE_BASE_URL?.trim();
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

export type AttendanceDay = {
  attendanceDate: string;
  status: string;
  presentFraction: string | number;
  checkInAtUtc?: string | null;
  checkOutAtUtc?: string | null;
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
  reason?: string | null;
  status: string;
  createdAtUtc: string;
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
  leaveHrApprove: boolean;
  reimbursementHrApprove: boolean;
  reimbursementFinanceApprove: boolean;
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
  grossAmount: string | number;
  deductionAmount: string | number;
  netAmount: string | number;
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
  if (!configuredBaseUrl) throw new Error('Employee Attendance service is not configured.');
  return configuredBaseUrl.replace(/\/$/, '');
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
  },
) {
  const body = new FormData();
  body.set('latitude', String(input.latitude));
  body.set('longitude', String(input.longitude));
  body.set('accuracyMeters', String(input.accuracyMeters));
  body.set('capturedAt', input.capturedAt);
  body.set('photo', input.photo, input.filename);
  return request(
    `/employee-attendance/v1/me/attendance/${action}`,
    token,
    { method: 'POST', body },
  );
}

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
    requestedDays: number;
    reason?: string;
  },
) => request<LeaveRequest>('/employee-attendance/v1/me/leave', token, {
  method: 'POST',
  body: JSON.stringify(body),
});

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

export const getMyReimbursements = (token: string) =>
  request<Reimbursement[]>('/employee-attendance/v1/me/reimbursements', token);

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
  decision: 'APPROVE' | 'REJECT',
  comment?: string,
) => request<LeaveRequest>(
  `/employee-attendance/v1/admin/leave/${leaveId}/decision`,
  token,
  { method: 'POST', body: JSON.stringify({ decision, comment }) },
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
  request<Array<Record<string, unknown>>>('/employee-attendance/v1/admin/leave-types', token);

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
