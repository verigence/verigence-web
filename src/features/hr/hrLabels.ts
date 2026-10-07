import type { DataFlag, EmploymentStatus, LoginStatus, MissingDetail, SalaryStatus } from '../../services/hr/employees';

export const dataFlagLabels: Record<DataFlag, string> = {
  PAN_MISSING: 'PAN missing',
  PAN_DUPLICATE: 'PAN repeated',
  AADHAAR_MISSING: 'Aadhaar missing',
  MOBILE_MISSING: 'Mobile missing',
};

/** Human names for the HR service's "pending details" codes. */
export const missingDetailLabels: Record<MissingDetail, string> = {
  STATE: 'State',
  DISTRICT: 'District',
  PINCODE: 'Pincode',
  EMERGENCY_CONTACT: 'Emergency contact',
  EXPERIENCE: 'Years of experience',
  QUALIFICATION: 'Qualification',
  UNIVERSITY_COLLEGE: 'University and college',
  SALARY: 'Salary',
};

export const salaryStatusLabels: Record<SalaryStatus, string> = {
  NONE: 'No salary',
  WAITING_FINANCE: 'Waiting for Finance approval',
  TEMPLATE_PENDING: 'Template pending',
  APPROVED: 'Salary approved',
  APPROVED_FROM_LATER: 'Salary approved (starts later)',
};

/** Badge tone, matching the hr-pay-pill colours. */
export const salaryStatusTone: Record<SalaryStatus, 'rejected' | 'pending' | 'approved'> = {
  NONE: 'rejected',
  WAITING_FINANCE: 'pending',
  TEMPLATE_PENDING: 'pending',
  APPROVED: 'approved',
  APPROVED_FROM_LATER: 'approved',
};

export const statusLabels: Record<EmploymentStatus, string> = {
  ACTIVE: 'Active',
  SUSPENDED: 'Suspended',
  TERMINATED: 'Terminated',
  QUIT: 'Quit',
};

/** What happened to the Verigence login when a status change was approved, in plain words. */
export const loginOutcomeLabels: Record<string, string> = {
  LOGIN_SUSPENDED: 'The Verigence login was suspended.',
  LOGIN_ALREADY_NOT_ACTIVE: 'The Verigence login was not active, so nothing was changed.',
  LOGIN_SUPERADMIN_NOT_SUSPENDED: 'This is the SuperAdmin login, so it was not suspended.',
  LOGIN_NOT_FOUND: 'The Verigence login could not be found.',
  LOGIN_NOT_UPDATED: 'The Verigence login could not be checked now. Use Sync with Verigence on the Employees page to suspend it.',
  LOGIN_NOT_CHECKED: 'The Verigence login was not checked.',
  LOGIN_ACTIVE: 'The Verigence login is active.',
  LOGIN_NEEDS_SUPERADMIN: 'The Verigence login is still suspended. Ask the SuperAdmin to reinstate it.',
  NO_LOGIN: 'This employee has no Verigence login.',
};

export const loginLabels: Record<LoginStatus, string> = {
  NOT_CREATED: 'No login yet',
  CREATED: 'Login created',
  FAILED: 'Login pending',
};

/** What HR should do about a login that could not be created. Codes come from the HR service. */
const loginProblemText: Record<string, string> = {
  EMAIL_OR_MOBILE_EXISTS: 'This email or mobile already has a Verigence login. Use "Link existing login" to connect it to this employee.',
  CONTACT_NOT_VALID: 'A valid mobile number is needed. Add it, then create the login.',
  NOT_PERMITTED: 'Verigence Security has not allowed HR to create logins yet.',
  SECURITY_UNAVAILABLE: 'Verigence Security could not be reached. Try again in a few minutes.',
  BAD_RESPONSE: 'Verigence Security gave an unexpected answer. Try again later.',
  NOT_CONFIGURED: 'Login creation is not set up for HR yet.',
};

export function loginProblem(code: string | null): string {
  if (!code) return 'The login could not be created.';
  return loginProblemText[code] ?? 'The login could not be created.';
}

export function formatDate(value: string | null): string {
  if (!value) return '—';
  const parts = value.slice(0, 10).split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return value;
  return new Date(parts[0], parts[1] - 1, parts[2]).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
}

export function experienceLabel(years: number | null): string {
  if (years === null) return '—';
  return `${years} ${years === 1 ? 'year' : 'years'}`;
}
