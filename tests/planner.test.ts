import { describe, expect, it } from 'vitest';
import { openDb } from '../src/lib/db';
import { generateDay, generateMonth } from '../src/lib/planner';
import { confirmMonth, decideUnavailable, getBoard, listProducts, monthView, removePerson, requestUnavailable, sendRequests, setProduct, setProductNeed, setSkill } from '../src/lib/repo';
import { importMonth } from '../src/lib/month-import';
import { groupsOn } from '../src/lib/shift';

/** 1공장 라인 05·07, 직책 OP. A·B·C조 각 2명(교대), 주간고정 1명, 임시 1명. */
function db() {
  const d = openDb(':memory:');
  d.prepare("INSERT INTO factories (id, code, name, sort) VALUES (1,'F1','1공장',1)").run();
  d.prepare("INSERT INTO posts (id, factory_id, code, name, kind, sort, zone, unmanned, fixed) VALUES (5,1,'05','05호기','machine',5,'PET',0,0),(7,1,'07','07호기','machine',7,'PET',0,0),(23,1,'OP','OP','op',23,'PET',0,1),(21,1,'기타','교육·선별','etc',21,'PET',0,0)").run();
  d.prepare(`INSERT INTO people (id, name, grp, work_type, unit, gender, home_factory_id) VALUES
    (1,'가A','A','교대','교대반','F',1),(2,'나A','A','교대','교대반','F',1),(3,'다B','B','교대','교대반','F',1),(4,'라B','B','교대','교대반','F',1),
    (5,'마C','C','교대','교대반','F',1),(6,'바C','C','교대','교대반','F',1),(7,'사고정','주전','주간고정','주전반','M',1),(8,'아임시','미정','임시','임시',null,1),(9,'자OP','A','교대','교대반','M',1)`).run();
  // 지난 기록: 자OP는 OP를 늘 맡았고, 가A는 05에 5번
  d.prepare("INSERT INTO boards (id, date, shift, factory_id, status) VALUES (1,'2026-10-20','주간',1,'확정')").run();
  d.prepare("INSERT INTO board_posts (board_id, post_id, product) VALUES (1,5,'1KG')").run();
  d.prepare("INSERT INTO assignments (board_id, post_id, person_id, source) VALUES (1,23,9,'이력'),(1,5,1,'이력')").run();
  for (let i = 0; i < 4; i++) { d.prepare('INSERT INTO boards (id, date, shift, factory_id, status) VALUES (?,?,?,1,?)').run(10 + i, `2026-10-1${i}`, '주간', '확정'); d.prepare("INSERT INTO board_posts (board_id, post_id, product) VALUES (?,5,'1KG')").run(10 + i); d.prepare("INSERT INTO assignments (board_id, post_id, person_id, source) VALUES (?,5,1,'이력'),(?,23,9,'이력')").run(10 + i, 10 + i); }
  return d;
}
/** 2026-11에서 A조가 주간인 첫 날 */
function aDay(): string { for (let n = 1; n <= 12; n++) { const date = `2026-11-${String(n).padStart(2, '0')}`; if (groupsOn(date).day === 'A') return date; } throw new Error(); }

describe('월 근무표 짜기', () => {
  it('생산 계획(제품·인원)이 있는 표에 그날 근무조 사람을 숙련·경험 순으로 채우고 이유를 남긴다', () => {
    const d = db(); const date = aDay();
    importMonth([{ date, shift: '주간', factory: 1, line: '05', product: '1KG', name: '', need: 2 }, { date, shift: '주간', factory: 1, line: '07', product: '옹기', name: '', need: 1 }], {}, d);
    const b = getBoard(date, '주간', 1, d);
    const r = generateDay(b.id, 'fill', d);
    const after = getBoard(date, '주간', 1, d);
    const names = (pid: number) => after.assignments.filter((a) => a.post_id === pid).map((a) => a.name).sort();
    expect(r.filled).toBe(4); // 05 두 명, 07 한 명, OP 한 명
    expect(names(5)).toContain('가A'); // 05 경험자
    expect(names(23)).toEqual(['자OP']); // 직책은 늘 맡던 사람
    expect(after.assignments.every((a) => ['가A', '나A', '자OP', '사고정', '아임시'].includes(a.name))).toBe(true); // 쉬는 조(B·C)는 안 쓴다
    expect(after.assignments.find((a) => a.name === '가A')?.reason).toContain('이 라인 5회');
    expect(after.assignments.every((a) => a.source === '자동')).toBe(true);
    expect(r.vacant).toEqual([]);
  });
  it('불가 라인·승인된 불가일은 빼고, 사람이 모자라면 못 채운 자리로 남긴다', () => {
    const d = db(); const date = aDay();
    importMonth([{ date, shift: '주간', factory: 1, line: '05', product: '1KG', name: '', need: 3 }], {}, d);
    setSkill(1, 5, '불가', d); // 가A는 05 불가
    const u = requestUnavailable(2, { kind: '요일', weekday: new Date(`${date}T00:00:00Z`).getUTCDay(), shift: '주간' }, d); decideUnavailable(u.id!, true, null, '팀장', d); // 나A는 그 요일 주간 불가
    const b = getBoard(date, '주간', 1, d);
    const r = generateDay(b.id, 'fill', d);
    const after = getBoard(date, '주간', 1, d);
    const names = after.assignments.filter((a) => a.post_id === 5).map((a) => a.name);
    expect(names).not.toContain('가A'); expect(names).not.toContain('나A');
    expect(r.vacant.length + names.length >= 1).toBe(true);
    expect(r.vacant.find((v) => v.code === '05')?.missing ?? 0).toBe(3 - names.length);
  });
  it('다시 짜기는 자동 자리만 바꾸고 직접 넣은 자리는 둔다 · 월 단위 짜기·보기·확정', () => {
    const d = db(); const date = aDay();
    importMonth([{ date, shift: '주간', factory: 1, line: '05', product: '1KG', name: '', need: 2 }], {}, d);
    const b = getBoard(date, '주간', 1, d);
    d.prepare("INSERT INTO assignments (board_id, post_id, person_id, source) VALUES (?,5,2,'수동')").run(b.id); // 나A 직접 넣음
    const r = generateMonth('2026-11', 1, 'redo', d);
    expect(r.boards).toBe(1); expect(r.filled).toBe(2); // 05 한 명 더 + OP
    const after = getBoard(date, '주간', 1, d);
    expect(after.assignments.find((a) => a.name === '나A')?.source).toBe('수동');
    const cell = monthView('2026-11', 1, d).find((c) => c.date === date && c.shift === '주간')!;
    expect(cell.status).toBe('초안'); expect(cell.workers).toBe(3); expect(cell.vacant).toBe(0); expect(cell.auto).toBe(2);
    const c = confirmMonth('2026-11', 1, d);
    expect(c.boards).toBe(1); expect(c.notified).toBe(3);
    expect(monthView('2026-11', 1, d).find((x) => x.date === date && x.shift === '주간')!.status).toBe('확정');
    // 확정 뒤 빼면 그 사람에게 변경 알림
    removePerson(b.id, 5, 2, false, d);
    const msg = d.prepare("SELECT body FROM messages WHERE person_id=2 AND kind='변경' ORDER BY id DESC LIMIT 1").get() as { body: string } | undefined;
    expect(msg?.body).toContain('빠졌습니다');
  });
  it('제품별 표준 인원을 정하면 제품을 고를 때 그 인원이 필요 인원이 된다', () => {
    const d = db(); const date = aDay();
    const b = getBoard(date, '주간', 1, d);
    setProduct(b.id, 5, '1KG', d);
    expect(getBoard(date, '주간', 1, d).posts.find((p) => p.id === 5)?.need).toBe(1); // 05에 1KG 기록상 1명
    setProductNeed(1, '1KG', 3, d);
    setProduct(b.id, 5, '옹기', d); setProduct(b.id, 5, '1KG', d);
    expect(getBoard(date, '주간', 1, d).posts.find((p) => p.id === 5)?.need).toBe(3);
    setProduct(b.id, 7, '1KG', d); // 기록 없는 라인도 표준 인원
    expect(getBoard(date, '주간', 1, d).posts.find((p) => p.id === 7)?.need).toBe(3);
    expect(listProducts(1, d).find((p) => p.name === '1KG')?.need).toBe(3);
  });

  it('생산 계획이 없는 날은 짜지 않고, 대체 요청을 기다리는 자리는 건드리지 않는다', () => {
    const d = db(); const date = aDay();
    const empty = getBoard(date, '주간', 1, d);
    expect(generateDay(empty.id, 'fill', d)).toMatchObject({ filled: 0, noPlan: true });
    importMonth([{ date, shift: '주간', factory: 1, line: '05', product: '1KG', name: '', need: 1 }], {}, d);
    const b = getBoard(date, '주간', 1, d);
    sendRequests(b.id, 5, null, d); // 05에 요청이 나가 있음
    const r = generateDay(b.id, 'fill', d);
    expect(r.skippedWaiting).toBe(1);
    expect(getBoard(date, '주간', 1, d).assignments.filter((a) => a.post_id === 5).length).toBe(0);
  });
});
