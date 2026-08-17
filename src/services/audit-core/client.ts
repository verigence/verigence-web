const configuredBaseUrl = import.meta.env.VITE_AUDIT_CORE_BASE_URL?.trim();

export interface AuditCoreRequestOptions extends RequestInit {
  accessToken?: string;
}

export async function auditCoreRequest<T>(
  path: string,
  options: AuditCoreRequestOptions = {},
): Promise<T> {
  if (!configuredBaseUrl) {
    throw new Error('VITE_AUDIT_CORE_BASE_URL is not configured.');
  }

  const baseUrl = configuredBaseUrl.replace(/\/$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const headers = new Headers(options.headers);

  if (options.accessToken) {
    headers.set('Authorization', `Bearer ${options.accessToken}`);
  }

  if (options.body && !headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${baseUrl}${normalizedPath}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(`Audit Core request failed with HTTP ${response.status}.`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}
