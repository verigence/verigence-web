import { ensureCorrelationHeader, responseCorrelationId } from '../../observability/correlation';

/**
 * HR (HRMgmt) requests go through the Web worker's same-origin /hr-api route in the browser.
 * Native builds point VITE_HR_PROXY_BASE_URL at the worker's absolute address.
 * Every call is made once: the screens never retry on their own.
 */
const configuredProxyBaseUrl = import.meta.env.VITE_HR_PROXY_BASE_URL?.trim();
const DEFAULT_BASE_URL = '/hr-api';
const READ_TIMEOUT_MS = 15_000;
const WRITE_TIMEOUT_MS = 30_000;

export interface HrFieldProblem {
  field: string;
  message: string;
}

export interface HrProblem {
  code?: string;
  detail?: string;
  problems?: HrFieldProblem[];
}

export class HrHttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly problems: HrFieldProblem[];
  readonly correlationId?: string;

  constructor(status: number, problem?: HrProblem, correlationId?: string) {
    const code = problem?.code?.trim() || `WEB-HR-HTTP-${status}`;
    super(problem?.detail?.trim() || `HR request failed with HTTP ${status}.`);
    this.name = 'HrHttpError';
    this.status = status;
    this.code = code;
    this.problems = problem?.problems ?? [];
    this.correlationId = correlationId;
  }
}

export class HrNetworkError extends Error {
  readonly code = 'WEB-HR-NETWORK';
  readonly correlationId?: string;

  constructor(message: string, correlationId?: string) {
    super(message);
    this.name = 'HrNetworkError';
    this.correlationId = correlationId;
  }
}

export interface HrRequestOptions extends Omit<RequestInit, 'body'> {
  accessToken?: string;
  body?: BodyInit | Record<string, unknown> | null;
  correlationId?: string;
  timeoutMs?: number;
}

function requestUrl(path: string): string {
  const base = (configuredProxyBaseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

export async function hrRawRequest(path: string, options: HrRequestOptions = {}): Promise<Response> {
  const { accessToken, body, correlationId: requested, timeoutMs, signal: callerSignal, ...init } = options;
  const headers = new Headers(init.headers);
  const correlationId = ensureCorrelationHeader(headers, requested);
  const method = (init.method || 'GET').toUpperCase();
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);

  let payload: BodyInit | undefined;
  if (body instanceof FormData || typeof body === 'string' || body instanceof Blob) {
    payload = body;
  } else if (body && typeof body === 'object') {
    payload = JSON.stringify(body);
    if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  }

  const limit = timeoutMs ?? (method === 'GET' ? READ_TIMEOUT_MS : WRITE_TIMEOUT_MS);
  const controller = new AbortController();
  let timedOut = false;
  const abortFromCaller = () => controller.abort(callerSignal?.reason);
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort(callerSignal.reason);
    else callerSignal.addEventListener('abort', abortFromCaller, { once: true });
  }
  const timer = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, limit);

  try {
    const response = await fetch(requestUrl(path), {
      ...init,
      method,
      headers,
      body: payload,
      credentials: 'include',
      signal: controller.signal,
    });
    const echoed = responseCorrelationId(response, correlationId);
    if (!response.ok) {
      let problem: HrProblem | undefined;
      try {
        problem = (await response.clone().json()) as HrProblem;
      } catch {
        problem = undefined;
      }
      throw new HrHttpError(response.status, problem, echoed);
    }
    return response;
  } catch (error) {
    if (error instanceof HrHttpError) throw error;
    if (timedOut) {
      throw new HrNetworkError('HR did not respond in time. Please try again.', correlationId);
    }
    if (callerSignal?.aborted) throw error;
    throw new HrNetworkError('HR could not be reached. Check your connection and try again.', correlationId);
  } finally {
    globalThis.clearTimeout(timer);
    callerSignal?.removeEventListener('abort', abortFromCaller);
  }
}

export async function hrRequest<T>(path: string, options: HrRequestOptions = {}): Promise<T> {
  const response = await hrRawRequest(path, options);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

/** A message safe to show a person: what to do, with the support reference when there is one. */
export function hrErrorMessage(error: unknown): string {
  if (error instanceof HrHttpError) {
    if (error.status === 401) return 'Your session has ended. Please sign in again.';
    if (error.status === 403) return 'You do not have access to this.';
    const fields = error.problems.map((p) => `${humanField(p.field)}: ${p.message}`);
    const lead = fields.length ? `${error.message} ${fields.join('; ')}.` : error.message;
    return error.correlationId ? `${lead} Reference: ${error.correlationId}.` : lead;
  }
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}

function humanField(field: string): string {
  const last = field.split('.').pop() || field;
  return last.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}
