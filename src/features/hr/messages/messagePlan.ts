import type { LoginStatus } from '../../../services/hr/employees';
import type {
  MessageResultStatus,
  MessageTemplateCode,
  SendMessageResult,
} from '../../../services/hr/messages';
import { MESSAGE_BATCH_LIMIT } from '../../../services/hr/messages';

/** Split ids into groups the HR service accepts, in order. Duplicates are dropped first. */
export function toBatches(ids: string[], size: number = MESSAGE_BATCH_LIMIT): string[][] {
  const unique = Array.from(new Set(ids));
  const out: string[][] = [];
  for (let i = 0; i < unique.length; i += size) out.push(unique.slice(i, i + size));
  return out;
}

/* ---------- placeholders ---------- */

export const placeholderToken = (key: string) => `{{${key}}}`;

export const placeholderHelp: Record<string, string> = {
  name: "The person's name",
  company: 'Company name',
  sign_in_link: 'Link to sign in',
  app_link: 'Link to download the mobile app',
  login_id: "The person's sign-in ID",
  temp_password: 'The new temporary password',
};

/** Keys used in a text, the way the HR service reads them ({{ key }}, spaces allowed). */
export function usedPlaceholders(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)) found.add(m[1]);
  return Array.from(found);
}

/** Put a placeholder where the cursor is (or replace the selected text). Returns the new text and caret. */
export function insertAtSelection(
  value: string,
  start: number | null | undefined,
  end: number | null | undefined,
  token: string,
): { value: string; caret: number } {
  const s = Math.min(Math.max(start ?? value.length, 0), value.length);
  const e = Math.min(Math.max(end ?? s, s), value.length);
  return { value: value.slice(0, s) + token + value.slice(e), caret: s + token.length };
}

const REQUIRED: Record<MessageTemplateCode, string[]> = { GENERAL: [], WELCOME: ['login_id', 'temp_password'] };

/**
 * The same rules as the HR service, so a mistake shows before sending. The service checks again
 * and its answer (MESSAGE_TEMPLATE_INVALID) is always shown as it is.
 */
export function validateWording(
  code: MessageTemplateCode,
  subject: string,
  body: string,
  allowed: string[],
): string | null {
  if (!subject.trim() || !body.trim()) return 'The subject and the message cannot be empty.';
  if (subject.trim().length > 200) return 'The subject can be at most 200 characters.';
  if (body.trim().length > 5000) return 'The message can be at most 5000 characters.';
  const inSubject = usedPlaceholders(subject);
  const inBody = usedPlaceholders(body);
  const unknown = Array.from(new Set([...inSubject, ...inBody])).filter((k) => !allowed.includes(k)).sort();
  if (unknown.length) {
    return `These placeholders are not available here: ${unknown.map(placeholderToken).join(', ')}.`;
  }
  if (inSubject.includes('temp_password')) return 'The password cannot be placed in the subject line.';
  const missing = REQUIRED[code].filter((k) => !inBody.includes(k));
  if (missing.length) return `The message must include ${missing.map(placeholderToken).join(', ')}.`;
  return null;
}

/* ---------- preview (never a real password) ---------- */

export const MASKED_PASSWORD = '••••••••';

export interface PreviewPerson {
  fullName: string;
}

/**
 * Preview for one person. The name is theirs; the temporary password is always masked here (a real
 * one is created only when sending); the company name, links and the sign-in ID are filled in by the
 * service, so they are shown as labels.
 */
export function renderPreview(text: string, person: PreviewPerson): string {
  const values: Record<string, string> = {
    name: person.fullName,
    company: '[company name]',
    sign_in_link: '[sign-in link]',
    app_link: '[app download link]',
    login_id: '[their sign-in ID]',
    temp_password: MASKED_PASSWORD,
  };
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_m, key: string) => values[key] ?? '');
}

/* ---------- results in plain words ---------- */

export const resultStatusText: Record<MessageResultStatus, string> = {
  SENT: 'Sent',
  SKIPPED: 'Skipped',
  FAILED: 'Not sent',
};

export const resultStatusClass: Record<MessageResultStatus, string> = {
  SENT: 'active',
  SKIPPED: 'pending',
  FAILED: 'suspended',
};

/** What a reason code means for HR. Codes come from the HR service; unknown ones are shown as they are. */
export const reasonText: Record<string, string> = {
  NOT_FOUND: 'This employee was not found.',
  NOT_ACTIVE: 'The employee is not active.',
  NO_LOGIN: 'There is no Verigence login yet.',
  LOGIN_NOT_ACTIVE: 'The login is waiting for SuperAdmin to allow it.',
  MAIL_UNAVAILABLE: 'The mail server could not be reached.',
  MAIL_AUTH_FAILED: 'The mail account refused the sign-in.',
  MAIL_RECIPIENT_REFUSED: 'The email address was refused.',
  SECURITY_UNAVAILABLE: 'Verigence Security could not be reached.',
  BAD_RESPONSE: 'Verigence Security gave an unexpected answer.',
  NOT_PERMITTED: 'HR is not allowed to set passwords yet.',
};

export function reasonLabel(code: string | null | undefined): string {
  if (!code) return '';
  return reasonText[code] ?? `Reason code ${code}`;
}

export const templateText: Record<string, string> = {
  GENERAL: 'General message',
  WELCOME: 'Welcome: login details',
};

export const channelText: Record<string, string> = { EMAIL: 'Email', WHATSAPP: 'WhatsApp' };

export function summariseSend(results: SendMessageResult[]) {
  return {
    sent: results.filter((r) => r.status === 'SENT').length,
    skipped: results.filter((r) => r.status === 'SKIPPED').length,
    failed: results.filter((r) => r.status === 'FAILED').length,
  };
}

/**
 * When a send request itself fails: do we know nothing was sent? A refusal by the service before it
 * starts (a 4xx answer, or "channel not available") means nothing went. A timeout, a network drop or
 * a server error means we cannot tell, so HR must check History before sending again.
 */
export function nothingWasSent(error: unknown): boolean {
  const e = error as { status?: unknown; code?: unknown } | null;
  const status = typeof e?.status === 'number' ? e.status : 0;
  return (status >= 400 && status < 500) || e?.code === 'MESSAGE_CHANNEL_NOT_AVAILABLE';
}

export function countLabel(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** A person chosen to receive a message: only what the screen needs. */
export interface Recipient {
  employeeId: string;
  fullName: string;
  employeeCode: string;
  personalEmail: string;
  loginStatus: LoginStatus;
}
