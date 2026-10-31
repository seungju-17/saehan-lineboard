/** 화면과 인쇄에서 뜻을 나르는 색. 구역(라인 그룹)과 근무조(A/B/C)에 각각 한 색. 장식용 색은 없다. */

export type ZoneColor = { ink: string; band: string; name: string };
const ZONES: Record<string, ZoneColor> = {
  PET: { ink: '#1e3a66', band: '#e5eaf3', name: 'PET' },
  PE: { ink: '#2a9d6f', band: '#e1f4ec', name: 'PE' },
  프리폼: { ink: '#e8932e', band: '#fdeedc', name: '프리폼' },
  성형: { ink: '#2b63d9', band: '#e3ebfa', name: '성형' },
  지원: { ink: '#8b919c', band: '#eef0f4', name: '지원' },
  관리: { ink: '#4f5b73', band: '#e8ecf3', name: '관리' },
};
const ZONE_DEFAULT: ZoneColor = { ink: '#1b2537', band: '#e7ecf5', name: '라인' };
export function zoneColor(zone: string | null | undefined): ZoneColor { return (zone && ZONES[zone]) || ZONE_DEFAULT; }

/** 근무조 색. A 파랑, B 초록, C 주황. 주간고정·임시는 회색. 명도가 달라 흑백 인쇄에서도 구분된다. */
export type GroupColor = { ink: string; bg: string; label: string };
const GROUPS: Record<string, GroupColor> = {
  A: { ink: '#2b63d9', bg: '#e3ebfa', label: 'A조' },
  B: { ink: '#2a9d6f', bg: '#e1f4ec', label: 'B조' },
  C: { ink: '#e8932e', bg: '#fdeedc', label: 'C조' },
};
const GROUP_DEFAULT: GroupColor = { ink: '#566070', bg: '#eef1f5', label: '' };
export function groupColor(grp: string | null | undefined, workType?: string): GroupColor {
  if (workType === '주간고정') return { ink: '#7c5a1e', bg: '#f6ecd4', label: '주간고정' };
  if (workType === '임시') return { ink: '#8b919c', bg: '#eef0f4', label: '임시' };
  return (grp && GROUPS[grp]) || GROUP_DEFAULT;
}
