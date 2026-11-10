import { describe, it, expect } from 'vitest';
import { aggregateExperience, assignmentMessage, availability, rankCandidates, typicalHeadcount, type Person, type SkillLevel, type SkillMap } from '../src/lib/engine';
import { addDays, dayTypeOf, groupsOn, sameGroupBefore, REFERENCE_DATE } from '../src/lib/shift';

const DATE = '2026-10-30';
const g = groupsOn(DATE);
const P = (o: Partial<Person> & { id: number; name: string }): Person => ({ grp: '미정', work_type: '임시', active: 1, ...o });

describe('교대 패턴', () => {
  it('매일 주·야·휴 조가 하나씩', () => {
    for (let i = 0; i < 36; i++) {
      const d = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
      expect((['A', 'B', 'C'] as const).map((x) => dayTypeOf(x, d)).sort().join('')).toBe('야주휴');
    }
  });
});
describe('투입 가능', () => {
  it('휴무조 가능, 근무조 불가, 주간고정은 주간만', () => {
    expect(availability(P({ id: 1, name: 'a', grp: g.off, work_type: '교대' }), DATE, '주간').ok).toBe(true);
    expect(availability(P({ id: 2, name: 'b', grp: g.day, work_type: '교대' }), DATE, '주간').ok).toBe(false);
    expect(availability(P({ id: 3, name: 'c', grp: g.night, work_type: '교대' }), DATE, '주간').ok).toBe(false);
    expect(availability(P({ id: 4, name: 'd', grp: '주전', work_type: '주간고정' }), DATE, '야간').ok).toBe(false);
  });
});
describe('후보 순위', () => {
  const people = [P({ id: 1, name: '자리', grp: g.off, work_type: '교대' }), P({ id: 2, name: '제품', grp: g.off, work_type: '교대' }), P({ id: 3, name: '공장', grp: g.off, work_type: '교대' }), P({ id: 4, name: '근무중', grp: g.day, work_type: '교대' }), P({ id: 5, name: '무경험', grp: g.off, work_type: '교대' }), P({ id: 6, name: '배치됨', grp: g.off, work_type: '교대' })];
  const experience = [{ personId: 1, postId: 10, product: 'x', count: 12 }, { personId: 2, postId: 11, product: 'x', count: 20 }, { personId: 3, postId: 11, product: 'y', count: 30 }, { personId: 4, postId: 10, product: 'x', count: 50 }, { personId: 6, postId: 10, product: 'x', count: 50 }];
  const base = { date: DATE, shift: '주간' as const, postId: 10, product: 'x', people, experience, assignedThatDay: new Set([6]), recentSubs: new Map<number, number>() };
  it('자리 → 제품 → 공장 순', () => { expect(rankCandidates(base).map((c) => c.name)).toEqual(['자리', '제품', '공장']); });
  it('이번 주 근무시간을 이유에 쓰고, 한 교대 더하면 상한을 넘는 사람은 뺀다', () => {
    const weekHours = new Map([[1, 48], [2, 36], [3, 0]]);
    const n = rankCandidates({ ...base, weekHours, shiftHours: 12, maxWeekHours: 52, limit: 10 });
    expect(n.map((c) => c.name)).toEqual(['제품', '공장']);
    expect(n[0].reasons).toContain('이번 주 36시간');
    expect(n[1].reasons).toContain('이번 주 0시간');
  });
  it('근무중·배치됨·무경험 제외', () => { const n = rankCandidates({ ...base, limit: 10 }).map((c) => c.name); expect(n).not.toContain('근무중'); expect(n).not.toContain('배치됨'); expect(n).not.toContain('무경험'); });
  it('최근 대체가 많으면 뒤로', () => { expect(rankCandidates({ ...base, recentSubs: new Map([[1, 5]]) })[0].name).toBe('제품'); });
});
describe('집계·문구', () => {
  it('집계', () => { expect(aggregateExperience([{ personId: 1, postId: 1, product: 'a' }, { personId: 1, postId: 1, product: 'a' }])[0].count).toBe(2); });
  it('문구', () => { expect(assignmentMessage({ date: DATE, shift: '야간', factory: '2공장', post: 'S-3호', product: '간장840' })).toBe('[배치 안내] 10/30 야간 2공장 S-3호 간장840'); });
});

describe('sameGroupBefore', () => {
  // 기준일(REFERENCE_DATE)부터 4일은 한 조가 주간, 5일째에 다른 조로 바뀐다
  const R = (n: number): string => addDays(REFERENCE_DATE, n);
  it('조가 바뀐 날은 같은 조가 마지막으로 그 근무를 한 날의 표를 고른다', () => {
    const dates = Array.from({ length: 12 }, (_, i) => R(3 - i)); // 최신순: R+3 … R-8
    const d = R(4);
    const pick = sameGroupBefore(d, '주간', dates)!;
    expect(groupsOn(pick).day).toBe(groupsOn(d).day);
    expect(pick).not.toBe(R(3));
  });
  it('같은 조 근무 블록 안에서는 어제 표를 고른다', () => {
    expect(sameGroupBefore(R(2), '주간', [R(1), R(0)])).toBe(R(1));
  });
  it('맞는 날이 없으면 가장 최근 표', () => {
    expect(sameGroupBefore(R(4), '주간', [R(3)])).toBe(R(3));
  });
});

describe('typicalHeadcount', () => {
  it('최빈값을 고르고, 같으면 큰 쪽', () => {
    expect(typicalHeadcount([1, 2, 2, 1, 2])).toBe(2);
    expect(typicalHeadcount([1, 2])).toBe(2);
  });
  it('이력이 없으면 기본값, 1~4명으로 제한', () => {
    expect(typicalHeadcount([])).toBe(1);
    expect(typicalHeadcount([7, 7])).toBe(4);
  });
});

describe('라인 숙련도', () => {
  const base = { date: '2025-11-12', shift: '주간' as const, postId: 5, product: null, assignedThatDay: new Set<number>(), recentSubs: new Map<number, number>() };
  // 2025-11-12: B 주간 · A 야간 · C 휴무 → C조만 후보
  const people = [
    { id: 1, name: '김숙련', grp: 'C', work_type: '교대' as const, active: 1 },
    { id: 2, name: '이불가', grp: 'C', work_type: '교대' as const, active: 1 },
    { id: 3, name: '박기록없음', grp: 'C', work_type: '교대' as const, active: 1 },
  ];
  const experience = [{ personId: 2, postId: 5, product: null, count: 9 }, { personId: 1, postId: 5, product: null, count: 1 }];
  it('불가로 정한 사람은 기록이 많아도 빠지고, 숙련은 앞에 선다', () => {
    const skills: SkillMap = new Map([[2, new Map<number, SkillLevel>([[5, '불가']])], [1, new Map<number, SkillLevel>([[5, '숙련']])]]);
    const r = rankCandidates({ ...base, people, experience, skills, limit: 5 });
    expect(r.map((c) => c.name)).toEqual(['김숙련']);
    expect(r[0].reasons).toContain('이 라인 숙련');
  });
  it('가능으로 정하면 기록이 없어도 후보가 된다', () => {
    const skills: SkillMap = new Map([[3, new Map<number, SkillLevel>([[5, '가능']])]]);
    const r = rankCandidates({ ...base, people, experience, skills, limit: 5 });
    expect(r.map((c) => c.name)).toEqual(['이불가', '김숙련', '박기록없음']); // 숙련도를 안 정한 이불가는 기록 9회로 1등
  });
});
