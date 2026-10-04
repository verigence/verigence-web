import type { Holiday, HolidayStatus, SettingItem, SettingValue } from '../../../services/hr/hrSettings';

/** Pure logic for the HR settings screens: no React, no requests. */

export interface SettingGroup {
  name: string;
  items: SettingItem[];
}

const GROUP_ORDER = ['Attendance', 'Leave', 'Reimbursement'];

/** Groups come from the service. Known groups keep a sensible order; company details come last. */
export function groupSettings(items: SettingItem[]): SettingGroup[] {
  const byName = new Map<string, SettingItem[]>();
  for (const item of items) {
    const name = item.group || 'Other';
    const list = byName.get(name);
    if (list) list.push(item);
    else byName.set(name, [item]);
  }
  const rank = (name: string) => {
    const known = GROUP_ORDER.indexOf(name);
    if (known >= 0) return known;
    return /company/i.test(name) ? 1000 : 500;
  };
  return [...byName.entries()]
    .map(([name, list]) => ({ name, items: list }))
    .sort((a, b) => rank(a.name) - rank(b.name));
}

/** The text shown in a field before anyone edits it. */
export function valueToText(value: SettingValue | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

/** How a default reads in the hint under a field. */
export function describeDefault(item: SettingItem): string {
  if (item.default === null || item.default === undefined || item.default === '') return 'none set';
  return String(item.default);
}

/** Bounds the service gave us, as a short phrase, or '' when it gave none. */
export function describeBounds(item: SettingItem): string {
  const hasMin = typeof item.min === 'number';
  const hasMax = typeof item.max === 'number';
  if (hasMin && hasMax) return `Allowed: ${item.min} to ${item.max}`;
  if (hasMin) return `At least ${item.min}`;
  if (hasMax) return `At most ${item.max}`;
  return '';
}

export type ParseResult = { ok: true; value: SettingValue } | { ok: false; message: string };

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const NUMBER = /^-?\d+(\.\d+)?$/;

/** Turns what was typed into the value the service expects, or says what is wrong. */
export function parseSetting(item: SettingItem, raw: string): ParseResult {
  const text = raw.trim();
  if (item.kind === 'time') {
    return TIME.test(text) ? { ok: true, value: text } : { ok: false, message: 'Use a time like 10:30.' };
  }
  if (item.kind === 'text') {
    const value = text.split(/\s+/).filter(Boolean).join(' ');
    if (value.length > 300) return { ok: false, message: 'Use up to 300 characters.' };
    return { ok: true, value };
  }
  if (item.kind === 'money_or_null' && text === '') return { ok: true, value: null };
  if (!NUMBER.test(text)) return { ok: false, message: 'Enter a number.' };
  const number = Number(text);
  if (!Number.isFinite(number)) return { ok: false, message: 'Enter a number.' };
  if (item.kind === 'int' && !Number.isInteger(number)) return { ok: false, message: 'Use a whole number.' };
  if (typeof item.min === 'number' && number < item.min) return { ok: false, message: `Use ${item.min} or more.` };
  if (typeof item.max === 'number' && number > item.max) return { ok: false, message: `Use ${item.max} or less.` };
  return { ok: true, value: item.kind === 'int' ? number : Math.round(number * 100) / 100 };
}

function sameValue(a: SettingValue | undefined, b: SettingValue): boolean {
  if (a === undefined || a === null) return b === null || b === '';
  return a === b;
}

export interface Collected {
  /** Only the settings whose value really differs from what the service holds. */
  changes: Record<string, SettingValue>;
  /** Client-side problems per setting key. */
  errors: Record<string, string>;
}

/** `edited` holds only fields a person touched, as typed. */
export function collectChanges(items: SettingItem[], edited: Record<string, string>): Collected {
  const changes: Record<string, SettingValue> = {};
  const errors: Record<string, string> = {};
  for (const item of items) {
    if (!(item.key in edited)) continue;
    const parsed = parseSetting(item, edited[item.key]);
    if (!parsed.ok) {
      errors[item.key] = parsed.message;
      continue;
    }
    if (!sameValue(item.value, parsed.value)) changes[item.key] = parsed.value;
  }
  return { changes, errors };
}

export interface ServerSettingProblems {
  fields: Record<string, string>;
  general: string;
}

/**
 * The service names the setting in its message ("<label>: use a value from 50 to 5000."), so the
 * message can be shown under the right field. Anything else (the cross-field rules, for example)
 * stays a general message for the form.
 */
export function placeServerProblem(items: SettingItem[], message: string): ServerSettingProblems {
  for (const item of items) {
    const prefix = `${item.label}:`;
    if (item.label && message.startsWith(prefix)) {
      const rest = message.slice(prefix.length).trim();
      return { fields: { [item.key]: rest.charAt(0).toUpperCase() + rest.slice(1) }, general: '' };
    }
  }
  return { fields: {}, general: message };
}

// ---- holidays -----------------------------------------------------------------------------

export const HOLIDAY_STATUS_LABEL: Record<HolidayStatus, string> = {
  TENTATIVE: 'Tentative',
  DECLARED: 'Declared',
};

export interface HolidayDraft {
  date: string;
  name: string;
  status: HolidayStatus;
}

export type HolidayErrors = Partial<Record<'date' | 'name', string>>;

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(y, m - 1, d));
  return parsed.getUTCFullYear() === y && parsed.getUTCMonth() === m - 1 && parsed.getUTCDate() === d;
}

export function validateHoliday(draft: HolidayDraft): HolidayErrors {
  const errors: HolidayErrors = {};
  if (!isIsoDate(draft.date)) errors.date = 'Choose a date.';
  else {
    const year = Number(draft.date.slice(0, 4));
    if (year < 2020 || year > 2100) errors.date = 'Use a year from 2020 to 2100.';
  }
  const name = draft.name.trim();
  if (name.length < 2) errors.name = 'Enter the holiday name (at least 2 characters).';
  else if (name.length > 120) errors.name = 'Use up to 120 characters.';
  return errors;
}

export function sortHolidays(items: Holiday[]): Holiday[] {
  return [...items].sort((a, b) => a.date.localeCompare(b.date));
}

/** "Tue, 20 Oct 2026" from an ISO date, with no time-zone shift. */
export function formatHolidayDate(iso: string): string {
  if (!isIsoDate(iso)) return iso;
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** A timestamp from the service, shown in Indian time. */
export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return 'Never';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  })} IST`;
}
