import { describe, it, expect } from 'vitest';
import { aggregateExperience, assignmentMessage, availability, rankCandidates, type Person } from '../src/lib/engine';
import { dayTypeOf, groupsOn, sameGroupBefore } from '../src/lib/shift';

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
  it('근무중·배치됨·무경험 제외', () => { const n = rankCandidates({ ...base, limit: 10 }).map((c) => c.name); expect(n).not.toContain('근무중'); expect(n).not.toContain('배치됨'); expect(n).not.toContain('무경험'); });
  it('최근 대체가 많으면 뒤로', () => { expect(rankCandidates({ ...base, recentSubs: new Map([[1, 5]]) })[0].name).toBe('제품'); });
});
describe('집계·문구', () => {
  it('집계', () => { expect(aggregateExperience([{ personId: 1, postId: 1, product: 'a' }, { personId: 1, postId: 1, product: 'a' }])[0].count).toBe(2); });
  it('문구', () => { expect(assignmentMessage({ date: DATE, shift: '야간', factory: '2공장', post: 'S-3호', product: '간장840' })).toBe('[배치 안내] 10/30 야간 2공장 S-3호 간장840'); });
});

describe('sameGroupBefore', () => {
  it('조가 바뀐 날은 같은 조가 마지막으로 그 근무를 한 날의 표를 고른다', () => {
    // 2026-01-05: B조 주간 4일째(01-01~01-04) 다음날 → A조 주간 시작
    const dates = ['2026-01-04', '2026-01-03', '2026-01-02', '2026-01-01', '2025-12-31', '2025-12-30', '2025-12-29', '2025-12-28', '2025-12-27', '2025-12-26', '2025-12-25', '2025-12-24'];
    const d = '2026-01-05';
    const pick = sameGroupBefore(d, '주간', dates)!;
    expect(groupsOn(pick).day).toBe(groupsOn(d).day);
    expect(pick).not.toBe('2026-01-04');
  });
  it('같은 조 근무 블록 안에서는 어제 표를 고른다', () => {
    expect(sameGroupBefore('2026-01-03', '주간', ['2026-01-02', '2026-01-01'])).toBe('2026-01-02');
  });
  it('맞는 날이 없으면 가장 최근 표', () => {
    expect(sameGroupBefore('2026-01-05', '주간', ['2026-01-04'])).toBe('2026-01-04');
  });
});
