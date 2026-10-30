import { NextRequest, NextResponse } from 'next/server';
import { markRead, myWork } from '@/lib/repo';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = new URL(req.url).searchParams.get('token') ?? '';
  const data = myWork(token);
  if (!data) return NextResponse.json({ error: '링크가 올바르지 않습니다' }, { status: 404 });
  return NextResponse.json(data);
}
export async function POST(req: NextRequest): Promise<NextResponse> {
  const { token, messageId } = await req.json() as { token: string; messageId: number };
  return NextResponse.json({ ok: markRead(token, messageId) });
}
