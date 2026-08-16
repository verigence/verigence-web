/**
 * POST /api/auth/exchange
 *
 * Server route: Clerk JWT → verigence-security /oauth/token (token-exchange)
 * SECURITY_CLIENT_SECRET stays server-side — never reaches the browser.
 *
 * Ref: src/verigence_security/app.py → /oauth/token
 *      SECURITY_CROSS_MODULE_AUTH_DESIGN_v1.0.md §3.2
 */
import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { exchangeToken } from '@/lib/security'

export async function POST(): Promise<NextResponse> {
  const session = await auth()
  if (!session.userId) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }
  const clerkToken = await session.getToken()
  if (!clerkToken) {
    return NextResponse.json({ error: 'no_clerk_token' }, { status: 401 })
  }
  try {
    const vgToken = await exchangeToken(clerkToken)
    return NextResponse.json(vgToken)
  } catch (err) {
    console.error('[auth/exchange]', err)
    return NextResponse.json(
      { error: 'token_exchange_failed', detail: String(err) },
      { status: 502 },
    )
  }
}
