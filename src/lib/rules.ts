/** 화면과 서버가 같이 쓰는 순수 규칙. DB나 node 모듈을 끌어오지 않는다. */

export const ATTENDANCE_KINDS = ['결근', '연차', '병가', '반차', '지각', '조퇴', '교육'] as const;
export type AttendanceKind = typeof ATTENDANCE_KINDS[number];
/** 자리를 비우는 근태(자동으로 대체 요청), 담당자가 요청 여부를 고르는 근태(반차·조퇴·교육), 기록만 하는 근태(지각) */
export const VACATING_KINDS: AttendanceKind[] = ['결근', '연차', '병가'];
export const OPTIONAL_KINDS: AttendanceKind[] = ['반차', '조퇴', '교육'];

export type VacancyInput = { kind: string; unmanned: number; product: string | null; vacant: number; stopped: number; need?: number | null };
/** 그 자리에 필요한 인원. 정해 둔 값이 있으면 그 값, 없으면 제품이 걸린 유인 라인은 1명, 그 밖에는 0. 무인·부동은 0. */
export function needFor(p: VacancyInput, count: number): number {
  if (Number(p.unmanned) === 1 || Number(p.stopped) === 1) return 0;
  if (p.need !== null && p.need !== undefined) return Number(p.need);
  if (Number(p.vacant) === 1) return count + 1;
  return p.kind === 'machine' && p.product ? 1 : 0;
}
/** 빈 자리 판정: 있는 사람이 필요 인원보다 적을 때. 무인 라인·부동 라인은 비어 있어도 빈 자리가 아니다. */
export function isVacantPost(p: VacancyInput, count: number): boolean { return count < needFor(p, count); }

/** 설정값. 없으면 기본값(근로기준법 주 52시간, 12시간 교대, 요청 만료 20분) */
export type Settings = { expiry_minutes: number; shift_hours: number; week_max_hours: number };
export const DEFAULT_SETTINGS: Settings = { expiry_minutes: 20, shift_hours: 12, week_max_hours: 52 };
export const SETTING_RANGE: Record<keyof Settings, [number, number]> = { expiry_minutes: [5, 240], shift_hours: [4, 24], week_max_hours: [12, 84] };

/** 역할과 권한. 2공장 결정은 팀장만, 1공장 확정은 팀장·담당자, 직원·설정은 팀장·담당자. */
export type Role = '팀장' | '담당자' | '반장';
export const CAN = {
  confirm: (r: Role | undefined): boolean => r === '팀장' || r === '담당자',
  decide: (r: Role | undefined): boolean => r === '팀장',
  manage: (r: Role | undefined): boolean => r === '팀장' || r === '담당자',
};
