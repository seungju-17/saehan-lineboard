import { NextRequest, NextResponse } from 'next/server';
import { importMonth, type MonthRow } from '@/lib/month-import';
import { todaySeoul } from '@/lib/shift';

/** 월 근무표 올리기. 브라우저에서 엑셀을 읽어 줄 단위로 보내면 날짜·교대·공장마다 표를 만든다. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.json() as { rows?: MonthRow[] };
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (!rows.length) return NextResponse.json({ error: '올릴 줄이 없습니다' }, { status: 400 });
  if (rows.length > 20000) return NextResponse.json({ error: '한 번에 2만 줄까지 올릴 수 있습니다' }, { status: 400 });
  return NextResponse.json(importMonth(rows, { today: todaySeoul() }));
}
