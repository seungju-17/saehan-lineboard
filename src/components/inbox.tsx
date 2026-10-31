'use client';
import { useState } from 'react';
import type { InboxEvent, LeaveRow } from '@/lib/repo';
import { fmtKo, fmtShort } from '@/lib/shift';
import { groupColor } from '@/lib/colors';

const FAC: Record<number, string> = { 1: '1공장', 2: '2공장' };
const KIND_CLS: Record<InboxEvent['kind'], string> = { 수락: 'bg-ok-bg text-ok', 거절: 'bg-vac-bg text-vac', 만료: 'bg-chip text-ink-3', 휴가신청: 'bg-wait-bg text-wait', 휴가승인: 'bg-ok-bg text-ok', 휴가거절: 'bg-vac-bg text-vac' };

/** 관리자 알림함. 위에 처리할 휴가 신청(승인/거절 + 한 줄 답), 아래에 최근 일. */
export function Inbox({ initial }: { initial: { pending: LeaveRow[]; events: InboxEvent[] } }): React.ReactElement {
  const [d, setD] = useState(initial);
  const [reply, setReply] = useState<Record<number, string>>({});
  const [note, setNote] = useState<string | null>(null);
  async function decide(id: number, approve: boolean): Promise<void> {
    const r = await fetch('/api/leaves', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, approve, reply: reply[id] ?? null }) });
    const j = await r.json() as { message?: string; error?: string };
    setNote(j.message ?? j.error ?? '처리했습니다');
    setD(await (await fetch('/api/leaves')).json());
  }
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[26px] font-bold tracking-tight leading-none">알림</h1>
        <div className="mt-1.5 text-sm text-ink-2">처리할 휴가 신청 <b className="text-ink">{d.pending.length}</b>건 · 최근 7일 일 {d.events.length}건</div>
      </div>
      {note && <div role="status" className="bg-ok-bg text-ok rounded-lg px-4 py-3 font-semibold">{note}</div>}
      <section className="bg-white border border-line rounded-xl">
        <h2 className="px-5 pt-4 pb-2 text-[15px] font-semibold">휴가 신청</h2>
        {d.pending.length === 0 ? <p className="px-5 pb-5 text-sm text-ink-3">기다리는 신청이 없습니다. 근무자가 폰에서 연차·반차·병가를 신청하면 여기에 쌓입니다.</p> : (
          <ul className="divide-y divide-line-2">
            {d.pending.map((l) => { const gc = groupColor(l.grp, l.work_type); return (
              <li key={l.id} className="px-5 py-4 flex flex-wrap items-center gap-x-5 gap-y-3">
                <div className="min-w-[200px]">
                  <div className="flex items-center gap-2"><i className="w-2.5 h-2.5 rounded-sm" style={{ background: gc.ink }} /><b className="text-[16px]">{l.name}</b><span className="text-sm text-ink-3">{gc.label || l.grp} · {FAC[l.home_factory_id ?? 1] ?? ''}</span></div>
                  <div className="mt-1 text-[15px]"><span className="inline-flex items-center h-6 px-2 rounded bg-wait-bg text-wait font-semibold text-sm mr-2">{l.kind}</span>{fmtKo(l.date)} {l.shift}{l.note && <span className="text-ink-2"> · {l.note}</span>}</div>
                  <div className="mt-0.5 text-xs text-ink-3">신청 {l.created_at.slice(5, 16)}</div>
                </div>
                <input value={reply[l.id] ?? ''} onChange={(e) => setReply({ ...reply, [l.id]: e.target.value })} placeholder="한 줄 답 (선택)" aria-label={`${l.name} 신청에 답`} className="h-10 flex-1 min-w-[160px] rounded-md border border-line px-3 text-sm" />
                <div className="flex gap-2 ml-auto">
                  <button onClick={() => decide(l.id, false)} className="h-11 px-5 rounded-md bg-vac-bg text-vac font-semibold hover:brightness-95">거절</button>
                  <button onClick={() => decide(l.id, true)} className="h-11 px-6 rounded-md bg-brand text-white font-semibold hover:bg-brand-2">승인</button>
                </div>
              </li>
            ); })}
          </ul>
        )}
      </section>
      <section className="bg-white border border-line rounded-xl">
        <h2 className="px-5 pt-4 pb-2 text-[15px] font-semibold">최근 일</h2>
        {d.events.length === 0 ? <p className="px-5 pb-5 text-sm text-ink-3">아직 없습니다.</p> : (
          <ul className="divide-y divide-line-2">
            {d.events.map((e, i) => (
              <li key={i} className="px-5 py-2.5 flex items-center gap-3 text-[15px]">
                <span className={`inline-flex items-center h-6 px-2 rounded text-sm font-semibold shrink-0 ${KIND_CLS[e.kind]}`}>{e.kind}</span>
                <span className="flex-1 truncate">{e.text}</span>
                <span className="text-xs text-ink-3 tabular-nums shrink-0">{fmtShort(e.at.slice(0, 10))} {e.at.slice(11, 16)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
