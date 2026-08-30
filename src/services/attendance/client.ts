const configuredAttendanceBaseUrl = import.meta.env.VITE_ATTENDANCE_BASE_URL?.trim();
const DEV_WEB_HOST = 'verigence-web-dev.jbrconsulting-it.workers.dev';
const DEV_ATTENDANCE_BASE_URL = 'https://attendance-dev.up.railway.app';
const REQUEST_TIMEOUT_MS = 12_000;

export interface AttendancePolicy {
  tenantId: string;
  timezoneIana: string;
  expectedStartLocal: string;
  checkinReminderLocal: string;
  expectedEndLocal: string;
  checkoutReminderLocal: string;
  pcGeofenceRadiusMeters: number;
  maxLocationAccuracyMeters: number;
  maxLocationAgeSeconds: number;
  geofenceExceptionAllowed: boolean;
}

export interface AttendanceRecord {
  attendanceId: string;
  tenantId: string;
  userId: string;
  attendanceDate: string;
  roleKey: string;
  status: string;
  checkInAt: string;
  checkInResult: string;
  checkInOutletId?: string | null;
  checkInDealerId?: string | null;
  checkInDistanceMeters?: number | null;
  checkOutAt?: string | null;
  checkOutResult?: string | null;
  checkOutOutletId?: string | null;
  checkOutDealerId?: string | null;
  checkOutDistanceMeters?: number | null;
}

export interface TodayAttendance {
  attendance?: AttendanceRecord | null;
  policy: AttendancePolicy;
  reminder?: 'CHECK_IN' | 'CHECK_OUT' | null;
}

export interface AttendanceActionResponse {
  attendance: AttendanceRecord;
  geofenceRequired: boolean;
  matchedOutlet?: {
    dealerId: string;
    outletId: string;
    outletName: string;
    latitude?: number | null;
    longitude?: number | null;
  } | null;
  distanceMeters?: number | null;
  exceptionRecorded: boolean;
}

export interface AttendanceLocationConfirmationSummary {
  displayAddress: string;
  employeeConfirmed: boolean;
  remarks?: string | null;
}

export interface AttendanceOverviewItem {
  userId: string;
  displayName: string;
  primaryEmail?: string | null;
  roleKey?: string | null;
  status: string;
  attendance?: AttendanceRecord | null;
  checkInLocationConfirmation?: AttendanceLocationConfirmationSummary | null;
  checkOutLocationConfirmation?: AttendanceLocationConfirmationSummary | null;
}

export interface AttendanceOverview {
  attendanceDate: string;
  totalEmployees: number;
  checkedIn: number;
  checkedOut: number;
  notCheckedIn: number;
  exceptions: number;
  items: AttendanceOverviewItem[];
}

export interface AttendanceList {
  items: AttendanceRecord[];
}

export interface AttendanceLocationEvidence {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  capturedAt: string;
}

export interface AttendanceLocationResolution {
  displayAddress: string;
  provider: string;
  attribution: string;
}

export interface AttendanceActionBody {
  location: AttendanceLocationEvidence;
  exceptionReason?: string;
  displayAddress?: string;
  locationConfirmed?: boolean;
  locationRemarks?: string;
}

export interface AttendanceCorrectionBody {
  checkInAt?: string;
  checkOutAt?: string;
  reason: string;
}

export class AttendanceHttpError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, detail: string, code?: string) {
    super(detail || `Attendance request failed with HTTP ${status}.`);
    this.name = 'AttendanceHttpError';
    this.status = status;
    this.code = code;
  }
}

function baseUrl(): string {
  if (configuredAttendanceBaseUrl) return configuredAttendanceBaseUrl.replace(/\/$/, '');

  // The Cloudflare DEV deployment is intentionally bound only to the isolated DEV
  // Attendance service. This runtime fallback cannot activate on any other host,
  // so a future production build cannot accidentally send attendance traffic to DEV.
  if (typeof window !== 'undefined' && window.location.hostname === DEV_WEB_HOST) {
    return DEV_ATTENDANCE_BASE_URL;
  }

  throw new Error('Attendance service is not configured.');
}

async function attendanceRequest<T>(
  path: string,
  accessToken: string,
  init: RequestInit = {},
): Promise<T> {
  const token = accessToken.trim();
  if (!token) throw new Error('A Security human access token is required.');

  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  try {
    const response = await fetch(`${baseUrl()}${path.startsWith('/') ? path : `/${path}`}`, {
      ...init,
      headers,
      signal: controller.signal,
      credentials: 'include',
    });
    if (!response.ok) {
      let problem: { code?: string; detail?: string } | undefined;
      try {
        problem = await response.clone().json() as { code?: string; detail?: string };
      } catch {
        problem = undefined;
      }
      throw new AttendanceHttpError(
        response.status,
        problem?.detail || 'Attendance is temporarily unavailable.',
        problem?.code,
      );
    }
    if (response.status === 204) return undefined as T;
    return await response.json() as T;
  } catch (error) {
    if (error instanceof AttendanceHttpError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Attendance request timed out. Your normal Verigence work is not affected.');
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

export function getTodayAttendance(tenantId: string, accessToken: string): Promise<TodayAttendance> {
  return attendanceRequest<TodayAttendance>(`/attendance/v1/tenants/${tenantId}/me/today`, accessToken);
}

export function getAttendanceHistory(
  tenantId: string,
  accessToken: string,
  limit = 31,
): Promise<AttendanceList> {
  return attendanceRequest<AttendanceList>(
    `/attendance/v1/tenants/${tenantId}/me/history?limit=${encodeURIComponent(limit)}`,
    accessToken,
  );
}

export function getAttendanceOverview(
  tenantId: string,
  accessToken: string,
  attendanceDate: string,
): Promise<AttendanceOverview> {
  return attendanceRequest<AttendanceOverview>(
    `/attendance/v1/tenants/${tenantId}/overview?attendanceDate=${encodeURIComponent(attendanceDate)}`,
    accessToken,
  );
}

export function getAttendancePolicy(tenantId: string, accessToken: string): Promise<AttendancePolicy> {
  return attendanceRequest<AttendancePolicy>(`/attendance/v1/tenants/${tenantId}/policy`, accessToken);
}

export function updateAttendancePolicy(
  tenantId: string,
  accessToken: string,
  policy: Omit<AttendancePolicy, 'tenantId'>,
): Promise<AttendancePolicy> {
  return attendanceRequest<AttendancePolicy>(`/attendance/v1/tenants/${tenantId}/policy`, accessToken, {
    method: 'PUT',
    body: JSON.stringify(policy),
  });
}

export function resolveAttendanceLocation(
  tenantId: string,
  accessToken: string,
  location: AttendanceLocationEvidence,
): Promise<AttendanceLocationResolution> {
  return attendanceRequest<AttendanceLocationResolution>(
    `/attendance/v1/tenants/${tenantId}/me/location/resolve`,
    accessToken,
    { method: 'POST', body: JSON.stringify({ location }) },
  );
}

async function withEmployeeLocationConfirmation(
  tenantId: string,
  accessToken: string,
  body: AttendanceActionBody,
): Promise<AttendanceActionBody> {
  if (body.displayAddress && body.locationConfirmed !== undefined) return body;

  const resolved = await resolveAttendanceLocation(tenantId, accessToken, body.location);
  const accuracy = Math.round(body.location.accuracyMeters);
  const confirmed = globalThis.confirm(
    `Your detected location:\n\n${resolved.displayAddress}\n\nGPS accuracy: ±${accuracy} m\n${resolved.attribution}\n\nDo you confirm you are currently at this location?\n\nOK = Yes   Cancel = No`,
  );

  let remarks: string | undefined;
  if (!confirmed) {
    const entered = globalThis.prompt(
      'You selected No. Please enter remarks explaining why the detected location does not represent your current work location. Select Cancel to stop attendance submission.',
      '',
    );
    if (entered === null) throw new Error('Attendance submission was cancelled before location confirmation.');
    remarks = entered.trim();
    if (remarks.length < 3) throw new Error('Remarks are required when you do not confirm the detected location.');
  }

  return {
    ...body,
    displayAddress: resolved.displayAddress,
    locationConfirmed: confirmed,
    locationRemarks: remarks,
  };
}

export async function checkInAttendance(
  tenantId: string,
  accessToken: string,
  body: AttendanceActionBody,
): Promise<AttendanceActionResponse> {
  const confirmedBody = await withEmployeeLocationConfirmation(tenantId, accessToken, body);
  return attendanceRequest<AttendanceActionResponse>(
    `/attendance/v1/tenants/${tenantId}/me/check-in`,
    accessToken,
    { method: 'POST', body: JSON.stringify(confirmedBody) },
  );
}

export async function checkOutAttendance(
  tenantId: string,
  accessToken: string,
  body: AttendanceActionBody,
): Promise<AttendanceActionResponse> {
  const confirmedBody = await withEmployeeLocationConfirmation(tenantId, accessToken, body);
  return attendanceRequest<AttendanceActionResponse>(
    `/attendance/v1/tenants/${tenantId}/me/check-out`,
    accessToken,
    { method: 'POST', body: JSON.stringify(confirmedBody) },
  );
}

export function correctAttendance(
  tenantId: string,
  accessToken: string,
  attendanceId: string,
  body: AttendanceCorrectionBody,
): Promise<AttendanceRecord> {
  return attendanceRequest<AttendanceRecord>(
    `/attendance/v1/tenants/${tenantId}/records/${attendanceId}`,
    accessToken,
    { method: 'PATCH', body: JSON.stringify(body) },
  );
}
