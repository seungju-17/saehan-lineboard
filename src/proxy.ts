import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE, ME_COOKIE, parseMe, parseSession } from '@/lib/auth';

/** 관리자 화면·API는 관리자 세션, 근무자 화면은 근무자 세션(또는 개인 링크 토큰)이 있어야 한다. */
const PUBLIC = [/^\/login/, /^\/r\//, /^\/me\/.+/, /^\/api\/public\//, /^\/api\/login/, /^\/api\/session/];

export function proxy(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => p.test(pathname))) return NextResponse.next();
  if (pathname === '/me') {
    if (parseMe(req.cookies.get(ME_COOKIE)?.value)) return NextResponse.next();
    const url = req.nextUrl.clone(); url.pathname = '/login'; url.searchParams.set('who', 'worker');
    return NextResponse.redirect(url);
  }
  if (parseSession(req.cookies.get(COOKIE)?.value)) return NextResponse.next();
  if (pathname.startsWith('/api/')) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
  const url = req.nextUrl.clone(); url.pathname = '/login'; url.searchParams.set('next', pathname);
  return NextResponse.redirect(url);
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico)$).*)'] };
