const configuredBaseUrl = import.meta.env.VITE_ANALYTICS_PROXY_BASE_URL?.trim() || '/analytics-api';
const DEFAULT_TIMEOUT_MS = 10_000;

export class AnalyticsHttpError extends Error {
  readonly status: number;

  constructor(status: number, detail?: string) {
    super(detail || `Analytics request failed with HTTP ${status}.`);
    this.name = 'AnalyticsHttpError';
    this.status = status;
  }
}

function requestUrl(path: string): string {
  const baseUrl = configuredBaseUrl.replace(/\/$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
}

export async function analyticsRequest<T>(
  path: string,
  accessToken: string,
  signal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  const abortFromCaller = () => controller.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) controller.abort(signal.reason);
    else signal.addEventListener('abort', abortFromCaller, { once: true });
  }

  try {
    const response = await fetch(requestUrl(path), {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: 'include',
      signal: controller.signal,
    });
    if (!response.ok) {
      let detail: string | undefined;
      try {
        const body = await response.clone().json() as { detail?: string; title?: string };
        detail = body.detail || body.title;
      } catch {
        detail = undefined;
      }
      throw new AnalyticsHttpError(response.status, detail);
    }
    return response.json() as Promise<T>;
  } finally {
    globalThis.clearTimeout(timeoutId);
    if (signal) signal.removeEventListener('abort', abortFromCaller);
  }
}

export interface AnalyticsOverview {
  tenant_id: string;
  data_as_of: string;
  entities: Array<{ source_table: string; row_count: number }>;
}

export interface AnalyticsFindings {
  tenant_id: string;
  data_as_of: string;
  rows: Array<{ rule_key: string; status: string; severity: string; finding_count: number }>;
}

export interface AnalyticsDocuments {
  tenant_id: string;
  data_as_of: string;
  requirements: Array<{ document_type: string; status: string; requirement_count: number }>;
  missing_document_flags: Array<{ rule_key: string; flag_count: number }>;
}

export interface AnalyticsPayments {
  tenant_id: string;
  data_as_of: string;
  rows: Array<{ payment_method: string; payment_count: number; total_amount: string | number }>;
}

export interface AnalyticsTurnaround {
  tenant_id: string;
  data_as_of: string;
  rows: Array<{ completed_count: number; avg_days: string | number | null }>;
}

export interface AnalyticsDashboardData {
  overview: AnalyticsOverview;
  findings: AnalyticsFindings;
  documents: AnalyticsDocuments;
  payments: AnalyticsPayments;
  turnaround: AnalyticsTurnaround;
}

export async function getAnalyticsDashboard(
  tenantId: string,
  accessToken: string,
  signal?: AbortSignal,
): Promise<AnalyticsDashboardData> {
  const root = `/v1/analytics/tenants/${encodeURIComponent(tenantId)}`;
  const [overview, findings, documents, payments, turnaround] = await Promise.all([
    analyticsRequest<AnalyticsOverview>(`${root}/overview`, accessToken, signal),
    analyticsRequest<AnalyticsFindings>(`${root}/findings`, accessToken, signal),
    analyticsRequest<AnalyticsDocuments>(`${root}/documents`, accessToken, signal),
    analyticsRequest<AnalyticsPayments>(`${root}/payments`, accessToken, signal),
    analyticsRequest<AnalyticsTurnaround>(`${root}/turnaround`, accessToken, signal),
  ]);
  return { overview, findings, documents, payments, turnaround };
}
