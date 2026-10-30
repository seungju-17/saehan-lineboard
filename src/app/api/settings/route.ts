import { NextRequest, NextResponse } from 'next/server';
import { getSettings, setSettings, type Settings } from '@/lib/repo';

export async function GET(): Promise<NextResponse> { return NextResponse.json(getSettings()); }

export async function PUT(req: NextRequest): Promise<NextResponse> {
  const body = await req.json() as Partial<Settings>;
  try { return NextResponse.json(setSettings(body)); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
