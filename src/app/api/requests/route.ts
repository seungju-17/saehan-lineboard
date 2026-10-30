import { NextResponse } from 'next/server';
import { allRequests } from '@/lib/repo';

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(allRequests());
}
