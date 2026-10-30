/** 화면과 인쇄에서 뜻을 나르는 색. 구역(라인 그룹)과 근무조(A/B/C)에 각각 한 색. 장식용 색은 없다. */

export type ZoneColor = { ink: string; band: string; name: string };
const ZONES: Record<string, ZoneColor> = {
  PET: { ink: '#1e3a8a', band: '#e3e9f8', name: 'PET' },
  PE: { ink: '#0f766e', band: '#dcf2ef', name: 'PE' },
  프리폼: { ink: '#9a3412', band: '#fbe9df', name: '프리폼' },
  성형: { ink: '#1d4ed8', band: '#e0e9ff', name: '성형' },
  지원: { ink: '#475569', band: '#e8ecf1', name: '지원' },
  관리: { ink: '#3f6212', band: '#e9f1dc', name: '관리' },
};
const ZONE_DEFAULT: ZoneColor = { ink: '#1b2537', band: '#e7ecf5', name: '라인' };
export function zoneColor(zone: string | null | undefined): ZoneColor { return (zone && ZONES[zone]) || ZONE_DEFAULT; }

/** 근무조 색. A 파랑, B 초록, C 주황. 주간고정·임시는 회색. 명도가 달라 흑백 인쇄에서도 구분된다. */
export type GroupColor = { ink: string; bg: string; label: string };
const GROUPS: Record<string, GroupColor> = {
  A: { ink: '#1d4ed8', bg: '#e0e9ff', label: 'A조' },
  B: { ink: '#15803d', bg: '#dcf5e3', label: 'B조' },
  C: { ink: '#c2410c', bg: '#feeadb', label: 'C조' },
};
const GROUP_DEFAULT: GroupColor = { ink: '#566070', bg: '#eef1f5', label: '' };
export function groupColor(grp: string | null | undefined, workType?: string): GroupColor {
  if (workType === '주간고정') return { ink: '#6b4e16', bg: '#f6ecd4', label: '주간고정' };
  if (workType === '임시') return { ink: '#566070', bg: '#eef1f5', label: '임시' };
  return (grp && GROUPS[grp]) || GROUP_DEFAULT;
}
