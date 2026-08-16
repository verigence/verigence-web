import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PUBLIC_PATHS = ['/sign-in', '/sign-up', '/registration-received']

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) return NextResponse.next()

  // Check for Verigence session token (httpOnly cookie set after login)
  const token = req.cookies.get('vg_session')?.value
  if (!token) {
    return NextResponse.redirect(new URL('/sign-in', req.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next|[^?]*\\.(?:ico|svg|png|jpg|css|js|woff2?)).*)', '/(api|trpc)(.*)'],
}
