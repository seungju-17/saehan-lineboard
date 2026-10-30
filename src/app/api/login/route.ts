import { NextRequest, NextResponse } from 'next/server';
import { checkPassword, COOKIE, sessionValue } from '@/lib/auth';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { password } = await req.json() as { password: string };
  if (!checkPassword(password ?? '')) return NextResponse.json({ error: '비밀번호가 맞지 않습니다' }, { status: 401 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, sessionValue(), { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30 });
  return res;
}
export async function DELETE(): Promise<NextResponse> {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}
