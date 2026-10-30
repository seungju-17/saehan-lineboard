import { NextRequest, NextResponse } from 'next/server';
import { respond } from '@/lib/repo';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { token, action } = await req.json() as { token: string; action: 'accept' | 'decline' };
  if (!token || !['accept', 'decline'].includes(action)) return NextResponse.json({ error: 'bad request' }, { status: 400 });
  const r = respond(token, action);
  return NextResponse.json(r, { status: r.ok ? 200 : 409 });
}
