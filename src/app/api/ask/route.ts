import { NextRequest, NextResponse } from 'next/server';
import { ask, makeClient, explainApiError, type ChatMessage } from '@/lib/assistant';

export const maxDuration = 120;

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'no_key', message: '서버에 ANTHROPIC_API_KEY가 없습니다. .env.local 에 넣고 다시 시작하세요.' }, { status: 503 });
  const { messages } = await req.json() as { messages: ChatMessage[] };
  if (!Array.isArray(messages) || messages.length === 0) return NextResponse.json({ error: 'bad request' }, { status: 400 });
  try {
    const r = await ask(messages.slice(-12), { client: makeClient() });
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: 'api', message: explainApiError(e).message }, { status: 502 });
  }
}
