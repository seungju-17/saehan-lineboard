import { NextRequest, NextResponse } from 'next/server';
import { confirmMonth, monthView } from '@/lib/repo';
import { generateMonth } from '@/lib/planner';

/** 월 근무표. GET ?month=YYYY-MM&factory= → 날짜·교대별 상태. POST {action:'generate'|'confirm', month, factory, mode?} */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const p = new URL(req.url).searchParams; const month = p.get('month') ?? '', factory = Number(p.get('factory'));
  if (!/^\d{4}-\d{2}$/.test(month) || !(factory === 1 || factory === 2)) return NextResponse.json({ error: 'month=YYYY-MM, factory' }, { status: 400 });
  return NextResponse.json({ cells: monthView(month, factory) });
}
export async function POST(req: NextRequest): Promise<NextResponse> {
  const b = await req.json() as { action: 'generate' | 'confirm'; month: string; factory: number; mode?: 'fill' | 'redo' };
  if (!/^\d{4}-\d{2}$/.test(b.month ?? '') || !(b.factory === 1 || b.factory === 2)) return NextResponse.json({ error: 'month, factory' }, { status: 400 });
  if (b.action === 'generate') return NextResponse.json(generateMonth(b.month, b.factory, b.mode === 'redo' ? 'redo' : 'fill'));
  if (b.action === 'confirm') return NextResponse.json(confirmMonth(b.month, b.factory));
  return NextResponse.json({ error: 'action' }, { status: 400 });
}
