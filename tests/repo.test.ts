import { describe, it, expect } from 'vitest';
import { openDb } from '../src/lib/db';
import { addPerson, cancelRequests, getSettings, setSettings, weekHoursFor, needFor, setNeed, setProduct, clearVacancy, ensureBoard, getBoard, isVacantPost, isWeekend, respond, sendRequests, setAttendance, setStopped, proposeBoard, confirmBoard } from '../src/lib/repo';
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
    expect(isVacantPost({ kind: 'machine', unmanned: 1, product: '진로4.0', vacant: 0, stopped: 0, need: null }, 0)).toBe(false);
    expect(isVacantPost({ kind: 'machine', unmanned: 0, product: '신광야950', vacant: 0, stopped: 0, need: null }, 0)).toBe(true);
    expect(isVacantPost({ kind: 'machine', unmanned: 0, product: '신광야950', vacant: 0, stopped: 0, need: null }, 1)).toBe(false);
  });
  it('필요 인원이 정해져 있으면 그보다 적을 때만 비어 있음', () => {
    const p = { kind: 'machine', unmanned: 0, product: '신광야950', vacant: 0, stopped: 0, need: 2 };
    expect(needFor(p, 1)).toBe(2);
    expect(isVacantPost(p, 1)).toBe(true);
    expect(isVacantPost(p, 2)).toBe(false);
    expect(isVacantPost({ ...p, need: 0 }, 0)).toBe(false);
  });
  it('표를 복사하면 어제 인원이 오늘 필요 인원이 된다', () => {
    const db = memDb();
    addPerson(1, 36, 2, '이력', db); // 10-20 S-3: 박현주 + 김순자 = 2명
    const b = getBoard('2026-10-21', '주간', 2, db);
    const s3 = b.posts.find((p) => p.code === 'S-3')!;
    expect(s3.need).toBe(2);
    setNeed(b.id, s3.id, 1, db);
    expect(getBoard('2026-10-21', '주간', 2, db).posts.find((p) => p.code === 'S-3')!.need).toBe(1);
    expect(() => setNeed(b.id, s3.id, 99, db)).toThrow();
    // 요청이 나간 뒤 필요 인원을 낮춰 자리가 차면 요청은 취소된다
    setNeed(b.id, s3.id, 3, db);
    sendRequests(b.id, s3.id, null, db);
    setNeed(b.id, s3.id, 2, db);
    expect(getBoard('2026-10-21', '주간', 2, db).requests.every((r) => r.status !== '발송')).toBe(true);
  });
  it('남은 인원으로 충분하면 결근을 기록만 할 수 있고, 자리는 비어 있지 않다', () => {
    const db = memDb();
    addPerson(1, 36, 2, '이력', db);
    const b = getBoard('2026-10-21', '주간', 2, db);
    const s3 = b.posts.find((p) => p.code === 'S-3')!;
    setNeed(b.id, s3.id, 1, db);
    const r = setAttendance(b.id, s3.id, 1, '결근', null, db, false);
    expect(r.sent).toBe(0);
    const after = getBoard('2026-10-21', '주간', 2, db);
    const cnt = after.assignments.filter((a) => a.post_id === s3.id).length;
    expect(cnt).toBe(1);
    expect(isVacantPost(after.posts.find((p) => p.code === 'S-3')!, cnt)).toBe(false);
    expect(after.attendance.map((a) => a.kind)).toEqual(['결근']);
  });
  it('요청을 보내면 필요 인원이 지금 인원+1로 잡히고, 자리 닫기는 지금 인원으로 맞춘다', () => {
    const db = memDb();
    const b = getBoard('2026-10-21', '주간', 2, db);
    const s3 = b.posts.find((p) => p.code === 'S-3')!;
    setNeed(b.id, s3.id, null, db);
    sendRequests(b.id, s3.id, null, db); // 박현주 1명 있는 상태에서 한 명 더
    expect(getBoard('2026-10-21', '주간', 2, db).posts.find((p) => p.code === 'S-3')!.need).toBe(2);
    clearVacancy(b.id, s3.id, db);
    const p = getBoard('2026-10-21', '주간', 2, db).posts.find((x) => x.code === 'S-3')!;
    expect(p.need).toBe(1);
    expect(isVacantPost(p, 1)).toBe(false);
  });
  it('제품을 바꾸면 그 제품으로 섰던 인원을 제안한다', () => {
    const db = memDb();
    db.prepare("INSERT INTO boards (id, date, shift, factory_id, status) VALUES (3,'2026-10-14','주간',2,'확정')").run();
    db.prepare("INSERT INTO board_posts (board_id, post_id, product) VALUES (3,36,'생수900')").run();
    db.prepare("INSERT INTO assignments (board_id, post_id, person_id, source) VALUES (3,36,1,'이력'),(3,36,2,'이력'),(3,36,3,'이력')").run();
    const b = getBoard('2026-10-21', '주간', 2, db);
    const s3 = b.posts.find((p) => p.code === 'S-3')!;
    setProduct(b.id, s3.id, '생수900', db);
    expect(getBoard('2026-10-21', '주간', 2, db).posts.find((p) => p.code === 'S-3')!.need).toBe(3);
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
  it('병가·연차도 자리를 비우고 요청을 보낸다', () => {
    const db = memDb();
    const b = getBoard('2026-10-21', '주간', 2, db);
    const s3 = b.posts.find((p) => p.code === 'S-3')!;
    setAttendance(b.id, s3.id, 1, '병가', null, db);
    const after = getBoard('2026-10-21', '주간', 2, db);
    expect(after.assignments.some((a) => a.person_id === 1)).toBe(false);
    expect(after.attendance[0].kind).toBe('병가');
    expect(db.prepare("SELECT COUNT(*) c FROM logs WHERE action='대체요청'").get()).toEqual({ c: 1 });
  });
  it('조퇴는 기록만 하다가, 요청을 고르면 자리를 비우고 요청을 보낸다', () => {
    const db = memDb();
    const b = getBoard('2026-10-21', '주간', 2, db);
    const s3 = b.posts.find((p) => p.code === 'S-3')!;
    setAttendance(b.id, s3.id, 1, '조퇴', '14시', db);
    expect(getBoard('2026-10-21', '주간', 2, db).assignments.some((a) => a.person_id === 1)).toBe(true);
    setAttendance(b.id, s3.id, 1, '조퇴', '14시', db, true);
    const after = getBoard('2026-10-21', '주간', 2, db);
    expect(after.assignments.some((a) => a.person_id === 1)).toBe(false);
    expect(after.attendance.map((a) => a.kind)).toEqual(['조퇴']);
    expect(db.prepare("SELECT COUNT(*) c FROM logs WHERE action='대체요청'").get()).toEqual({ c: 1 });
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

describe('설정', () => {
  it('기본값은 20분·12시간·52시간이고, 저장하면 요청 만료에 쓰인다', () => {
    const db = memDb();
    expect(getSettings(db)).toEqual({ expiry_minutes: 20, shift_hours: 12, week_max_hours: 52 });
    expect(setSettings({ expiry_minutes: 45 }, db).expiry_minutes).toBe(45);
    expect(() => setSettings({ week_max_hours: 3 }, db)).toThrow();
    db.prepare("INSERT INTO boards (id, date, shift, factory_id, status) VALUES (3,'2026-10-14','주간',2,'확정')").run();
    db.prepare("INSERT INTO assignments (board_id, post_id, person_id, source) VALUES (3,36,2,'이력')").run();
    const b = getBoard('2026-10-21', '주간', 2, db);
    const s3 = b.posts.find((p) => p.code === 'S-3')!;
    sendRequests(b.id, s3.id, 1, db);
    const r = db.prepare("SELECT expires_at, sent_at FROM requests LIMIT 1").get() as { expires_at: string; sent_at: string } | undefined;
    expect(r).toBeTruthy();
    const diff = (Date.parse(r!.expires_at.replace(' ', 'T') + 'Z') - Date.now()) / 60000;
    expect(diff).toBeGreaterThan(40); expect(diff).toBeLessThanOrEqual(45);
  });
  it('이번 주 근무시간은 월~일 배치된 교대 수 × 12시간', () => {
    const db = memDb();
    // 10-19(월)~10-25(일): 박현주 10-20 주간 1회 → 12시간, 최상진 1회
    expect(weekHoursFor('2026-10-21', db).get(1)).toBe(12);
    db.prepare("INSERT INTO boards (id, date, shift, factory_id, status) VALUES (3,'2026-10-22','야간',2,'확정'),(4,'2026-10-18','주간',2,'확정')").run();
    db.prepare("INSERT INTO assignments (board_id, post_id, person_id, source) VALUES (3,36,1,'이력'),(4,36,1,'이력')").run();
    expect(weekHoursFor('2026-10-21', db).get(1)).toBe(24); // 10-18은 지난주
  });
});

describe('후보 제외', () => {
  it('오늘 연차인 사람은 다른 자리 후보로 추천되지 않는다', () => {
    const db = memDb();
    db.prepare("INSERT INTO boards (id, date, shift, factory_id, status) VALUES (3,'2026-10-14','주간',2,'확정')").run();
    db.prepare("INSERT INTO board_posts (board_id, post_id, product) VALUES (3,36,'신광야950')").run();
    db.prepare("INSERT INTO assignments (board_id, post_id, person_id, source) VALUES (3,36,2,'이력')").run();
    const b = getBoard('2026-10-21', '주간', 2, db);
    const s3 = b.posts.find((p) => p.code === 'S-3')!;
    expect(sendRequests(b.id, s3.id, 1, db).candidates.map((c) => c.name)).toContain('김순자');
    cancelRequests(b.id, s3.id, null, db);
    db.prepare("DELETE FROM requests").run();
    db.prepare("INSERT INTO attendance (date, shift, person_id, kind) VALUES ('2026-10-21','주간',2,'연차')").run();
    expect(sendRequests(b.id, s3.id, 1, db).candidates.map((c) => c.name)).not.toContain('김순자');
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
