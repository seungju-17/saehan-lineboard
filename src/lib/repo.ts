import crypto from 'node:crypto';
import { getDb, type DB } from './db';
import { addDays, groupsOn, sameGroupBefore, weekRange, type Shift } from './shift';
import { defaultPassword, hashPassword } from './auth';
import { aggregateExperience, typicalHeadcount, assignmentMessage, rankCandidates, requestMessage, type Person } from './engine';

export type Factory = { id: number; code: string; name: string };
export type Post = { id: number; factory_id: number; code: string; name: string; kind: string; sort: number; zone: string; unmanned: number; fixed: number };
export type PersonRow = Person & { affiliation: string | null; role: string | null; gender: string | null; phone: string | null; home_factory_id: number | null; unit: string };
export type Assignment = { id: number; post_id: number; person_id: number; source: string; name: string; affiliation: string | null; grp: string; work_type: string; gender: string | null; home_factory_id: number | null; unit: string };
export type AttendanceRow = { person_id: number; kind: string; note: string | null; name: string };
import { DEFAULT_SETTINGS, SETTING_RANGE, VACATING_KINDS, OPTIONAL_KINDS, isVacantPost, type AttendanceKind, type Settings, type Role } from './rules';
export { ATTENDANCE_KINDS, DEFAULT_SETTINGS, VACATING_KINDS, OPTIONAL_KINDS, isVacantPost, needFor, CAN, type AttendanceKind, type Settings, type VacancyInput, type Role } from './rules';
export type RequestRow = { id: number; board_id: number; post_id: number; person_id: number; vacated_person_id: number | null; rank: number; reason: string | null; status: string; token: string; channel: string; sent_at: string; expires_at: string | null; responded_at: string | null; name: string; affiliation: string | null; post_code: string; post_name: string; date: string; shift: Shift; factory_id: number; vacated_name: string | null; vacated_kind: string | null; product: string | null };
export type Board = {
  id: number; date: string; shift: Shift; factory_id: number; status: '초안' | '입안' | '확정'; confirmed_at: string | null; copied_from: string | null; note: string | null;
  posts: (Post & { product: string | null; vacant: number; stopped: number; need: number | null })[];
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
    // 제품은 지난 표에서 실제로 돌린 라인(사람이 있었고 부동이 아닌)과 무인 라인만 가져온다. 안 돌린 라인은 엑셀처럼 빈 줄로 시작한다.
    db.prepare(`INSERT INTO board_posts (board_id, post_id, product, vacant, need) SELECT ?, bp.post_id,
      CASE WHEN COALESCE(bp.stopped,0)=0 AND (po.unmanned=1 OR EXISTS (SELECT 1 FROM assignments a WHERE a.board_id=bp.board_id AND a.post_id=bp.post_id)) THEN bp.product ELSE NULL END, 0, bp.need
      FROM board_posts bp JOIN posts po ON po.id=bp.post_id WHERE bp.board_id=?`).run(id, latest.id);
    db.prepare(`INSERT OR IGNORE INTO assignments (board_id, post_id, person_id, source) SELECT ?, a.post_id, a.person_id, '복사' FROM assignments a JOIN people p ON p.id=a.person_id WHERE a.board_id=? AND p.work_type='교대'`).run(id, src.id);
    db.prepare(`INSERT OR IGNORE INTO assignments (board_id, post_id, person_id, source) SELECT ?, a.post_id, a.person_id, '복사' FROM assignments a JOIN people p ON p.id=a.person_id WHERE a.board_id=? AND p.work_type<>'교대'`).run(id, latest.id);
    // 사람이 복사되지 않은 유인 라인은 오늘 안 돌리는 것으로 보고 제품도 비운다 (제품은 최근 표, 사람은 같은 조 표에서 오므로 어긋날 수 있다)
    db.prepare(`UPDATE board_posts SET product=NULL, need=NULL WHERE board_id=? AND post_id IN (SELECT po.id FROM posts po WHERE po.kind='machine' AND po.unmanned=0)
      AND NOT EXISTS (SELECT 1 FROM assignments a WHERE a.board_id=board_posts.board_id AND a.post_id=board_posts.post_id)`).run(id);
    // 필요 인원 = 복사돼 들어온 인원
    db.prepare('INSERT OR IGNORE INTO board_posts (board_id, post_id) SELECT DISTINCT ?, post_id FROM assignments WHERE board_id=?').run(id, id);
    db.prepare('UPDATE board_posts SET need=COALESCE(NULLIF((SELECT COUNT(*) FROM assignments a WHERE a.board_id=board_posts.board_id AND a.post_id=board_posts.post_id), 0), need) WHERE board_id=?').run(id);
    db.prepare("INSERT INTO logs (board_id, action, detail) VALUES (?, '복사', ?)").run(id, src.id === latest.id ? src.date : `교대 ${src.date} · 그 외 ${latest.date}`);
  }
  return id;
}

/** 달력용: 그 달에 있는 표의 상태·근무 인원·빈 자리 수 */
export function monthSummary(month: string, shift: Shift, factoryId: number, db: DB = getDb()): { date: string; status: string; vacant: number; workers: number }[] {
  const rows = db.prepare('SELECT id, date, status FROM boards WHERE shift=? AND factory_id=? AND date LIKE ? ORDER BY date').all(shift, factoryId, `${month}-%`) as { id: number; date: string; status: string }[];
  const ps = posts(factoryId, db);
  return rows.map((b) => {
    const bp = new Map((db.prepare('SELECT post_id, product, vacant, stopped, need FROM board_posts WHERE board_id=?').all(b.id) as { post_id: number; product: string | null; vacant: number; stopped: number; need: number | null }[]).map((r) => [r.post_id, r]));
    const cnt = new Map<number, number>();
    let workers = 0;
    for (const r of db.prepare('SELECT post_id FROM assignments WHERE board_id=?').all(b.id) as { post_id: number }[]) { cnt.set(r.post_id, (cnt.get(r.post_id) ?? 0) + 1); workers++; }
    const vacant = ps.filter((p) => { const x = bp.get(p.id); return isVacantPost({ kind: p.kind, unmanned: p.unmanned, product: x?.product ?? null, vacant: x?.vacant ?? 0, stopped: x?.stopped ?? 0, need: x?.need ?? null }, cnt.get(p.id) ?? 0); }).length;
    return { date: b.date, status: b.status, vacant, workers };
  });
}
export function getBoard(date: string, shift: Shift, factoryId: number, db: DB = getDb()): Board {
  const id = ensureBoard(date, shift, factoryId, db);
  expireDue(db);
  const b = boardRow(date, shift, factoryId, db)!;
  const ps = posts(factoryId, db);
  const bp = new Map((db.prepare('SELECT post_id, product, vacant, stopped, need FROM board_posts WHERE board_id=?').all(id) as { post_id: number; product: string | null; vacant: number; stopped: number; need: number | null }[]).map((r) => [r.post_id, r]));
  const assignments = db.prepare(`SELECT a.id, a.post_id, a.person_id, a.source, p.name, p.affiliation, p.grp, p.work_type, p.gender, p.home_factory_id, p.unit
    FROM assignments a JOIN people p ON p.id=a.person_id WHERE a.board_id=? ORDER BY a.id`).all(id) as Assignment[];
  const requests = requestsFor(`r.board_id=${id}`, db);
  const attendance = db.prepare('SELECT t.person_id, t.kind, t.note, p.name FROM attendance t JOIN people p ON p.id=t.person_id WHERE t.date=? AND t.shift=? ORDER BY t.id').all(date, shift) as AttendanceRow[];
  return {
    id, date, shift, factory_id: factoryId, status: b.status, confirmed_at: b.confirmed_at, copied_from: b.copied_from, note: b.note,
    posts: ps.map((p) => ({ ...p, product: bp.get(p.id)?.product ?? null, vacant: bp.get(p.id)?.vacant ?? 0, stopped: bp.get(p.id)?.stopped ?? 0, need: bp.get(p.id)?.need ?? null })),
    assignments, requests, attendance, suggestions: suggestionsFor(date, shift, factoryId, ps, assignments, db),
  };
}

function requestsFor(where: string, db: DB): RequestRow[] {
  return db.prepare(`SELECT r.*, p.name, p.affiliation, po.code AS post_code, po.name AS post_name, b.date, b.shift, b.factory_id, v.name AS vacated_name, t.kind AS vacated_kind, bp.product
    FROM requests r JOIN people p ON p.id=r.person_id JOIN posts po ON po.id=r.post_id JOIN boards b ON b.id=r.board_id LEFT JOIN people v ON v.id=r.vacated_person_id LEFT JOIN attendance t ON t.date=b.date AND t.shift=b.shift AND t.person_id=r.vacated_person_id LEFT JOIN board_posts bp ON bp.board_id=r.board_id AND bp.post_id=r.post_id
    WHERE ${where} ORDER BY r.sent_at DESC, r.rank`).all() as RequestRow[];
}
export function allRequests(db: DB = getDb()): RequestRow[] { expireDue(db); return requestsFor('1=1', db).slice(0, 400); }

export function getSettings(db: DB = getDb()): Settings {
  const out = { ...DEFAULT_SETTINGS };
  for (const r of db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]) {
    if (r.key in out) { const n = Number(r.value); if (Number.isFinite(n)) out[r.key as keyof Settings] = n; }
  }
  return out;
}
export function setSettings(patch: Partial<Settings>, db: DB = getDb()): Settings {
  const up = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
  for (const k of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    if (patch[k] === undefined) continue;
    const n = Number(patch[k]); const [lo, hi] = SETTING_RANGE[k];
    if (!Number.isInteger(n) || n < lo || n > hi) throw new Error(`${k}: ${lo}~${hi} 사이 정수여야 합니다`);
    up.run(k, String(n));
  }
  return getSettings(db);
}
/** 이번 주(월~일) 사람별 근무시간. 배치된 교대 수 × 한 교대 시간. 공장 구분 없이 센다. */
export function weekHoursFor(date: string, db: DB = getDb(), shiftHours = getSettings(db).shift_hours): Map<number, number> {
  const w = weekRange(date);
  const out = new Map<number, number>();
  for (const r of db.prepare('SELECT a.person_id, COUNT(DISTINCT b.date || b.shift) c FROM assignments a JOIN boards b ON b.id=a.board_id WHERE b.date BETWEEN ? AND ? GROUP BY a.person_id').all(w.from, w.to) as { person_id: number; c: number }[]) out.set(r.person_id, r.c * shiftHours);
  return out;
}

/** 후보 계산에 필요한 경험·가용 정보 */
function rankContext(date: string, shift: Shift, factoryId: number, db: DB) {
  const st = getSettings(db);
  const since = addDays(date, -180), recentSince = addDays(date, -30);
  const hist = db.prepare(`SELECT a.person_id AS personId, a.post_id AS postId, bp.product FROM assignments a JOIN boards b ON b.id=a.board_id
    LEFT JOIN board_posts bp ON bp.board_id=a.board_id AND bp.post_id=a.post_id WHERE b.factory_id=? AND b.date>=? AND b.date<?`).all(factoryId, since, date) as { personId: number; postId: number; product: string | null }[];
  const today = new Set((db.prepare('SELECT a.person_id FROM assignments a JOIN boards b ON b.id=a.board_id WHERE b.date=?').all(date) as { person_id: number }[]).map((r) => r.person_id));
  // 오늘 결근·연차·병가로 빠진 사람은 다른 자리 후보로도 올리지 않는다 (지각·조퇴 등 기록만 한 사람은 그대로 근무 중이라 위에서 이미 걸러진다)
  for (const r of db.prepare("SELECT person_id FROM attendance WHERE date=? AND kind IN ('결근','연차','병가')").all(date) as { person_id: number }[]) today.add(r.person_id);
  // 반차·조퇴·교육으로 자리를 비우고 요청을 보낸 사람도 그날은 뺀다 (자리에서 빠졌으면 요청 기록이 있다)
  for (const r of db.prepare("SELECT DISTINCT r.vacated_person_id person_id FROM requests r JOIN boards b ON b.id=r.board_id WHERE b.date=? AND r.vacated_person_id IS NOT NULL").all(date) as { person_id: number }[]) today.add(r.person_id);
  const recent = new Map<number, number>();
  for (const r of db.prepare(`SELECT a.person_id FROM assignments a JOIN boards b ON b.id=a.board_id WHERE a.source='대체' AND b.date>=? AND b.date<?`).all(recentSince, date) as { person_id: number }[]) recent.set(r.person_id, (recent.get(r.person_id) ?? 0) + 1);
  return { people: people(db), experience: aggregateExperience(hist), assignedThatDay: today, recentSubs: recent, weekHours: weekHoursFor(date, db, st.shift_hours), shiftHours: st.shift_hours, maxWeekHours: st.week_max_hours };
}

/** 라인별 "+ 이름" 추천: 그 라인 경험자 중 오늘 투입 가능한 사람 */
function suggestionsFor(date: string, shift: Shift, factoryId: number, ps: Post[], assignments: Assignment[], db: DB): Board['suggestions'] {
  const ctx = rankContext(date, shift, factoryId, db);
  const pmap = new Map(ctx.people.map((p) => [p.id, p]));
  const out: Board['suggestions'] = {};
  const assignedHere = new Set(assignments.map((a) => a.person_id));
  for (const p of ps) {
    const c = rankCandidates({ date, shift, postId: p.id, product: null, people: ctx.people, experience: ctx.experience, assignedThatDay: new Set([...ctx.assignedThatDay, ...assignedHere]), recentSubs: ctx.recentSubs, weekHours: ctx.weekHours, shiftHours: ctx.shiftHours, maxWeekHours: ctx.maxWeekHours, limit: 8 });
    out[p.id] = c.map((x) => ({ id: x.personId, name: x.name, affiliation: pmap.get(x.personId)?.affiliation ?? null, hint: x.reasons.slice(0, 2).join(' · ') }));
  }
  return out;
}

/** 필요 인원 바꾸기. null 이면 기본값으로 돌아간다. */
export function setNeed(boardId: number, postId: number, need: number | null, db: DB = getDb()): void {
  if (need !== null && (!Number.isInteger(need) || need < 0 || need > 20)) throw new Error('필요 인원은 0~20 사이여야 합니다');
  ensureBp(boardId, postId, db);
  db.prepare('UPDATE board_posts SET need=?, vacant=0 WHERE board_id=? AND post_id=?').run(need, boardId, postId);
  db.prepare("INSERT INTO logs (board_id, post_id, action, detail) VALUES (?,?,'인원',?)").run(boardId, postId, need === null ? '기본' : `${need}명`);
  // 필요 인원을 낮춰서 자리가 찼으면 기다리는 요청은 거둔다
  if (need !== null && countAt(boardId, postId, db) >= need) cancelRequests(boardId, postId, null, db);
}
function countAt(boardId: number, postId: number, db: DB): number {
  return (db.prepare('SELECT COUNT(*) c FROM assignments WHERE board_id=? AND post_id=?').get(boardId, postId) as { c: number }).c;
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
export type SendResult = { sent: number; candidates: { name: string; reasons: string[] }[] };
/** 근태 표시. 결근·연차·병가는 자리를 비우고 대체 요청. 반차·조퇴·교육은 request=true 일 때만 비우고 요청, 아니면 기록만. 지각은 기록만. kind=null 이면 지움. */
export function setAttendance(boardId: number, postId: number | null, personId: number, kind: AttendanceKind | null, note: string | null, db: DB = getDb(), request?: boolean): SendResult {
  const b = db.prepare('SELECT date, shift FROM boards WHERE id=?').get(boardId) as { date: string; shift: Shift };
  if (!kind) { db.prepare('DELETE FROM attendance WHERE date=? AND shift=? AND person_id=?').run(b.date, b.shift, personId); return { sent: 0, candidates: [] }; }
  db.prepare('INSERT INTO attendance (date, shift, person_id, kind, note) VALUES (?,?,?,?,?) ON CONFLICT(date, shift, person_id) DO UPDATE SET kind=excluded.kind, note=excluded.note').run(b.date, b.shift, personId, kind, note);
  db.prepare("INSERT INTO logs (board_id, post_id, person_id, action, detail) VALUES (?,?,?,'근태',?)").run(boardId, postId, personId, kind);
  const send = request ?? VACATING_KINDS.includes(kind);
  if (postId && (VACATING_KINDS.includes(kind) || (send && OPTIONAL_KINDS.includes(kind)))) {
    removePerson(boardId, postId, personId, true, db);
    if (send) return sendRequests(boardId, postId, personId, db);
    // 요청 없이 자리만 비움: 남은 인원으로 충분하다는 뜻이므로 필요 인원을 지금 인원으로 맞춘다
    db.prepare('UPDATE board_posts SET need=COALESCE(need, ?) WHERE board_id=? AND post_id=?').run(countAt(boardId, postId, db), boardId, postId);
  }
  return { sent: 0, candidates: [] };
}
/** 2공장 결재: 입안(반장) → 결정(팀장=확정). */
export function proposeBoard(boardId: number, db: DB = getDb()): void {
  db.prepare("UPDATE boards SET status='입안' WHERE id=? AND status='초안'").run(boardId);
  db.prepare("INSERT INTO logs (board_id, action) VALUES (?, '입안')").run(boardId);
}

export function setProduct(boardId: number, postId: number, product: string | null, db: DB = getDb()): void {
  const before = db.prepare('SELECT product FROM board_posts WHERE board_id=? AND post_id=?').get(boardId, postId) as { product: string | null } | undefined;
  db.prepare('INSERT INTO board_posts (board_id, post_id, product) VALUES (?,?,?) ON CONFLICT(board_id, post_id) DO UPDATE SET product=excluded.product').run(boardId, postId, product || null);
  // 제품이 바뀌면 그 제품으로 섰던 날의 인원을 필요 인원으로 제안한다
  if (product && product !== (before?.product ?? null)) {
    const b = db.prepare('SELECT date, factory_id FROM boards WHERE id=?').get(boardId) as { date: string; factory_id: number };
    const counts = (db.prepare(`SELECT COUNT(*) c FROM assignments a JOIN boards bo ON bo.id=a.board_id JOIN board_posts bp ON bp.board_id=a.board_id AND bp.post_id=a.post_id
      WHERE a.post_id=? AND bp.product=? AND bo.date>=? AND bo.date<? GROUP BY a.board_id`).all(postId, product, addDays(b.date, -365), b.date) as { c: number }[]).map((r) => r.c);
    if (counts.length) db.prepare('UPDATE board_posts SET need=? WHERE board_id=? AND post_id=?').run(typicalHeadcount(counts, 1), boardId, postId);
  }
}
export function addPerson(boardId: number, postId: number, personId: number, source = '수동', db: DB = getDb()): void {
  db.prepare('INSERT INTO board_posts (board_id, post_id) VALUES (?,?) ON CONFLICT DO NOTHING').run(boardId, postId);
  db.prepare('INSERT OR IGNORE INTO assignments (board_id, post_id, person_id, source) VALUES (?,?,?,?)').run(boardId, postId, personId, source);
  // 필요 인원보다 많이 넣었으면 오늘은 그만큼 필요한 것으로 본다 (대체·자동 투입은 빈 자리를 채우는 것이라 제외)
  if (source === '수동' || source === '복사') db.prepare('UPDATE board_posts SET vacant=0, need=CASE WHEN need IS NOT NULL AND need < ? THEN ? ELSE need END WHERE board_id=? AND post_id=?').run(countAt(boardId, postId, db), countAt(boardId, postId, db), boardId, postId);
  else db.prepare('UPDATE board_posts SET vacant=0 WHERE board_id=? AND post_id=?').run(boardId, postId);
  db.prepare("INSERT INTO logs (board_id, post_id, person_id, action) VALUES (?,?,?,'추가')").run(boardId, postId, personId);
}
function ensureBp(boardId: number, postId: number, db: DB): void {
  db.prepare('INSERT INTO board_posts (board_id, post_id) VALUES (?,?) ON CONFLICT DO NOTHING').run(boardId, postId);
}
/** 사람 빼기. absent=false(일부러 뺌)이면 필요 인원을 남은 인원으로 낮추고, 유인 라인에서 마지막 한 명까지 빼면 오늘 안 돌리는 라인으로 보고 부동 처리한다. */
export function removePerson(boardId: number, postId: number, personId: number, absent: boolean, db: DB = getDb()): { stopped: boolean } {
  db.prepare('DELETE FROM assignments WHERE board_id=? AND post_id=? AND person_id=?').run(boardId, postId, personId);
  db.prepare("INSERT INTO logs (board_id, post_id, person_id, action) VALUES (?,?,?,?)").run(boardId, postId, personId, absent ? '결근' : '빼기');
  ensureBp(boardId, postId, db);
  if (absent) return { stopped: false };
  const left = countAt(boardId, postId, db);
  db.prepare('UPDATE board_posts SET need=CASE WHEN need IS NOT NULL AND need > ? THEN ? ELSE need END WHERE board_id=? AND post_id=?').run(left, left, boardId, postId);
  if (left === 0) {
    const r = db.prepare('SELECT po.kind, po.unmanned, bp.product, bp.stopped FROM board_posts bp JOIN posts po ON po.id=bp.post_id WHERE bp.board_id=? AND bp.post_id=?').get(boardId, postId) as { kind: string; unmanned: number; product: string | null; stopped: number };
    if (r.kind === 'machine' && !r.unmanned && r.product && !r.stopped) { setStopped(boardId, postId, true, db); return { stopped: true }; }
  }
  return { stopped: false };
}
export function clearVacancy(boardId: number, postId: number, db: DB = getDb()): void {
  ensureBp(boardId, postId, db);
  db.prepare('UPDATE board_posts SET vacant=0, need=? WHERE board_id=? AND post_id=?').run(countAt(boardId, postId, db), boardId, postId);
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
  const expires = new Date(Date.now() + getSettings(db).expiry_minutes * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
  const fac = factoryName(b.factory_id, db);
  const ins = db.prepare('INSERT INTO requests (board_id, post_id, person_id, vacated_person_id, rank, reason, token, expires_at) VALUES (?,?,?,?,?,?,?,?)');
  const startRank = (db.prepare('SELECT COUNT(*) c FROM requests WHERE board_id=? AND post_id=?').get(boardId, postId) as { c: number }).c;
  ranked.forEach((c, i) => {
    const t = token();
    ins.run(boardId, postId, c.personId, vacatedId, startRank + i + 1, c.reasons.join(' · '), t, expires);
    sendMessage(c.personId, '요청', requestMessage({ date: b.date, shift: b.shift, factory: fac, post: post.name, product }), `/r/${t}`, db);
  });
  ensureBp(boardId, postId, db);
  // 필요 인원이 안 정해진 자리면 지금 인원보다 한 명 더 필요한 것으로 본다
  db.prepare('UPDATE board_posts SET vacant=1, need=COALESCE(need, ?) WHERE board_id=? AND post_id=?').run(countAt(boardId, postId, db) + 1, boardId, postId);
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
/** 알림. 앱 알림함에 쌓이고, 전화번호가 있으면 문자로도 간다(도입 때 문자 발송 연결). channel에 어디로 갔는지 남긴다. */
export function sendMessage(personId: number, kind: '요청' | '배치' | '변경', body: string, link: string | null, db: DB = getDb()): void {
  const p = db.prepare('SELECT phone FROM people WHERE id=?').get(personId) as { phone: string | null } | undefined;
  db.prepare('INSERT INTO messages (person_id, kind, body, link, channel) VALUES (?,?,?,?,?)').run(personId, kind, body, link, p?.phone ? '앱·문자' : '앱');
}

/** 관리자 계정. 비어 있으면 기본 계정 넷(팀장·담당자·반장 1공장·반장 2공장)을 만든다. 비밀번호는 LINEBOARD_PASSWORD(기본 saehan). */
export type Account = { id: number; username: string; name: string; role: Role; factory_id: number | null };
export function ensureDefaultAccounts(db: DB = getDb()): void {
  const n = (db.prepare('SELECT COUNT(*) c FROM accounts').get() as { c: number }).c;
  if (n > 0) return;
  const ins = db.prepare('INSERT INTO accounts (username, name, role, factory_id, password_hash) VALUES (?,?,?,?,?)');
  const h = hashPassword(defaultPassword());
  ins.run('teamlead', '팀장', '팀장', null, h);
  ins.run('staff', '지원팀 담당자', '담당자', null, h);
  ins.run('lead1', '1공장 반장', '반장', 1, h);
  ins.run('lead2', '2공장 반장', '반장', 2, h);
}
export function loginAccount(username: string, password: string, db: DB = getDb()): Account | null {
  ensureDefaultAccounts(db);
  const r = db.prepare('SELECT id, username, name, role, factory_id, password_hash FROM accounts WHERE username=? AND active=1').get(username.trim()) as (Account & { password_hash: string }) | undefined;
  if (!r || r.password_hash !== hashPassword(password)) return null;
  const { password_hash: _h, ...a } = r; void _h;
  return a;
}
export function listAccounts(db: DB = getDb()): Account[] { ensureDefaultAccounts(db); return db.prepare('SELECT id, username, name, role, factory_id FROM accounts WHERE active=1 ORDER BY id').all() as Account[]; }
/** 근무자 찾기: 전화번호 숫자만 비교 */
export function personByPhone(phone: string, db: DB = getDb()): { id: number; name: string; token: string } | null {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 8) return null;
  const rows = db.prepare("SELECT id, name, phone FROM people WHERE active=1 AND phone IS NOT NULL AND phone<>''").all() as { id: number; name: string; phone: string }[];
  const p = rows.find((r) => r.phone.replace(/\D/g, '') === digits);
  return p ? { id: p.id, name: p.name, token: ensureToken(p.id, db) } : null;
}
export function personByToken(tok: string, db: DB = getDb()): { id: number; name: string } | null {
  return (db.prepare('SELECT id, name FROM people WHERE token=?').get(tok) as { id: number; name: string } | undefined) ?? null;
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
  const b = db.prepare('SELECT date, shift, factory_id, status FROM boards WHERE id=?').get(r.board_id) as { date: string; shift: Shift; factory_id: number; status: string };
  const post = db.prepare('SELECT name FROM posts WHERE id=?').get(r.post_id) as { name: string };
  const others = db.prepare("SELECT person_id FROM requests WHERE board_id=? AND post_id=? AND status='발송'").all(r.board_id, r.post_id) as { person_id: number }[];
  db.prepare(`UPDATE requests SET status='만료', responded_at=${now} WHERE board_id=? AND post_id=? AND status='발송'`).run(r.board_id, r.post_id);
  for (const o of others) sendMessage(o.person_id, '요청', `[대체 요청 마감] ${+b.date.slice(5, 7)}/${+b.date.slice(8, 10)} ${b.shift} ${post.name} — 다른 분이 먼저 수락했습니다. 감사합니다.`, null, db);
  addPerson(r.board_id, r.post_id, r.person_id, '대체', db);
  if (b.status === '확정') {
    const product = (db.prepare('SELECT product FROM board_posts WHERE board_id=? AND post_id=?').get(r.board_id, r.post_id) as { product: string | null } | undefined)?.product ?? null;
    sendMessage(r.person_id, '배치', assignmentMessage({ date: b.date, shift: b.shift, factory: factoryName(b.factory_id, db), post: post.name, product }), `/me/${ensureToken(r.person_id, db)}`, db);
  }
  return { ok: true, message: '수락했습니다. 배치표에 들어갔습니다.' };
}

/** 자동 채우기: 제품이 적힌 라인마다 과거 표의 보통 인원만큼, 후보 순위대로 채운다. 이미 있는 사람은 그대로 둔다. */
export function autoFill(boardId: number, db: DB = getDb()): { filled: number; lines: number; need: number } {
  const b = db.prepare('SELECT date, shift, factory_id, status FROM boards WHERE id=?').get(boardId) as { date: string; shift: Shift; factory_id: number; status: string };
  if (b.status === '확정') return { filled: 0, lines: 0, need: 0 };
  const targets = db.prepare(`SELECT bp.post_id, bp.product, bp.need FROM board_posts bp JOIN posts po ON po.id=bp.post_id
    WHERE bp.board_id=? AND po.kind='machine' AND po.unmanned=0 AND COALESCE(bp.stopped,0)=0 AND bp.product IS NOT NULL AND bp.product<>'' ORDER BY po.sort`).all(boardId) as { post_id: number; product: string; need: number | null }[];
  const since = addDays(b.date, -365);
  const histCounts = db.prepare(`SELECT a.post_id, bp.product, COUNT(*) c FROM assignments a JOIN boards bo ON bo.id=a.board_id
    JOIN board_posts bp ON bp.board_id=a.board_id AND bp.post_id=a.post_id WHERE bo.factory_id=? AND bo.date>=? AND bo.date<? GROUP BY a.board_id, a.post_id`).all(b.factory_id, since, b.date) as { post_id: number; product: string | null; c: number }[];
  const ctx = rankContext(b.date, b.shift, b.factory_id, db);
  const taken = new Set<number>();
  let filled = 0, lines = 0, need = 0;
  for (const t of targets) {
    const same = histCounts.filter((h) => h.post_id === t.post_id && h.product === t.product).map((h) => h.c);
    const any = histCounts.filter((h) => h.post_id === t.post_id).map((h) => h.c);
    const want = t.need ?? typicalHeadcount(same.length ? same : any, 1);
    const have = countAt(boardId, t.post_id, db);
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
  const messages = db.prepare('SELECT id, kind, body, link, channel, sent_at, read_at FROM messages WHERE person_id=? ORDER BY sent_at DESC LIMIT 30').all(p.id) as { id: number; kind: string; body: string; link: string | null; channel: string; sent_at: string; read_at: string | null }[];
  const facs = new Map(factories(db).map((f) => [f.id, f.name]));
  expireDue(db);
  const open = db.prepare(`SELECT r.token, r.expires_at, b.date, b.shift, b.factory_id, po.name AS post, bp.product FROM requests r JOIN boards b ON b.id=r.board_id JOIN posts po ON po.id=r.post_id
    LEFT JOIN board_posts bp ON bp.board_id=r.board_id AND bp.post_id=r.post_id WHERE r.person_id=? AND r.status='발송' ORDER BY r.sent_at DESC`).all(p.id) as { token: string; expires_at: string | null; date: string; shift: Shift; factory_id: number; post: string; product: string | null }[];
  const st = getSettings(db);
  const w = weekRange(today);
  const weekShifts = (db.prepare('SELECT COUNT(DISTINCT b.date || b.shift) c FROM assignments a JOIN boards b ON b.id=a.board_id WHERE a.person_id=? AND b.date BETWEEN ? AND ?').get(p.id, w.from, w.to) as { c: number }).c;
  const attendance = db.prepare('SELECT date, shift, kind, note FROM attendance WHERE person_id=? AND date>=? ORDER BY date DESC, shift').all(p.id, addDays(today, -31)) as { date: string; shift: Shift; kind: string; note: string | null }[];
  const g = groupsOn(today);
  const dayType = p.work_type === '교대' && ['A', 'B', 'C'].includes(p.grp) ? (p.grp === g.day ? '주간' : p.grp === g.night ? '야간' : '휴무') : p.work_type;
  return {
    person: { ...p, phone: (db.prepare('SELECT phone FROM people WHERE id=?').get(p.id) as { phone: string | null }).phone },
    today, dayType,
    assignments: rows.map((r) => ({ ...r, factory: facs.get(r.factory_id) ?? '' })),
    messages,
    openRequests: open.map((r) => ({ ...r, factory: facs.get(r.factory_id) ?? '' })),
    week: { from: w.from, to: w.to, shifts: weekShifts, hours: weekShifts * st.shift_hours, max: st.week_max_hours },
    attendance,
  };
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
