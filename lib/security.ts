/**
 * verigence-security integration
 *
 * Implements POST /oauth/token with grant_type=token-exchange
 * per SECURITY_CROSS_MODULE_AUTH_DESIGN_v1.0.md §3.2 and
 * src/verigence_security/app.py (TokenService.exchange_user_token)
 *
 * Client authentication: HTTP Basic (CLIENT_ID:CLIENT_SECRET)
 * Server-side only — secret never reaches the browser.
 */

export const TOKEN_EXCHANGE_GRANT =
  'urn:ietf:params:oauth:grant-type:token-exchange'
export const ACCESS_TOKEN_TYPE =
  'urn:ietf:params:oauth:token-type:access_token'

// All permissions a web client may request — intersection with user's effective
// permissions is calculated by the Security module (§4 permission intersection)
export const WEB_CLIENT_SCOPE = [
  // PC permissions
  'audit.project.read', 'audit.master.read',
  'audit.customer.read', 'audit.customer.write',
  'audit.journey.create', 'audit.journey.read',
  'audit.journey.update', 'audit.journey.submit',
  'audit.evidence.read', 'audit.evidence.upload',
  'audit.payment.read', 'audit.payment.write',
  'audit.payment.verify',
  'audit.delivery.read', 'audit.delivery.write',
  'audit.delivery.verify',
  'audit.finding.read', 'audit.finding.create',
  'audit.finding.update', 'audit.finding.resolve',
  'audit.review.read', 'audit.review.decide',
  'audit.work.read', 'audit.work.update',
  'audit.daily_ops.read', 'audit.daily_ops.execute',
  'audit.crm.read', 'audit.crm.execute',
  'audit.escalation.read', 'audit.analytics.read',
  // DI permissions
  'di.subject.read', 'di.document.read',
  'di.document.upload', 'di.document.fields.read',
  'di.verification.read',
].join(' ')

export interface VgToken {
  access_token: string
  expires_in: number
  scope: string
  permissions: string[]
}

export interface ExchangeError {
  error: string
  error_description?: string
}

/**
 * Exchange a Clerk JWT for a Verigence platform JWT.
 * Called server-side only (from /api/auth/exchange route).
 */
export async function exchangeToken(
  clerkJwt: string,
  opts?: {
    securityUrl?: string
    clientId?: string
    clientSecret?: string
  },
): Promise<VgToken> {
  const url    = opts?.securityUrl  ?? process.env.NEXT_PUBLIC_SECURITY_URL ?? ''
  const id     = opts?.clientId     ?? process.env.SECURITY_CLIENT_ID ?? ''
  const secret = opts?.clientSecret ?? process.env.SECURITY_CLIENT_SECRET ?? ''

  if (!url || !id || !secret) {
    throw new Error(
      'Security module env vars missing: NEXT_PUBLIC_SECURITY_URL, SECURITY_CLIENT_ID, SECURITY_CLIENT_SECRET',
    )
  }

  const basic = Buffer.from(`${id}:${secret}`).toString('base64')

  const body = new URLSearchParams({
    grant_type:         TOKEN_EXCHANGE_GRANT,
    subject_token:      clerkJwt,
    subject_token_type: ACCESS_TOKEN_TYPE,
    scope:              WEB_CLIENT_SCOPE,
  })

  const res = await fetch(`${url}/oauth/token`, {
    method:  'POST',
    headers: {
      Authorization:  `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  })

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as ExchangeError
    throw new Error(
      `Security /oauth/token ${res.status}: ${err.error ?? 'unknown'} — ${err.error_description ?? ''}`,
    )
  }

  const data = (await res.json()) as { access_token: string; expires_in: number; scope: string }

  // Decode permissions from JWT payload for UI rendering only.
  // Authorization enforcement is server-side (Audit Core → Security JWKS).
  let permissions: string[] = []
  try {
    const payload = JSON.parse(
      Buffer.from(data.access_token.split('.')[1], 'base64url').toString('utf-8'),
    ) as { permissions?: string[] }
    if (Array.isArray(payload.permissions)) {
      permissions = payload.permissions.filter((p): p is string => typeof p === 'string')
    }
  } catch { /* leave empty — UI hides restricted elements */ }

  return { ...data, permissions }
}

/** JWKS endpoint URL — for reference / server-side JWT verification config */
export function jwksUrl(securityUrl?: string): string {
  return `${securityUrl ?? process.env.NEXT_PUBLIC_SECURITY_URL}/.well-known/jwks.json`
}
