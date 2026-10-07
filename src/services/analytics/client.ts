const configuredBaseUrl = import.meta.env.VITE_ANALYTICS_PROXY_BASE_URL?.trim() || '/analytics-api';
const DEFAULT_TIMEOUT_MS = 30_000;

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
        const body = response.clone().json() as Promise<{ detail?: string; title?: string }>;
        const parsed = await body;
        detail = parsed.detail || parsed.title;
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


interface AnalyticsFindings {
  tenant_id: string;
  data_as_of: string;
  rows: Array<{ rule_key: string; status: string; severity: string; finding_count: number }>;
}

interface AnalyticsDocuments {
  tenant_id: string;
  data_as_of: string;
  requirements: Array<{ document_type: string; status: string; requirement_count: number }>;
  missing_document_flags: Array<{ rule_key: string; flag_count: number }>;
}

interface AnalyticsPayments {
  tenant_id: string;
  data_as_of: string;
  rows: Array<{ payment_method: string; payment_count: number; total_amount: string | number }>;
}

interface AnalyticsTurnaround {
  tenant_id: string;
  data_as_of: string;
  rows: Array<{ completed_count: number; avg_days: string | number | null }>;
}

interface AnalyticsFinance {
  tenant_id: string;
  data_as_of: string;
  rows: Array<{
    finance_type: string;
    provider: string;
    deal_count: number;
    financed_amount: string | number;
  }>;
}

interface AnalyticsInsurance {
  tenant_id: string;
  data_as_of: string;
  rows: Array<{
    insurance_by: string;
    insurer: string;
    policy_count: number;
    premium_amount: string | number;
  }>;
  duplicate_agent_codes: Array<{ agent_code: string; booking_count: number }>;
}

interface AnalyticsAddons {
  tenant_id: string;
  data_as_of: string;
  rows: Array<{
    addon_type: string;
    attach_count: number;
    actual_amount: string | number;
  }>;
}

interface AnalyticsDiscounts {
  tenant_id: string;
  data_as_of: string;
  rows: Array<{
    discount_key: string;
    application_count: number;
    actual_discount_amount: string | number;
    standard_eligible_amount: string | number;
  }>;
}

interface AnalyticsTradeIn {
  tenant_id: string;
  data_as_of: string;
  rows: Array<{
    status: string;
    trade_in_count: number;
    actual_value: string | number;
  }>;
}

interface AnalyticsProductivityEmployee {
  employee_name: string;
  actor_id: string;
  journeys_created: number;
  bookings: number;
  bookings_with_date: number;
  deliveries_started: number;
  deliveries_completed: number;
  avg_days_journey_to_delivery: number | null;
  avg_days_to_completion: number | null;
}

interface AnalyticsProductivityJourney {
  journey_ref: string;
  employee_name: string;
  created_date: string | null;
  booking_date: string | null;
  booking_ref: string | null;
  delivery_status: string | null;
  delivered_date: string | null;
  days_to_delivery: number | null;
}

interface AnalyticsProductivity {
  tenant_id: string;
  data_as_of: string;
  summary: AnalyticsProductivityEmployee[];
  journeys: AnalyticsProductivityJourney[];
}






export type AnalyticsReportKey =
  | 'finance'
  | 'insurance'
  | 'addons'
  | 'discounts'
  | 'trade-in'
  | 'payments'
  | 'findings'
  | 'documents'
  | 'turnaround'
  | 'productivity';

export type AnalyticsReportPayload =
  | { kind: 'finance'; data: AnalyticsFinance }
  | { kind: 'insurance'; data: AnalyticsInsurance }
  | { kind: 'addons'; data: AnalyticsAddons }
  | { kind: 'discounts'; data: AnalyticsDiscounts }
  | { kind: 'trade-in'; data: AnalyticsTradeIn }
  | { kind: 'payments'; data: AnalyticsPayments }
  | { kind: 'findings'; data: AnalyticsFindings }
  | { kind: 'documents'; data: AnalyticsDocuments }
  | { kind: 'turnaround'; data: AnalyticsTurnaround }
  | { kind: 'productivity'; data: AnalyticsProductivity };


export async function getAnalyticsReport(
  tenantId: string,
  accessToken: string,
  report: AnalyticsReportKey,
  signal?: AbortSignal,
): Promise<AnalyticsReportPayload> {
  const root = `/v1/analytics/tenants/${encodeURIComponent(tenantId)}`;
  switch (report) {
    case 'finance':
      return { kind: report, data: await analyticsRequest<AnalyticsFinance>(`${root}/finance`, accessToken, signal) };
    case 'insurance':
      return { kind: report, data: await analyticsRequest<AnalyticsInsurance>(`${root}/insurance`, accessToken, signal) };
    case 'addons':
      return { kind: report, data: await analyticsRequest<AnalyticsAddons>(`${root}/addons`, accessToken, signal) };
    case 'discounts':
      return { kind: report, data: await analyticsRequest<AnalyticsDiscounts>(`${root}/discounts`, accessToken, signal) };
    case 'trade-in':
      return { kind: report, data: await analyticsRequest<AnalyticsTradeIn>(`${root}/trade-in`, accessToken, signal) };
    case 'payments':
      return { kind: report, data: await analyticsRequest<AnalyticsPayments>(`${root}/payments`, accessToken, signal) };
    case 'findings':
      return { kind: report, data: await analyticsRequest<AnalyticsFindings>(`${root}/findings`, accessToken, signal) };
    case 'documents':
      return { kind: report, data: await analyticsRequest<AnalyticsDocuments>(`${root}/documents`, accessToken, signal) };
    case 'turnaround':
      return { kind: report, data: await analyticsRequest<AnalyticsTurnaround>(`${root}/turnaround`, accessToken, signal) };
    case 'productivity':
      return { kind: report, data: await analyticsRequest<AnalyticsProductivity>(`${root}/productivity`, accessToken, signal) };
  }
}
