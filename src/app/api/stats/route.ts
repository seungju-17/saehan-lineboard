import { NextRequest, NextResponse } from 'next/server';
import { getStats } from '@/lib/stats';
import { currentShiftSeoul, todaySeoul, type Shift } from '@/lib/shift';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const p = new URL(req.url).searchParams;
  const factory = Number(p.get('factory') ?? 2);
  const date = p.get('date') ?? todaySeoul();
  const shift = (p.get('shift') as Shift | null) ?? currentShiftSeoul();
  const days = Math.min(90, Math.max(7, Number(p.get('days') ?? 30)));
  if (!(factory === 1 || factory === 2) || !(shift === '주간' || shift === '야간')) return NextResponse.json({ error: 'factory, shift' }, { status: 400 });
  return NextResponse.json(getStats(date, shift, factory, days));
}
