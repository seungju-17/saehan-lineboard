import { NextRequest, NextResponse } from 'next/server';
import { ME_COOKIE, parseMe } from '@/lib/auth';
import { markRead, myWork, personByToken, requestLeave } from '@/lib/repo';
import type { LeaveKind } from '@/lib/rules';
import type { Shift } from '@/lib/shift';

/** 근무자 자기 화면 데이터. 개인 링크의 토큰이나 근무자 로그인 쿠키로 찾는다. */
function tokenOf(req: NextRequest, given?: string | null): string {
  return given || parseMe(req.cookies.get(ME_COOKIE)?.value) || '';
}
export async function GET(req: NextRequest): Promise<NextResponse> {
  const data = myWork(tokenOf(req, new URL(req.url).searchParams.get('token')));
  if (!data) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
  return NextResponse.json(data);
}
export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.json() as { token?: string; messageId?: number; action?: 'leave'; date?: string; shift?: Shift; kind?: LeaveKind; note?: string | null };
  const tok = tokenOf(req, body.token);
  if (body.action === 'leave') {
    const p = personByToken(tok);
    if (!p) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
    const r = requestLeave(p.id, body.date ?? '', body.shift ?? '주간', body.kind ?? '연차', body.note ?? null);
    return NextResponse.json(r, { status: r.ok ? 200 : 409 });
  }
  return NextResponse.json({ ok: markRead(tok, Number(body.messageId)) });
}
