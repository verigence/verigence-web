/**
 * The shutdown switch, kept by Security (product owner, 21 Nov 2026: "lets have a tab in the verigence to
 * have a full shutdown of DB"; "let have superadmin and Executive only the privilege to start the
 * database").
 *
 * Whether Verigence is shut is one piece of state: the daily hours (India time) and, while it lasts, a
 * "Shut down now" or "Start now" by a Super Admin or Executive. Shut, nobody signs in but the people
 * listed to start it, and every Verigence service rests, so the database stops by itself. Security
 * decides and the services obey; this app only shows it and sends the four changes.
 */

export interface SystemShutdownPerson {
  userId: string;
  name: string;
  role: 'Super Admin' | 'Executive' | (string & {});
  /** On the configured list of people who may sign in while Verigence is shut. */
  mayStart: boolean;
}

export interface SystemShutdownOverview {
  /** People are being refused right now. */
  closed: boolean;
  opensAtUtc: string | null;
  message: string | null;
  /** Verigence is shut right now: the services rest until restUntilUtc. */
  resting: boolean;
  restUntilUtc: string | null;
  /** India time, HH:MM; null when there is no daily shutdown. */
  hoursFromIst: string | null;
  hoursToIst: string | null;
  /** A Shut down or Start by hand in force, and until when. */
  manual: 'SHUT' | 'OPEN' | null;
  manualSinceUtc: string | null;
  manualUntilUtc: string | null;
  /** False when no list of people is configured: nobody is refused at sign-in, the services still rest. */
  gate: boolean;
  people: SystemShutdownPerson[];
  lastChange: { action: string; atUtc: string; by: string | null } | null;
}

export class SystemShutdownRequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'SystemShutdownRequestError';
    this.status = status;
  }
}

const securityBaseUrl = (import.meta.env.VITE_SECURITY_BASE_URL?.trim() ?? '').replace(/\/$/, '');
const BASE = '/security/v1/admin/system-shutdown';

function detailText(payload: unknown): string | undefined {
  const detail = (payload as { detail?: unknown } | undefined)?.detail;
  if (typeof detail === 'string' && detail.trim()) return detail.trim();
  if (Array.isArray(detail)) {
    const messages = detail.map((d) => (d as { msg?: unknown })?.msg).filter((m): m is string => typeof m === 'string' && Boolean(m));
    if (messages.length) return messages.join('; ');
  }
  const title = (payload as { title?: unknown } | undefined)?.title;
  return typeof title === 'string' && title.trim() ? title.trim() : undefined;
}

async function call(accessToken: string, method: string, path: string, body?: unknown): Promise<SystemShutdownOverview> {
  const headers: Record<string, string> = { Authorization: `Bearer ${accessToken}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${securityBaseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });
  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    throw new SystemShutdownRequestError(response.status, detailText(payload) ?? 'The change could not be saved. Please try again.');
  }
  return payload as SystemShutdownOverview;
}

/** Super Admin and Executive only, as are the three changes below. Each answers with the new state. */
export const getSystemShutdown = (accessToken: string) => call(accessToken, 'GET', BASE);

export const setSystemShutdownHours = (accessToken: string, fromIst: string, toIst: string) =>
  call(accessToken, 'PUT', `${BASE}/hours`, { fromIst, toIst });

export const shutDownNow = (accessToken: string) => call(accessToken, 'POST', `${BASE}/shut-now`);

export const startNow = (accessToken: string) => call(accessToken, 'POST', `${BASE}/start-now`);
