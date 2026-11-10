'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MonthCell } from '@/lib/repo';
import type { GenResult } from '@/lib/planner';
import { todaySeoul, type Shift } from '@/lib/shift';
import { useSession } from '@/lib/use-session';
import { CAN } from '@/lib/rules';

const FACTORIES = [[1, '1공장'], [2, '2공장']] as const;
const WD = ['월', '화', '수', '목', '금', '토', '일'];

/** 월 근무표: 날짜 × 교대 격자. 생산 계획을 올리고 → 「이 달 근무표 짜기」 → 고치고 → 「이 달 확정」. */
export function MonthBoard(): React.ReactElement {
  const today = useMemo(() => todaySeoul(), []);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [factory, setFactory] = useState<number>(1);
  const [cells, setCells] = useState<MonthCell[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const session = useSession();
  const role = session?.kind === 'admin' ? session.role : undefined;
  const load = useCallback(async (): Promise<void> => { const r = await fetch(`/api/month?month=${month}&factory=${factory}`); if (r.ok) setCells((await r.json() as { cells: MonthCell[] }).cells); }, [month, factory]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- 조회 결과 반영
  useEffect(() => { load(); }, [load]);
  const shiftMonth = (n: number): void => { const y = +month.slice(0, 4), m = +month.slice(5, 7) - 1 + n; const d = new Date(Date.UTC(y, m, 1)); setMonth(d.toISOString().slice(0, 7)); setFlash(null); };
  async function run(action: 'generate' | 'confirm', mode?: 'fill' | 'redo'): Promise<void> {
    if (action === 'confirm' && !window.confirm(`${+month.slice(5, 7)}월 ${FACTORIES.find(([id]) => id === factory)?.[1]} 표를 모두 확정하고 근무자에게 알림을 보냅니다.`)) return;
    if (mode === 'redo' && !window.confirm('자동으로 넣었던 자리를 모두 지우고 다시 짭니다. 사람이 직접 넣은 자리는 그대로 둡니다.')) return;
    setBusy(true); setFlash(null);
    const r = await fetch('/api/month', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, month, factory, mode }) });
    const d = await r.json() as (GenResult & { boards: number }) | { boards: number; notified: number } | { error: string };
    setBusy(false);
    if ('error' in d) { setFlash(d.error); return; }
    if (action === 'confirm') { const c = d as { boards: number; notified: number }; setFlash(c.boards ? `표 ${c.boards}개를 확정하고 알림 ${c.notified}건을 보냈습니다.` : '확정할 표가 없습니다. 먼저 근무표를 짜 주세요.'); }
    else {
      const g = d as GenResult;
      const v = g.vacant.length ? ` 못 채운 자리 ${g.vacant.length}곳: ${g.vacant.slice(0, 6).map((x) => `${+x.date.slice(8, 10)}일 ${x.shift} ${x.code} ${x.missing}명`).join(', ')}${g.vacant.length > 6 ? ' …' : ''} → 그날 표에서 「빈 자리 요청 보내기」.` : '';
      const un = g.unplaced.reduce((t, x) => t + x.names.length, 0);
      const uTxt = un ? ` 라인이 다 차서 자리 없는 출근자 ${un}명분(날짜별 표에서 확인).` : '';
      setFlash(g.boards === 0 ? '짤 표가 없습니다. 설정 → 「월 근무표·생산 계획 올리기」로 이 달 생산 계획(날짜·교대·공장·라인·제품·인원)을 먼저 올려 주세요.' : `표 ${g.boards}개에 ${g.filled}명을 배치했습니다.${v}${uTxt}`);
    }
    await load();
  }
  const y = +month.slice(0, 4), m = +month.slice(5, 7);
  const first = new Date(Date.UTC(y, m - 1, 1)); const lead = (first.getUTCDay() + 6) % 7; // 월요일 시작
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const byKey = new Map((cells ?? []).map((c) => [`${c.date}|${c.shift}`, c]));
  const tot = { planned: 0, drafted: 0, confirmed: 0, vacant: 0 };
  for (const c of cells ?? []) { if (c.planned || c.workers) tot.planned++; if (c.status === '초안' && c.workers) tot.drafted++; if (c.status === '확정') tot.confirmed++; tot.vacant += c.vacant; }
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight leading-none">월 근무표</h1>
          <div className="mt-1.5 text-sm text-ink-2">생산 계획을 올리고 짜서, 고친 뒤, 달 단위로 확정합니다. 확정 뒤 바뀌는 자리는 그 사람에게 변경 알림이 갑니다.</div>
        </div>
        <div className="flex flex-wrap items-center gap-2 ml-auto">
          <span className="inline-flex items-center h-9 rounded-md border border-line bg-white">
            <button aria-label="이전 달" onClick={() => shiftMonth(-1)} className="h-9 w-9 text-ink-3 hover:text-ink">‹</button>
            <b className="px-2 text-[15px]">{y}년 {m}월</b>
            <button aria-label="다음 달" onClick={() => shiftMonth(1)} className="h-9 w-9 text-ink-3 hover:text-ink">›</button>
          </span>
          <span className="inline-flex h-9 p-0.5 rounded-md bg-ground border border-line">{FACTORIES.map(([id, n]) => <button key={id} onClick={() => { setFactory(id); setFlash(null); }} aria-pressed={factory === id} className={`px-3.5 rounded text-sm ${factory === id ? 'bg-white shadow-sm font-semibold text-ink' : 'text-ink-2 hover:text-ink'}`}>{n}</button>)}</span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="inline-flex items-center h-8 px-2.5 rounded bg-chip text-ink-2">계획 있음 <b className="ml-1 text-ink">{tot.planned}</b></span>
        <span className="inline-flex items-center h-8 px-2.5 rounded bg-chip text-ink-2">짬 <b className="ml-1 text-ink">{tot.drafted}</b></span>
        <span className="inline-flex items-center h-8 px-2.5 rounded bg-ok-bg text-ok">확정 <b className="ml-1">{tot.confirmed}</b></span>
        {tot.vacant > 0 && <span className="inline-flex items-center h-8 px-2.5 rounded bg-vac text-white font-semibold">빈 자리 {tot.vacant}</span>}
        {CAN.manage(role) && <span className="ml-auto flex flex-wrap items-center gap-2">
          <Link href="/settings" className="h-10 px-3.5 inline-flex items-center rounded-md border border-line bg-white text-[14px] text-ink-2 hover:text-ink hover:border-ink-3">생산 계획·근무표 올리기</Link>
          <button onClick={() => run('generate', 'fill')} disabled={busy} className="h-10 px-4 rounded-md bg-brand text-white text-[14px] font-semibold hover:bg-brand-2 disabled:opacity-40">{busy ? '처리 중…' : '이 달 근무표 짜기'}</button>
          <button onClick={() => run('generate', 'redo')} disabled={busy} className="h-10 px-3.5 rounded-md border border-line bg-white text-[14px] text-ink-2 hover:text-ink hover:border-ink-3 disabled:opacity-40">자동 자리 다시 짜기</button>
          <button onClick={() => run('confirm')} disabled={busy || tot.drafted === 0} className="h-10 px-4 rounded-md bg-ok text-white text-[14px] font-semibold hover:brightness-95 disabled:opacity-40">이 달 확정 · 알림</button>
        </span>}
      </div>
      {flash && <div role="status" className="rounded-lg bg-brand-soft text-brand px-4 py-3 text-sm">{flash}</div>}
      <div className="bg-white border border-line rounded-xl overflow-hidden">
        <div className="grid grid-cols-7 text-center text-xs text-ink-3 border-b border-line">{WD.map((w, i) => <div key={w} className={`py-2 ${i === 5 ? 'text-brand' : i === 6 ? 'text-vac' : ''}`}>{w}</div>)}</div>
        <div className="grid grid-cols-7">
          {Array.from({ length: lead }).map((_, i) => <div key={`e${i}`} className="min-h-24 border-b border-r border-line-2 bg-ground/40" />)}
          {Array.from({ length: days }).map((_, i) => {
            const d = i + 1; const date = `${month}-${String(d).padStart(2, '0')}`; const isToday = date === today;
            return (
              <div key={date} className={`min-h-24 border-b border-r border-line-2 p-1.5 ${isToday ? 'bg-brand-soft/40' : ''}`}>
                <div className={`text-[12px] font-semibold ${isToday ? 'text-brand' : 'text-ink-2'}`}>{d}</div>
                {(['주간', '야간'] as Shift[]).map((sh) => { const c = byKey.get(`${date}|${sh}`); return <Cell key={sh} c={c} date={date} shift={sh} factory={factory} />; })}
              </div>
            );
          })}
        </div>
      </div>
      <p className="text-xs text-ink-3">회색 = 계획 없음 · 파랑 = 짬(작성 중) · 초록 = 확정 · 빨강 숫자 = 빈 자리. 칸을 누르면 그날 표로 갑니다. 자동 배치는 그날 출근하는 사람만 쓰고, 쉬는 조에는 그날 표의 「빈 자리 요청 보내기」로 묻습니다.</p>
    </div>
  );
}

function Cell({ c, date, shift, factory }: { c: MonthCell | undefined; date: string; shift: Shift; factory: number }): React.ReactElement {
  const none = !c || (c.status === '없음') || (!c.planned && c.workers === 0);
  const cls = none ? 'bg-ground text-ink-3' : c!.status === '확정' ? 'bg-ok-bg text-ok' : c!.workers > 0 ? 'bg-brand-soft text-brand' : 'bg-wait-bg text-wait';
  return (
    <Link href={`/today?date=${date}&shift=${shift}&factory=${factory}`} className={`mt-1 flex items-center justify-between rounded px-1.5 h-6 text-[11px] font-semibold ${cls} hover:brightness-95`} title={`${date} ${shift}`}>
      <span>{shift[0]}</span>
      <span className="tabular-nums">{none ? '–' : c!.workers > 0 || c!.planned ? `${c!.workers}명` : '계획'}{c && c.vacant > 0 ? <span className="ml-1 text-vac">빈 {c.vacant}</span> : null}</span>
    </Link>
  );
}
