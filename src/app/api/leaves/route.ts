import { NextRequest, NextResponse } from 'next/server';
import { COOKIE, parseSession } from '@/lib/auth';
import { adminInbox, decideLeave } from '@/lib/repo';

/** 관리자 알림함: 처리할 휴가 신청과 최근 일. POST { id, approve, reply } 로 승인·거절. */
export async function GET(): Promise<NextResponse> { return NextResponse.json(adminInbox()); }

export async function POST(req: NextRequest): Promise<NextResponse> {
  const s = parseSession(req.cookies.get(COOKIE)?.value);
  const { id, approve, reply } = await req.json() as { id: number; approve: boolean; reply?: string | null };
  const r = decideLeave(Number(id), !!approve, reply ?? null, s?.name ?? '관리자');
  return NextResponse.json(r, { status: r.ok ? 200 : 409 });
}
