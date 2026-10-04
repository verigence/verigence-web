import type { AdminAnnouncement, MaintenanceNotice, PersonAnnouncement } from '../../services/security/announcements';

const IST = 'Asia/Kolkata';
const IST_OFFSET = '+05:30';
const IST_MINUTES = 330;

/** Pages anyone may open, whatever is running: sign-in and the public documents. */
export const PUBLIC_PATHS = ['/login', '/signup', '/forgot-password', '/terms', '/privacy'];
export const isPublicPath = (pathname: string) => PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

// ---- maintenance gate ----------------------------------------------------------------------------

export type GateDecision = 'open' | 'block' | 'admin-banner';

/**
 * What the app does while a maintenance notice is running. Unknown (no notice, or the check failed)
 * means open. SuperAdmin always gets in, with a banner. Signed-out people and public pages stay open
 * so they can reach sign-in (which explains the maintenance).
 */
export function gateDecision(input: { maintenance: MaintenanceNotice | null | undefined; signedIn: boolean; role: string; pathname: string }): GateDecision {
  if (!input.maintenance) return 'open';
  if (!input.signedIn) return 'open';
  if (input.role === 'SUPER_ADMIN') return 'admin-banner';
  return isPublicPath(input.pathname) ? 'open' : 'block';
}

// ---- popup ---------------------------------------------------------------------------------------

/** Show the one announcement only to a signed-in person, on an app page, outside maintenance, and not twice in a session. */
export function popupVisible(input: {
  announcement: PersonAnnouncement | null | undefined;
  dismissed: ReadonlySet<string>;
  signedIn: boolean;
  pathname: string;
  gate: GateDecision;
}): boolean {
  const { announcement } = input;
  if (!announcement || !input.signedIn || input.gate === 'block') return false;
  if (isPublicPath(input.pathname)) return false;
  return !input.dismissed.has(announcement.announcementId);
}

// ---- history status ------------------------------------------------------------------------------

export type AnnouncementStatus = 'Scheduled' | 'Showing' | 'Ended' | 'Stopped';

export function announcementStatus(a: Pick<AdminAnnouncement, 'active' | 'startsAt' | 'endsAt'>, now: Date = new Date()): AnnouncementStatus {
  if (!a.active) return 'Stopped';
  if (new Date(a.startsAt).getTime() > now.getTime()) return 'Scheduled';
  if (a.endsAt && new Date(a.endsAt).getTime() <= now.getTime()) return 'Ended';
  return 'Showing';
}

// ---- IST date-times ------------------------------------------------------------------------------

const LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** "2026-10-04T17:30" typed as IST wall-clock time becomes "2026-10-04T17:30:00+05:30". Empty or invalid gives undefined. */
export function istInputToIso(local: string): string | undefined {
  const m = LOCAL.exec(local.trim());
  if (!m) return undefined;
  const [mo, d, h, mi] = [Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return undefined;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00${IST_OFFSET}`;
}

/** An ISO instant as IST wall-clock "YYYY-MM-DDTHH:mm" for a datetime-local input. */
export function isoToIstInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  return new Date(t + IST_MINUTES * 60_000).toISOString().slice(0, 16);
}

const istDay = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: IST });

/** "5:30 pm today", "9:00 am tomorrow" or "5:30 pm on 06 Oct", in IST. */
export function formatBackAt(iso: string | null | undefined, now: Date = new Date()): string | null {
  if (!iso) return null;
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return null;
  const time = when.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: IST }).replace(/\s?([ap])m/i, (_m, c: string) => ` ${c.toLowerCase()}m`);
  const day = istDay(when);
  const today = istDay(now);
  const tomorrow = istDay(new Date(now.getTime() + 86_400_000));
  if (day === today) return `${time} today`;
  if (day === tomorrow) return `${time} tomorrow`;
  return `${time} on ${when.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: IST })}`;
}

export function formatWhenIst(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: IST });
}

export const TITLE_MAX = 120;
export const BODY_MAX = 1000;
export const QUIET_MAX = 720;

export const DEFAULT_MAINTENANCE_TITLE = "We'll be back soon";
export const DEFAULT_MAINTENANCE_BODY = 'Verigence is being upgraded. Please visit again in a little while.';

export interface MessageForm {
  kind: 'WELCOME' | 'NOTICE';
  title: string;
  body: string;
  audience: 'EVERYONE' | 'PEOPLE';
  people: string[];
  from: string;
  until: string;
}

/** A sentence for the first problem with a new message, or null when it can be sent. */
export function validateMessage(f: MessageForm): string | null {
  if (!f.title.trim()) return 'Add a title.';
  if (f.title.trim().length > TITLE_MAX) return `Keep the title within ${TITLE_MAX} characters.`;
  if (!f.body.trim()) return 'Write the message.';
  if (f.body.trim().length > BODY_MAX) return `Keep the message within ${BODY_MAX} characters.`;
  if (f.audience === 'PEOPLE' && f.people.length === 0) return 'Choose at least one person, or send it to everyone.';
  if (f.from && !istInputToIso(f.from)) return 'Check the "Show from" date and time.';
  if (f.until && !istInputToIso(f.until)) return 'Check the "Until" date and time.';
  if (f.from && f.until && f.until <= f.from) return '"Until" must be after "Show from".';
  return null;
}

export function buildMessageInput(f: MessageForm) {
  return {
    kind: f.kind,
    title: f.title.trim(),
    body: f.body.trim(),
    audience: f.audience,
    ...(f.audience === 'PEOPLE' ? { people: f.people } : {}),
    ...(f.from ? { startsAt: istInputToIso(f.from) } : {}),
    ...(f.until ? { endsAt: istInputToIso(f.until) } : {}),
  };
}

/** Quiet hours as typed: a whole number from 0 to 720, else null. */
export function parseQuietHours(text: string): number | null {
  if (!/^\d{1,3}$/.test(text.trim())) return null;
  const n = Number(text.trim());
  return n >= 0 && n <= QUIET_MAX ? n : null;
}
