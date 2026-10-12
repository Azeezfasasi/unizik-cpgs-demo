import { NextResponse, type NextRequest } from 'next/server';

/**
 * Optimistic gate only: sends visitors without a session cookie to the login page.
 * The real checks (signature, active account, role, department scope) run in the
 * data access layer on every page, server action and route handler.
 */
export function proxy(req: NextRequest) {
  if (!req.cookies.has('crr_session')) {
    const url = new URL('/login', req.url);
    url.searchParams.set('next', req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/dashboard/:path*', '/records/:path*', '/sheets/:path*', '/digitization/:path*',
    '/submissions/:path*', '/approvals/:path*', '/amendments/:path*', '/transcripts/:path*',
    '/admin/:path*', '/audit/:path*', '/account/:path*', '/setup/:path*', '/mfa',
  ],
};
