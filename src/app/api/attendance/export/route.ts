import { NextRequest, NextResponse } from 'next/server';
import { attendanceXlsx } from '@/lib/attendance-xlsx';
import { factoryName } from '@/lib/repo';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const p = new URL(req.url).searchParams;
  const month = p.get('month') ?? '', factory = Number(p.get('factory'));
  if (!/^\d{4}-\d{2}$/.test(month) || !(factory === 1 || factory === 2)) return NextResponse.json({ error: 'month=YYYY-MM, factory' }, { status: 400 });
  const buf = attendanceXlsx(month, factory);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`근태표_${factoryName(factory)}_${month}.xlsx`)}`,
    },
  });
}
