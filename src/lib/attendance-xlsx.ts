/**
 * 월 근태표. 회사 양식(02. 새한 1공장 PET 근태표)과 같은 모양으로 만든다.
 * 시트 = 집단(주전반·교대반·협력사 A/B/C조·PE 협력사·임시), 사람당 두 줄(1줄: 주/야 또는 근태, 2줄: 라인), 날짜 가로, 끝에 서명·비고.
 * 마감 주기: 직영(주전반·교대반)은 11일~익월 10일, 협력사·임시는 1일~말일.
 */
import * as XLSX from 'xlsx';
import { getDb, type DB } from './db';
import { addDays } from './shift';

const UNITS = ['주전반', '교대반', '협력사 A조', '협력사 B조', '협력사 C조', 'PE 협력사', '임시'] as const;
const DIRECT = new Set(['주전반', '교대반']);

export function periodFor(month: string, unit: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number);
  const first = `${y}-${String(m).padStart(2, '0')}-01`;
  const nextFirst = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  if (DIRECT.has(unit)) return { from: `${y}-${String(m).padStart(2, '0')}-11`, to: addDays(nextFirst, 9) };
  return { from: first, to: addDays(nextFirst, -1) };
}
function dates(from: string, to: string): string[] { const out: string[] = []; for (let d = from; d <= to; d = addDays(d, 1)) out.push(d); return out; }

export function attendanceXlsx(month: string, factoryId: number, db: DB = getDb()): Buffer {
  const wb = XLSX.utils.book_new();
  const people = db.prepare('SELECT id, name, affiliation, grp, unit FROM people WHERE active=1 AND (home_factory_id=? OR home_factory_id IS NULL) ORDER BY unit, grp, name').all(factoryId) as { id: number; name: string; affiliation: string | null; grp: string; unit: string }[];
  for (const unit of UNITS) {
    const members = people.filter((p) => p.unit === unit);
    if (members.length === 0) continue;
    const { from, to } = periodFor(month, unit);
    const ds = dates(from, to);
    // 이 기간의 근무(주/야 + 라인)와 근태
    const work = new Map<string, string>(), line = new Map<string, string>();
    for (const r of db.prepare(`SELECT a.person_id, b.date, b.shift, po.code FROM assignments a JOIN boards b ON b.id=a.board_id JOIN posts po ON po.id=a.post_id
        WHERE b.factory_id=? AND b.date BETWEEN ? AND ?`).all(factoryId, from, to) as { person_id: number; date: string; shift: string; code: string }[]) {
      const k = `${r.person_id}|${r.date}`; work.set(k, r.shift === '주간' ? '주' : '야'); line.set(k, r.code);
    }
    const att = new Map<string, string>();
    for (const r of db.prepare('SELECT person_id, date, kind FROM attendance WHERE date BETWEEN ? AND ?').all(from, to) as { person_id: number; date: string; kind: string }[]) att.set(`${r.person_id}|${r.date}`, r.kind);
    const rows: (string | number)[][] = [
      [], ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '근  태  표'], [],
      ['', '', '', '', '', '', '연  도', '', '', +month.slice(0, 4), '', '', '', '월', '', +month.slice(5, 7), '', '', '', '[', `생산${factoryId}팀 ${unit}`, '', '', '', ']'],
      ['새한프라텍㈜', '', '', DIRECT.has(unit) ? `당월 ${from} ~ 익월 ${to}` : `${from} ~ ${to}`],
      ['소속', '조', '성 명', ...ds, '서명', '비  고'],
      ['', '', '', ...ds.map((d) => +d.slice(8, 10)), '', ''],
    ];
    for (const p of members) {
      const l1: (string | number)[] = [p.affiliation ?? '', p.grp, p.name];
      const l2: (string | number)[] = ['', '', ''];
      for (const d of ds) { const k = `${p.id}|${d}`; l1.push(att.get(k) ?? work.get(k) ?? ''); l2.push(line.get(k) ?? ''); }
      l1.push('', ''); l2.push('', '');
      rows.push(l1, l2);
    }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 6 }, { wch: 4 }, { wch: 9 }, ...ds.map(() => ({ wch: 3.5 })), { wch: 6 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws, unit.replace(/[\\/?*[\]]/g, ' ').slice(0, 31));
  }
  if (wb.SheetNames.length === 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['해당 공장에 직원이 없습니다']]), '근태표');
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as ArrayBuffer);
}
