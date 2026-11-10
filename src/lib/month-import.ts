import * as XLSX from 'xlsx';
import type { DB } from './db';
import { getDb } from './db';
import { findOrCreatePerson } from './repo';
import type { Shift } from './shift';

/** 월 근무표 한 줄: 한 사람의 한 교대. 엑셀 「배치」 시트의 날짜·교대·공장·라인·제품·근무자. */
export type MonthRow = { date: string; shift: Shift; factory: number; line: string; product: string | null; name: string; need?: number | null };

const HEAD: Record<Exclude<keyof MonthRow, 'need'> | 'need', string[]> = {
  date: ['날짜', '일자', 'date'], shift: ['교대', '근무', 'shift'], factory: ['공장', 'factory'],
  line: ['라인', 'line', '호기', 'line & 운반'], product: ['제품', '생산제품명', '생산제품', 'product'], name: ['근무자', '이름', '성명', 'name'], need: ['인원', '필요 인원', '필요인원', 'need'],
};

function cellDate(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') { const d = XLSX.SSF.parse_date_code(v); return d ? `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}` : null; }
  if (v instanceof Date) return new Date(v.getTime() - v.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const m = String(v).trim().match(/^(\d{4})[-./년]\s*(\d{1,2})[-./월]\s*(\d{1,2})일?/);
  return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : null;
}
function cellShift(v: unknown): Shift | null {
  const s = String(v ?? '').trim();
  if (/^(주간|주|D|day)$/i.test(s)) return '주간';
  if (/^(야간|야|N|night)$/i.test(s)) return '야간';
  return null;
}
function cellFactory(v: unknown): number | null {
  const m = String(v ?? '').trim().match(/^(\d)/);
  return m && (m[1] === '1' || m[1] === '2') ? Number(m[1]) : null;
}
/** 라인 표기를 포스트 코드로. '5' '05호기' → '05', 'S-7호' → 'S-7'. 모르는 것은 그대로 두고 import 때 「기타」로 보낸다. */
export function normalizeLine(factory: number, raw: string): string {
  const s = raw.trim().replace(/\s+/g, ' ');
  if (factory === 1) {
    const n = s.match(/^(\d{1,2})\s*(호기|호|번)?$/); if (n) return n[1].padStart(2, '0');
    const b = s.match(/^(B|PE)\s*-?\s*(\d)\s*(호기|호)?$/i); if (b) return `${b[1].toUpperCase()}-${b[2]}`;
    if (/^box\s*&?\s*운반$/i.test(s)) return 'BOX&운반';
    if (/^pe\s*box\s*&?\s*운반$/i.test(s)) return 'PE BOX&운반';
    if (/^pe\s*op$/i.test(s)) return 'PE OP';
    if (/^pe\s*기타$/i.test(s)) return 'PE 기타';
    if (/^op$/i.test(s)) return 'OP';
    return s;
  }
  const m = s.match(/^([SP])\s*-?\s*(\d)/i); if (m) return `${m[1].toUpperCase()}-${m[2]}`;
  if (/밴딩|박스|운반/.test(s)) return '밴딩,박스,운반';
  if (/^설비/.test(s)) return '설비관리';
  if (/^생산관리|^반장$/.test(s)) return '생산관리';
  return s;
}

export type ParseResult = { rows: MonthRow[]; problems: string[]; sheet: string | null };
/** 엑셀(xlsx·xls·csv) 첫 시트(「배치」 시트가 있으면 그것)를 읽는다. 머리글 줄을 찾아 열을 맞춘다. */
export function parseMonthSheet(data: ArrayBuffer | Uint8Array): ParseResult {
  const wb = XLSX.read(data, { type: 'array', cellDates: false });
  const name = wb.SheetNames.includes('배치') ? '배치' : wb.SheetNames[0];
  if (!name) return { rows: [], problems: ['시트가 없습니다'], sheet: null };
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: '' });
  const keyOf = (h: unknown): keyof MonthRow | null => { const t = String(h ?? '').trim().toLowerCase(); for (const k of Object.keys(HEAD) as (keyof MonthRow)[]) if (HEAD[k].some((x) => x.toLowerCase() === t)) return k; return null; };
  let hi = -1; let cols: Partial<Record<keyof MonthRow, number>> = {};
  for (let i = 0; i < Math.min(aoa.length, 20); i++) {
    const c: Partial<Record<keyof MonthRow, number>> = {};
    aoa[i].forEach((h, j) => { const k = keyOf(h); if (k && c[k] === undefined) c[k] = j; });
    if (c.date !== undefined && c.shift !== undefined && c.line !== undefined && (c.name !== undefined || c.need !== undefined)) { hi = i; cols = c; break; }
  }
  if (hi < 0) return { rows: [], problems: ['머리글(날짜·교대·공장·라인·제품·근무자 또는 인원)이 있는 줄을 찾지 못했습니다'], sheet: name };
  const rows: MonthRow[] = []; const problems: string[] = [];
  let lastDate: string | null = null, lastShift: Shift | null = null, lastFac: number | null = null; // 병합 셀처럼 비워 둔 칸은 윗줄 값을 쓴다
  for (let i = hi + 1; i < aoa.length; i++) {
    const r = aoa[i]; const get = (k: keyof MonthRow): unknown => (cols[k] === undefined ? '' : r[cols[k]!]);
    const names = String(get('name') ?? '').split(/[,，/·;]/).map((x) => x.trim()).filter(Boolean);
    const line = String(get('line') ?? '').trim();
    if (!names.length && !line) continue;
    const date: string | null = cellDate(get('date')) ?? lastDate; const shift: Shift | null = cellShift(get('shift')) ?? lastShift;
    const factory: number | null = cols.factory === undefined ? (lastFac ?? 1) : (cellFactory(get('factory')) ?? lastFac);
    if (!date || !shift || !factory) { if (problems.length < 20) problems.push(`${i + 1}행: 날짜·교대·공장을 읽지 못했습니다`); continue; }
    lastDate = date; lastShift = shift; lastFac = factory;
    const product = String(get('product') ?? '').trim() || null;
    const needRaw = cols.need === undefined ? '' : String(get('need') ?? '').trim();
    const need = needRaw && Number.isFinite(Number(needRaw)) ? Number(needRaw) : null;
    if (!line) continue;
    if (names.length === 0) { rows.push({ date, shift, factory, line: normalizeLine(factory, line), product, name: '', need }); continue; } // 생산 계획 줄: 사람 없이 라인·제품·인원만
    for (const name of names) rows.push({ date, shift, factory, line: normalizeLine(factory, line), product, name, need });
  }
  return { rows, problems, sheet: name };
}

export type ImportSummary = {
  boards: number; created: number; updated: number; skipped: { date: string; shift: Shift; factory: number }[];
  assignments: number; newPeople: string[]; unknownLines: string[]; from: string | null; to: string | null; planned?: number;
};
/** 월 근무표를 표로 넣는다. 날짜·교대·공장마다 표 하나. 이미 확정된 표는 건너뛰고, 아직 확정하지 않은 표는 내용을 바꾼다.
 *  today 이전 날짜는 confirmPast 가 켜져 있으면 확정으로 넣는다(시드용). */
export function importMonth(rows: MonthRow[], opts: { today?: string; confirmPast?: boolean } = {}, db: DB = getDb()): ImportSummary {
  const sum: ImportSummary = { boards: 0, created: 0, updated: 0, skipped: [], assignments: 0, newPeople: [], unknownLines: [], from: null, to: null };
  const postId = new Map<string, number>();
  for (const r of db.prepare('SELECT id, factory_id, code FROM posts').all() as { id: number; factory_id: number; code: string }[]) postId.set(`${r.factory_id}|${r.code}`, r.id);
  const groups = new Map<string, MonthRow[]>();
  for (const r of rows) { const k = `${r.date}|${r.shift}|${r.factory}`; groups.set(k, [...(groups.get(k) ?? []), r]); }
  const unknown = new Set<string>(); const fresh = new Set<string>();
  // 체험판(sql.js)에는 transaction()이 없어 BEGIN/COMMIT으로 묶는다
  const body = (): void => {
    for (const [k, list] of groups) {
      const [date, shift, facS] = k.split('|'); const factory = Number(facS);
      sum.from = !sum.from || date < sum.from ? date : sum.from; sum.to = !sum.to || date > sum.to ? date : sum.to;
      const ex = db.prepare('SELECT id, status FROM boards WHERE date=? AND shift=? AND factory_id=?').get(date, shift, factory) as { id: number; status: string } | undefined;
      let boardId: number;
      if (ex && ex.status === '확정') { sum.skipped.push({ date, shift: shift as Shift, factory }); continue; }
      if (ex) {
        db.prepare('DELETE FROM assignments WHERE board_id=?').run(ex.id); db.prepare('DELETE FROM board_posts WHERE board_id=?').run(ex.id);
        db.prepare("UPDATE boards SET status='초안', return_note=NULL, copied_from=NULL WHERE id=?").run(ex.id); boardId = ex.id; sum.updated++;
      } else {
        const status = opts.confirmPast && opts.today && date < opts.today ? '확정' : '초안';
        boardId = Number(db.prepare('INSERT INTO boards (date, shift, factory_id, status, copied_from) VALUES (?,?,?,?,NULL)').run(date, shift, factory, status).lastInsertRowid); sum.created++;
      }
      sum.boards++;
      const explicit = new Map<number, number>(); // 인원 열에 적힌 필요 인원
      for (const r of list) {
        let pid = postId.get(`${factory}|${r.line}`);
        if (!pid) { unknown.add(`${factory}공장 ${r.line}`); pid = postId.get(`${factory}|기타`)!; }
        db.prepare('INSERT INTO board_posts (board_id, post_id, product) VALUES (?,?,?) ON CONFLICT(board_id, post_id) DO UPDATE SET product=COALESCE(excluded.product, product)').run(boardId, pid, r.product);
        if (r.need !== null && r.need !== undefined) explicit.set(pid, Math.max(explicit.get(pid) ?? 0, r.need));
        if (!r.name) { sum.planned = (sum.planned ?? 0) + 1; continue; } // 생산 계획 줄
        const p = findOrCreatePerson(r.name, factory, db); if (p.created) fresh.add(r.name.replace(/\s+/g, ''));
        const ins = db.prepare("INSERT OR IGNORE INTO assignments (board_id, post_id, person_id, source) VALUES (?,?,?,'이력')").run(boardId, pid, p.id);
        if (ins.changes) sum.assignments++;
      }
      // 필요 인원 = 인원 열이 있으면 그 값, 없으면 표에 적힌 사람 수. 그래야 받은 표가 「비어 있음」으로 뜨지 않는다.
      db.prepare('UPDATE board_posts SET need=(SELECT COUNT(DISTINCT a.person_id) FROM assignments a WHERE a.board_id=board_posts.board_id AND a.post_id=board_posts.post_id) WHERE board_id=? AND EXISTS (SELECT 1 FROM assignments a WHERE a.board_id=board_posts.board_id AND a.post_id=board_posts.post_id)').run(boardId);
      for (const [pid, n] of explicit) db.prepare('UPDATE board_posts SET need=? WHERE board_id=? AND post_id=?').run(n, boardId, pid);
      db.prepare("INSERT INTO logs (board_id, action, detail) VALUES (?, '월표', ?)").run(boardId, `${list.length}줄`);
    }
  };
  db.prepare('BEGIN').run();
  try { body(); db.prepare('COMMIT').run(); } catch (e) { db.prepare('ROLLBACK').run(); throw e; }
  sum.newPeople = [...fresh]; sum.unknownLines = [...unknown];
  return sum;
}

/** 올리기 양식. 「배치」 시트에 머리글과 보기 줄, 「안내」 시트에 설명과 라인 코드. */
export function monthTemplate(lines: { factory: number; code: string; name: string }[], month: string): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const ex = [['날짜', '교대', '공장', '라인', '제품', '인원', '근무자'],
    [`${month}-01`, '주간', '1공장', '05', '1KG 광구', 2, '홍길동'],
    [`${month}-01`, '주간', '1공장', '05', '1KG 광구', 2, '김영희'],
    [`${month}-01`, '주간', '1공장', 'BOX&운반', '', 2, '박철수, 이민호'],
    [`${month}-01`, '야간', '2공장', 'S-3', '초고추장', 1, '최수진'],
    [`${month}-02`, '주간', '1공장', '05', '1KG 광구', 2, ''],
    [`${month}-02`, '주간', '1공장', '07', '옹기 1KG', 1, '']];
  const ws = XLSX.utils.aoa_to_sheet(ex); ws['!cols'] = [{ wch: 12 }, { wch: 8 }, { wch: 8 }, { wch: 14 }, { wch: 22 }, { wch: 6 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, ws, '배치');
  const guide: string[][] = [['월 근무표 · 생산 계획 올리기 양식'], [''], ['한 줄 = 한 사람의 한 교대. 같은 라인에 여러 명이면 줄을 여러 개 쓰거나 근무자 칸에 쉼표로 구분합니다.'],
    ['근무자 칸을 비우고 인원만 적으면 「생산 계획」입니다. 그 날 그 라인에 몇 명이 필요한지만 정해 두고, 사람은 「월 근무표」 화면에서 「이 달 근무표 짜기」로 채웁니다.'],
    ['날짜: 2026-11-10 처럼 (엑셀 날짜 형식도 됩니다) · 교대: 주간/야간 · 공장: 1공장/2공장 · 제품은 비워도 됩니다.'],
    ['날짜·교대·공장 칸을 비우면 바로 윗줄 값을 씁니다(병합 셀처럼).'], ['이미 확정된 날의 표는 건너뛰고, 초안·입안인 표는 이 파일 내용으로 바뀝니다.'], [''], ['라인 코드']];
  for (const f of [1, 2]) guide.push([`${f}공장: ` + lines.filter((l) => l.factory === f).map((l) => l.code).join(', ')]);
  const g = XLSX.utils.aoa_to_sheet(guide); g['!cols'] = [{ wch: 110 }];
  XLSX.utils.book_append_sheet(wb, g, '안내');
  return wb;
}
