import { NextRequest, NextResponse } from 'next/server';
import { addPerson, clearVacancy, confirmBoard, findOrCreatePerson, getBoard, nextCandidates, removePerson, sendRequests, setProduct, unconfirmBoard, autoFill } from '@/lib/repo';
import type { Shift } from '@/lib/shift';

type Key = { date: string; shift: Shift; factory: number };
function key(p: URLSearchParams | Record<string, unknown>): Key | null {
  const g = (k: string): string | null => p instanceof URLSearchParams ? p.get(k) : ((p[k] as string | number | undefined)?.toString() ?? null);
  const date = g('date'), shift = g('shift') as Shift | null, factory = Number(g('factory'));
  if (!date || !shift || !factory) return null;
  return { date, shift, factory };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const k = key(new URL(req.url).searchParams);
  if (!k) return NextResponse.json({ error: 'date, shift, factory' }, { status: 400 });
  return NextResponse.json(getBoard(k.date, k.shift, k.factory));
}

type Action =
  | { action: 'product'; postId: number; product: string | null }
  | { action: 'add'; postId: number; personId?: number; name?: string }
  | { action: 'remove'; postId: number; personId: number }
  | { action: 'absent'; postId: number; personId: number }
  | { action: 'send'; postId: number }
  | { action: 'next'; postId: number }
  | { action: 'cancel'; postId: number }
  | { action: 'autofill' }
  | { action: 'confirm' }
  | { action: 'unconfirm' };

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.json() as Action & Record<string, unknown>;
  const k = key(body);
  if (!k) return NextResponse.json({ error: 'date, shift, factory' }, { status: 400 });
  const board = getBoard(k.date, k.shift, k.factory);
  let extra: Record<string, unknown> = {};
  try {
    switch (body.action) {
      case 'product': setProduct(board.id, body.postId, body.product); break;
      case 'add': {
        const id = body.personId ?? findOrCreatePerson(body.name ?? '', k.factory).id;
        addPerson(board.id, body.postId, id); break;
      }
      case 'remove': removePerson(board.id, body.postId, body.personId, false); break;
      case 'absent': removePerson(board.id, body.postId, body.personId, true); extra = sendRequests(board.id, body.postId, body.personId); break;
      case 'send': extra = sendRequests(board.id, body.postId, null); break;
      case 'next': extra = nextCandidates(board.id, body.postId); break;
      case 'cancel': clearVacancy(board.id, body.postId); break;
      case 'autofill': extra = autoFill(board.id); break;
      case 'confirm': extra = confirmBoard(board.id); break;
      case 'unconfirm': unconfirmBoard(board.id); break;
      default: return NextResponse.json({ error: 'unknown action' }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
  return NextResponse.json({ ...getBoard(k.date, k.shift, k.factory), ...extra });
}
