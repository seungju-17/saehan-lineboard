import { NextRequest, NextResponse } from 'next/server';
import { factoryName, getBoard } from '@/lib/repo';
import { boardToXlsx } from '@/lib/excel';
import type { Shift } from '@/lib/shift';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const p = new URL(req.url).searchParams;
  const date = p.get('date'), shift = p.get('shift') as Shift | null, factory = Number(p.get('factory'));
  if (!date || !shift || !factory) return NextResponse.json({ error: 'date, shift, factory' }, { status: 400 });
  const board = getBoard(date, shift, factory);
  const name = factoryName(factory);
  const buf = boardToXlsx(board, name);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`배치표_${name}_${date}_${shift}.xlsx`)}`,
    },
  });
}
