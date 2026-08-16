/**
 * Tests for lib/security.ts
 *
 * Verifies token-exchange integration with verigence-security
 * per SECURITY_CROSS_MODULE_AUTH_DESIGN_v1.0.md §3.2
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  exchangeToken,
  TOKEN_EXCHANGE_GRANT,
  ACCESS_TOKEN_TYPE,
  WEB_CLIENT_SCOPE,
  jwksUrl,
} from '../lib/security'

// Build a minimal RS256-style JWT with given payload (not cryptographically signed — unit test only)
function makeJwt(payload: Record<string, unknown>): string {
  const header  = Buffer.from(JSON.stringify({ alg:'RS256', typ:'JWT' })).toString('base64url')
  const body    = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${header}.${body}.fakesig`
}

const MOCK_PERMISSIONS = ['audit.project.read', 'audit.journey.read', 'di.document.read']
const MOCK_JWT = makeJwt({
  sub:'user-123', tenant_id:'tenant-abc',
  actor_type:'USER', roles:['PC'],
  permissions: MOCK_PERMISSIONS,
  iat: Math.floor(Date.now()/1000),
  exp: Math.floor(Date.now()/1000) + 300,
})

const MOCK_USER_JWT = makeJwt({ sub:"user-123", tenant_id:"tenant-abc", actor_type:"USER", roles:["PC"], permissions:MOCK_PERMISSIONS, iat:0, exp:9999999999 })

const opts = { securityUrl:'https://sec.test', clientId:'verigence-web', clientSecret:'secret123' }

describe('exchangeToken', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('calls POST /oauth/token with correct grant type', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: MOCK_JWT, expires_in: 300, scope:'audit.project.read' }), { status:200 }),
    )

    await exchangeToken(MOCK_USER_JWT, opts)

    expect(fetchSpy).toHaveBeenCalledOnce()
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://sec.test/oauth/token')
    expect(init.method).toBe('POST')

    const body = new URLSearchParams(init.body as string)
    expect(body.get('grant_type')).toBe(TOKEN_EXCHANGE_GRANT)
    expect(body.get('subject_token')).toBe(MOCK_USER_JWT)
    expect(body.get('subject_token_type')).toBe(ACCESS_TOKEN_TYPE)
    expect(body.get('scope')).toBe(WEB_CLIENT_SCOPE)
  })

  it('sends HTTP Basic auth header with client credentials', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: MOCK_JWT, expires_in: 300, scope:'' }), { status:200 }),
    )

    await exchangeToken(MOCK_USER_JWT, opts)

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    const headers = init.headers as Record<string, string>
    const expected = `Basic ${Buffer.from('verigence-web:secret123').toString('base64')}`
    expect(headers['Authorization']).toBe(expected)
  })

  it('decodes permissions[] from JWT payload', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: MOCK_JWT, expires_in: 300, scope:'' }), { status:200 }),
    )

    const result = await exchangeToken(MOCK_USER_JWT, opts)
    expect(result.permissions).toEqual(MOCK_PERMISSIONS)
  })

  it('returns empty permissions[] when JWT payload cannot be decoded', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: 'bad.token', expires_in: 300, scope:'' }), { status:200 }),
    )

    const result = await exchangeToken(MOCK_USER_JWT, opts)
    expect(result.permissions).toEqual([])
  })

  it('throws when security responds 401 invalid_client', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error:'invalid_client' }),
        { status:401, headers: { 'WWW-Authenticate':'Basic' } },
      ),
    )

    await expect(exchangeToken(MOCK_USER_JWT, opts)).rejects.toThrow('invalid_client')
  })

  it('throws when security responds 400 invalid_grant', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error:'invalid_grant', error_description:'subject token is invalid' }),
        { status:400 },
      ),
    )

    await expect(exchangeToken(MOCK_USER_JWT, opts)).rejects.toThrow('invalid_grant')
  })

  it('throws when security responds 400 invalid_scope (permission denied)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error:'invalid_scope', error_description:'requested permission is not authorized' }),
        { status:400 },
      ),
    )

    await expect(exchangeToken(MOCK_USER_JWT, opts)).rejects.toThrow('invalid_scope')
  })

  it('throws when env vars are missing', async () => {
    await expect(
      exchangeToken(MOCK_USER_JWT, { securityUrl:'', clientId:'', clientSecret:'' }),
    ).rejects.toThrow('env vars missing')
  })
})

describe('WEB_CLIENT_SCOPE', () => {
  it('includes core PC permissions from default_role_templates.json', () => {
    const perms = WEB_CLIENT_SCOPE.split(' ')
    expect(perms).toContain('audit.journey.create')
    expect(perms).toContain('audit.journey.submit')
    expect(perms).toContain('audit.evidence.upload')
    expect(perms).toContain('di.document.upload')
  })

  it('includes TL/PM permissions for role-aware UI', () => {
    const perms = WEB_CLIENT_SCOPE.split(' ')
    expect(perms).toContain('audit.payment.verify')
    expect(perms).toContain('audit.review.decide')
    expect(perms).toContain('audit.analytics.read')
  })

  it('does NOT include admin permissions (security.* forbidden for operational roles)', () => {
    const perms = WEB_CLIENT_SCOPE.split(' ')
    expect(perms.some(p => p.startsWith('security.'))).toBe(false)
  })

  it('does NOT include forbidden DI permissions per role_templates.json', () => {
    const perms = WEB_CLIENT_SCOPE.split(' ')
    expect(perms).not.toContain('di.document.delete')
    expect(perms).not.toContain('di.platform.whatsapp.admin')
  })
})

describe('jwksUrl', () => {
  it('builds correct JWKS URL from security base URL', () => {
    expect(jwksUrl('https://sec.test')).toBe('https://sec.test/.well-known/jwks.json')
  })
})
