const configuredBaseUrl = import.meta.env.VITE_AUDIT_CORE_BASE_URL?.trim();

export interface AuditCoreRequestOptions extends RequestInit {
  accessToken?: string;
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

  constructor(status: number, problem?: AuditCoreProblem) {
    super(problem?.detail || problem?.title || `Audit Core request failed with HTTP ${status}.`);
    this.name = 'AuditCoreHttpError';
    this.status = status;
    this.problem = problem;
  }
}

function requestUrl(path: string): string {
  if (!configuredBaseUrl) {
    throw new Error('VITE_AUDIT_CORE_BASE_URL is not configured.');
  }
  const baseUrl = configuredBaseUrl.replace(/\/$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
}

export async function auditCoreRawRequest(
  path: string,
  options: AuditCoreRequestOptions = {},
): Promise<Response> {
  const headers = new Headers(options.headers);

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

  if (!response.ok) {
    let problem: AuditCoreProblem | undefined;
    try {
      problem = (await response.clone().json()) as AuditCoreProblem;
    } catch {
      problem = undefined;
    }
    throw new AuditCoreHttpError(response.status, problem);
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
