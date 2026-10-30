import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE, sessionValue } from '@/lib/auth';

const PUBLIC = [/^\/login/, /^\/r\//, /^\/me\//, /^\/api\/public\//, /^\/api\/login/];

export function proxy(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => p.test(pathname))) return NextResponse.next();
  if (req.cookies.get(COOKIE)?.value === sessionValue()) return NextResponse.next();
  if (pathname.startsWith('/api/')) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
  const url = req.nextUrl.clone(); url.pathname = '/login'; url.searchParams.set('next', pathname);
  return NextResponse.redirect(url);
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico)$).*)'] };
