import { NextResponse } from 'next/server'
export function POST(): NextResponse {
  const res = NextResponse.json({ ok: true })
  res.cookies.set('vg_session', '', { maxAge: 0, path: '/' })
  return res
}
