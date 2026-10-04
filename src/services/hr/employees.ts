import { hrRawRequest, hrRequest } from './client';

export type Gender = 'MALE' | 'FEMALE' | 'OTHER';
export type EmploymentStatus = 'ACTIVE' | 'INACTIVE' | 'EXITED';
export type LoginStatus = 'NOT_CREATED' | 'CREATED' | 'FAILED';
export type DataFlag = 'PAN_MISSING' | 'PAN_DUPLICATE' | 'AADHAAR_MISSING' | 'MOBILE_MISSING';

export const HR_PERMISSION = {
  employeeRead: 'hr.employee.read',
  employeeManage: 'hr.employee.manage',
  sensitiveRead: 'hr.sensitive.read',
  auditRead: 'hr.audit.read',
  settingsManage: 'hr.settings.manage',
} as const;

export interface HrMe {
  userId: string;
  permissions: string[];
  employeeId: string | null;
}

export interface Qualification {
  qualificationId: string;
  degreeCode: string;
  degree: string;
  level: string;
  percentage: number;
  yearOfPassing: number;
}

export interface Employee {
  employeeId: string;
  employeeCode: string;
  fullName: string;
  dateOfBirth: string | null;
  gender: Gender | null;
  mobile: string | null;
  personalEmail: string;
  secondaryEmail: string | null;
  qualification: string | null;
  department: string | null;
  designationCode: string | null;
  designation: string | null;
  address: string | null;
  state: string | null;
  pincode: string | null;
  totalExperienceYears: number | null;
  emergencyContactName: string | null;
  emergencyContactNumber: string | null;
  emergencyContactAddress: string | null;
  hasPhoto: boolean;
  dateOfJoining: string | null;
  employmentStatus: EmploymentStatus;
  loginStatus: LoginStatus;
  loginErrorCode: string | null;
  panMasked: string | null;
  aadhaarMasked: string | null;
  dataFlags: DataFlag[];
}

export interface EmployeeDetail extends Employee {
  qualifications: Qualification[];
}

export interface EmployeeList {
  total: number;
  items: Employee[];
}

export interface Degree {
  code: string;
  label: string;
  level: string;
}

export interface Designation {
  code: string;
  label: string;
}

export interface QualificationInput {
  degree_code: string;
  degree_other?: string | null;
  percentage: number;
  year_of_passing: number;
}

/** Fields HR may send when creating an employee. Empty values are omitted by the caller. */
export interface EmployeeCreateInput {
  employee_code: string;
  full_name: string;
  personal_email: string;
  mobile?: string;
  date_of_birth?: string;
  gender?: Gender;
  qualification?: string;
  department?: string;
  address?: string;
  state?: string;
  pincode?: string;
  total_experience_years?: number;
  emergency_contact_name?: string;
  emergency_contact_number?: string;
  emergency_contact_address?: string;
  date_of_joining?: string;
  pan?: string;
  aadhaar?: string;
  qualifications?: QualificationInput[];
  create_login: boolean;
}

/** On update a field set to null is cleared; a field left out is not touched. */
export type EmployeeUpdateInput = Partial<
  Omit<EmployeeCreateInput, 'employee_code' | 'qualifications' | 'create_login'>
> & {
  designation_code?: string | null;
  employment_status?: EmploymentStatus;
};

export interface SelfUpdateInput {
  address?: string | null;
  state?: string | null;
  pincode?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_number?: string | null;
  emergency_contact_address?: string | null;
  secondary_email?: string | null;
}

export interface CreateEmployeeResult {
  employee: EmployeeDetail;
  initialPassword?: string;
  initialPasswordNote?: string;
}

export interface RetryLoginResult {
  employee: Employee;
  initialPassword?: string;
  initialPasswordNote?: string;
}

export interface AuditEntry {
  auditId: number;
  occurredAt: string;
  actorUserId: string;
  action: string;
  entityType: string;
  entityId: string;
  changes: Record<string, unknown>;
}

export interface AuditPage {
  items: AuditEntry[];
  nextBeforeId: number | null;
}

const base = '/hr/v1';

export const getHrMe = (token: string) => hrRequest<HrMe>(`${base}/me`, { accessToken: token });

export const listEmployees = (
  token: string,
  params: { q?: string; status?: EmploymentStatus; limit?: number; offset?: number },
) => {
  const query = new URLSearchParams();
  if (params.q?.trim()) query.set('q', params.q.trim());
  if (params.status) query.set('status', params.status);
  query.set('limit', String(params.limit ?? 50));
  query.set('offset', String(params.offset ?? 0));
  return hrRequest<EmployeeList>(`${base}/employees?${query.toString()}`, { accessToken: token });
};

export const getEmployee = (token: string, id: string) =>
  hrRequest<EmployeeDetail>(`${base}/employees/${id}`, { accessToken: token });

export const createEmployee = (token: string, input: EmployeeCreateInput) =>
  hrRequest<CreateEmployeeResult>(`${base}/employees`, {
    accessToken: token,
    method: 'POST',
    body: input as unknown as Record<string, unknown>,
  });

export const updateEmployee = (token: string, id: string, input: EmployeeUpdateInput) =>
  hrRequest<Employee>(`${base}/employees/${id}`, {
    accessToken: token,
    method: 'PATCH',
    body: input as unknown as Record<string, unknown>,
  });

export const retryEmployeeLogin = (token: string, id: string) =>
  hrRequest<RetryLoginResult>(`${base}/employees/${id}/login`, { accessToken: token, method: 'POST' });

export const revealEmployeeSensitive = (token: string, id: string) =>
  hrRequest<{ pan: string | null; aadhaar: string | null }>(`${base}/employees/${id}/sensitive`, {
    accessToken: token,
  });

export const getDegrees = (token: string) => hrRequest<Degree[]>(`${base}/degrees`, { accessToken: token });
export const getStates = (token: string) => hrRequest<string[]>(`${base}/states`, { accessToken: token });
export const getDesignations = (token: string) =>
  hrRequest<Designation[]>(`${base}/designations`, { accessToken: token });

export const addQualification = (token: string, id: string, input: QualificationInput) =>
  hrRequest<EmployeeDetail>(`${base}/employees/${id}/qualifications`, {
    accessToken: token,
    method: 'POST',
    body: input as unknown as Record<string, unknown>,
  });

export const replaceQualification = (token: string, id: string, qid: string, input: QualificationInput) =>
  hrRequest<EmployeeDetail>(`${base}/employees/${id}/qualifications/${qid}`, {
    accessToken: token,
    method: 'PUT',
    body: input as unknown as Record<string, unknown>,
  });

export const removeQualification = (token: string, id: string, qid: string) =>
  hrRequest<EmployeeDetail>(`${base}/employees/${id}/qualifications/${qid}`, {
    accessToken: token,
    method: 'DELETE',
  });

function photoForm(file: Blob, name: string): FormData {
  const form = new FormData();
  form.append('file', file, name);
  return form;
}

export const uploadEmployeePhoto = (token: string, id: string, file: Blob, name: string) =>
  hrRequest<Employee>(`${base}/employees/${id}/photo`, {
    accessToken: token,
    method: 'POST',
    body: photoForm(file, name),
  });

export async function fetchEmployeePhoto(token: string, id: string): Promise<Blob> {
  const response = await hrRawRequest(`${base}/employees/${id}/photo`, { accessToken: token });
  return response.blob();
}

export const getHrAudit = (token: string, entityId: string, beforeId?: number) => {
  const query = new URLSearchParams({ entity_type: 'employee', entity_id: entityId, limit: '30' });
  if (beforeId) query.set('before_id', String(beforeId));
  return hrRequest<AuditPage>(`${base}/audit?${query.toString()}`, { accessToken: token });
};

// ---- self service: always the caller's own record; the server finds it from the sign-in --------

export const getMyEmployee = (token: string) =>
  hrRequest<EmployeeDetail>(`${base}/me/employee`, { accessToken: token });

export const updateMyEmployee = (token: string, input: SelfUpdateInput) =>
  hrRequest<Employee>(`${base}/me/employee`, {
    accessToken: token,
    method: 'PATCH',
    body: input as unknown as Record<string, unknown>,
  });

export const revealMySensitive = (token: string) =>
  hrRequest<{ pan: string | null; aadhaar: string | null }>(`${base}/me/employee/sensitive`, {
    accessToken: token,
  });

export const uploadMyPhoto = (token: string, file: Blob, name: string) =>
  hrRequest<Employee>(`${base}/me/employee/photo`, {
    accessToken: token,
    method: 'POST',
    body: photoForm(file, name),
  });

export async function fetchMyPhoto(token: string): Promise<Blob> {
  const response = await hrRawRequest(`${base}/me/employee/photo`, { accessToken: token });
  return response.blob();
}

// ---- spreadsheet import ----------------------------------------------------------------------

export type ImportRowStatus = 'READY' | 'EXISTS' | 'ERROR';

export interface ImportPreviewRow {
  row: number;
  status: ImportRowStatus;
  employeeCode: string;
  fullName: string;
  personalEmail: string | null;
  mobile: string | null;
  dateOfBirth: string | null;
  gender: Gender | null;
  department: string | null;
  qualification: string | null;
  panMasked: string | null;
  aadhaarMasked: string | null;
  notes: string[];
  errors: string[];
}

export interface ImportPreview {
  summary: { total: number; ready: number; exists: number; errors: number };
  rows: ImportPreviewRow[];
}

export interface ImportResult {
  row: number;
  employeeCode?: string;
  status: 'CREATED' | 'FAILED' | 'SKIPPED';
  employeeId?: string;
  fullName?: string;
  personalEmail?: string;
  loginStatus?: LoginStatus;
  loginErrorCode?: string | null;
  initialPassword?: string;
  error?: string;
}

export const previewEmployeeImport = (token: string, file: File) => {
  const form = new FormData();
  form.append('file', file, file.name);
  return hrRequest<ImportPreview>(`${base}/employees/import/preview`, {
    accessToken: token,
    method: 'POST',
    body: form,
    timeoutMs: 60_000,
  });
};

export const commitEmployeeImport = (token: string, file: File, rows: number[], createLogin: boolean) => {
  const form = new FormData();
  form.append('file', file, file.name);
  form.append('rows', rows.join(','));
  form.append('create_login', createLogin ? 'true' : 'false');
  return hrRequest<{ results: ImportResult[] }>(`${base}/employees/import/commit`, {
    accessToken: token,
    method: 'POST',
    body: form,
    timeoutMs: 120_000,
  });
};
