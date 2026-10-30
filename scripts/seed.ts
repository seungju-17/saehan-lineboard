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

// 포스트: 실제 배치표 양식 순서
const insPost = db.prepare('INSERT INTO posts (factory_id, code, name, kind, sort) VALUES (?,?,?,?,?)');
let s = 0;
for (let i = 1; i <= 18; i++) insPost.run(1, String(i).padStart(2, '0'), `${String(i).padStart(2, '0')}호기`, 'machine', ++s);
for (const c of ['B-1', 'B-2', 'PE-1', 'PE-2', 'PE-3', 'PE-4']) insPost.run(1, c, `${c}호기`, 'machine', ++s);
insPost.run(1, '기타', '교육·선별·지원', 'etc', ++s); insPost.run(1, 'BOX&운반', 'BOX & 운반', 'support', ++s); insPost.run(1, 'OP', 'OP', 'op', ++s); insPost.run(1, '반장', '반장', 'leader', ++s);
s = 0;
for (let i = 1; i <= 5; i++) insPost.run(2, `P-${i}`, `P-${i}호 (프리폼)`, 'machine', ++s);
for (let i = 1; i <= 7; i++) insPost.run(2, `S-${i}`, `S-${i}호`, 'machine', ++s);
insPost.run(2, '기타', '선별·교육', 'etc', ++s); insPost.run(2, '밴딩,박스,운반', '밴딩 · 박스 · 운반', 'support', ++s); insPost.run(2, '설비관리', '설비관리 (OP)', 'op', ++s); insPost.run(2, '생산관리', '생산관리 (반장)', 'leader', ++s);
const postId = new Map<string, number>();
for (const r of db.prepare('SELECT id, factory_id, code FROM posts').all() as { id: number; factory_id: number; code: string }[]) postId.set(`${r.factory_id}|${r.code}`, r.id);

// 사람: 시드 명단
const insPerson = db.prepare('INSERT INTO people (name, affiliation, grp, work_type, role, gender, home_factory_id) VALUES (?,?,?,?,?,?,?)');
const personId = new Map<string, number>();
for (const r of csv(path.join(ROOT, 'data', 'people_seed.csv'))) {
  const name = r['이름'].replace(/\s+/g, '');
  const fac = r['부서'] === '생산2팀' ? 2 : 1;
  const id = Number(insPerson.run(name, r['소속사'], r['조'], '교대', r['역할'], r['성별'] || null, fac).lastInsertRowid);
  personId.set(name, id);
}

// 이력
const mapF1 = (line: string): string => /^\d\d$/.test(line) || ['B-1', 'B-2', 'PE-1', 'PE-2', 'PE-3', 'PE-4', 'BOX&운반', 'OP', '반장'].includes(line) ? line : '기타';
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
  personId.set(name, Number(insPerson.run(name, '새한', '미정', '임시', '미정', null, fac).lastInsertRowid)); temps++;
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
const stat = db.prepare('SELECT (SELECT COUNT(*) FROM people) p, (SELECT COUNT(*) FROM boards) b, (SELECT COUNT(*) FROM assignments) a, (SELECT MAX(date) FROM boards) d').get();
console.log('seeded', DB_FILE, stat, 'temps', temps, 'cutoff', CUTOFF);
