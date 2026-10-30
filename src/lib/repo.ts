import crypto from 'node:crypto';
import { getDb, type DB } from './db';
import { addDays, sameGroupBefore, type Shift } from './shift';
import { aggregateExperience, typicalHeadcount, assignmentMessage, availability, rankCandidates, requestMessage, type Person } from './engine';

export type Factory = { id: number; code: string; name: string };
export type Post = { id: number; factory_id: number; code: string; name: string; kind: string; sort: number; zone: string; unmanned: number; fixed: number };
export type PersonRow = Person & { affiliation: string | null; role: string | null; gender: string | null; phone: string | null; home_factory_id: number | null; unit: string };
export type Assignment = { id: number; post_id: number; person_id: number; source: string; name: string; affiliation: string | null; grp: string; work_type: string; gender: string | null; home_factory_id: number | null; unit: string };
export type AttendanceRow = { person_id: number; kind: string; note: string | null; name: string };
export const ATTENDANCE_KINDS = ['결근', '연차', '병가', '반차', '지각', '조퇴', '교육'] as const;
export type AttendanceKind = typeof ATTENDANCE_KINDS[number];
export type RequestRow = { id: number; board_id: number; post_id: number; person_id: number; vacated_person_id: number | null; rank: number; reason: string | null; status: string; token: string; channel: string; sent_at: string; expires_at: string | null; responded_at: string | null; name: string; affiliation: string | null; post_code: string; post_name: string; date: string; shift: Shift; factory_id: number; vacated_name: string | null; product: string | null };
export type Board = {
  id: number; date: string; shift: Shift; factory_id: number; status: '초안' | '입안' | '확정'; confirmed_at: string | null; copied_from: string | null; note: string | null;
  posts: (Post & { product: string | null; vacant: number; stopped: number })[];
  assignments: Assignment[];
  attendance: AttendanceRow[];
  requests: RequestRow[];
  suggestions: Record<number, { id: number; name: string; affiliation: string | null; hint: string }[]>;
};

const token = (): string => crypto.randomBytes(12).toString('hex');

export function factories(db: DB = getDb()): Factory[] { return db.prepare('SELECT id, code, name FROM factories ORDER BY sort').all() as Factory[]; }
export function factoryName(id: number, db: DB = getDb()): string { return (db.prepare('SELECT name FROM factories WHERE id=?').get(id) as { name: string } | undefined)?.name ?? ''; }
export function posts(factoryId: number, db: DB = getDb()): Post[] {
  return db.prepare('SELECT id, factory_id, code, name, kind, sort, zone, unmanned, fixed FROM posts WHERE factory_id=? AND active=1 ORDER BY sort').all(factoryId) as Post[];
}
export function people(db: DB = getDb(), activeOnly = true): PersonRow[] {
  return db.prepare(`SELECT id, name, affiliation, grp, work_type, role, gender, phone, home_factory_id, active, unit FROM people ${activeOnly ? 'WHERE active=1' : ''} ORDER BY name`).all() as PersonRow[];
}
export function findOrCreatePerson(name: string, factoryId: number | null, db: DB = getDb()): { id: number; created: boolean } {
  const clean = name.replace(/\s+/g, '');
  const row = db.prepare('SELECT id FROM people WHERE replace(name," ","")=? AND active=1 ORDER BY (work_type<>\'임시\') DESC LIMIT 1').get(clean) as { id: number } | undefined;
  if (row) return { id: row.id, created: false };
  const r = db.prepare('INSERT INTO people (name, grp, work_type, role, home_factory_id) VALUES (?, \'미정\', \'임시\', \'미정\', ?)').run(clean, factoryId);
  return { id: Number(r.lastInsertRowid), created: true };
}
export function ensureToken(personId: number, db: DB = getDb()): string {
  const r = db.prepare('SELECT token FROM people WHERE id=?').get(personId) as { token: string | null };
  if (r.token) return r.token;
  const t = token(); db.prepare('UPDATE people SET token=? WHERE id=?').run(t, personId); return t;
}

export function isWeekend(date: string): boolean { const d = new Date(date + 'T00:00:00Z').getUTCDay(); return d === 0 || d === 6; }

function boardRow(date: string, shift: Shift, factoryId: number, db: DB): { id: number; status: '초안' | '입안' | '확정'; confirmed_at: string | null; copied_from: string | null; note: string | null } | undefined {
  return db.prepare('SELECT id, status, confirmed_at, copied_from, note FROM boards WHERE date=? AND shift=? AND factory_id=?').get(date, shift, factoryId) as never;
}

/** 보드가 없으면 직전 보드를 복사해 만든다 (버튼 없음). */
export function ensureBoard(date: string, shift: Shift, factoryId: number, db: DB = getDb()): number {
  const ex = boardRow(date, shift, factoryId, db);
  if (ex) return ex.id;
  // 최근 표 중 "같은 조가 같은 근무를 한 날"의 표에서 교대 인원을, 가장 최근 표에서 제품·주간고정·임시 인원을 가져온다.
  const all = db.prepare('SELECT id, date FROM boards WHERE shift=? AND factory_id=? AND date<? ORDER BY date DESC LIMIT 60').all(shift, factoryId, date) as { id: number; date: string }[];
  // 휴일(토·일)은 최소 인원으로 돌아가므로 지난 휴일 표를 기준으로 삼는다.
  const wk = isWeekend(date);
  const pool = wk ? all.filter((r) => isWeekend(r.date)) : all.filter((r) => !isWeekend(r.date));
  const recent = (pool.length ? pool : all).slice(0, 14);
  const latest = recent[0];
  const srcDate = sameGroupBefore(date, shift, recent.map((r) => r.date));
  const src = recent.find((r) => r.date === srcDate) ?? latest;
  const ins = db.prepare('INSERT INTO boards (date, shift, factory_id, copied_from) VALUES (?,?,?,?)').run(date, shift, factoryId, src?.date ?? null);
  const id = Number(ins.lastInsertRowid);
  if (src && latest) {
    db.prepare('INSERT INTO board_posts (board_id, post_id, product, vacant) SELECT ?, post_id, product, 0 FROM board_posts WHERE board_id=?').run(id, latest.id);
    db.prepare(`INSERT OR IGNORE INTO assignments (board_id, post_id, person_id, source) SELECT ?, a.post_id, a.person_id, '복사' FROM assignments a JOIN people p ON p.id=a.person_id WHERE a.board_id=? AND p.work_type='교대'`).run(id, src.id);
    db.prepare(`INSERT OR IGNORE INTO assignments (board_id, post_id, person_id, source) SELECT ?, a.post_id, a.person_id, '복사' FROM assignments a JOIN people p ON p.id=a.person_id WHERE a.board_id=? AND p.work_type<>'교대'`).run(id, latest.id);
    db.prepare("INSERT INTO logs (board_id, action, detail) VALUES (?, '복사', ?)").run(id, src.id === latest.id ? src.date : `교대 ${src.date} · 그 외 ${latest.date}`);
  }
  return id;
}

export function getBoard(date: string, shift: Shift, factoryId: number, db: DB = getDb()): Board {
  const id = ensureBoard(date, shift, factoryId, db);
  expireDue(db);
  const b = boardRow(date, shift, factoryId, db)!;
  const ps = posts(factoryId, db);
  const bp = new Map((db.prepare('SELECT post_id, product, vacant, stopped FROM board_posts WHERE board_id=?').all(id) as { post_id: number; product: string | null; vacant: number; stopped: number }[]).map((r) => [r.post_id, r]));
  const assignments = db.prepare(`SELECT a.id, a.post_id, a.person_id, a.source, p.name, p.affiliation, p.grp, p.work_type, p.gender, p.home_factory_id, p.unit
    FROM assignments a JOIN people p ON p.id=a.person_id WHERE a.board_id=? ORDER BY a.id`).all(id) as Assignment[];
  const requests = requestsFor(`r.board_id=${id}`, db);
  const attendance = db.prepare('SELECT t.person_id, t.kind, t.note, p.name FROM attendance t JOIN people p ON p.id=t.person_id WHERE t.date=? AND t.shift=? ORDER BY t.id').all(date, shift) as AttendanceRow[];
  return {
    id, date, shift, factory_id: factoryId, status: b.status, confirmed_at: b.confirmed_at, copied_from: b.copied_from, note: b.note,
    posts: ps.map((p) => ({ ...p, product: bp.get(p.id)?.product ?? null, vacant: bp.get(p.id)?.vacant ?? 0, stopped: bp.get(p.id)?.stopped ?? 0 })),
    assignments, requests, attendance, suggestions: suggestionsFor(date, shift, factoryId, ps, assignments, db),
  };
}

function requestsFor(where: string, db: DB): RequestRow[] {
  return db.prepare(`SELECT r.*, p.name, p.affiliation, po.code AS post_code, po.name AS post_name, b.date, b.shift, b.factory_id, v.name AS vacated_name, bp.product
    FROM requests r JOIN people p ON p.id=r.person_id JOIN posts po ON po.id=r.post_id JOIN boards b ON b.id=r.board_id LEFT JOIN people v ON v.id=r.vacated_person_id LEFT JOIN board_posts bp ON bp.board_id=r.board_id AND bp.post_id=r.post_id
    WHERE ${where} ORDER BY r.sent_at DESC, r.rank`).all() as RequestRow[];
}
export function allRequests(db: DB = getDb()): RequestRow[] { expireDue(db); return requestsFor('1=1', db).slice(0, 400); }

/** 후보 계산에 필요한 경험·가용 정보 */
function rankContext(date: string, shift: Shift, factoryId: number, db: DB) {
  const since = addDays(date, -180), recentSince = addDays(date, -30);
  const hist = db.prepare(`SELECT a.person_id AS personId, a.post_id AS postId, bp.product FROM assignments a JOIN boards b ON b.id=a.board_id
    LEFT JOIN board_posts bp ON bp.board_id=a.board_id AND bp.post_id=a.post_id WHERE b.factory_id=? AND b.date>=? AND b.date<?`).all(factoryId, since, date) as { personId: number; postId: number; product: string | null }[];
  const today = new Set((db.prepare('SELECT a.person_id FROM assignments a JOIN boards b ON b.id=a.board_id WHERE b.date=?').all(date) as { person_id: number }[]).map((r) => r.person_id));
  const recent = new Map<number, number>();
  for (const r of db.prepare(`SELECT a.person_id FROM assignments a JOIN boards b ON b.id=a.board_id WHERE a.source='대체' AND b.date>=? AND b.date<?`).all(recentSince, date) as { person_id: number }[]) recent.set(r.person_id, (recent.get(r.person_id) ?? 0) + 1);
  return { people: people(db), experience: aggregateExperience(hist), assignedThatDay: today, recentSubs: recent };
}

/** 라인별 "+ 이름" 추천: 그 라인 경험자 중 오늘 투입 가능한 사람 */
function suggestionsFor(date: string, shift: Shift, factoryId: number, ps: Post[], assignments: Assignment[], db: DB): Board['suggestions'] {
  const ctx = rankContext(date, shift, factoryId, db);
  const pmap = new Map(ctx.people.map((p) => [p.id, p]));
  const out: Board['suggestions'] = {};
  const assignedHere = new Set(assignments.map((a) => a.person_id));
  for (const p of ps) {
    const c = rankCandidates({ date, shift, postId: p.id, product: null, people: ctx.people, experience: ctx.experience, assignedThatDay: new Set([...ctx.assignedThatDay, ...assignedHere]), recentSubs: ctx.recentSubs, limit: 8 });
    out[p.id] = c.map((x) => ({ id: x.personId, name: x.name, affiliation: pmap.get(x.personId)?.affiliation ?? null, hint: x.reasons.slice(0, 2).join(' · ') }));
  }
  return out;
}

/** 빈 자리 판정. 무인 라인·부동 라인은 비어 있어도 빈 자리가 아니다. */
export function isVacantPost(p: { kind: string; unmanned: number; product: string | null; vacant: number; stopped: number }, count: number): boolean {
  if (Number(p.unmanned) === 1 || Number(p.stopped) === 1) return false;
  return Number(p.vacant) === 1 || (count === 0 && p.kind === 'machine' && !!p.product);
}
/** 라인 부동(세움)/해제. 부동이면 빈 자리로 치지 않고 요청도 닫는다. */
export function setStopped(boardId: number, postId: number, stopped: boolean, db: DB = getDb()): void {
  ensureBp(boardId, postId, db);
  db.prepare('UPDATE board_posts SET stopped=?, vacant=CASE WHEN ? THEN 0 ELSE vacant END WHERE board_id=? AND post_id=?').run(stopped ? 1 : 0, stopped ? 1 : 0, boardId, postId);
  if (stopped) db.prepare("UPDATE requests SET status='취소', responded_at=datetime('now','localtime') WHERE board_id=? AND post_id=? AND status='발송'").run(boardId, postId);
  db.prepare("INSERT INTO logs (board_id, post_id, action) VALUES (?,?,?)").run(boardId, postId, stopped ? '부동' : '부동해제');
}
export function setNote(boardId: number, note: string | null, db: DB = getDb()): void {
  db.prepare('UPDATE boards SET note=? WHERE id=?').run(note && note.trim() ? note.trim() : null, boardId);
}
/** 근태 표시. 결근은 자리를 비우고 대체 요청, 연차·병가는 자리만 비움, 반차·지각·조퇴·교육은 기록만. kind=null 이면 지움. */
export type SendResult = { sent: number; candidates: { name: string; reasons: string[] }[] };
export function setAttendance(boardId: number, postId: number | null, personId: number, kind: AttendanceKind | null, note: string | null, db: DB = getDb()): SendResult {
  const b = db.prepare('SELECT date, shift FROM boards WHERE id=?').get(boardId) as { date: string; shift: Shift };
  if (!kind) { db.prepare('DELETE FROM attendance WHERE date=? AND shift=? AND person_id=?').run(b.date, b.shift, personId); return { sent: 0, candidates: [] }; }
  db.prepare('INSERT INTO attendance (date, shift, person_id, kind, note) VALUES (?,?,?,?,?) ON CONFLICT(date, shift, person_id) DO UPDATE SET kind=excluded.kind, note=excluded.note').run(b.date, b.shift, personId, kind, note);
  db.prepare("INSERT INTO logs (board_id, post_id, person_id, action, detail) VALUES (?,?,?,'근태',?)").run(boardId, postId, personId, kind);
  if (postId && (kind === '결근' || kind === '연차' || kind === '병가')) {
    removePerson(boardId, postId, personId, true, db);
    if (kind === '결근') return sendRequests(boardId, postId, personId, db);
  }
  return { sent: 0, candidates: [] };
}
/** 2공장 결재: 입안(반장) → 결정(팀장=확정). */
export function proposeBoard(boardId: number, db: DB = getDb()): void {
  db.prepare("UPDATE boards SET status='입안' WHERE id=? AND status='초안'").run(boardId);
  db.prepare("INSERT INTO logs (board_id, action) VALUES (?, '입안')").run(boardId);
}

export function setProduct(boardId: number, postId: number, product: string | null, db: DB = getDb()): void {
  db.prepare('INSERT INTO board_posts (board_id, post_id, product) VALUES (?,?,?) ON CONFLICT(board_id, post_id) DO UPDATE SET product=excluded.product').run(boardId, postId, product || null);
}
export function addPerson(boardId: number, postId: number, personId: number, source = '수동', db: DB = getDb()): void {
  db.prepare('INSERT INTO board_posts (board_id, post_id) VALUES (?,?) ON CONFLICT DO NOTHING').run(boardId, postId);
  db.prepare('INSERT OR IGNORE INTO assignments (board_id, post_id, person_id, source) VALUES (?,?,?,?)').run(boardId, postId, personId, source);
  db.prepare('UPDATE board_posts SET vacant=0 WHERE board_id=? AND post_id=?').run(boardId, postId);
  db.prepare("INSERT INTO logs (board_id, post_id, person_id, action) VALUES (?,?,?,'추가')").run(boardId, postId, personId);
}
function ensureBp(boardId: number, postId: number, db: DB): void {
  db.prepare('INSERT INTO board_posts (board_id, post_id) VALUES (?,?) ON CONFLICT DO NOTHING').run(boardId, postId);
}
export function removePerson(boardId: number, postId: number, personId: number, absent: boolean, db: DB = getDb()): void {
  db.prepare('DELETE FROM assignments WHERE board_id=? AND post_id=? AND person_id=?').run(boardId, postId, personId);
  if (absent) { ensureBp(boardId, postId, db); db.prepare('UPDATE board_posts SET vacant=1 WHERE board_id=? AND post_id=?').run(boardId, postId); }
  db.prepare("INSERT INTO logs (board_id, post_id, person_id, action) VALUES (?,?,?,?)").run(boardId, postId, personId, absent ? '결근' : '빼기');
}
export function clearVacancy(boardId: number, postId: number, db: DB = getDb()): void {
  db.prepare('UPDATE board_posts SET vacant=0 WHERE board_id=? AND post_id=?').run(boardId, postId);
  db.prepare("UPDATE requests SET status='취소', responded_at=datetime('now','localtime') WHERE board_id=? AND post_id=? AND status='발송'").run(boardId, postId);
}

/** 보낸 요청 거두기. 자리는 그대로 비워 둔다. requestId를 주면 그 한 명만. */
export function cancelRequests(boardId: number, postId: number, requestId: number | null, db: DB = getDb()): { cancelled: number } {
  const rows = db.prepare(`SELECT r.id, r.person_id, b.date, b.shift, b.factory_id, po.name AS post_name, bp.product FROM requests r JOIN boards b ON b.id=r.board_id JOIN posts po ON po.id=r.post_id
    LEFT JOIN board_posts bp ON bp.board_id=r.board_id AND bp.post_id=r.post_id WHERE r.board_id=? AND r.post_id=? AND r.status='발송' ${requestId ? 'AND r.id=?' : ''}`).all(...(requestId ? [boardId, postId, requestId] : [boardId, postId])) as { id: number; person_id: number; date: string; shift: Shift; factory_id: number; post_name: string; product: string | null }[];
  for (const r of rows) {
    db.prepare("UPDATE requests SET status='취소', responded_at=datetime('now','localtime') WHERE id=?").run(r.id);
    sendMessage(r.person_id, '요청', `[대체 요청 취소] ${+r.date.slice(5, 7)}/${+r.date.slice(8, 10)} ${r.shift} ${factoryName(r.factory_id, db)} ${r.post_name}${r.product ? ' ' + r.product : ''} — 이 요청은 취소되었습니다. 응답하지 않으셔도 됩니다.`, null, db);
  }
  if (rows.length) db.prepare("INSERT INTO logs (board_id, post_id, action, detail) VALUES (?,?,'요청취소',?)").run(boardId, postId, `${rows.length}명`);
  return { cancelled: rows.length };
}

export function sendRequests(boardId: number, postId: number, vacatedId: number | null, db: DB = getDb()): SendResult {
  const b = db.prepare('SELECT date, shift, factory_id, status FROM boards WHERE id=?').get(boardId) as { date: string; shift: Shift; factory_id: number; status: string };
  const post = db.prepare('SELECT code, name FROM posts WHERE id=?').get(postId) as { code: string; name: string };
  const product = (db.prepare('SELECT product FROM board_posts WHERE board_id=? AND post_id=?').get(boardId, postId) as { product: string | null } | undefined)?.product ?? null;
  const asked = new Set((db.prepare('SELECT person_id FROM requests WHERE board_id=? AND post_id=?').all(boardId, postId) as { person_id: number }[]).map((r) => r.person_id));
  if (vacatedId) asked.add(vacatedId);
  const ctx = rankContext(b.date, b.shift, b.factory_id, db);
  const ranked = rankCandidates({ date: b.date, shift: b.shift, postId, product, ...ctx, excludeIds: asked, limit: 3 });
  const expires = new Date(Date.now() + 20 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
  const fac = factoryName(b.factory_id, db);
  const ins = db.prepare('INSERT INTO requests (board_id, post_id, person_id, vacated_person_id, rank, reason, token, expires_at) VALUES (?,?,?,?,?,?,?,?)');
  const startRank = (db.prepare('SELECT COUNT(*) c FROM requests WHERE board_id=? AND post_id=?').get(boardId, postId) as { c: number }).c;
  ranked.forEach((c, i) => {
    const t = token();
    ins.run(boardId, postId, c.personId, vacatedId, startRank + i + 1, c.reasons.join(' · '), t, expires);
    sendMessage(c.personId, '요청', requestMessage({ date: b.date, shift: b.shift, factory: fac, post: post.name, product }), `/r/${t}`, db);
  });
  ensureBp(boardId, postId, db);
  db.prepare('UPDATE board_posts SET vacant=1 WHERE board_id=? AND post_id=?').run(boardId, postId);
  db.prepare("INSERT INTO logs (board_id, post_id, person_id, action, detail) VALUES (?,?,?,'대체요청',?)").run(boardId, postId, vacatedId, `${ranked.length}명`);
  return { sent: ranked.length, candidates: ranked.map((c) => ({ name: c.name, reasons: c.reasons })) };
}
export function nextCandidates(boardId: number, postId: number, db: DB = getDb()): SendResult {
  db.prepare("UPDATE requests SET status='만료', responded_at=datetime('now','localtime') WHERE board_id=? AND post_id=? AND status='발송'").run(boardId, postId);
  const v = db.prepare('SELECT vacated_person_id FROM requests WHERE board_id=? AND post_id=? LIMIT 1').get(boardId, postId) as { vacated_person_id: number | null } | undefined;
  return sendRequests(boardId, postId, v?.vacated_person_id ?? null, db);
}
export function expireDue(db: DB = getDb()): void {
  db.prepare("UPDATE requests SET status='만료', responded_at=datetime('now','localtime') WHERE status='발송' AND expires_at < datetime('now')").run();
}

/** 알림 발송. 지금은 DB에만 저장(데모). 알림톡·SMS 연동 시 이 함수만 바꾼다. */
export function sendMessage(personId: number, kind: '요청' | '배치' | '변경', body: string, link: string | null, db: DB = getDb()): void {
  db.prepare('INSERT INTO messages (person_id, kind, body, link) VALUES (?,?,?,?)').run(personId, kind, body, link);
}
export function respond(tok: string, action: 'accept' | 'decline', db: DB = getDb()): { ok: boolean; message: string } {
  const r = db.prepare('SELECT * FROM requests WHERE token=?').get(tok) as (RequestRow & { board_id: number }) | undefined;
  if (!r) return { ok: false, message: '요청을 찾을 수 없습니다' };
  if (r.status !== '발송') return { ok: false, message: r.status === '수락' ? '이미 수락한 요청입니다' : '마감된 요청입니다' };
  const now = "datetime('now','localtime')";
  if (action === 'decline') { db.prepare(`UPDATE requests SET status='거절', responded_at=${now} WHERE id=?`).run(r.id); return { ok: true, message: '알겠습니다. 다음에 또 부탁드릴게요.' }; }
  const taken = db.prepare("SELECT 1 FROM requests WHERE board_id=? AND post_id=? AND status='수락'").get(r.board_id, r.post_id);
  if (taken) { db.prepare(`UPDATE requests SET status='만료', responded_at=${now} WHERE id=?`).run(r.id); return { ok: false, message: '다른 분이 먼저 수락했습니다' }; }
  db.prepare(`UPDATE requests SET status='수락', responded_at=${now} WHERE id=?`).run(r.id);
  const others = db.prepare("SELECT person_id FROM requests WHERE board_id=? AND post_id=? AND status='발송'").all(r.board_id, r.post_id) as { person_id: number }[];
  db.prepare(`UPDATE requests SET status='만료', responded_at=${now} WHERE board_id=? AND post_id=? AND status='발송'`).run(r.board_id, r.post_id);
  for (const o of others) sendMessage(o.person_id, '요청', `[대체 요청 마감] ${+r.date.slice(5, 7)}/${+r.date.slice(8, 10)} ${r.shift} ${r.post_name} — 다른 분이 먼저 수락했습니다. 감사합니다.`, null, db);
  addPerson(r.board_id, r.post_id, r.person_id, '대체', db);
  const b = db.prepare('SELECT date, shift, factory_id, status FROM boards WHERE id=?').get(r.board_id) as { date: string; shift: Shift; factory_id: number; status: string };
  if (b.status === '확정') {
    const post = db.prepare('SELECT name FROM posts WHERE id=?').get(r.post_id) as { name: string };
    const product = (db.prepare('SELECT product FROM board_posts WHERE board_id=? AND post_id=?').get(r.board_id, r.post_id) as { product: string | null } | undefined)?.product ?? null;
    sendMessage(r.person_id, '배치', assignmentMessage({ date: b.date, shift: b.shift, factory: factoryName(b.factory_id, db), post: post.name, product }), `/me/${ensureToken(r.person_id, db)}`, db);
  }
  return { ok: true, message: '수락했습니다. 배치표에 들어갔습니다.' };
}

/** 자동 채우기: 제품이 적힌 라인마다 과거 표의 보통 인원만큼, 후보 순위대로 채운다. 이미 있는 사람은 그대로 둔다. */
export function autoFill(boardId: number, db: DB = getDb()): { filled: number; lines: number; need: number } {
  const b = db.prepare('SELECT date, shift, factory_id, status FROM boards WHERE id=?').get(boardId) as { date: string; shift: Shift; factory_id: number; status: string };
  if (b.status === '확정') return { filled: 0, lines: 0, need: 0 };
  const targets = db.prepare(`SELECT bp.post_id, bp.product FROM board_posts bp JOIN posts po ON po.id=bp.post_id
    WHERE bp.board_id=? AND po.kind='machine' AND po.unmanned=0 AND COALESCE(bp.stopped,0)=0 AND bp.product IS NOT NULL AND bp.product<>'' ORDER BY po.sort`).all(boardId) as { post_id: number; product: string }[];
  const since = addDays(b.date, -365);
  const histCounts = db.prepare(`SELECT a.post_id, bp.product, COUNT(*) c FROM assignments a JOIN boards bo ON bo.id=a.board_id
    JOIN board_posts bp ON bp.board_id=a.board_id AND bp.post_id=a.post_id WHERE bo.factory_id=? AND bo.date>=? AND bo.date<? GROUP BY a.board_id, a.post_id`).all(b.factory_id, since, b.date) as { post_id: number; product: string | null; c: number }[];
  const ctx = rankContext(b.date, b.shift, b.factory_id, db);
  const taken = new Set<number>();
  let filled = 0, lines = 0, need = 0;
  for (const t of targets) {
    const same = histCounts.filter((h) => h.post_id === t.post_id && h.product === t.product).map((h) => h.c);
    const any = histCounts.filter((h) => h.post_id === t.post_id).map((h) => h.c);
    const want = typicalHeadcount(same.length ? same : any, 1);
    const have = (db.prepare('SELECT COUNT(*) c FROM assignments WHERE board_id=? AND post_id=?').get(boardId, t.post_id) as { c: number }).c;
    if (have >= want) continue;
    need += want - have;
    const picks = rankCandidates({ date: b.date, shift: b.shift, postId: t.post_id, product: t.product, ...ctx, excludeIds: taken, limit: want - have });
    if (picks.length) lines++;
    for (const c of picks) { addPerson(boardId, t.post_id, c.personId, '자동', db); taken.add(c.personId); ctx.assignedThatDay.add(c.personId); filled++; }
  }
  if (filled) db.prepare("INSERT INTO logs (board_id, action, detail) VALUES (?, '자동채우기', ?)").run(boardId, `${lines}라인 ${filled}명`);
  return { filled, lines, need };
}

/** 라인 코드로 대체 후보를 본다(봇·검색용). 이미 그날 배치된 사람 제외. */
export function candidatesFor(date: string, shift: Shift, factoryId: number, postCode: string, limit = 5, db: DB = getDb()): { personId: number; name: string; reasons: string[] }[] {
  const post = db.prepare('SELECT id FROM posts WHERE factory_id=? AND (code=? OR code=?)').get(factoryId, postCode, postCode.padStart(2, '0')) as { id: number } | undefined;
  if (!post) return [];
  const b = db.prepare('SELECT id FROM boards WHERE date=? AND shift=? AND factory_id=?').get(date, shift, factoryId) as { id: number } | undefined;
  const product = b ? ((db.prepare('SELECT product FROM board_posts WHERE board_id=? AND post_id=?').get(b.id, post.id) as { product: string | null } | undefined)?.product ?? null) : null;
  const ctx = rankContext(date, shift, factoryId, db);
  return rankCandidates({ date, shift, postId: post.id, product, ...ctx, limit }).map((c) => ({ personId: c.personId, name: c.name, reasons: c.reasons }));
}

export function confirmBoard(boardId: number, db: DB = getDb()): { notified: number } {
  const b = db.prepare('SELECT date, shift, factory_id FROM boards WHERE id=?').get(boardId) as { date: string; shift: Shift; factory_id: number };
  const fac = factoryName(b.factory_id, db);
  const rows = db.prepare(`SELECT a.person_id, po.name AS post, bp.product FROM assignments a JOIN posts po ON po.id=a.post_id
    LEFT JOIN board_posts bp ON bp.board_id=a.board_id AND bp.post_id=a.post_id WHERE a.board_id=?`).all(boardId) as { person_id: number; post: string; product: string | null }[];
  const prefix = `${+b.date.slice(5, 7)}/${+b.date.slice(8, 10)} ${b.shift} ${fac}`;
  const sent = db.prepare("SELECT person_id, body FROM messages WHERE kind IN ('배치','변경') AND body LIKE ?").all(`%${prefix}%`) as { person_id: number; body: string }[];
  let notified = 0;
  for (const r of rows) {
    const body = assignmentMessage({ date: b.date, shift: b.shift, factory: fac, post: r.post, product: r.product });
    const same = sent.some((s) => s.person_id === r.person_id && s.body.replace(/^\[[^\]]+\]/, '') === body.replace(/^\[[^\]]+\]/, ''));
    if (same) continue;
    const changed = sent.some((s) => s.person_id === r.person_id);
    sendMessage(r.person_id, changed ? '변경' : '배치', changed ? assignmentMessage({ date: b.date, shift: b.shift, factory: fac, post: r.post, product: r.product, changed: true }) : body, `/me/${ensureToken(r.person_id, db)}`, db);
    notified++;
  }
  db.prepare("UPDATE boards SET status='확정', confirmed_at=datetime('now','localtime') WHERE id=?").run(boardId);
  db.prepare("INSERT INTO logs (board_id, action, detail) VALUES (?, '확정', ?)").run(boardId, `${rows.length}명, 알림 ${notified}`);
  return { notified };
}
export function unconfirmBoard(boardId: number, db: DB = getDb()): void {
  db.prepare("UPDATE boards SET status='초안', confirmed_at=NULL WHERE id=?").run(boardId);
  db.prepare("INSERT INTO logs (board_id, action) VALUES (?, '확정해제')").run(boardId);
}

export function myWork(tok: string, db: DB = getDb()) {
  const p = db.prepare('SELECT id, name, affiliation, grp, work_type FROM people WHERE token=?').get(tok) as { id: number; name: string; affiliation: string | null; grp: string; work_type: string } | undefined;
  if (!p) return null;
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
  const rows = db.prepare(`SELECT b.date, b.shift, b.status, b.factory_id, po.name AS post, bp.product FROM assignments a JOIN boards b ON b.id=a.board_id JOIN posts po ON po.id=a.post_id
    LEFT JOIN board_posts bp ON bp.board_id=a.board_id AND bp.post_id=a.post_id WHERE a.person_id=? AND b.date BETWEEN ? AND ? ORDER BY b.date, b.shift`).all(p.id, addDays(today, -1), addDays(today, 6)) as { date: string; shift: Shift; status: string; factory_id: number; post: string; product: string | null }[];
  const messages = db.prepare('SELECT id, kind, body, link, sent_at, read_at FROM messages WHERE person_id=? ORDER BY sent_at DESC LIMIT 20').all(p.id) as { id: number; kind: string; body: string; link: string | null; sent_at: string; read_at: string | null }[];
  const facs = new Map(factories(db).map((f) => [f.id, f.name]));
  const avail = (['주간', '야간'] as Shift[]);
  return { person: p, today, assignments: rows.map((r) => ({ ...r, factory: facs.get(r.factory_id) ?? '' })), messages, offToday: !availability({ ...p, active: 1 } as Person, today, avail[0]).ok ? null : null };
}
export function markRead(tok: string, messageId: number, db: DB = getDb()): boolean {
  const p = db.prepare('SELECT id FROM people WHERE token=?').get(tok) as { id: number } | undefined;
  if (!p) return false;
  db.prepare("UPDATE messages SET read_at=datetime('now','localtime') WHERE id=? AND person_id=?").run(messageId, p.id);
  return true;
}
export function requestByToken(tok: string, db: DB = getDb()): (RequestRow & { product: string | null }) | null {
  expireDue(db);
  const r = requestsFor(`r.token='${tok.replace(/[^a-f0-9]/g, '')}'`, db)[0];
  if (!r) return null;
  const product = (db.prepare('SELECT product FROM board_posts WHERE board_id=? AND post_id=?').get(r.board_id, r.post_id) as { product: string | null } | undefined)?.product ?? null;
  return { ...r, product };
}
