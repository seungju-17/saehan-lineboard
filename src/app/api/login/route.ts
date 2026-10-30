import { NextRequest, NextResponse } from 'next/server';
import { COOKIE, DEMO_CODE, ME_COOKIE, meCookie, sessionCookie } from '@/lib/auth';
import { loginAccount, personByPhone } from '@/lib/repo';

const MONTH = 60 * 60 * 24 * 30;

/** 관리자: { username, password }. 근무자: { phone } → 인증번호 안내, { phone, code } → 로그인. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.json() as { username?: string; password?: string; phone?: string; code?: string };
  if (body.phone !== undefined) {
    const p = personByPhone(body.phone);
    if (!p) return NextResponse.json({ error: '등록된 전화번호가 아닙니다. 담당자에게 번호 등록을 요청하세요.' }, { status: 404 });
    if (body.code === undefined) return NextResponse.json({ ok: true, name: p.name, sent: true, demoCode: DEMO_CODE });
    if (body.code.trim() !== DEMO_CODE) return NextResponse.json({ error: '인증번호가 맞지 않습니다' }, { status: 401 });
    const res = NextResponse.json({ ok: true, kind: 'worker', name: p.name });
    res.cookies.set(ME_COOKIE, meCookie(p.token), { httpOnly: true, sameSite: 'lax', path: '/', maxAge: MONTH * 6 });
    return res;
  }
  const a = loginAccount(body.username ?? '', body.password ?? '');
  if (!a) return NextResponse.json({ error: '아이디나 비밀번호가 맞지 않습니다' }, { status: 401 });
  const res = NextResponse.json({ ok: true, kind: 'admin', name: a.name, role: a.role });
  res.cookies.set(COOKIE, sessionCookie({ id: a.id, name: a.name, role: a.role, factory_id: a.factory_id }), { httpOnly: true, sameSite: 'lax', path: '/', maxAge: MONTH });
  return res;
}
export async function DELETE(): Promise<NextResponse> {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, '', { path: '/', maxAge: 0 });
  res.cookies.set(ME_COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}
