import type {
  Holiday,
  HolidayAppliesTo,
  HolidayDayPart,
  HolidayInput,
  HolidayKind,
  HolidayScope,
  HolidayScopeProject,
  HolidayStatus,
  SettingItem,
  SettingValue,
} from '../../../services/hr/hrSettings';

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

/** Full day, or which half is off (product owner, 7 Nov 2026). */
export const HOLIDAY_DAY_PART_LABEL: Record<HolidayDayPart, string> = {
  FULL_DAY: 'Full day',
  MORNING: 'Half day, morning off',
  AFTERNOON: 'Half day, afternoon off',
};

export type HolidayLength = 'FULL' | 'HALF';
export type HolidayHalf = 'MORNING' | 'AFTERNOON';

export interface HolidayDraft {
  /** HOLIDAY, or WORKING_DAY: a Sunday made a working day (7 Nov 2026). */
  kind: HolidayKind;
  date: string;
  name: string;
  status: HolidayStatus;
  length: HolidayLength;
  half: HolidayHalf;
  appliesTo: HolidayAppliesTo;
  /** Chosen projects and outlets, as scopeKey() values. */
  scope: string[];
}

export type HolidayErrors = Partial<Record<'date' | 'name' | 'scope', string>>;

export function emptyHolidayDraft(year: number): HolidayDraft {
  return { kind: 'HOLIDAY', date: `${year}-01-01`, name: '', status: 'TENTATIVE', length: 'FULL', half: 'AFTERNOON', appliesTo: 'ALL', scope: [] };
}

/** One key per choice: a whole project (no outlet) or one outlet of it. */
export function scopeKey(tenantId: string, outletId: string | null): string {
  return `${tenantId}\u0000${outletId ?? ''}`;
}

function parseScopeKey(key: string): { tenantId: string; outletId: string | null } {
  const at = key.lastIndexOf('\u0000');
  return { tenantId: key.slice(0, at), outletId: key.slice(at + 1) || null };
}

export function draftDayPart(draft: Pick<HolidayDraft, 'length' | 'half'> & { kind?: HolidayKind }): HolidayDayPart {
  return draft.kind === 'WORKING_DAY' || draft.length === 'FULL' ? 'FULL_DAY' : draft.half;
}

/** The draft as a working Sunday: a whole day, declared, for chosen projects unless set otherwise. */
export function asWorkingSunday(draft: HolidayDraft): HolidayDraft {
  return {
    ...draft,
    kind: 'WORKING_DAY',
    length: 'FULL',
    status: 'DECLARED',
    name: draft.name || 'Working Sunday',
    appliesTo: draft.kind === 'WORKING_DAY' ? draft.appliesTo : 'SELECTED',
  };
}

export function isSundayIso(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 0;
}

export function draftFromHoliday(h: Holiday): HolidayDraft {
  const dayPart = h.dayPart ?? 'FULL_DAY';
  return {
    kind: h.kind ?? 'HOLIDAY',
    date: h.date,
    name: h.name,
    status: h.status,
    length: dayPart === 'FULL_DAY' ? 'FULL' : 'HALF',
    half: dayPart === 'MORNING' ? 'MORNING' : 'AFTERNOON',
    appliesTo: h.appliesTo ?? 'ALL',
    scope: (h.scope ?? []).map((s) => scopeKey(s.tenantId, s.outletId)),
  };
}

export function draftToInput(draft: HolidayDraft): HolidayInput {
  return {
    date: draft.date,
    name: draft.name.trim(),
    status: draft.status,
    dayPart: draftDayPart(draft),
    appliesTo: draft.appliesTo,
    kind: draft.kind,
    scope: draft.appliesTo === 'ALL' ? [] : draft.scope.map(parseScopeKey),
  };
}

/**
 * Ticks or unticks one choice. A whole project covers its outlets, so ticking it clears them; an
 * outlet cannot be ticked while its project is ticked whole.
 */
export function toggleScope(scope: string[], tenantId: string, outletId: string | null): string[] {
  const key = scopeKey(tenantId, outletId);
  if (scope.includes(key)) return scope.filter((k) => k !== key);
  if (outletId === null) return [...scope.filter((k) => parseScopeKey(k).tenantId !== tenantId), key];
  if (scope.includes(scopeKey(tenantId, null))) return scope;
  return [...scope, key];
}

/** A project's name for the picker and the table; its code, or the tenant, when it has none. */
export function projectLabel(p: Pick<HolidayScopeProject, 'tenantId' | 'projectCode' | 'projectName'>): string {
  return p.projectName || p.projectCode || p.tenantId;
}

export function outletLabel(o: { outletName: string | null; outletCode: string | null; outletId: string | null }): string {
  return o.outletName || o.outletCode || 'Outlet';
}

/** Who a holiday is for, grouped by project: "Alpha (whole project); Bravo: Cuttack Motors, Puri Motors". */
export function describeAppliesTo(h: Pick<Holiday, 'appliesTo' | 'scope'>): string {
  if ((h.appliesTo ?? 'ALL') === 'ALL') return 'Whole company';
  const byProject = new Map<string, { label: string; whole: boolean; outlets: string[] }>();
  for (const s of h.scope ?? []) {
    const entry = byProject.get(s.tenantId) ?? { label: projectLabel(s), whole: false, outlets: [] };
    if (s.outletId === null) entry.whole = true;
    else entry.outlets.push(outletLabel(s));
    byProject.set(s.tenantId, entry);
  }
  if (byProject.size === 0) return 'Selected projects and outlets';
  return [...byProject.values()]
    .map((p) => (p.whole ? `${p.label} (whole project)` : `${p.label}: ${p.outlets.join(', ')}`))
    .join('; ');
}

/** "Half day, afternoon off, for the whole company, declared." */
export function holidaySummary(h: Pick<Holiday, 'dayPart' | 'appliesTo' | 'scope' | 'status' | 'kind'>): string {
  const who = (h.appliesTo ?? 'ALL') === 'ALL' ? 'the whole company' : describeAppliesTo(h);
  if (h.kind === 'WORKING_DAY') return `Working Sunday, for ${who}.`;
  return `${HOLIDAY_DAY_PART_LABEL[h.dayPart ?? 'FULL_DAY']}, for ${who}, ${HOLIDAY_STATUS_LABEL[h.status].toLowerCase()}.`;
}

/** The chosen items as the picker shows them, for a summary line under it. */
export function describeDraftScope(scope: string[], projects: HolidayScopeProject[]): string {
  const known: HolidayScope[] = [];
  for (const key of scope) {
    const { tenantId, outletId } = parseScopeKey(key);
    const project = projects.find((p) => p.tenantId === tenantId);
    const outlet = outletId ? project?.outlets.find((o) => o.outletId === outletId) : undefined;
    known.push({
      tenantId,
      projectCode: project?.projectCode ?? null,
      projectName: project?.projectName ?? null,
      outletId,
      outletCode: outlet?.outletCode ?? null,
      outletName: outlet?.outletName ?? null,
    });
  }
  return describeAppliesTo({ appliesTo: 'SELECTED', scope: known });
}

function isIsoDate(value: string): boolean {
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
  if (!errors.date && draft.kind === 'WORKING_DAY' && !isSundayIso(draft.date)) {
    errors.date = 'A working Sunday must be on a Sunday.';
  }
  if (draft.appliesTo === 'SELECTED' && draft.scope.length === 0) {
    errors.scope = 'Choose at least one project or outlet, or make it for the whole company.';
  }
  return errors;
}

const PART_ORDER: Record<HolidayDayPart, number> = { FULL_DAY: 0, MORNING: 1, AFTERNOON: 2 };

export function sortHolidays<T extends Pick<Holiday, 'date' | 'name'> & { dayPart?: HolidayDayPart }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      PART_ORDER[a.dayPart ?? 'FULL_DAY'] - PART_ORDER[b.dayPart ?? 'FULL_DAY'] ||
      a.name.localeCompare(b.name),
  );
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
