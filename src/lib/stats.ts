/** 현황 화면용 집계. 모두 배치표 이력에서 계산한다. 추정치 없음. */
import { getDb, type DB } from './db';
import { getBoard, isVacantPost, posts } from './repo';
import { addDays, fmtShort, sameGroupBefore, type Shift } from './shift';

export type Kpi = { key: string; label: string; value: number; unit: string; delta: number | null; upIsGood: boolean | null; pct?: boolean; denom?: string; small?: boolean; note?: string };
export type Stats = {
  date: string; shift: Shift; factory_id: number; days: number; since: string;
  baseline: { date: string; label: string } | null;
  kpis: Kpi[];
  byLine: { code: string; avg: number; boards: number }[];
  composition: { label: string; count: number }[];
  funnel: { label: string; count: number }[];
  topSubs: { name: string; subs: number; accepted: number; declined: number; who: string }[];
  daily: { date: string; day: number | null; night: number | null }[];
};

type Snap = { workers: number; lines: number; vacant: number; waiting: number; temps: number };

function snapshot(boardId: number, factoryId: number, db: DB): Snap {
  const ps = posts(factoryId, db);
  const bp = new Map((db.prepare('SELECT post_id, product, vacant, stopped FROM board_posts WHERE board_id=?').all(boardId) as { post_id: number; product: string | null; vacant: number; stopped: number }[]).map((r) => [r.post_id, r]));
  const cnt = new Map<number, number>();
  let temps = 0, workers = 0;
  for (const r of db.prepare('SELECT a.post_id, p.work_type FROM assignments a JOIN people p ON p.id=a.person_id WHERE a.board_id=?').all(boardId) as { post_id: number; work_type: string }[]) {
    cnt.set(r.post_id, (cnt.get(r.post_id) ?? 0) + 1); workers++; if (r.work_type === '임시') temps++;
  }
  let lines = 0, vacant = 0;
  for (const p of ps) {
    const n = cnt.get(p.id) ?? 0, b = bp.get(p.id);
    const product = !!b?.product;
    if (p.kind === 'machine' && !p.unmanned && !Number(b?.stopped) && (product || n > 0)) lines++;
    if (isVacantPost({ kind: p.kind, unmanned: p.unmanned, product: b?.product ?? null, vacant: b?.vacant ?? 0, stopped: b?.stopped ?? 0 }, n)) vacant++;
  }
  const waiting = (db.prepare("SELECT COUNT(*) c FROM requests WHERE board_id=? AND status='발송'").get(boardId) as { c: number }).c;
  return { workers, lines, vacant, waiting, temps };
}

export function getStats(date: string, shift: Shift, factoryId: number, days = 30, db: DB = getDb()): Stats {
  const since = addDays(date, -days);
  const today = getBoard(date, shift, factoryId, db);
  const now = snapshot(today.id, factoryId, db);
  // 비교 기준: 어제가 아니라 "같은 조가 지난번 같은 근무를 한 날". 3조 2교대라 어제는 다른 사람들일 수 있다.
  const recent = db.prepare('SELECT id, date FROM boards WHERE shift=? AND factory_id=? AND date<? ORDER BY date DESC LIMIT 14').all(shift, factoryId, date) as { id: number; date: string }[];
  const baseDate = sameGroupBefore(date, shift, recent.map((r) => r.date));
  const yb = recent.find((r) => r.date === baseDate);
  const prev = yb ? snapshot(yb.id, factoryId, db) : null;
  const baseline = yb ? { date: yb.date, label: `같은 조 지난 근무 ${fmtShort(yb.date)}` } : null;

  const reqAgg = db.prepare(`SELECT COUNT(*) sent, SUM(r.status IN ('수락','거절')) responded, SUM(r.status='수락') accepted
    FROM requests r JOIN boards b ON b.id=r.board_id WHERE b.factory_id=? AND b.date>=? AND b.date<=?`).get(factoryId, since, date) as { sent: number; responded: number | null; accepted: number | null };
  const slots = db.prepare(`SELECT COUNT(*) n, SUM(ok) filled FROM (SELECT r.board_id, r.post_id, MAX(r.status='수락') ok FROM requests r JOIN boards b ON b.id=r.board_id
    WHERE b.factory_id=? AND b.date>=? AND b.date<=? GROUP BY r.board_id, r.post_id)`).get(factoryId, since, date) as { n: number; filled: number | null };
  const rate = slots.n ? Math.round(((slots.filled ?? 0) / slots.n) * 100) : null;
  const tempShare = now.workers ? Math.round((now.temps / now.workers) * 100) : 0;
  const prevTemp = prev && prev.workers ? Math.round((prev.temps / prev.workers) * 100) : null;
  const d = (a: number, b: number | null | undefined): number | null => (b === null || b === undefined ? null : a - b);

  const kpis: Kpi[] = [
    { key: 'workers', label: '근무 인원', value: now.workers, unit: '명', delta: d(now.workers, prev?.workers), upIsGood: null },
    { key: 'lines', label: '가동 라인', value: now.lines, unit: '라인', delta: d(now.lines, prev?.lines), upIsGood: null },
    { key: 'vacant', label: '비어 있음', value: now.vacant, unit: '자리', delta: d(now.vacant, prev?.vacant), upIsGood: false },
    { key: 'waiting', label: '요청 대기', value: now.waiting, unit: '건', delta: null, upIsGood: false },
    { key: 'rate', label: `대체 성공률 ${days}일`, value: rate ?? 0, unit: '%', delta: null, upIsGood: true, pct: true,
      denom: slots.n ? `${slots.n}자리 중 ${slots.filled ?? 0}자리 채움` : '요청한 자리 없음', small: slots.n > 0 && slots.n < 5 },
    { key: 'temp', label: '임시 인원 비율', value: tempShare, unit: '%', delta: d(tempShare, prevTemp), upIsGood: false, pct: true,
      denom: `${now.workers}명 중 ${now.temps}명`, small: now.workers > 0 && now.workers < 5 },
  ];

  const byLineRows = db.prepare(`SELECT po.code, AVG(c) avg, COUNT(*) boards FROM (
      SELECT a.post_id, a.board_id, COUNT(*) c FROM assignments a JOIN boards b ON b.id=a.board_id WHERE b.factory_id=? AND b.date>=? AND b.date<? GROUP BY a.post_id, a.board_id
    ) x JOIN posts po ON po.id=x.post_id WHERE po.kind='machine' GROUP BY po.code ORDER BY avg DESC, boards DESC LIMIT 8`).all(factoryId, since, date) as { code: string; avg: number; boards: number }[];
  const byLine = byLineRows.map((r) => ({ code: r.code, avg: Math.round(r.avg * 10) / 10, boards: r.boards }));

  const comp = new Map<string, number>([['A조', 0], ['B조', 0], ['C조', 0], ['주간고정', 0], ['임시', 0]]);
  for (const a of today.assignments) {
    const k = a.work_type === '임시' ? '임시' : a.work_type === '주간고정' ? '주간고정' : ['A', 'B', 'C'].includes(a.grp) ? `${a.grp}조` : '임시';
    comp.set(k, (comp.get(k) ?? 0) + 1);
  }
  const composition = [...comp.entries()].map(([label, count]) => ({ label, count }));

  const funnel = [
    { label: '요청 보냄', count: reqAgg.sent },
    { label: '응답', count: reqAgg.responded ?? 0 },
    { label: '수락', count: reqAgg.accepted ?? 0 },
  ];

  const topSubs = (db.prepare(`SELECT p.name, p.grp, p.work_type, p.affiliation,
      (SELECT COUNT(*) FROM assignments a JOIN boards b ON b.id=a.board_id WHERE a.person_id=p.id AND a.source='대체' AND b.factory_id=? AND b.date>=? AND b.date<=?) subs,
      (SELECT COUNT(*) FROM requests r JOIN boards b ON b.id=r.board_id WHERE r.person_id=p.id AND r.status='수락' AND b.date>=? AND b.date<=?) accepted,
      (SELECT COUNT(*) FROM requests r JOIN boards b ON b.id=r.board_id WHERE r.person_id=p.id AND r.status='거절' AND b.date>=? AND b.date<=?) declined
    FROM people p WHERE p.active=1 ORDER BY subs DESC, accepted DESC, p.name LIMIT 6`).all(factoryId, since, date, since, date, since, date) as { name: string; grp: string; work_type: string; affiliation: string | null; subs: number; accepted: number; declined: number }[])
    .filter((r) => r.subs + r.accepted + r.declined > 0)
    .map((r) => ({ name: r.name, subs: r.subs, accepted: r.accepted, declined: r.declined, who: [r.affiliation, r.work_type === '임시' ? '임시' : ['A', 'B', 'C'].includes(r.grp) ? `${r.grp}조` : r.work_type].filter(Boolean).join(' · ') }));

  const dailyRows = db.prepare(`SELECT b.date, b.shift, COUNT(a.id) c FROM boards b LEFT JOIN assignments a ON a.board_id=b.id
    WHERE b.factory_id=? AND b.date>=? AND b.date<=? GROUP BY b.date, b.shift`).all(factoryId, addDays(date, -13), date) as { date: string; shift: Shift; c: number }[];
  const dm = new Map<string, { day: number | null; night: number | null }>();
  for (let i = 13; i >= 0; i--) dm.set(addDays(date, -i), { day: null, night: null });
  for (const r of dailyRows) { const e = dm.get(r.date); if (e) { if (r.shift === '주간') e.day = r.c; else e.night = r.c; } }
  const daily = [...dm.entries()].map(([dt, v]) => ({ date: dt, ...v }));

  return { date, shift, factory_id: factoryId, days, since, baseline, kpis, byLine, composition, funnel, topSubs, daily };
}
