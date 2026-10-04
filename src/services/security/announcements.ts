/** Announcements kept by Security: the public maintenance notice, the one message a signed-in person may see, and the SuperAdmin controls. */

export type AnnouncementKind = 'NOTICE' | 'WELCOME' | 'MAINTENANCE';
export type AnnouncementAudience = 'EVERYONE' | 'PEOPLE';

export interface MaintenanceNotice {
  announcementId: string;
  kind: 'MAINTENANCE';
  title: string;
  body: string;
  backAt: string | null;
  startsAt: string;
  endsAt: string | null;
  audience: AnnouncementAudience;
  active: boolean;
}

export interface PersonAnnouncement {
  announcementId: string;
  kind: 'NOTICE' | 'WELCOME';
  title: string;
  body: string;
}

export interface AdminAnnouncement {
  announcementId: string;
  kind: AnnouncementKind;
  title: string;
  body: string;
  backAt: string | null;
  startsAt: string;
  endsAt: string | null;
  audience: AnnouncementAudience;
  active: boolean;
  seenBy: number;
  chosenPeople: number;
  people: Array<{ userId: string; displayName: string; email: string | null }>;
}

export interface AnnouncementInput {
  kind: AnnouncementKind;
  title: string;
  body: string;
  backAt?: string;
  startsAt?: string;
  endsAt?: string;
  audience?: AnnouncementAudience;
  people?: string[];
}

export interface AnnouncementPatch {
  title?: string;
  body?: string;
  backAt?: string | null;
  endsAt?: string | null;
  active?: boolean;
  people?: string[];
}

const securityBaseUrl = (import.meta.env.VITE_SECURITY_BASE_URL?.trim() ?? '').replace(/\/$/, '');

async function call<T>(accessToken: string | undefined, method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${securityBaseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });
  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const detail = (payload as { detail?: unknown } | undefined)?.detail;
    throw new Error(typeof detail === 'string' && detail ? detail : 'The change could not be saved. Please try again.');
  }
  return payload as T;
}

/** Public: no sign-in needed. Callers treat a failure as "no maintenance". */
export async function getMaintenance(): Promise<MaintenanceNotice | null> {
  const data = await call<{ maintenance: MaintenanceNotice | null }>(undefined, 'GET', '/security/v1/status/maintenance');
  return data?.maintenance ?? null;
}

export async function getMyAnnouncement(accessToken: string): Promise<PersonAnnouncement | null> {
  const data = await call<{ announcement: PersonAnnouncement | null }>(accessToken, 'GET', '/security/v1/me/announcements');
  return data?.announcement ?? null;
}

export const markAnnouncementSeen = (accessToken: string, id: string) =>
  call<{ seen: boolean }>(accessToken, 'POST', `/security/v1/me/announcements/${encodeURIComponent(id)}/seen`);

// ---- SuperAdmin ---------------------------------------------------------------------------------

export async function listAnnouncements(accessToken: string): Promise<AdminAnnouncement[]> {
  const data = await call<{ announcements: AdminAnnouncement[] }>(accessToken, 'GET', '/security/v1/admin/announcements');
  return data.announcements;
}

export const createAnnouncement = (accessToken: string, input: AnnouncementInput) =>
  call<{ announcementId: string }>(accessToken, 'POST', '/security/v1/admin/announcements', input);

export const patchAnnouncement = (accessToken: string, id: string, patch: AnnouncementPatch) =>
  call<unknown>(accessToken, 'PATCH', `/security/v1/admin/announcements/${encodeURIComponent(id)}`, patch);

export async function getAnnouncementSettings(accessToken: string): Promise<{ quietHours: number }> {
  return call<{ quietHours: number }>(accessToken, 'GET', '/security/v1/admin/announcements/settings');
}

export const saveAnnouncementSettings = (accessToken: string, quietHours: number) =>
  call<unknown>(accessToken, 'PUT', '/security/v1/admin/announcements/settings', { quietHours });
