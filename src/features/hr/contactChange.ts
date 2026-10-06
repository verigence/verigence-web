import type { ContactChange, ContactField } from '../../services/hr/contactChanges';
import { isEmail, normaliseMobile } from './employeeValidation';

export const contactFieldLabels: Record<ContactField, string> = { EMAIL: 'Email', MOBILE: 'Mobile' };

export const contactStatusLabels: Record<ContactChange['status'], string> = {
  PENDING: 'Waiting for HR',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
};

/** What the server will be sent, or the message to show. The server checks everything again. */
export function checkNewContact(
  field: ContactField,
  raw: string,
  current: string | null,
): { value: string; error: null } | { value: null; error: string } {
  if (field === 'EMAIL') {
    if (!isEmail(raw)) return { value: null, error: 'Enter a valid email address.' };
    const value = raw.trim().toLowerCase();
    if (value === (current ?? '').toLowerCase()) return { value: null, error: 'This is already your email.' };
    return { value, error: null };
  }
  const value = normaliseMobile(raw);
  if (!value) return { value: null, error: 'Enter a valid 10-digit Indian mobile number.' };
  if (value === (current ?? '')) return { value: null, error: 'This is already your mobile number.' };
  return { value, error: null };
}

/**
 * What HR may do with a request. Any HR person with manage access decides, never on their own
 * request; only the employee who asked can cancel. The server decides again.
 */
export function contactChangeActions(
  change: Pick<ContactChange, 'status' | 'requestedBy'>,
  who: { userId: string | null; canManage: boolean },
): { approve: boolean; reject: boolean } {
  const open = change.status === 'PENDING';
  const own = Boolean(who.userId) && change.requestedBy === who.userId;
  return { approve: open && who.canManage && !own, reject: open && who.canManage && !own };
}

/** One plain sentence about the login, shown to HR after a decision. */
export function contactLoginNote(change: Pick<ContactChange, 'status' | 'field' | 'loginOutcome'>): string {
  if (change.status !== 'APPROVED') return '';
  if (change.loginOutcome === 'LOGIN_UPDATED') {
    return change.field === 'EMAIL'
      ? 'The Verigence login now uses the new email. Send the Welcome email so the employee knows.'
      : 'The Verigence login was updated.';
  }
  if (change.loginOutcome === 'LOGIN_NOT_UPDATED') return 'The Verigence login could not be updated now.';
  return 'This employee has no Verigence login yet.';
}
