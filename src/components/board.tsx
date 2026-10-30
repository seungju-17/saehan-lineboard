'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Board as BoardT, RequestRow } from '@/lib/repo';
import { addDays, currentShiftSeoul, fmtKo, todaySeoul, type Shift } from '@/lib/shift';

const FACTORIES = [[1, '1공장'], [2, '2공장']] as const;
type Popover = { kind: 'person'; postId: number; personId: number } | { kind: 'add'; postId: number } | { kind: 'vacancy'; postId: number } | null;

export function Board(): React.ReactElement {
  const [date, setDate] = useState(todaySeoul());
  const [shift, setShift] = useState<Shift>(currentShiftSeoul());
  const [factory, setFactory] = useState<number>(2);
  const [board, setBoard] = useState<BoardT | null>(null);
  const [pop, setPop] = useState<Popover>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const popRef = useRef<HTMLDivElement>(null);

  const q = useMemo(() => `date=${date}&shift=${shift}&factory=${factory}`, [date, shift, factory]);

  const load = useCallback(async (): Promise<void> => {
    const r = await fetch(`/api/board?${q}`); if (r.ok) setBoard(await r.json());
  }, [q]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- 조회 결과 반영
  useEffect(() => { load(); setPop(null); }, [load]);
  useEffect(() => { if (!flash) return; const t = setTimeout(() => setFlash(null), 2500); return () => clearTimeout(t); }, [flash]);
  useEffect(() => {
    function onDoc(e: MouseEvent): void { if (popRef.current && !popRef.current.contains(e.target as Node)) setPop(null); }
    function onKey(e: KeyboardEvent): void { if (e.key === 'Escape') setPop(null); }
    document.addEventListener('mousedown', onDoc); document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, []);

  async function act(body: Record<string, unknown>): Promise<BoardT | null> {
    setBusy(true);
    try {
      const r = await fetch('/api/board', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date, shift, factory, ...body }) });
      const data = await r.json();
      if (!r.ok) { setFlash(data.error ?? '실패'); return null; }
      setBoard(data); return data;
    } finally { setBusy(false); }
  }

  const locked = board?.status === '확정';
  const byPost = useMemo(() => {
    const m = new Map<number, BoardT['assignments']>();
    for (const a of board?.assignments ?? []) { if (!m.has(a.post_id)) m.set(a.post_id, []); m.get(a.post_id)!.push(a); }
    return m;
  }, [board]);
  const reqByPost = useMemo(() => {
    const m = new Map<number, RequestRow[]>();
    for (const r of board?.requests ?? []) { if (!m.has(r.post_id)) m.set(r.post_id, []); m.get(r.post_id)!.push(r); }
    return m;
  }, [board]);
  const total = board?.assignments.length ?? 0;

  async function confirm(): Promise<void> {
    if (!window.confirm(`${total}명에게 알림을 보냅니다.`)) return;
    const d = await act({ action: 'confirm' });
    if (d) setFlash(`확정 · 알림 ${(d as BoardT & { notified: number }).notified}건`);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <div className="flex items-center">
          <button aria-label="전날" onClick={() => setDate(addDays(date, -1))} className="h-10 w-9 rounded-md hover:bg-ground">‹</button>
          <label className="relative">
            <span className="h-10 px-2 inline-flex items-center text-xl font-bold cursor-pointer">{fmtKo(date)}</span>
            <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" aria-label="날짜" />
          </label>
          <button aria-label="다음날" onClick={() => setDate(addDays(date, 1))} className="h-10 w-9 rounded-md hover:bg-ground">›</button>
        </div>
        <Seg value={shift} options={[['주간', '주간'], ['야간', '야간']]} onChange={(v) => setShift(v as Shift)} />
        <Seg value={String(factory)} options={FACTORIES.map(([id, n]) => [String(id), n])} onChange={(v) => setFactory(Number(v))} />
        <div className="ml-auto flex items-center gap-2">
          {locked ? <span className="text-sm font-semibold text-ok bg-ok-bg px-2.5 h-8 inline-flex items-center rounded-md">확정</span> : null}
          <a href={`/print?${q}`} target="_blank" className="h-10 px-3 inline-flex items-center rounded-md border border-line text-[15px] hover:bg-ground">인쇄</a>
          <a href={`/api/board/export?${q}`} className="h-10 px-3 inline-flex items-center rounded-md border border-line text-[15px] hover:bg-ground">엑셀</a>
          {locked
            ? <button onClick={() => act({ action: 'unconfirm' })} disabled={busy} className="h-10 px-3 rounded-md border border-line text-[15px] hover:bg-ground">확정 해제</button>
            : <button onClick={confirm} disabled={busy || total === 0} className="h-10 px-4 rounded-md bg-ink text-white font-semibold disabled:opacity-40">확정</button>}
        </div>
      </div>

      <div className="relative">
        <table className="w-full text-base border-t border-line">
          <tbody>
            {board?.posts.map((p) => {
              const ppl = byPost.get(p.id) ?? [];
              const reqs = reqByPost.get(p.id) ?? [];
              const open = reqs.filter((r) => r.status === '발송').length;
              const vacant = ppl.length === 0 && (p.vacant === 1 || (p.kind === 'machine' && !!p.product));
              const machine = p.kind === 'machine';
              return (
                <tr key={p.id} className={`border-b border-line-2 ${vacant ? 'bg-vac-bg' : machine ? '' : 'bg-ground/60'}`}>
                  <td className="w-36 sm:w-44 py-3 pr-3 align-top">
                    <div className="font-bold leading-6">{p.code}</div>
                    {!machine && <div className="text-xs text-ink-3">{p.name}</div>}
                  </td>
                  <td className="w-40 sm:w-52 py-3 pr-3 align-top">
                    {machine && (editing === p.id
                      ? <input autoFocus defaultValue={p.product ?? ''} onBlur={async (e) => { setEditing(null); if (e.target.value !== (p.product ?? '')) await act({ action: 'product', postId: p.id, product: e.target.value }); }}
                          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} className="w-full h-8 px-2 border border-ink rounded-md" aria-label={`${p.code} 제품`} />
                      : <button disabled={locked} onClick={() => setEditing(p.id)} className={`h-8 -mx-2 px-2 rounded-md text-left hover:bg-black/5 disabled:cursor-default ${p.product ? '' : 'text-ink-3'}`}>{p.product ?? '—'}</button>)}
                  </td>
                  <td className="py-2 align-top">
                    <div className="relative flex flex-wrap items-center gap-1.5">
                      {ppl.map((a) => (
                        <span key={a.id} className="relative">
                          <button data-chip="person" disabled={locked} onClick={() => setPop({ kind: 'person', postId: p.id, personId: a.person_id })}
                            className={`h-9 px-3 rounded-full border text-[15px] font-medium hover:bg-black/5 disabled:cursor-default ${a.source === '대체' ? 'border-ok text-ok' : 'border-line'}`}>{a.name}</button>
                          {pop?.kind === 'person' && pop.postId === p.id && pop.personId === a.person_id && (
                            <Pop ref={popRef}>
                              <div className="px-3 py-2 text-sm text-ink-2">{[a.affiliation, a.work_type === '임시' ? '임시' : a.grp !== '미정' ? `${a.grp}조` : null].filter(Boolean).join(' · ') || '정보 없음'}</div>
                              <PopBtn onClick={async () => { setPop(null); if (!window.confirm(`${a.name} 결근 처리하고 후보 3명에게 요청을 보냅니다.`)) return; const d = await act({ action: 'absent', postId: p.id, personId: a.person_id }); if (d) setFlash(`${(d as BoardT & { sent: number }).sent}명에게 요청 보냄`); }}>결근 처리</PopBtn>
                              <PopBtn onClick={() => { setPop(null); act({ action: 'remove', postId: p.id, personId: a.person_id }); }}>빼기</PopBtn>
                            </Pop>
                          )}
                        </span>
                      ))}
                      {vacant && (
                        <span className="relative">
                          <button data-chip="vacant" onClick={() => setPop({ kind: 'vacancy', postId: p.id })} className="h-9 px-3 rounded-full bg-white border border-vac text-vac text-[15px] font-semibold hover:bg-vac/5">
                            비어 있음{open > 0 && <span className="font-normal text-ink-2"> · 요청 {open}</span>}{reqs.some((r) => r.status === '거절') && open === 0 && <span className="font-normal text-ink-2"> · 응답 없음</span>}
                          </button>
                          {pop?.kind === 'vacancy' && pop.postId === p.id && (
                            <Pop ref={popRef} wide>
                              {reqs.length === 0 ? <div className="px-3 py-2 text-sm text-ink-2">아직 요청하지 않음</div> : reqs.map((r) => (
                                <div key={r.id} className="px-3 py-1.5 text-sm flex gap-2"><span className="font-medium w-16 shrink-0">{r.name}</span><span className={`w-12 shrink-0 ${r.status === '수락' ? 'text-ok' : r.status === '발송' ? 'text-ink' : 'text-ink-3'}`}>{r.status === '발송' ? '대기' : r.status}</span><span className="text-ink-3 truncate">{r.reason}</span></div>
                              ))}
                              <div className="border-t border-line-2 mt-1">
                                {reqs.length === 0 ? <PopBtn onClick={async () => { setPop(null); const d = await act({ action: 'send', postId: p.id }); if (d) setFlash(`${(d as BoardT & { sent: number }).sent}명에게 요청 보냄`); }}>후보에게 요청</PopBtn>
                                  : <PopBtn onClick={async () => { setPop(null); const d = await act({ action: 'next', postId: p.id }); if (d) setFlash(`다음 ${(d as BoardT & { sent: number }).sent}명에게 요청 보냄`); }}>다음 후보에게</PopBtn>}
                                <PopBtn onClick={() => { setPop({ kind: 'add', postId: p.id }); setQuery(''); }}>직접 넣기</PopBtn>
                                {!(p.kind === 'machine' && p.product) && <PopBtn onClick={() => { setPop(null); act({ action: 'cancel', postId: p.id }); }} muted>자리 닫기</PopBtn>}
                              </div>
                            </Pop>
                          )}
                        </span>
                      )}
                      {!locked && (
                        <span className="relative">
                          <button data-chip="add" aria-label={`${p.code}에 이름 추가`} onClick={() => { setPop({ kind: 'add', postId: p.id }); setQuery(''); }} className="h-9 w-9 rounded-full border border-dashed border-line text-ink-3 hover:border-ink hover:text-ink">+</button>
                          {pop?.kind === 'add' && pop.postId === p.id && (
                            <Pop ref={popRef} wide>
                              <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="이름"
                                onKeyDown={async (e) => { if (e.key === 'Enter' && query.trim()) { setPop(null); const d = await act({ action: 'add', postId: p.id, name: query.trim() }); if (d && !(d.assignments.some((a) => a.post_id === p.id && a.name === query.trim().replace(/\s+/g, '')))) setFlash('추가 실패'); } }}
                                className="mx-2 mt-2 mb-1 h-9 px-2 border border-line rounded-md w-[calc(100%-16px)]" />
                              {(board.suggestions[p.id] ?? []).filter((s) => !query || s.name.includes(query.replace(/\s+/g, ''))).slice(0, 8).map((s) => (
                                <PopBtn key={s.id} onClick={() => { setPop(null); act({ action: 'add', postId: p.id, personId: s.id }); }}>
                                  <span className="font-medium">{s.name}</span><span className="ml-2 text-xs text-ink-3">{s.affiliation} · {s.hint}</span>
                                </PopBtn>
                              ))}
                              {query.trim() && !(board.suggestions[p.id] ?? []).some((s) => s.name === query.trim()) && (
                                <PopBtn onClick={() => { setPop(null); act({ action: 'add', postId: p.id, name: query.trim() }); }}>‘{query.trim()}’ 추가</PopBtn>
                              )}
                            </Pop>
                          )}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!board && <div className="py-12 text-center text-ink-3">불러오는 중</div>}
      </div>
      {board?.copied_from && board.status === '초안' && board.assignments.every((a) => a.source === '복사') && (
        <div className="text-sm text-ink-3">{board.copied_from} 표 기준</div>
      )}
      {flash && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 bg-ink text-white text-sm px-4 py-2 rounded-md shadow-lg">{flash}</div>}
    </div>
  );
}

function Seg({ value, options, onChange }: { value: string; options: readonly (readonly [string, string])[]; onChange: (v: string) => void }): React.ReactElement {
  return (
    <div className="inline-flex rounded-md border border-line overflow-hidden" role="group">
      {options.map(([v, label]) => (
        <button key={v} onClick={() => onChange(v)} className={`h-10 px-3.5 text-[15px] ${value === v ? 'bg-ink text-white font-semibold' : 'text-ink-2 hover:bg-ground'}`}>{label}</button>
      ))}
    </div>
  );
}
import { forwardRef } from 'react';
const Pop = forwardRef<HTMLDivElement, { children: React.ReactNode; wide?: boolean }>(function Pop({ children, wide }, ref) {
  return <div ref={ref} className={`absolute z-20 top-10 left-0 ${wide ? 'w-80' : 'w-44'} py-1 bg-white border border-line rounded-lg shadow-lg`}>{children}</div>;
});
function PopBtn({ children, onClick, muted }: { children: React.ReactNode; onClick: () => void; muted?: boolean }): React.ReactElement {
  return <button onClick={onClick} className={`w-full text-left px-3 h-10 text-[15px] hover:bg-ground ${muted ? 'text-ink-3' : ''}`}>{children}</button>;
}
