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

/** One's own stuck or failed pages: Audit Core sends one message per booking, named by its customer
 *  (product owner 2026-11-18: the message did not say which customer or booking it was about). */
export const DOCUMENTS_ATTENTION = 'MY_DOCUMENTS_ATTENTION';

/** The booking's document tasks: where a failed, refused or stuck page is answered. */
export function bookingTasksLink(journeyId: string): string {
  return `/p2/journeys/${journeyId}/tasks?tab=DOCUMENTS`;
}

export function journey360Link(journeyId: string): string {
  return `/p2/journeys/${journeyId}/overview`;
}

export type MessageLinks = {
  /** Where the message itself goes when clicked. */
  primary: string;
  /** The named links under it: the booking's tasks and its Journey 360. */
  actions: { label: string; to: string }[];
};

/**
 * Where a message goes (product owner 2026-11-18: "can you provide it clickable so that it can
 * directly open up that task or journey 360"): a message about one's pages opens the booking's
 * document tasks, with Journey 360 beside it; any other message about a booking opens its
 * Journey 360. A message about no booking has nowhere to go.
 */
export function messageLinks(message: Pick<NotificationMessage, 'kind' | 'journeyId'>): MessageLinks | null {
  if (!message.journeyId) return null;
  const journey360 = { label: 'Journey 360', to: journey360Link(message.journeyId) };
  if (message.kind !== DOCUMENTS_ATTENTION) return { primary: journey360.to, actions: [journey360] };
  const tasks = { label: 'Open tasks', to: bookingTasksLink(message.journeyId) };
  return { primary: tasks.to, actions: [tasks, journey360] };
}
