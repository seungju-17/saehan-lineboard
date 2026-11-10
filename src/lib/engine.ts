import { groupsOn, type Shift } from './shift';

export type Person = { id: number; name: string; grp: string; work_type: '교대' | '주간고정' | '임시'; active: number; role?: string | null };
export type Experience = { personId: number; postId: number; product: string | null; count: number };
export type Candidate = { personId: number; name: string; score: number; reasons: string[] };
/** 사람별·라인별 숙련도. 불가면 후보에서 빠지고, 숙련이면 앞에 선다. 정하지 않은 라인은 과거 기록으로만 본다. */
export type SkillLevel = '불가' | '가능' | '숙련';
export type SkillMap = Map<number, Map<number, SkillLevel>>;

export function availability(p: Person, date: string, shift: Shift): { ok: boolean; why: string } {
  if (!p.active) return { ok: false, why: '퇴사' };
  if (p.work_type === '주간고정') return shift === '주간' ? { ok: true, why: '주간 고정' } : { ok: false, why: '주간 고정 (야간 불가)' };
  if (p.work_type === '임시' || !['A', 'B', 'C'].includes(p.grp)) return { ok: true, why: '임시·지원' };
  const g = groupsOn(date);
  if (p.grp === g.off) return { ok: true, why: `${p.grp}조 휴무` };
  if ((shift === '주간' && p.grp === g.day) || (shift === '야간' && p.grp === g.night)) return { ok: false, why: `${p.grp}조 근무 중` };
  return { ok: false, why: `${p.grp}조 다른 교대 (연속 근무 불가)` };
}

/** 빈자리 후보: 그 자리 경험 → 같은 제품 → 이 공장 경험, 최근 대체 투입은 감점 */
export function rankCandidates(i: {
  date: string; shift: Shift; postId: number; product: string | null; people: Person[]; experience: Experience[];
  assignedThatDay: Set<number>; excludeIds?: Set<number>; recentSubs: Map<number, number>; limit?: number; requireExperience?: boolean;
  /** 이번 주 근무시간(교대 수 × 한 교대 시간). 있으면 이유에 표시하고, 한 교대를 더해 상한을 넘는 사람은 뺀다 */
  weekHours?: Map<number, number>; shiftHours?: number; maxWeekHours?: number;
  skills?: SkillMap;
}): Candidate[] {
  const byP = new Map<number, Experience[]>();
  for (const e of i.experience) { if (!byP.has(e.personId)) byP.set(e.personId, []); byP.get(e.personId)!.push(e); }
  const out: Candidate[] = [];
  for (const p of i.people) {
    if (i.excludeIds?.has(p.id) || i.assignedThatDay.has(p.id)) continue;
    const av = availability(p, i.date, i.shift);
    if (!av.ok) continue;
    const lv = i.skills?.get(p.id)?.get(i.postId);
    if (lv === '불가') continue; // 이 라인은 못 하는 사람
    const rows = byP.get(p.id) ?? [];
    const post = rows.filter((r) => r.postId === i.postId).reduce((s, r) => s + r.count, 0);
    const prod = i.product ? rows.filter((r) => r.product === i.product).reduce((s, r) => s + r.count, 0) : 0;
    const fac = rows.reduce((s, r) => s + r.count, 0);
    if ((i.requireExperience ?? true) && fac === 0 && !lv) continue; // 기록도 없고 숙련도도 안 정했으면 뺀다
    const recent = i.recentSubs.get(p.id) ?? 0;
    const hours = i.weekHours?.get(p.id) ?? 0;
    if (i.weekHours && i.maxWeekHours && hours + (i.shiftHours ?? 12) > i.maxWeekHours) continue;
    const reasons = [av.why];
    if (lv) reasons.push(lv === '숙련' ? '이 라인 숙련' : '이 라인 가능');
    if (i.weekHours) reasons.push(`이번 주 ${hours}시간`);
    if (post) reasons.push(`이 라인 ${post}회`);
    if (prod) reasons.push(`같은 제품 ${prod}회`);
    if (!post && fac) reasons.push(`이 공장 ${fac}회`);
    if (recent) reasons.push(`최근 대체 ${recent}회`);
    out.push({ personId: p.id, name: p.name, score: post * 10 + prod * 3 + fac - recent * 25 + (lv === '숙련' ? 40 : lv === '가능' ? 5 : 0), reasons });
  }
  out.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'ko'));
  return out.slice(0, i.limit ?? 3);
}

export function aggregateExperience(rows: { personId: number; postId: number; product: string | null }[]): Experience[] {
  const m = new Map<string, Experience>();
  for (const r of rows) {
    const k = `${r.personId}|${r.postId}|${r.product ?? ''}`;
    const e = m.get(k); if (e) e.count++; else m.set(k, { personId: r.personId, postId: r.postId, product: r.product, count: 1 });
  }
  return [...m.values()];
}

const md = (d: string): string => `${+d.slice(5, 7)}/${+d.slice(8, 10)}`;
export function assignmentMessage(a: { date: string; shift: Shift; factory: string; post: string; product: string | null; changed?: boolean }): string {
  return `${a.changed ? '[배치 변경]' : '[배치 안내]'} ${md(a.date)} ${a.shift} ${a.factory} ${a.post}${a.product ? ' ' + a.product : ''}`;
}
export function requestMessage(a: { date: string; shift: Shift; factory: string; post: string; product: string | null }): string {
  return `[대체 근무 요청] ${md(a.date)} ${a.shift} ${a.factory} ${a.post}${a.product ? ' ' + a.product : ''} — 가능하시면 수락을 눌러 주세요`;
}

/** 과거 표에서 그 라인·제품에 보통 몇 명이 섰는지. 최빈값, 같으면 큰 쪽. 1~4명으로 제한. */
export function typicalHeadcount(counts: number[], fallback = 1): number {
  if (counts.length === 0) return fallback;
  const freq = new Map<number, number>();
  for (const c of counts) freq.set(c, (freq.get(c) ?? 0) + 1);
  let best = fallback, bestF = 0;
  for (const [c, f] of freq) if (f > bestF || (f === bestF && c > best)) { best = c; bestF = f; }
  return Math.min(4, Math.max(1, best));
}

/** 월 근무표 짜기용 자리 점수. 그날 출근하는 사람(근무조·주간고정·임시) 중에서 한 자리에 세울 사람을 고른다.
 *  불가 라인은 제외, 숙련·경험은 가산, 이번 달 야간·주말·배치 횟수가 많을수록 감점해 형평을 맞춘다. */
export type SlotCounters = { shifts: number; nights: number; weekends: number };
export function rankForSlot(i: {
  postId: number; product: string | null; pool: Person[]; experience: Experience[]; skills?: SkillMap;
  counters: Map<number, SlotCounters>; isNight: boolean; isWeekend: boolean; fairNight: boolean; fairWeekend: boolean;
  /** 직책 자리면 그 자리를 가장 많이 맡았던 사람을 우선 */
  fixedPreference?: Map<number, number>;
}): { personId: number; score: number; reason: string }[] {
  const byP = new Map<number, Experience[]>();
  for (const e of i.experience) { if (!byP.has(e.personId)) byP.set(e.personId, []); byP.get(e.personId)!.push(e); }
  const out: { personId: number; score: number; reason: string }[] = [];
  for (const p of i.pool) {
    const lv = i.skills?.get(p.id)?.get(i.postId);
    if (lv === '불가') continue;
    const rows = byP.get(p.id) ?? [];
    const post = rows.filter((r) => r.postId === i.postId).reduce((s, r) => s + r.count, 0);
    const prod = i.product ? rows.filter((r) => r.product === i.product).reduce((s, r) => s + r.count, 0) : 0;
    const c = i.counters.get(p.id) ?? { shifts: 0, nights: 0, weekends: 0 };
    let score = post * 10 + prod * 3 + (lv === '숙련' ? 40 : lv === '가능' ? 5 : 0) + (i.fixedPreference?.get(p.id) ?? 0) * 50;
    const why: string[] = [];
    if (lv) why.push(lv === '숙련' ? '이 라인 숙련' : '이 라인 가능');
    if (post) why.push(`이 라인 ${post}회`);
    if (prod) why.push(`같은 제품 ${prod}회`);
    if (i.fairNight && i.isNight) { score -= c.nights * 4; if (c.nights) why.push(`이번 달 야간 ${c.nights}회`); }
    if (i.fairWeekend && i.isWeekend) { score -= c.weekends * 4; if (c.weekends) why.push(`이번 달 주말 ${c.weekends}회`); }
    score -= c.shifts; // 같은 조건이면 이번 달 덜 선 사람부터
    out.push({ personId: p.id, score, reason: why.join(' · ') || '이번 달 배치 적음' });
  }
  out.sort((a, b) => b.score - a.score || a.personId - b.personId);
  return out;
}
