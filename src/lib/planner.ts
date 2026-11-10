import type { DB } from './db';
import { getDb } from './db';
import { aggregateExperience, rankForSlot, type Person, type SlotCounters } from './engine';
import { addDays, groupsOn, weekRange, type Shift } from './shift';
import { approvedUnavailable, getSettings, isUnavailable, isVacantPost, isWeekend, needFor, people, type UnavailRow } from './repo';
import { typicalHeadcount } from './engine';

/** 월 근무표 짜기.
 *  그날 출근하는 사람(근무조 교대 인원 → 주간고정(주간만) → 임시) 중에서 라인마다 필요 인원만큼 고른다. 쉬는 조는 쓰지 않는다(그건 대체 요청의 몫).
 *  절대 조건: 라인 불가, 그날 휴가·결근, 승인된 불가일, 이미 그날 다른 자리, 주 최대 시간, 연속 근무 일수.
 *  점수: 직책은 늘 맡던 사람, 라인 숙련·경험, 같은 제품 경험, 이번 달 야간·주말·배치 횟수가 많으면 감점(형평).
 *  mode 'fill'은 빈 자리만 채우고, 'redo'는 자동으로 넣었던 자리를 지우고 다시 짠다. 사람이 직접 넣은 자리와 확정된 표는 건드리지 않는다. */
export type GenResult = { boards: number; filled: number; vacant: { date: string; shift: Shift; code: string; missing: number }[]; unplaced: { date: string; shift: Shift; names: string[] }[] };
/** unplaced: 라인이 다 차서 자리가 없는 근무조 출근자. 표에 넣지 않고 알리기만 한다. */

type Ctx = { settings: ReturnType<typeof getSettings>; people: Person[]; rules: Map<number, UnavailRow[]>; skills: Map<number, Map<number, '불가' | '가능' | '숙련'>>; experience: ReturnType<typeof aggregateExperience>; fixedPref: Map<number, Map<number, number>> };

function context(factoryId: number, month: string, db: DB): Ctx {
  const skills = new Map<number, Map<number, '불가' | '가능' | '숙련'>>();
  for (const r of db.prepare('SELECT s.person_id, s.post_id, s.level FROM skills s JOIN posts po ON po.id=s.post_id WHERE po.factory_id=?').all(factoryId) as { person_id: number; post_id: number; level: '불가' | '가능' | '숙련' }[]) {
    if (!skills.has(r.person_id)) skills.set(r.person_id, new Map()); skills.get(r.person_id)!.set(r.post_id, r.level);
  }
  const since = addDays(`${month}-01`, -365);
  const hist = db.prepare(`SELECT a.person_id AS personId, a.post_id AS postId, bp.product FROM assignments a JOIN boards b ON b.id=a.board_id
    LEFT JOIN board_posts bp ON bp.board_id=a.board_id AND bp.post_id=a.post_id WHERE b.factory_id=? AND b.date>=? AND b.date<?`).all(factoryId, since, `${month}-01`) as { personId: number; postId: number; product: string | null }[];
  // 직책 자리(반장·OP 등)는 누가 주로 맡았는지
  const fixedPref = new Map<number, Map<number, number>>();
  for (const r of db.prepare(`SELECT a.post_id, a.person_id, COUNT(*) c FROM assignments a JOIN boards b ON b.id=a.board_id JOIN posts po ON po.id=a.post_id
    WHERE b.factory_id=? AND po.fixed=1 AND b.date>=? GROUP BY a.post_id, a.person_id`).all(factoryId, since) as { post_id: number; person_id: number; c: number }[]) {
    if (!fixedPref.has(r.post_id)) fixedPref.set(r.post_id, new Map()); fixedPref.get(r.post_id)!.set(r.person_id, r.c);
  }
  return { settings: getSettings(db), people: people(db).map((p) => ({ id: p.id, name: p.name, grp: p.grp, work_type: p.work_type as Person['work_type'], active: p.active, role: p.role })), rules: approvedUnavailable(db), skills, experience: aggregateExperience(hist), fixedPref };
}

/** 이번 달 사람별 누적(형평용): 지금까지 짠 표 기준 */
function counters(month: string, factoryId: number, db: DB): Map<number, SlotCounters> {
  const m = new Map<number, SlotCounters>();
  for (const r of db.prepare(`SELECT DISTINCT a.person_id, b.date, b.shift FROM assignments a JOIN boards b ON b.id=a.board_id WHERE b.date LIKE ? AND b.factory_id=?`).all(`${month}-%`, factoryId) as { person_id: number; date: string; shift: Shift }[]) {
    const c = m.get(r.person_id) ?? { shifts: 0, nights: 0, weekends: 0 };
    c.shifts++; if (r.shift === '야간') c.nights++; if (isWeekend(r.date)) c.weekends++; m.set(r.person_id, c);
  }
  return m;
}

function consecutiveDaysBefore(personId: number, date: string, db: DB): number {
  let n = 0; let d = addDays(date, -1);
  while (n < 31) {
    const has = db.prepare('SELECT 1 FROM assignments a JOIN boards b ON b.id=a.board_id WHERE a.person_id=? AND b.date=? LIMIT 1').get(personId, d);
    if (!has) break; n++; d = addDays(d, -1);
  }
  return n;
}

/** 표 하나 짜기. 반환: 채운 수, 못 채운 자리, 배치 못 한 출근자 */
export function generateDay(boardId: number, mode: 'fill' | 'redo', db: DB = getDb(), ctx?: Ctx): { filled: number; vacant: { code: string; missing: number }[]; unplaced: string[] } {
  const b = db.prepare('SELECT date, shift, factory_id, status FROM boards WHERE id=?').get(boardId) as { date: string; shift: Shift; factory_id: number; status: string };
  if (b.status === '확정') return { filled: 0, vacant: [], unplaced: [] };
  const c = ctx ?? context(b.factory_id, b.date.slice(0, 7), db);
  if (mode === 'redo') db.prepare("DELETE FROM assignments WHERE board_id=? AND source='자동'").run(boardId);
  const month = b.date.slice(0, 7);
  const g = groupsOn(b.date); const onDuty = b.shift === '주간' ? g.day : g.night;
  // 그날 못 서는 사람: 결근·연차·병가 기록, 승인된 휴가, 불가일, 이미 그날 다른 표에 선 사람
  const out = new Set<number>();
  for (const r of db.prepare("SELECT person_id FROM attendance WHERE date=? AND kind IN ('결근','연차','병가')").all(b.date) as { person_id: number }[]) out.add(r.person_id);
  for (const r of db.prepare("SELECT person_id FROM leave_requests WHERE date=? AND status='승인' AND (shift=? OR kind='연차' OR kind='병가')").all(b.date, b.shift) as { person_id: number }[]) out.add(r.person_id);
  for (const r of db.prepare('SELECT a.person_id FROM assignments a JOIN boards bo ON bo.id=a.board_id WHERE bo.date=? AND a.board_id<>?').all(b.date, boardId) as { person_id: number }[]) out.add(r.person_id);
  const w = weekRange(b.date);
  const hoursSoFar = new Map<number, number>();
  for (const r of db.prepare('SELECT a.person_id, COUNT(DISTINCT bo.date || bo.shift) c FROM assignments a JOIN boards bo ON bo.id=a.board_id WHERE bo.date BETWEEN ? AND ? AND a.board_id<>? GROUP BY a.person_id').all(w.from, b.date, boardId) as { person_id: number; c: number }[]) hoursSoFar.set(r.person_id, r.c * c.settings.shift_hours);
  const can = (p: Person): boolean => {
    if (out.has(p.id) || isUnavailable(c.rules.get(p.id), b.date, b.shift)) return false;
    if ((hoursSoFar.get(p.id) ?? 0) + c.settings.shift_hours > c.settings.week_max_hours) return false;
    if (consecutiveDaysBefore(p.id, b.date, db) >= c.settings.max_consecutive_days) return false;
    return true;
  };
  // 출근자 풀: 근무조 교대 인원 → 주간고정(주간) → 임시. 이 공장 소속을 먼저.
  const home = new Map((db.prepare('SELECT id, home_factory_id FROM people').all() as { id: number; home_factory_id: number | null }[]).map((r) => [r.id, r.home_factory_id]));
  const tier = (p: Person): number => (p.work_type === '교대' && p.grp === onDuty ? 0 : p.work_type === '주간고정' && b.shift === '주간' ? 1 : p.work_type === '임시' ? 2 : 9) + (home.get(p.id) === b.factory_id ? 0 : 0.5);
  const pool = c.people.filter((p) => tier(p) < 9 && can(p)).sort((a, z) => tier(a) - tier(z));
  // 자리: 제품이 있거나 필요 인원이 적힌 유인 라인 + 직책 자리
  const posts = db.prepare(`SELECT po.id, po.code, po.kind, po.unmanned, po.fixed, bp.product, bp.need, COALESCE(bp.stopped,0) stopped, COALESCE(bp.vacant,0) vacant
    FROM posts po LEFT JOIN board_posts bp ON bp.board_id=? AND bp.post_id=po.id WHERE po.factory_id=? AND po.active=1 ORDER BY po.fixed DESC, po.sort`).all(boardId, b.factory_id) as
    { id: number; code: string; kind: string; unmanned: number; fixed: number; product: string | null; need: number | null; stopped: number; vacant: number }[];
  const cnt = counters(month, b.factory_id, db);
  const used = new Set<number>((db.prepare('SELECT person_id FROM assignments WHERE board_id=?').all(boardId) as { person_id: number }[]).map((r) => r.person_id));
  const insert = db.prepare("INSERT OR IGNORE INTO assignments (board_id, post_id, person_id, source, reason) VALUES (?,?,?,'자동',?)");
  let filled = 0; const vacant: { code: string; missing: number }[] = [];
  const std = new Map((db.prepare('SELECT name, need FROM products WHERE factory_id=?').all(b.factory_id) as { name: string; need: number }[]).map((r) => [r.name, r.need]));
  for (const po of posts) {
    if (po.stopped || po.unmanned) continue;
    const have = (db.prepare('SELECT COUNT(*) c FROM assignments WHERE board_id=? AND post_id=?').get(boardId, po.id) as { c: number }).c;
    let need: number;
    if (po.fixed) need = 1; // 직책은 한 명
    else if (po.kind !== 'machine') need = po.need ?? 0; // 지원 자리는 적힌 만큼만
    else if (!po.product && !(po.need ?? 0)) continue; // 안 돌리는 라인
    else if (po.need !== null) need = po.need;
    else if (po.product && std.has(po.product)) need = std.get(po.product)!;
    else {
      const counts = po.product ? (db.prepare(`SELECT COUNT(DISTINCT a.person_id) c FROM assignments a JOIN boards bo ON bo.id=a.board_id JOIN board_posts bp ON bp.board_id=a.board_id AND bp.post_id=a.post_id
        WHERE a.post_id=? AND bp.product=? AND bo.date<? GROUP BY a.board_id`).all(po.id, po.product, b.date) as { c: number }[]).map((r) => r.c) : [];
      need = typicalHeadcount(counts, 1);
    }
    if (po.kind === 'machine' && po.need === null && need > 0) { db.prepare('INSERT INTO board_posts (board_id, post_id, need) VALUES (?,?,?) ON CONFLICT(board_id, post_id) DO UPDATE SET need=excluded.need').run(boardId, po.id, need); }
    let missing = need - have;
    if (missing <= 0) continue;
    const ranked = rankForSlot({ postId: po.id, product: po.product, pool: pool.filter((p) => !used.has(p.id)), experience: c.experience, skills: c.skills, counters: cnt,
      isNight: b.shift === '야간', isWeekend: isWeekend(b.date), fairNight: c.settings.fair_night === 1, fairWeekend: c.settings.fair_weekend === 1, fixedPreference: c.fixedPref.get(po.id) });
    // 직책 자리는 그 자리를 맡아 본 사람 → 없으면 같은 역할(OP·반장)인 출근자. 기계 라인은 임시 인원을 교대 인원 뒤에
    const roleOk = (pid: number): boolean => { const r = c.people.find((p) => p.id === pid)?.role ?? ''; return po.kind === 'op' ? r === 'OP' : po.kind === 'leader' ? r === '반장' : false; };
    const held = ranked.filter((r) => (c.fixedPref.get(po.id)?.get(r.personId) ?? 0) > 0);
    const order = po.fixed ? (held.length ? held : ranked.filter((r) => roleOk(r.personId))) : ranked.sort((a, z) => tier(c.people.find((p) => p.id === a.personId)!) - tier(c.people.find((p) => p.id === z.personId)!) || z.score - a.score);
    for (const r of order) {
      if (missing <= 0) break;
      const p = c.people.find((x) => x.id === r.personId)!;
      const why = `${p.work_type === '교대' ? `${p.grp}조 ${b.shift}` : p.work_type} · ${r.reason}`;
      insert.run(boardId, po.id, r.personId, why); used.add(r.personId); filled++; missing--;
      const cc = cnt.get(r.personId) ?? { shifts: 0, nights: 0, weekends: 0 }; cc.shifts++; if (b.shift === '야간') cc.nights++; if (isWeekend(b.date)) cc.weekends++; cnt.set(r.personId, cc);
    }
    if (missing > 0) vacant.push({ code: po.code, missing });
  }
  // 라인이 다 찼는데 남은 이 공장 근무조 인원은 표에 넣지 않고 「자리 없는 출근자」로 알린다.
  // (「기타」에는 생산 계획에 기타 인원을 적어 둔 만큼만 위에서 채운다.) 담당자가 라인을 더 돌리거나 직접 넣어 정한다.
  const unplaced = pool.filter((p) => !used.has(p.id) && p.work_type === '교대' && p.grp === onDuty && home.get(p.id) === b.factory_id).map((p) => p.name);
  db.prepare("INSERT INTO logs (board_id, action, detail) VALUES (?, '자동배치', ?)").run(boardId, `${filled}명, 못 채움 ${vacant.length}자리, 자리 없는 출근자 ${unplaced.length}명`);
  return { filled, vacant, unplaced };
}

/** 한 달 전체. 표가 없는 날은 건너뛴다(생산 계획이 있어야 짠다). */
export function generateMonth(month: string, factoryId: number, mode: 'fill' | 'redo', db: DB = getDb()): GenResult {
  const ctx = context(factoryId, month, db);
  const boards = db.prepare("SELECT id, date, shift FROM boards WHERE factory_id=? AND date LIKE ? AND status<>'확정' ORDER BY date, shift").all(factoryId, `${month}-%`) as { id: number; date: string; shift: Shift }[];
  const res: GenResult = { boards: 0, filled: 0, vacant: [], unplaced: [] };
  const run = (): void => {
    for (const b of boards) {
      const planned = db.prepare("SELECT 1 FROM board_posts WHERE board_id=? AND (product IS NOT NULL AND product<>'' OR COALESCE(need,0)>0) LIMIT 1").get(b.id);
      if (!planned) continue;
      const r = generateDay(b.id, mode, db, ctx);
      res.boards++; res.filled += r.filled;
      for (const v of r.vacant) res.vacant.push({ date: b.date, shift: b.shift, ...v });
      if (r.unplaced.length) res.unplaced.push({ date: b.date, shift: b.shift, names: r.unplaced });
    }
  };
  db.prepare('BEGIN').run(); try { run(); db.prepare('COMMIT').run(); } catch (e) { db.prepare('ROLLBACK').run(); throw e; }
  return res;
}
export { isVacantPost, needFor };
