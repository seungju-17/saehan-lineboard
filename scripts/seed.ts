/**
 * 시드: 직원 명단(교수님 데이터 67명) + 2025 실제 배치표(1공장 58일, 2공장 146일)를 +364일 이동해 이력으로 넣는다.
 * 오늘(한국 시간) 이후는 비워 두어 첫 화면에서 어제 표가 자동 복사되게 한다.
 * 실행: pnpm tsx scripts/seed.ts [cutoff=오늘]
 */
import fs from 'node:fs';
import path from 'node:path';
import { openDb } from '../src/lib/db';

const ROOT = path.resolve(__dirname, '..');
const DB_FILE = process.env.LINEBOARD_DB ?? path.join(ROOT, 'data', 'lineboard.db');
const CUTOFF = process.argv[2] ?? new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
const SHIFT_DAYS = 364;

function csv(file: string): Record<string, string>[] {
  const lines = fs.readFileSync(file, 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter(Boolean);
  const split = (l: string): string[] => { const out: string[] = []; let cur = ''; let q = false;
    for (let i = 0; i < l.length; i++) { const c = l[i]; if (q) { if (c === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; } else if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c; }
    out.push(cur); return out; };
  const head = split(lines[0]);
  return lines.slice(1).map((l) => { const v = split(l); return Object.fromEntries(head.map((h, i) => [h, v[i] ?? ''])); });
}
const shiftDate = (d: string): string => new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) + SHIFT_DAYS * 86_400_000).toISOString().slice(0, 10);

if (fs.existsSync(DB_FILE)) fs.rmSync(DB_FILE); for (const s of ['-wal', '-shm']) if (fs.existsSync(DB_FILE + s)) fs.rmSync(DB_FILE + s);
const db = openDb(DB_FILE);

db.prepare("INSERT INTO factories (id, code, name, sort) VALUES (1,'F1','1공장 PET',1),(2,'F2','2공장',2)").run();

// 포스트: 실제 배치표 양식 순서. zone=구역, unmanned=무인 라인(2공장 프리폼), fixed=직책(고정 인원)
const insPost = db.prepare('INSERT INTO posts (factory_id, code, name, kind, sort, zone, unmanned, fixed) VALUES (?,?,?,?,?,?,?,?)');
let s = 0;
for (let i = 1; i <= 18; i++) insPost.run(1, String(i).padStart(2, '0'), `${String(i).padStart(2, '0')}호기`, 'machine', ++s, 'PET', 0, 0);
for (const c of ['B-1', 'B-2']) insPost.run(1, c, `${c}호기`, 'machine', ++s, 'PET', 0, 0);
insPost.run(1, '기타', '교육·선별·지원', 'etc', ++s, 'PET', 0, 0); insPost.run(1, 'BOX&운반', 'BOX & 운반', 'support', ++s, 'PET', 0, 0); insPost.run(1, 'OP', 'OP', 'op', ++s, 'PET', 0, 1);
for (const c of ['PE-1', 'PE-2', 'PE-3', 'PE-4']) insPost.run(1, c, `${c}호기`, 'machine', ++s, 'PE', 0, 0);
insPost.run(1, 'PE 기타', 'PE 교육·선별', 'etc', ++s, 'PE', 0, 0); insPost.run(1, 'PE BOX&운반', 'PE BOX & 운반', 'support', ++s, 'PE', 0, 0); insPost.run(1, 'PE OP', 'PE OP', 'op', ++s, 'PE', 0, 1);
insPost.run(1, '반장', '반장', 'leader', ++s, '관리', 0, 1);
s = 0;
for (let i = 1; i <= 5; i++) insPost.run(2, `P-${i}`, `P-${i}호 (프리폼)`, 'machine', ++s, '프리폼', 1, 0);
for (let i = 1; i <= 7; i++) insPost.run(2, `S-${i}`, `S-${i}호`, 'machine', ++s, '성형', 0, 0);
insPost.run(2, '기타', '선별·교육', 'etc', ++s, '지원', 0, 0); insPost.run(2, '밴딩,박스,운반', '밴딩 · 박스 · 운반', 'support', ++s, '지원', 0, 0);
insPost.run(2, '설비관리', '설비관리 (OP)', 'op', ++s, '관리', 0, 1); insPost.run(2, '생산관리', '생산관리 (반장)', 'leader', ++s, '관리', 0, 1);
const postId = new Map<string, number>();
for (const r of db.prepare('SELECT id, factory_id, code FROM posts').all() as { id: number; factory_id: number; code: string }[]) postId.set(`${r.factory_id}|${r.code}`, r.id);

// 사람: 시드 명단(교수님 자료) + 2025-09 근태표 명단(집단·소속·조). 근태표가 더 최신이라 겹치면 근태표를 따른다.
const insPerson = db.prepare('INSERT INTO people (name, affiliation, grp, work_type, role, gender, home_factory_id, unit) VALUES (?,?,?,?,?,?,?,?)');
const updPerson = db.prepare('UPDATE people SET affiliation=?, grp=?, work_type=?, unit=?, home_factory_id=?, gender=COALESCE(gender, ?) WHERE id=?');
const personId = new Map<string, number>();
for (const r of csv(path.join(ROOT, 'data', 'people_seed.csv'))) {
  const name = r['이름'].replace(/\s+/g, '');
  const fac = r['부서'] === '생산2팀' ? 2 : 1;
  const unit = r['부서'].includes('PE') ? 'PE 협력사' : r['소속사'] === '새한' ? '교대반' : `협력사 ${r['조']}조`;
  const id = Number(insPerson.run(name, r['소속사'], r['조'], '교대', r['역할'], r['성별'] || null, fac, unit).lastInsertRowid);
  personId.set(name, id);
}
let rosterNew = 0, rosterUpd = 0;
for (const r of csv(path.join(ROOT, 'data', 'roster_2025_09.csv'))) {
  const name = r['name'].replace(/\s+/g, ''); if (!name) continue;
  const sheet = r['sheet'];
  const unit = sheet.includes('주전반') ? '주전반' : sheet.includes('교대반') ? '교대반' : sheet.includes('PE_') ? 'PE 협력사' : sheet.includes('협력사') ? `협력사 ${r['grp']}조` : '지원';
  const workType = unit === '주전반' ? '주간고정' : '교대';
  const grp = unit === '주전반' ? '주전' : (r['grp'] || '미정');
  const gender = unit === '교대반' || unit === '주전반' ? 'M' : unit.startsWith('협력사') || unit === 'PE 협력사' ? 'F' : null;
  const existing = personId.get(name);
  if (existing) { updPerson.run(r['affiliation'] || '새한', grp, workType, unit, 1, gender, existing); rosterUpd++; }
  else { personId.set(name, Number(insPerson.run(name, r['affiliation'] || '새한', grp, workType, '미정', gender, 1, unit).lastInsertRowid)); rosterNew++; }
}

// 이력
const mapF1 = (line: string): string => /^\d\d$/.test(line) || ['B-1', 'B-2', 'PE-1', 'PE-2', 'PE-3', 'PE-4', 'BOX&운반', 'OP', '반장', 'PE BOX&운반', 'PE OP', 'PE 기타'].includes(line) ? line : '기타';
const mapF2 = (line: string): string => { const m = line.match(/^([SP])-(\d)/); if (m) return `${m[1]}-${m[2]}`; return ['밴딩,박스,운반', '설비관리', '생산관리'].includes(line) ? line : '기타'; };
type Row = { fac: number; date: string; shift: string; post: number; product: string | null; name: string };
const rows: Row[] = [];
for (const [file, fac, mapper] of [['f1_assignments.csv', 1, mapF1], ['f2_assignments.csv', 2, mapF2]] as const) {
  for (const r of csv(path.join(ROOT, 'data', file))) {
    const name = r['name'].replace(/\s+/g, '');
    if (!name || ['가동', '부동', '대기'].includes(name) || name.length > 12) continue;
    const date = shiftDate(r['date']);
    if (date >= CUTOFF) continue;
    rows.push({ fac, date, shift: r['shift'], post: postId.get(`${fac}|${mapper(r['line'])}`)!, product: r['product']?.trim() || null, name });
  }
}
// 임시 인원 생성 (주 공장 = 가장 많이 나온 공장)
const cnt = new Map<string, Map<number, number>>();
for (const r of rows) { if (!cnt.has(r.name)) cnt.set(r.name, new Map()); const m = cnt.get(r.name)!; m.set(r.fac, (m.get(r.fac) ?? 0) + 1); }
let temps = 0;
for (const [name, m] of cnt) if (!personId.has(name)) {
  const fac = [...m.entries()].sort((a, b) => b[1] - a[1])[0][0];
  personId.set(name, Number(insPerson.run(name, '새한', '미정', '임시', '미정', null, fac, '임시').lastInsertRowid)); temps++;
}
const insBoard = db.prepare("INSERT OR IGNORE INTO boards (date, shift, factory_id, status) VALUES (?,?,?,'확정')");
const getBoard = db.prepare('SELECT id FROM boards WHERE date=? AND shift=? AND factory_id=?');
const insBP = db.prepare('INSERT INTO board_posts (board_id, post_id, product) VALUES (?,?,?) ON CONFLICT(board_id, post_id) DO UPDATE SET product=COALESCE(excluded.product, product)');
const insA = db.prepare("INSERT OR IGNORE INTO assignments (board_id, post_id, person_id, source) VALUES (?,?,?,'이력')");
const tx = db.transaction(() => {
  for (const r of rows) {
    insBoard.run(r.date, r.shift, r.fac);
    const bid = (getBoard.get(r.date, r.shift, r.fac) as { id: number }).id;
    insBP.run(bid, r.post, r.product);
    insA.run(bid, r.post, personId.get(r.name)!);
  }
});
tx();
// 2공장 프리폼 P라인은 양식에 제품이 늘 적혀 있다(무인 자동 운전). 이력 CSV에는 근무자 없는 줄이 빠져 있어 기본 제품을 채운다.
const P_PRODUCTS: Record<string, string> = { 'P-1': '진로4.0', 'P-2': '테일러86', 'P-3': '올리고당', 'P-4': '진로투명', 'P-5': 'PCO 27' };
const insP = db.prepare('INSERT INTO board_posts (board_id, post_id, product) VALUES (?,?,?) ON CONFLICT(board_id, post_id) DO UPDATE SET product=COALESCE(board_posts.product, excluded.product)');
for (const b of db.prepare('SELECT id FROM boards WHERE factory_id=2').all() as { id: number }[]) for (const [code, prod] of Object.entries(P_PRODUCTS)) insP.run(b.id, postId.get(`2|${code}`)!, prod);
const stat = db.prepare('SELECT (SELECT COUNT(*) FROM people) p, (SELECT COUNT(*) FROM boards) b, (SELECT COUNT(*) FROM assignments) a, (SELECT MAX(date) FROM boards) d').get();
console.log('seeded', DB_FILE, stat, 'temps', temps, 'roster new/upd', rosterNew, rosterUpd, 'cutoff', CUTOFF);
