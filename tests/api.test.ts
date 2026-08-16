import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ApiError, apiRequest } from '../lib/api'

// env must be set before module import — use process.env directly in tests
const BASE = 'https://audit.test'

describe('ApiError', () => {
  it('sets status and body correctly', () => {
    const err = new ApiError(404, { detail:'not found' })
    expect(err.status).toBe(404)
    expect(err.body).toEqual({ detail:'not found' })
    expect(err.name).toBe('ApiError')
    expect(err.message).toBe('API 404')
  })
})

describe('apiRequest', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    process.env.NEXT_PUBLIC_AUDIT_CORE_URL = BASE
  })

  it('GET sends Bearer and Correlation-ID headers', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify([]), { status:200 }),
    )
    await apiRequest('tok', 'GET', '/v1/journeys')
    const [url, init] = spy.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/v1/journeys')
    const headers = init.headers as Record<string,string>
    expect(headers['Authorization']).toBe('Bearer tok')
    expect(headers['X-Correlation-ID']).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('POST sends JSON body and Idempotency-Key', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status:201 }),
    )
    await apiRequest('tok', 'POST', '/v1/journeys', { customer:'Raj' }, 'idem-1')
    const [, init] = spy.mock.calls[0] as [string, RequestInit]
    const headers = init.headers as Record<string,string>
    expect(headers['Content-Type']).toBe('application/json')
    expect(headers['Idempotency-Key']).toBe('idem-1')
    expect(init.body).toBe(JSON.stringify({ customer:'Raj' }))
  })

  it('GET does NOT send Idempotency-Key', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify([]), { status:200 }),
    )
    await apiRequest('tok', 'GET', '/v1/x', undefined, 'ignored')
    const [, init] = vi.mocked(globalThis.fetch).mock.calls[0] as [string,RequestInit]
    const headers = init.headers as Record<string,string>
    expect(headers['Idempotency-Key']).toBeUndefined()
  })

  it('throws ApiError on 403', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ detail:'forbidden' }), { status:403 }),
    )
    await expect(apiRequest('tok', 'GET', '/v1/x')).rejects.toBeInstanceOf(ApiError)
  })

  it('returns undefined on 204', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(null, { status:204 }))
    const result = await apiRequest('tok', 'DELETE', '/v1/x')
    expect(result).toBeUndefined()
  })
})
