import type { DataFlag, EmploymentStatus, LoginStatus } from '../../services/hr/employees';

export const dataFlagLabels: Record<DataFlag, string> = {
  PAN_MISSING: 'PAN missing',
  PAN_DUPLICATE: 'PAN repeated',
  AADHAAR_MISSING: 'Aadhaar missing',
  MOBILE_MISSING: 'Mobile missing',
};

export const statusLabels: Record<EmploymentStatus, string> = {
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  EXITED: 'Exited',
};

export const loginLabels: Record<LoginStatus, string> = {
  NOT_CREATED: 'No login yet',
  CREATED: 'Login created',
  FAILED: 'Login pending',
};

/** What HR should do about a login that could not be created. Codes come from the HR service. */
export const loginProblemText: Record<string, string> = {
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
