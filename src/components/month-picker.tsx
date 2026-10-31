'use client';
import { useEffect, useState } from 'react';
import { addDays, groupsOn, type Shift } from '@/lib/shift';

export type MonthMark = { date: string; status: '초안' | '입안' | '확정'; vacant: number; workers: number };
const W = ['일', '월', '화', '수', '목', '금', '토'];

/** 달력 하나로 날짜를 고른다(시프티 근무일정 달력). 표가 있는 날은 파랑, 빈 자리가 있는 날은 빨간 점, 확정은 진한 파랑. */
export function MonthPicker({ date, shift, factory, onPick, onClose }: { date: string; shift: Shift; factory: number; onPick: (d: string) => void; onClose: () => void }): React.ReactElement {
  const [month, setMonth] = useState(date.slice(0, 7));
  const [marks, setMarks] = useState<Record<string, MonthMark>>({});
  useEffect(() => {
    let alive = true;
    fetch(`/api/board?month=${month}&shift=${shift}&factory=${factory}`).then((r) => r.json()).then((j: { dates?: MonthMark[] }) => { if (alive && j.dates) setMarks(Object.fromEntries(j.dates.map((m) => [m.date, m]))); }).catch(() => undefined);
    return () => { alive = false; };
  }, [month, shift, factory]);
  const first = `${month}-01`;
  const dow = new Date(first + 'T00:00:00Z').getUTCDay();
  const start = addDays(first, -dow);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const [y, m] = month.split('-').map(Number);
  const shiftMonth = (n: number): void => { const d = new Date(Date.UTC(y, m - 1 + n, 1)); setMonth(d.toISOString().slice(0, 7)); };
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
  return (
    <div role="dialog" aria-label="날짜 고르기" className="absolute z-30 top-11 left-0 w-[340px] bg-white border border-line rounded-xl shadow-[0_12px_32px_rgba(31,95,232,0.14)] p-3">
      <div className="flex items-center justify-between mb-2">
        <button onClick={() => shiftMonth(-1)} aria-label="지난달" className="h-8 w-8 rounded-md hover:bg-ground text-ink-2">‹</button>
        <div className="font-bold text-[15px]">{y}년 {m}월</div>
        <button onClick={() => shiftMonth(1)} aria-label="다음달" className="h-8 w-8 rounded-md hover:bg-ground text-ink-2">›</button>
      </div>
      <div className="grid grid-cols-7 text-center text-[12px] text-ink-3 mb-1">{W.map((w, i) => <div key={w} className={`h-6 leading-6 ${i === 0 ? 'text-vac' : i === 6 ? 'text-brand' : ''}`}>{w}</div>)}</div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d) => {
          const inMonth = d.startsWith(month); const mk = marks[d]; const sel = d === date; const g = groupsOn(d);
          const cls = sel ? 'bg-brand text-white font-bold' : mk?.status === '확정' ? 'bg-brand-soft text-brand font-semibold' : mk ? 'bg-ground text-ink font-medium' : 'text-ink-2 hover:bg-ground';
          return (
            <button key={d} onClick={() => { onPick(d); onClose(); }} disabled={!inMonth} title={mk ? `${mk.status} · 근무 ${mk.workers}명${mk.vacant ? ` · 비어 있음 ${mk.vacant}` : ''}` : `${shift === '주간' ? g.day : g.night}조 근무`}
              className={`relative h-10 rounded-md text-[13px] disabled:opacity-25 ${cls} ${d === today && !sel ? 'ring-1 ring-brand' : ''}`}>
              {+d.slice(8, 10)}
              {mk && mk.vacant > 0 && <i className="absolute right-1 top-1 w-1.5 h-1.5 rounded-full bg-vac" aria-hidden />}
              {inMonth && <span className={`absolute left-1 bottom-0.5 text-[9px] ${sel ? 'text-white/80' : 'text-ink-3'}`}>{shift === '주간' ? g.day : g.night}</span>}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-3">
        <span className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm bg-brand" />고른 날</span>
        <span className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm bg-brand-soft" />확정된 표</span>
        <span className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm bg-ground border border-line" />작성 중</span>
        <span className="inline-flex items-center gap-1"><i className="w-1.5 h-1.5 rounded-full bg-vac" />빈 자리</span>
        <span>작은 글자는 그날 {shift} 근무조</span>
      </div>
    </div>
  );
}
