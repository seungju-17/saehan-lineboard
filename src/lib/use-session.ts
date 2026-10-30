'use client';
import { useEffect, useState } from 'react';
import type { Role } from './rules';

export type SessionInfo = { kind: 'admin'; id: number; name: string; role: Role; factory_id: number | null } | { kind: 'worker'; name: string } | { kind: 'none' };
let cache: SessionInfo | null = null;
const listeners = new Set<(s: SessionInfo) => void>();
export async function refreshSession(): Promise<SessionInfo> {
  try { const r = await fetch('/api/session'); cache = r.ok ? await r.json() as SessionInfo : { kind: 'none' }; }
  catch { cache = { kind: 'none' }; }
  listeners.forEach((f) => f(cache!));
  return cache;
}
/** 지금 로그인한 사람. 처음엔 null(모름), 한 번 받아오면 공유한다. */
export function useSession(): SessionInfo | null {
  const [s, setS] = useState<SessionInfo | null>(cache);
  useEffect(() => { listeners.add(setS); if (!cache) refreshSession(); return () => { listeners.delete(setS); }; }, []);
  return s;
}
