/**
 * Audit Core API client
 *
 * Every request carries:
 *  - Bearer: Verigence platform JWT (from VgAuthContext)
 *  - X-Correlation-ID: UUID for audit trail (Security §10)
 *  - Idempotency-Key: on mutations (NFR-07 — safe offline replay)
 */
import { useVgAuth } from './auth-context'

const BASE = process.env.NEXT_PUBLIC_AUDIT_CORE_URL ?? ''

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(`API ${status}`)
    this.name = 'ApiError'
  }
}

export async function apiRequest<T>(
  token: string,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
  idempotencyKey?: string,
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization:     `Bearer ${token}`,
    'X-Correlation-ID': crypto.randomUUID(),
  }
  if (body !== undefined)       headers['Content-Type']   = 'application/json'
  if (idempotencyKey && method !== 'GET') headers['Idempotency-Key'] = idempotencyKey

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => ({})))
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export function useApiClient() {
  const { platformToken } = useVgAuth()
  if (!platformToken) throw new Error('useApiClient: no platform token')
  const t = platformToken
  return {
    get:    <T>(path: string)              => apiRequest<T>(t, 'GET',    path),
    post:   <T>(path: string, body: unknown) => apiRequest<T>(t, 'POST',   path, body, crypto.randomUUID()),
    patch:  <T>(path: string, body: unknown) => apiRequest<T>(t, 'PATCH',  path, body, crypto.randomUUID()),
    delete: <T>(path: string)              => apiRequest<T>(t, 'DELETE', path, undefined, crypto.randomUUID()),
  }
}
