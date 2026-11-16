import { auditCoreRequest } from './client';

/**
 * The notification bell (product owner 2026-11-16): "can we introduce a notification icon and they
 * should click on it know the status or any notification messages".
 *
 * GET  /p2/v1/tenants/{t}/notifications       the person's messages (Project alerts addressed to them,
 *                                             last 7 days, kept after the banner closed them) and their
 *                                             uploads of the last 14 days that left no record (a file never
 *                                             read, a bulk or Google Drive file not uploaded or set aside)
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

/** Where an upload that left no record came from (product owner 2026-11-16: notify only what did not
 *  get uploaded -- failed pages and the rest already raise tasks). */
export type UploadSource = 'UPLOAD' | 'BULK' | 'DRIVE';

export type NotUploaded = {
  source: UploadSource | string;
  itemId: string;
  name: string;
  reason: string;
  journeyId?: string | null;
  reference?: string | null;
  atUtc: string;
};

export type UploadStatus = {
  upload: number;
  bulk: number;
  drive: number;
  total: number;
  items: NotUploaded[];
  more: number;
};

export type Notifications = {
  messages: NotificationMessage[];
  unreadCount: number;
  status: UploadStatus;
  /** Unread messages + uploads that left no record: the number on the bell. */
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

/** Where the item came from, in words. */
export function sourceLabel(source: string): string {
  return ({ UPLOAD: 'Upload', BULK: 'Bulk upload', DRIVE: 'Google Drive' } as Record<string, string>)[source] ?? source;
}

/** Where to go for it: the booking when there is one, else the bulk or Drive upload page. */
export function itemLink(item: NotUploaded): string {
  if (item.journeyId) return `/p2/journeys/${item.journeyId}/documents?tab=files`;
  return item.source === 'DRIVE' ? '/p2/drive-uploads' : '/p2/bulk-upload';
}
