/**
 * POST /api/auth/login
 *
 * Forwards credentials to the Security module login endpoint.
 * On success: Security issues a platform JWT → stored in httpOnly cookie → 
 * subsequent requests attach it via the vg_session cookie.
 *
 * NOTE: The Security module's login endpoint is to be defined.
 * Placeholder until Security team publishes the login API spec.
 */
import { NextRequest, NextResponse } from 'next/server'

const SECURITY_URL = process.env.NEXT_PUBLIC_SECURITY_URL ?? ''

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { email, password } = await req.json() as { email: string; password: string }

  if (!email || !password) {
    return NextResponse.json({ error: 'email and password are required' }, { status: 400 })
  }

  try {
    // Forward to Security module — endpoint TBD by Security team
    const res = await fetch(`${SECURITY_URL}/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: string; detail?: string }
      return NextResponse.json(
        { error: err.detail ?? err.error ?? 'Invalid credentials' },
        { status: res.status === 401 ? 401 : 502 },
      )
    }

    const data = await res.json() as { access_token: string; expires_in: number }

    // Store platform JWT in httpOnly cookie — never accessible to JS
    const response = NextResponse.json({ ok: true })
    response.cookies.set('vg_session', data.access_token, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge:   data.expires_in ?? 300,
      path:     '/',
    })
    return response
  } catch (err) {
    console.error('[auth/login]', err)
    return NextResponse.json({ error: 'Security service unavailable' }, { status: 503 })
  }
}
