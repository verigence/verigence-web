import { ensureCorrelationHeader, responseCorrelationId } from '../../observability/correlation';

const configuredBaseUrl = import.meta.env.VITE_AUDIT_CORE_BASE_URL?.trim();
const configuredProxyBaseUrl = import.meta.env.VITE_AUDIT_CORE_PROXY_BASE_URL?.trim();
const DEFAULT_READ_TIMEOUT_MS = 10_000;

export interface AuditCoreRequestOptions extends RequestInit {
  accessToken?: string;
  correlationId?: string;
  timeoutMs?: number;
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

export class AuditCoreTimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`Audit Core did not respond within ${Math.ceil(timeoutMs / 1_000)} seconds. Please try again.`);
    this.name = 'AuditCoreTimeoutError';
    this.timeoutMs = timeoutMs;
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

function readTimeoutMs(method: string, configuredTimeoutMs?: number): number | undefined {
  if (configuredTimeoutMs !== undefined) return configuredTimeoutMs > 0 ? configuredTimeoutMs : undefined;
  return method === 'GET' || method === 'HEAD' ? DEFAULT_READ_TIMEOUT_MS : undefined;
}

export async function auditCoreRawRequest(
  path: string,
  options: AuditCoreRequestOptions = {},
): Promise<Response> {
  const {
    accessToken,
    correlationId: requestedCorrelationId,
    timeoutMs: configuredTimeoutMs,
    signal: callerSignal,
    ...requestInit
  } = options;
  const headers = new Headers(requestInit.headers);
  const correlationId = ensureCorrelationHeader(headers, requestedCorrelationId);
  const method = (requestInit.method || 'GET').toUpperCase();
  const timeoutMs = readTimeoutMs(method, configuredTimeoutMs);
  const controller = timeoutMs ? new AbortController() : undefined;
  let timedOut = false;

  const abortFromCaller = () => controller?.abort(callerSignal?.reason);
  if (controller && callerSignal) {
    if (callerSignal.aborted) controller.abort(callerSignal.reason);
    else callerSignal.addEventListener('abort', abortFromCaller, { once: true });
  }

  const timeoutId = controller && timeoutMs
    ? globalThis.setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs)
    : undefined;

  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  if (requestInit.body && !headers.has('Content-Type') && !(requestInit.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  try {
    const response = await fetch(requestUrl(path), {
      ...requestInit,
      headers,
      credentials: 'include',
      signal: controller?.signal || callerSignal,
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
  } catch (error) {
    if (timedOut && timeoutMs) throw new AuditCoreTimeoutError(timeoutMs);
    throw error;
  } finally {
    if (timeoutId !== undefined) globalThis.clearTimeout(timeoutId);
    if (controller && callerSignal) callerSignal.removeEventListener('abort', abortFromCaller);
  }
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
