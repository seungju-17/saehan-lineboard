import { NextRequest, NextResponse } from 'next/server';
import { personSkills, setSkill } from '@/lib/repo';
import type { SkillLevel } from '@/lib/engine';

/** 사람별 라인 숙련도. GET ?person=ID → 라인 목록(수준·선 횟수), PUT {person, post, level|null}. */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const id = Number(new URL(req.url).searchParams.get('person'));
  if (!id) return NextResponse.json({ error: 'person' }, { status: 400 });
  return NextResponse.json(personSkills(id));
}
export async function PUT(req: NextRequest): Promise<NextResponse> {
  const b = await req.json() as { person: number; post: number; level: SkillLevel | null };
  if (!b.person || !b.post) return NextResponse.json({ error: 'person, post' }, { status: 400 });
  try { setSkill(Number(b.person), Number(b.post), b.level ?? null); } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 }); }
  return NextResponse.json({ ok: true });
}
