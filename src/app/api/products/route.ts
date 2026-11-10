import { NextRequest, NextResponse } from 'next/server';
import { listProducts, setProductNeed } from '@/lib/repo';

/** 제품별 표준 인원. GET ?factory= → 제품 목록(정한 인원·기록상 보통 인원), PUT {factory, name, need|null}. */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const f = Number(new URL(req.url).searchParams.get('factory'));
  if (!(f === 1 || f === 2)) return NextResponse.json({ error: 'factory' }, { status: 400 });
  return NextResponse.json(listProducts(f));
}
export async function PUT(req: NextRequest): Promise<NextResponse> {
  const b = await req.json() as { factory: number; name: string; need: number | null };
  try { setProductNeed(Number(b.factory), String(b.name), b.need === null ? null : Number(b.need)); } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 }); }
  return NextResponse.json({ ok: true });
}
