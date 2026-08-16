/**
 * GET /api/auth/session
 *
 * Reads the vg_session httpOnly cookie, decodes permissions[] from the JWT payload,
 * returns them to the client (VgAuthContext) for UI rendering.
 *
 * The raw token is also returned so the client can attach it to Audit Core API calls.
 * This is safe — the token is already in a cookie; we're just surfacing it to JS
 * for the purpose of attaching it to fetch() calls within the same browser session.
 */
import { NextRequest, NextResponse } from 'next/server'

export function GET(req: NextRequest): NextResponse {
  const token = req.cookies.get('vg_session')?.value
  if (!token) {
    return NextResponse.json({ error: 'no_session' }, { status: 401 })
  }

  let permissions: string[] = []
  try {
    const payload = JSON.parse(
      Buffer.from(token.split('.')[1], 'base64url').toString('utf-8'),
    ) as { permissions?: string[] }
    if (Array.isArray(payload.permissions)) {
      permissions = payload.permissions.filter((p): p is string => typeof p === 'string')
    }
  } catch { /* permissions stay empty */ }

  return NextResponse.json({ access_token: token, permissions })
}
