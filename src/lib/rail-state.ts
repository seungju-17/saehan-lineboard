'use client';
import { useSyncExternalStore } from 'react';

/** 왼쪽 메뉴를 넓게(글자 보임) 볼지 좁게(아이콘만) 볼지. 위 막대의 ≡ 로 바꾸고 브라우저에 기억한다. */
const KEY = 'lb_rail_wide';
const subs = new Set<() => void>();
let wide: boolean | null = null;
function read(): boolean {
  if (wide === null) { try { wide = localStorage.getItem(KEY) !== '0'; } catch { wide = true; } }
  return wide;
}
export function toggleRail(): void {
  wide = !read();
  try { localStorage.setItem(KEY, wide ? '1' : '0'); } catch { /* 저장소 없음 */ }
  subs.forEach((f) => f());
}
export function useRailWide(): boolean {
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, read, () => true);
}
