import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { people, weekHoursFor } from '@/lib/repo';
import { todaySeoul } from '@/lib/shift';

export async function GET(): Promise<NextResponse> { const h = weekHoursFor(todaySeoul()); return NextResponse.json(people(getDb(), false).map((p) => ({ ...p, week_hours: h.get(p.id) ?? 0 }))); }

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const { id, ...u } = await req.json() as { id: number; phone?: string; grp?: string; work_type?: string; affiliation?: string; active?: number; home_factory_id?: number; unit?: string; gender?: string | null };
  const allowed = ['phone', 'grp', 'work_type', 'affiliation', 'active', 'home_factory_id', 'unit', 'gender'] as const;
  const sets = allowed.filter((k) => k in u);
  if (!id || !sets.length) return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
  getDb().prepare(`UPDATE people SET ${sets.map((k) => `${k}=?`).join(', ')} WHERE id=?`).run(...sets.map((k) => u[k] ?? null), id);
  return NextResponse.json({ ok: true });
}
