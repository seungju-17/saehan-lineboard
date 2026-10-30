'use client';
import { useState } from 'react';
import type { RequestRow } from '@/lib/repo';
import { fmtShort } from '@/lib/shift';

const FAC: Record<number, string> = { 1: '1공장', 2: '2공장' };

export function Requests({ initial }: { initial: RequestRow[] }): React.ReactElement {
  const [rows, setRows] = useState(initial);
  const groups = new Map<string, RequestRow[]>();
  for (const r of rows) { const k = `${r.board_id}|${r.post_id}`; if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(r); }

  async function act(r: RequestRow, action: 'next' | 'cancel'): Promise<void> {
    await fetch('/api/board', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: r.date, shift: r.shift, factory: r.factory_id, action, postId: r.post_id }) });
    setRows(await (await fetch('/api/requests')).json());
  }

  if (groups.size === 0) return <div className="py-16 text-center text-ink-3">보낸 요청이 없습니다</div>;
  return (
    <div className="flex flex-col divide-y divide-line">
      {[...groups.values()].map((list) => {
        const f = list[0]; const accepted = list.find((r) => r.status === '수락'); const open = list.filter((r) => r.status === '발송');
        return (
          <section key={`${f.board_id}|${f.post_id}`} className="py-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-bold">{fmtShort(f.date)} {f.shift} · {FAC[f.factory_id]} {f.post_code}</span>
              {f.vacated_name && <span className="text-sm text-ink-3">{f.vacated_name} 결근</span>}
              {accepted ? <span className="text-sm font-semibold text-ok">{accepted.name} 수락</span> : open.length ? <span className="text-sm text-ink-2">응답 대기 {open.length}</span> : <span className="text-sm text-vac">미충원</span>}
              {!accepted && <span className="ml-auto flex gap-1">
                <button onClick={() => act(f, 'next')} className="h-8 px-2.5 rounded-md border border-line text-sm hover:bg-ground">다음 후보</button>
                {open.length > 0 && <button onClick={() => act(f, 'cancel')} className="h-8 px-2.5 rounded-md text-sm text-ink-3 hover:bg-ground">취소</button>}
              </span>}
            </div>
            <ul className="mt-2 flex flex-col gap-1 text-[15px]">
              {list.sort((a, b) => a.rank - b.rank).map((r) => (
                <li key={r.id} className="flex items-baseline gap-3">
                  <span className="w-5 text-ink-3 text-sm">{r.rank}</span>
                  <span className="font-medium">{r.name}</span>
                  <span className={`text-sm ${r.status === '수락' ? 'text-ok font-semibold' : r.status === '발송' ? 'text-ink' : 'text-ink-3'}`}>{r.status === '발송' ? '대기' : r.status}</span>
                  <span className="text-sm text-ink-3 truncate">{r.reason}</span>
                  <span className="ml-auto text-xs text-ink-3 shrink-0">{r.sent_at.slice(11, 16)}{r.responded_at ? ` → ${r.responded_at.slice(11, 16)}` : ''}</span>
                  {r.status === '발송' && <a href={`/r/${r.token}`} target="_blank" rel="noreferrer" className="text-xs text-ink-3 underline shrink-0">수락 화면</a>}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
