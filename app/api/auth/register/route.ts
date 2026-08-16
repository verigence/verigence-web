/**
 * POST /api/auth/register
 *
 * Forwards registration request to the Security module.
 * The onboarding_key is validated server-side by Security.
 * On success: returns 201 — user is pending admin approval.
 *
 * NOTE: Registration endpoint is to be defined by Security team.
 * Placeholder until Security team publishes the registration API spec.
 */
import { NextRequest, NextResponse } from 'next/server'

const SECURITY_URL = process.env.NEXT_PUBLIC_SECURITY_URL ?? ''

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.json() as {
    onboarding_key: string
    first_name:     string
    last_name:      string
    email:          string
    mobile:         string
    password:       string
  }

  try {
    const res = await fetch(`${SECURITY_URL}/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: string; detail?: string }
      return NextResponse.json(
        { error: err.detail ?? err.error ?? 'Registration failed' },
        { status: res.status },
      )
    }

    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (err) {
    console.error('[auth/register]', err)
    return NextResponse.json({ error: 'Security service unavailable' }, { status: 503 })
  }
}
