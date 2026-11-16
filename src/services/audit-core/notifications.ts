import { auditCoreRequest } from './client';

/**
 * The notification bell (product owner 2026-11-16): "can we introduce a notification icon and they
 * should click on it know the status or any notification messages".
 *
 * GET  /p2/v1/tenants/{t}/notifications       the person's messages (Project alerts addressed to them,
 *                                             last 7 days, kept after the banner closed them) and the
 *                                             status of the documents they uploaded
 * POST /p2/v1/tenants/{t}/notifications:seen  the person opened the bell (kept on the server, so the web
 *                                             and the app agree on what is unread)
 */
export type NotificationMessage = {
  alertId: string;
  kind: string;
  title: string;
  body: string;
  journeyId?: string | null;
  journeyReference?: string | null;
  payload: Record<string, unknown>;
  publishedAtUtc: string;
  expiresAtUtc: string;
  unread: boolean;
};

export type DocumentStatusJourney = {
  journeyId: string;
  reference?: string | null;
  beingRead: number;
  stuck: number;
  failedPages: number;
  filesNotRead: number;
  files: string[];
  uploadTasks: number;
};

export type DocumentStatus = {
  beingRead: number;
  stuck: number;
  failedPages: number;
  filesNotRead: number;
  uploadTasks: number;
  /** Failed pages + files not read + open "upload again" tasks: what the person has to act on. */
  needsAction: number;
  journeys: DocumentStatusJourney[];
  moreJourneys: number;
};

export type Notifications = {
  messages: NotificationMessage[];
  unreadCount: number;
  status: DocumentStatus;
  /** Unread messages + documents needing the person: the number on the bell. */
  badgeCount: number;
  seenAtUtc?: string | null;
  serverTimeUtc: string;
};

const base = (tenantId: string) => `/p2/v1/tenants/${encodeURIComponent(tenantId)}/notifications`;

export function getNotifications(tenantId: string, accessToken?: string) {
  return auditCoreRequest<Notifications>(base(tenantId), { accessToken, cache: 'no-store' });
}

export function markNotificationsSeen(tenantId: string, accessToken?: string) {
  return auditCoreRequest<void>(`${base(tenantId)}:seen`, { method: 'POST', accessToken, cache: 'no-store' });
}

/** The number on the bell: nothing under 1, "99+" past 99. */
export function badgeLabel(count: number | undefined): string | null {
  if (!count || count < 1) return null;
  return count > 99 ? '99+' : String(count);
}

/** "just now", "5 min ago", "3 h ago", "2 d ago". */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return '';
  const minutes = Math.max(0, Math.floor((now.getTime() - at) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

/** What one booking still needs, in a line: "1 file not read, 2 pages failed, 1 task to upload again". */
export function journeyStatusLine(line: DocumentStatusJourney): string {
  const parts: string[] = [];
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  if (line.filesNotRead) parts.push(plural(line.filesNotRead, 'file not read', 'files not read'));
  if (line.failedPages) parts.push(plural(line.failedPages, 'page failed', 'pages failed'));
  if (line.uploadTasks) parts.push(plural(line.uploadTasks, 'task to upload again', 'tasks to upload again'));
  if (line.beingRead) {
    parts.push(line.stuck
      ? `${plural(line.beingRead, 'page', 'pages')} being read (${line.stuck} for over 6 h)`
      : plural(line.beingRead, 'page being read', 'pages being read'));
  }
  return parts.join(', ');
}
