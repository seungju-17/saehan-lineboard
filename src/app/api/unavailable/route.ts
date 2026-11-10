import { NextRequest, NextResponse } from 'next/server';
import { COOKIE, parseSession } from '@/lib/auth';
import { decideUnavailable, pendingUnavailable } from '@/lib/repo';

/** 불가일 신청 처리. GET → 기다리는 신청, POST {id, approve, reply}. */
export async function GET(): Promise<NextResponse> { return NextResponse.json(pendingUnavailable()); }
export async function POST(req: NextRequest): Promise<NextResponse> {
  const s = parseSession(req.cookies.get(COOKIE)?.value);
  const { id, approve, reply } = await req.json() as { id: number; approve: boolean; reply?: string | null };
  const r = decideUnavailable(Number(id), !!approve, reply ?? null, s?.name ?? '관리자');
  return NextResponse.json(r, { status: r.ok ? 200 : 409 });
}
