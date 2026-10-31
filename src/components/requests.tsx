'use client';
import { useState } from 'react';
import type { RequestRow } from '@/lib/repo';
import { fmtShort } from '@/lib/shift';
import { StatusTag } from './board';

const FAC: Record<number, string> = { 1: '1공장', 2: '2공장' };

export function Requests({ initial }: { initial: RequestRow[] }): React.ReactElement {
  const [rows, setRows] = useState(initial);
  const groups = new Map<string, RequestRow[]>();
  for (const r of rows) { const k = `${r.board_id}|${r.post_id}`; if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(r); }
  const list = [...groups.values()];
  const openCount = list.filter((l) => !l.some((r) => r.status === '수락') && l.some((r) => r.status === '발송')).length;

  async function act(r: RequestRow, action: 'next' | 'cancel' | 'cancel_requests', requestId?: number): Promise<void> {
    await fetch('/api/board', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: r.date, shift: r.shift, factory: r.factory_id, action, postId: r.post_id, requestId }) });
    setRows(await (await fetch('/api/requests')).json());
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[26px] font-bold tracking-tight leading-none">대체 요청</h1>
        <div className="mt-1.5 text-sm text-ink-2">{list.length === 0 ? '아직 보낸 요청이 없습니다' : <>전체 <b className="text-ink">{list.length}</b>건{openCount > 0 && <> · 응답 대기 <b className="text-ink">{openCount}</b>건</>}</>}</div>
      </div>
      {list.length === 0 ? (
        <div className="bg-white border border-line rounded-xl py-16 text-center text-ink-3">오늘 배치에서 이름을 누르고 「결근 처리」를 하면 여기에 쌓입니다.</div>
      ) : (
        <div className="flex flex-col gap-3">
          {list.map((l) => {
            const f = l[0]; const accepted = l.find((r) => r.status === '수락'); const open = l.filter((r) => r.status === '발송');
            return (
              <section key={`${f.board_id}|${f.post_id}`} className="bg-white border border-line rounded-xl">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3.5 border-b border-line-2">
                  <span className="text-[17px] font-semibold">{fmtShort(f.date)} {f.shift} · {FAC[f.factory_id]} {f.post_code}</span>
                  {f.product && <span className="text-sm text-ink-2">{f.product}</span>}
                  {f.vacated_name && <span className="text-sm text-ink-3">{f.vacated_name} {f.vacated_kind ?? '결근'}</span>}
                  {accepted
                    ? <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-ok bg-ok-bg px-2 h-6 rounded"><i className="w-1.5 h-1.5 rounded-full bg-ok" />{accepted.name} 수락</span>
                    : open.length ? <span className="text-sm text-ink-2 bg-chip px-2 h-6 inline-flex items-center rounded">응답 대기 {open.length}</span>
                    : <span className="text-sm font-semibold text-vac bg-vac-bg px-2 h-6 inline-flex items-center rounded">미충원</span>}
                  {!accepted && <span className="ml-auto flex gap-1.5">
                    <button onClick={() => act(f, 'next')} className="h-8 px-3 rounded-md border border-line text-sm font-medium hover:border-ink-3">다음 후보에게</button>
                    {open.length > 0 && <button onClick={() => act(f, 'cancel_requests')} className="h-8 px-2.5 rounded-md text-sm text-vac hover:bg-vac-bg">전체 취소</button>}
                    <button onClick={() => act(f, 'cancel')} className="h-8 px-2.5 rounded-md text-sm text-ink-3 hover:bg-ground">자리 닫기</button>
                  </span>}
                </div>
                <ul className="px-5 py-2 divide-y divide-line-2">
                  {l.sort((a, b) => a.rank - b.rank).map((r) => (
                    <li key={r.id} className="flex items-center gap-3 py-2 text-[15px]">
                      <span className="w-5 text-xs text-ink-3">{r.rank}</span>
                      <span className="font-medium w-16">{r.name}</span>
                      <StatusTag status={r.status} />
                      {r.status === '발송' && <button onClick={() => act(r, 'cancel_requests', r.id)} className="h-6 px-2 rounded text-[12px] font-semibold text-vac border border-vac/40 hover:bg-vac-bg shrink-0">취소</button>}
                      <span className="flex flex-wrap gap-1 min-w-0">{(r.reason ?? '').split(' · ').filter(Boolean).map((t) => <span key={t} className="inline-flex items-center gap-1 h-6 px-2 rounded border border-brand/30 text-brand text-[12px] whitespace-nowrap"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12l5 5L20 6" /></svg>{t}</span>)}</span>
                      <span className="ml-auto text-xs text-ink-3 shrink-0">{r.sent_at.slice(11, 16)}{r.responded_at ? ` → ${r.responded_at.slice(11, 16)}` : ''}</span>
                      {r.status === '발송' && <a href={`/r/${r.token}`} target="_blank" rel="noreferrer" className="text-xs text-ink-2 underline shrink-0">수락 화면</a>}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
