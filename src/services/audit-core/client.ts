import { ensureCorrelationHeader, responseCorrelationId } from '../../observability/correlation';

const configuredBaseUrl = import.meta.env.VITE_AUDIT_CORE_BASE_URL?.trim();
const configuredProxyBaseUrl = import.meta.env.VITE_AUDIT_CORE_PROXY_BASE_URL?.trim();

export interface AuditCoreRequestOptions extends RequestInit {
  accessToken?: string;
  correlationId?: string;
}

export interface AuditCoreProblem {
  errorCode?: string;
  title?: string;
  detail?: string;
  status?: number;
  correlationId?: string;
}

export class AuditCoreHttpError extends Error {
  readonly status: number;
  readonly problem?: AuditCoreProblem;
  readonly correlationId?: string;

  constructor(status: number, problem?: AuditCoreProblem, correlationId?: string) {
    super(problem?.detail || problem?.title || `Audit Core request failed with HTTP ${status}.`);
    this.name = 'AuditCoreHttpError';
    this.status = status;
    this.problem = problem;
    this.correlationId = problem?.correlationId || correlationId;
  }
}

function requestUrl(path: string): string {
  const selectedBaseUrl = configuredProxyBaseUrl || configuredBaseUrl;
  if (!selectedBaseUrl) {
    throw new Error('Audit Core base URL is not configured.');
  }
  const baseUrl = selectedBaseUrl.replace(/\/$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
}

export async function auditCoreRawRequest(
  path: string,
  options: AuditCoreRequestOptions = {},
): Promise<Response> {
  const headers = new Headers(options.headers);
  const correlationId = ensureCorrelationHeader(headers, options.correlationId);

  if (options.accessToken) {
    headers.set('Authorization', `Bearer ${options.accessToken}`);
  }

  if (options.body && !headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(requestUrl(path), {
    ...options,
    headers,
    credentials: 'include',
  });
  const echoedCorrelationId = responseCorrelationId(response, correlationId);

  if (!response.ok) {
    let problem: AuditCoreProblem | undefined;
    try {
      problem = (await response.clone().json()) as AuditCoreProblem;
    } catch {
      problem = undefined;
    }
    throw new AuditCoreHttpError(response.status, problem, echoedCorrelationId);
  }

  return response;
}

export async function auditCoreRequest<T>(
  path: string,
  options: AuditCoreRequestOptions = {},
): Promise<T> {
  const response = await auditCoreRawRequest(path, options);

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}
