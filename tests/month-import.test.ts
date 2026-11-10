import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { openDb } from '../src/lib/db';
import { importMonth, normalizeLine, parseMonthSheet } from '../src/lib/month-import';
import { getBoard } from '../src/lib/repo';

function db() {
  const d = openDb(':memory:');
  d.prepare("INSERT INTO factories (id, code, name, sort) VALUES (1,'F1','1공장',1),(2,'F2','2공장',2)").run();
  d.prepare("INSERT INTO posts (id, factory_id, code, name, kind, sort, zone, unmanned, fixed) VALUES (5,1,'05','05호기','machine',5,'PET',0,0),(21,1,'기타','교육·선별·지원','etc',21,'PET',0,0),(22,1,'BOX&운반','BOX & 운반','support',22,'PET',0,0),(36,2,'S-3','S-3호','machine',8,'성형',0,0),(45,2,'기타','선별·교육','etc',13,'지원',0,0)").run();
  d.prepare("INSERT INTO people (id, name, grp, work_type, unit, gender, home_factory_id) VALUES (1,'홍길동','A','교대','교대반','M',1),(2,'김영희','A','교대','협력사 A조','F',1)").run();
  return d;
}
function sheet(aoa: unknown[][]): Uint8Array {
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), '배치');
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
}

describe('월 근무표 읽기', () => {
  it('머리글을 찾고 날짜·교대·공장 빈칸은 윗줄 값을 쓰며, 근무자 쉼표는 여러 줄로 푼다', () => {
    const r = parseMonthSheet(sheet([
      ['2026년 11월 근무표'], [],
      ['날짜', '교대', '공장', '라인', '제품', '근무자'],
      ['2026-11-10', '주간', '1공장', '5', '1KG 광구', '홍길동, 김영희'],
      ['', '', '', 'BOX & 운반', '', '박철수'],
      ['2026.11.10', '야', '2', 'S-3호', '초고추장', '최수진'],
      ['11월 10일', '주간', '1공장', '05', '', '날짜 못 읽음'],
    ]));
    expect(r.rows.map((x) => `${x.date} ${x.shift} ${x.factory} ${x.line} ${x.name}`)).toEqual([
      '2026-11-10 주간 1 05 홍길동', '2026-11-10 주간 1 05 김영희', '2026-11-10 주간 1 BOX&운반 박철수', '2026-11-10 야간 2 S-3 최수진',
      '2026-11-10 주간 1 05 날짜 못 읽음', // 날짜 칸을 못 읽으면 윗줄 날짜를 쓴다
    ]);
    expect(r.problems).toEqual([]);
  });
  it('엑셀 날짜 숫자도 읽는다', () => {
    const serial = 46336; // 2026-11-10
    const r = parseMonthSheet(sheet([['날짜', '교대', '공장', '라인', '제품', '근무자'], [serial, '주간', '1공장', '05', '', '홍길동']]));
    expect(r.rows[0].date).toBe('2026-11-10');
  });
  it('라인 표기 정리', () => {
    expect(normalizeLine(1, '5')).toBe('05'); expect(normalizeLine(1, '05호기')).toBe('05'); expect(normalizeLine(1, 'B-1호')).toBe('B-1');
    expect(normalizeLine(1, 'pe-3')).toBe('PE-3'); expect(normalizeLine(2, 's7')).toBe('S-7'); expect(normalizeLine(2, '밴딩/박스/운반')).toBe('밴딩,박스,운반');
    expect(normalizeLine(1, '알 수 없음')).toBe('알 수 없음');
  });
});

describe('월 근무표 넣기', () => {
  const rows = [
    { date: '2026-11-10', shift: '주간' as const, factory: 1, line: '05', product: '1KG 광구', name: '홍길동' },
    { date: '2026-11-10', shift: '주간' as const, factory: 1, line: '05', product: null, name: '김영희' },
    { date: '2026-11-10', shift: '주간' as const, factory: 1, line: '이상한라인', product: null, name: '박철수' },
    { date: '2026-11-11', shift: '야간' as const, factory: 2, line: 'S-3', product: '초고추장', name: '최수진' },
  ];
  it('날짜·교대·공장마다 초안 표를 만들고, 필요 인원은 표에 적힌 인원, 모르는 이름은 임시로', () => {
    const d = db();
    const s = importMonth(rows, { today: '2026-11-10' }, d);
    expect(s.boards).toBe(2); expect(s.created).toBe(2); expect(s.assignments).toBe(4);
    expect(s.newPeople.sort()).toEqual(['박철수', '최수진']); expect(s.unknownLines).toEqual(['1공장 이상한라인']);
    const b = getBoard('2026-11-10', '주간', 1, d);
    expect(b.status).toBe('초안'); expect(b.assignments.filter((a) => a.post_id === 5).map((a) => a.name).sort()).toEqual(['김영희', '홍길동']);
    expect(b.posts.find((p) => p.id === 5)?.need).toBe(2); expect(b.posts.find((p) => p.id === 5)?.product).toBe('1KG 광구');
    expect(b.assignments.find((a) => a.name === '박철수')?.post_id).toBe(21); // 기타로
  });
  it('다시 올리면 작성 중인 표는 바뀌고 확정된 표는 건너뛴다', () => {
    const d = db();
    importMonth(rows, {}, d);
    const b = getBoard('2026-11-10', '주간', 1, d);
    d.prepare("UPDATE boards SET status='확정' WHERE id=?").run(b.id);
    const s = importMonth([{ ...rows[3], name: '다른사람' }, rows[0]], {}, d);
    expect(s.skipped).toEqual([{ date: '2026-11-10', shift: '주간', factory: 1 }]);
    expect(s.updated).toBe(1);
    expect(getBoard('2026-11-11', '야간', 2, d).assignments.map((a) => a.name)).toEqual(['다른사람']);
    expect(getBoard('2026-11-10', '주간', 1, d).assignments.length).toBe(3); // 확정 표는 그대로
  });
  it('시드처럼 지난 날은 확정으로 넣을 수 있다', () => {
    const d = db();
    importMonth(rows, { today: '2026-11-11', confirmPast: true }, d);
    expect(getBoard('2026-11-10', '주간', 1, d).status).toBe('확정');
    expect(getBoard('2026-11-11', '야간', 2, d).status).toBe('초안');
  });
});
