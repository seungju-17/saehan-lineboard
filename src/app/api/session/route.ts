import { NextRequest, NextResponse } from 'next/server';
import { COOKIE, ME_COOKIE, parseMe, parseSession } from '@/lib/auth';
import { personByToken } from '@/lib/repo';

/** 지금 누가 들어와 있는지. 화면이 역할에 따라 버튼을 보이고 숨기는 데 쓴다. */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const s = parseSession(req.cookies.get(COOKIE)?.value);
  if (s) return NextResponse.json({ kind: 'admin', ...s });
  const tok = parseMe(req.cookies.get(ME_COOKIE)?.value);
  const p = tok ? personByToken(tok) : null;
  if (p) return NextResponse.json({ kind: 'worker', name: p.name });
  return NextResponse.json({ kind: 'none' });
}
