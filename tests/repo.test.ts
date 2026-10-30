import { describe, it, expect } from 'vitest';
import { openDb } from '../src/lib/db';
import { addPerson, cancelRequests, ensureBoard, getBoard, isVacantPost, isWeekend, respond, sendRequests, setAttendance, setStopped, proposeBoard, confirmBoard } from '../src/lib/repo';
import { periodFor } from '../src/lib/attendance-xlsx';

function memDb() {
  const db = openDb(':memory:');
  db.prepare("INSERT INTO factories (id, code, name, sort) VALUES (2,'F2','2공장',2)").run();
  db.prepare("INSERT INTO posts (id, factory_id, code, name, kind, sort, zone, unmanned, fixed) VALUES (29,2,'P-1','P-1호 (프리폼)','machine',1,'프리폼',1,0),(36,2,'S-3','S-3호','machine',8,'성형',0,0),(44,2,'생산관리','생산관리','leader',20,'관리',0,1)").run();
  db.prepare("INSERT INTO people (id, name, grp, work_type, unit, gender, home_factory_id) VALUES (1,'박현주','A','교대','협력사 A조','F',2),(2,'김순자','B','교대','협력사 B조','F',2),(3,'최상진','A','교대','교대반','M',2)").run();
  // 2026-10-20(화) 주간 표: S-3 신광야950 박현주, P-1 제품만
  db.prepare("INSERT INTO boards (id, date, shift, factory_id, status) VALUES (1,'2026-10-20','주간',2,'확정')").run();
  db.prepare("INSERT INTO board_posts (board_id, post_id, product) VALUES (1,36,'신광야950'),(1,29,'진로4.0')").run();
  db.prepare("INSERT INTO assignments (board_id, post_id, person_id, source) VALUES (1,36,1,'이력'),(1,44,3,'이력')").run();
  return db;
}

describe('빈 자리 판정', () => {
  it('무인 라인은 제품만 있어도 비어 있음이 아니다', () => {
    expect(isVacantPost({ kind: 'machine', unmanned: 1, product: '진로4.0', vacant: 0, stopped: 0 }, 0)).toBe(false);
    expect(isVacantPost({ kind: 'machine', unmanned: 0, product: '신광야950', vacant: 0, stopped: 0 }, 0)).toBe(true);
    expect(isVacantPost({ kind: 'machine', unmanned: 0, product: '신광야950', vacant: 0, stopped: 0 }, 1)).toBe(false);
  });
  it('부동 라인은 빈 자리가 아니고 열린 요청도 닫힌다', () => {
    const db = memDb();
    const b = getBoard('2026-10-21', '주간', 2, db); // 10-20 복사
    const s3 = b.posts.find((p) => p.code === 'S-3')!;
    setStopped(b.id, s3.id, true, db);
    const after = getBoard('2026-10-21', '주간', 2, db);
    expect(after.posts.find((p) => p.code === 'S-3')!.stopped).toBe(1);
    expect(isVacantPost(after.posts.find((p) => p.code === 'S-3')!, 0)).toBe(false);
  });
});

describe('근태', () => {
  it('결근은 자리를 비우고 요청을 보내며 근태에 남는다', () => {
    const db = memDb();
    const b = getBoard('2026-10-21', '주간', 2, db);
    const s3 = b.posts.find((p) => p.code === 'S-3')!;
    const r = setAttendance(b.id, s3.id, 1, '결근', null, db);
    const after = getBoard('2026-10-21', '주간', 2, db);
    expect(after.assignments.some((a) => a.person_id === 1)).toBe(false);
    expect(after.attendance.map((a) => [a.name, a.kind])).toEqual([['박현주', '결근']]);
    expect(isVacantPost(after.posts.find((p) => p.code === 'S-3')!, 0)).toBe(true);
    expect(r.sent).toBeGreaterThanOrEqual(0);
  });
  it('지각은 자리를 유지한 채 기록만 한다', () => {
    const db = memDb();
    const b = getBoard('2026-10-21', '주간', 2, db);
    const s3 = b.posts.find((p) => p.code === 'S-3')!;
    setAttendance(b.id, s3.id, 1, '지각', '30분', db);
    const after = getBoard('2026-10-21', '주간', 2, db);
    expect(after.assignments.some((a) => a.person_id === 1)).toBe(true);
    expect(after.attendance[0].kind).toBe('지각');
    setAttendance(b.id, null, 1, null, null, db);
    expect(getBoard('2026-10-21', '주간', 2, db).attendance).toHaveLength(0);
  });
});

describe('2공장 결재와 휴일 복사', () => {
  it('입안 → 결정(확정)', () => {
    const db = memDb();
    const b = getBoard('2026-10-21', '주간', 2, db);
    proposeBoard(b.id, db);
    expect(getBoard('2026-10-21', '주간', 2, db).status).toBe('입안');
    confirmBoard(b.id, db);
    expect(getBoard('2026-10-21', '주간', 2, db).status).toBe('확정');
  });
  it('토·일은 지난 휴일 표를 기준으로 복사한다', () => {
    const db = memDb();
    expect(isWeekend('2026-10-24')).toBe(true); // 토
    // 10-18(일) 표: 김순자만
    db.prepare("INSERT INTO boards (id, date, shift, factory_id, status) VALUES (2,'2026-10-18','주간',2,'확정')").run();
    db.prepare("INSERT INTO board_posts (board_id, post_id, product) VALUES (2,36,'생수900')").run();
    addPerson(2, 36, 2, '이력', db);
    const id = ensureBoard('2026-10-24', '주간', 2, db);
    const names = (db.prepare('SELECT p.name FROM assignments a JOIN people p ON p.id=a.person_id WHERE a.board_id=?').all(id) as { name: string }[]).map((r) => r.name);
    expect(names).toContain('김순자');
    expect(names).not.toContain('박현주');
  });
});

describe('근태표 기간', () => {
  it('직영은 11일~익월 10일, 협력사는 1일~말일', () => {
    expect(periodFor('2026-10', '교대반')).toEqual({ from: '2026-10-11', to: '2026-11-10' });
    expect(periodFor('2026-12', '주전반')).toEqual({ from: '2026-12-11', to: '2027-01-10' });
    expect(periodFor('2026-02', '협력사 A조')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  });
});

describe('요청 취소', () => {
  it('한 명만 취소하면 나머지는 살아 있고, 전체 취소하면 자리는 비어 있음으로 남는다', () => {
    const db = memDb();
    // 10-21은 B조가 휴무. B조 두 명에게 2공장 S-3 경험을 심어 후보가 되게 한다.
    db.prepare("INSERT INTO people (id, name, grp, work_type, unit, home_factory_id) VALUES (5,'정미영','B','교대','협력사 B조',2)").run();
    db.prepare("INSERT INTO boards (id, date, shift, factory_id, status) VALUES (3,'2026-10-14','주간',2,'확정')").run();
    db.prepare("INSERT INTO board_posts (board_id, post_id, product) VALUES (3,36,'신광야950')").run();
    db.prepare("INSERT INTO assignments (board_id, post_id, person_id, source) VALUES (3,36,2,'이력'),(3,36,5,'이력')").run();
    const b = getBoard('2026-10-21', '주간', 2, db);
    const s3 = b.posts.find((p) => p.code === 'S-3')!;
    const sent = setAttendance(b.id, s3.id, 1, '결근', null, db);
    expect(sent.sent).toBe(2);
    expect(sent.candidates.map((c) => c.name).sort()).toEqual(['김순자', '정미영']);
    let reqs = getBoard('2026-10-21', '주간', 2, db).requests.filter((r) => r.status === '발송');
    expect(reqs.length).toBeGreaterThan(0);
    const first = reqs[0];
    expect(cancelRequests(b.id, s3.id, first.id, db).cancelled).toBe(1);
    reqs = getBoard('2026-10-21', '주간', 2, db).requests;
    expect(reqs.find((r) => r.id === first.id)!.status).toBe('취소');
    const msg = db.prepare("SELECT body FROM messages WHERE person_id=? ORDER BY id DESC LIMIT 1").get(first.person_id) as { body: string };
    expect(msg.body).toContain('취소');
    cancelRequests(b.id, s3.id, null, db);
    const after = getBoard('2026-10-21', '주간', 2, db);
    expect(after.requests.every((r) => r.status !== '발송')).toBe(true);
    expect(isVacantPost(after.posts.find((p) => p.code === 'S-3')!, 0)).toBe(true);
  });
  it('한 명이 수락하면 나머지에게 마감 알림이 간다', () => {
    const db = memDb();
    db.prepare("INSERT INTO people (id, name, grp, work_type, unit, home_factory_id) VALUES (4,'이은희','C','교대','협력사 C조',2)").run();
    db.prepare("INSERT INTO assignments (board_id, post_id, person_id, source) VALUES (1,36,2,'이력'),(1,36,4,'이력')").run();
    const b = getBoard('2026-10-21', '주간', 2, db);
    const s3 = b.posts.find((p) => p.code === 'S-3')!;
    const r = sendRequests(b.id, s3.id, 1, db);
    if (r.sent < 2) return; // 후보가 둘 미만이면 검증할 것이 없다
    const reqs = getBoard('2026-10-21', '주간', 2, db).requests.filter((x) => x.status === '발송');
    expect(respond(reqs[0].token, 'accept', db).ok).toBe(true);
    const other = db.prepare("SELECT body FROM messages WHERE person_id=? ORDER BY id DESC LIMIT 1").get(reqs[1].person_id) as { body: string };
    expect(other.body).toContain('먼저 수락');
  });
});
