export type Group = 'A' | 'B' | 'C';
export type Shift = '주간' | '야간';
export type DayType = '주' | '야' | '휴';

// 3조 2교대: 4일 근무 → 2일 휴무 → 주/야 전환, 12일 주기 (2026-01-01 기준)
const PATTERNS: Record<Group, DayType[]> = {
  A: ['야', '야', '휴', '휴', '주', '주', '주', '주', '휴', '휴', '야', '야'],
  B: ['주', '주', '주', '주', '휴', '휴', '야', '야', '야', '야', '휴', '휴'],
  C: ['휴', '휴', '야', '야', '야', '야', '휴', '휴', '주', '주', '주', '주'],
};
export const REFERENCE_DATE = '2026-01-01';

function utc(d: string): number { return Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)); }

export function dayTypeOf(group: Group, date: string): DayType {
  const diff = Math.round((utc(date) - utc(REFERENCE_DATE)) / 86_400_000);
  return PATTERNS[group][((diff % 12) + 12) % 12];
}
export function groupsOn(date: string): { day: Group; night: Group; off: Group } {
  const m: Partial<Record<DayType, Group>> = {};
  for (const g of ['A', 'B', 'C'] as Group[]) m[dayTypeOf(g, date)] = g;
  return { day: m['주']!, night: m['야']!, off: m['휴']! };
}
/** 같은 조가 같은 근무를 한 가장 최근 날짜. dates는 최신순. 없으면 첫 번째(=가장 최근). */
export function sameGroupBefore(date: string, shift: Shift, dates: string[]): string | undefined {
  const key = shift === '주간' ? 'day' : 'night';
  const g = groupsOn(date)[key];
  return dates.find((d) => groupsOn(d)[key] === g) ?? dates[0];
}
export function addDays(date: string, n: number): string { return new Date(utc(date) + n * 86_400_000).toISOString().slice(0, 10); }
export function todaySeoul(): string { return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }); }
export function currentShiftSeoul(): Shift {
  const h = +new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', hour12: false }).slice(0, 2);
  return h >= 6 && h < 18 ? '주간' : '야간';
}
const W = ['일', '월', '화', '수', '목', '금', '토'];
export function fmtKo(date: string): string { const d = new Date(date + 'T00:00:00'); return `${d.getMonth() + 1}월 ${d.getDate()}일 (${W[d.getDay()]})`; }
export function fmtShort(date: string): string { const d = new Date(date + 'T00:00:00'); return `${d.getMonth() + 1}/${d.getDate()} (${W[d.getDay()]})`; }
export const SHIFT_HOURS: Record<Shift, string> = { 주간: '06:00–18:00', 야간: '18:00–06:00' };
