'use client';
import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ATTENDANCE_KINDS, isVacantPost, type AttendanceKind, type Board as BoardT, type RequestRow, type SendResult } from '@/lib/repo';
import { addDays, currentShiftSeoul, fmtKo, fmtShort, groupsOn, todaySeoul, type Shift } from '@/lib/shift';
import { ask } from '@/lib/ask';

const FACTORIES = [[1, '1공장'], [2, '2공장']] as const;
type Popover = { kind: 'person'; postId: number; personId: number } | { kind: 'add'; postId: number } | { kind: 'vacancy'; postId: number } | { kind: 'line'; postId: number } | null;
type PostT = BoardT['posts'][number];

export function Board(): React.ReactElement {
  const [date, setDate] = useState(todaySeoul());
  const [shift, setShift] = useState<Shift>(currentShiftSeoul());
  const [factory, setFactory] = useState<number>(2);
  const [board, setBoard] = useState<BoardT | null>(null);
  const [pop, setPop] = useState<Popover>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [noteEdit, setNoteEdit] = useState(false);
  const [query, setQuery] = useState('');
  const [showIdle, setShowIdle] = useState<Record<string, boolean>>({});
  const popRef = useRef<HTMLDivElement>(null);

  const q = useMemo(() => `date=${date}&shift=${shift}&factory=${factory}`, [date, shift, factory]);
  // 주소에 날짜·근무·공장을 남겨 링크로 공유할 수 있게 한다 (브라우저 판은 해시 주소라 제외)
  useEffect(() => {
    if (window.location.hash) return;
    const sp = new URLSearchParams(window.location.search);
    const d = sp.get('date'), sh = sp.get('shift'), f = Number(sp.get('factory'));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 첫 진입 때 주소의 값을 반영
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) setDate(d); if (sh === '주간' || sh === '야간') setShift(sh); if (f === 1 || f === 2) setFactory(f);
  }, []);
  useEffect(() => { if (!window.location.hash) window.history.replaceState(null, '', `?${q}`); }, [q]);

  const load = useCallback(async (): Promise<void> => {
    const r = await fetch(`/api/board?${q}`); if (r.ok) setBoard(await r.json());
  }, [q]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- 조회 결과 반영
  useEffect(() => { load(); setPop(null); setNoteEdit(false); }, [load]);
  useEffect(() => { if (!flash) return; const t = setTimeout(() => setFlash(null), flash.length > 40 ? 5000 : 2500); return () => clearTimeout(t); }, [flash]);
  // 요청을 보낸 뒤 자동으로 열리는 말풍선이 화면 밖이면 보이게 끌어온다
  useEffect(() => { if (pop?.kind === 'vacancy') popRef.current?.scrollIntoView({ block: 'nearest' }); }, [pop]);
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
  const attByPerson = useMemo(() => new Map((board?.attendance ?? []).map((a) => [a.person_id, a])), [board]);
  const isVacant = (p: PostT): boolean => isVacantPost(p, byPost.get(p.id)?.length ?? 0);
  const total = board?.assignments.length ?? 0;
  const men = board?.assignments.filter((a) => a.gender === 'M').length ?? 0;
  const women = board?.assignments.filter((a) => a.gender === 'F').length ?? 0;
  const vacantCount = board?.posts.filter(isVacant).length ?? 0;
  const waiting = board?.requests.filter((r) => r.status === '발송').length ?? 0;
  const runningLines = board?.posts.filter((p) => p.kind === 'machine' && !p.unmanned && !p.stopped && (p.product || (byPost.get(p.id)?.length ?? 0) > 0)).length ?? 0;
  const stoppedCount = board?.posts.filter((p) => p.stopped).length ?? 0;
  const groups = useMemo(() => {
    const out: { name: string; posts: PostT[] }[] = [];
    for (const p of board?.posts ?? []) { const g = p.zone || '라인'; const last = out[out.length - 1]; if (last && last.name === g) last.posts.push(p); else out.push({ name: g, posts: [p] }); }
    return out;
  }, [board]);
  const twoStep = factory === 2; // 2공장은 결재 문서: 입안(반장) → 결정(팀장)

  async function autofill(): Promise<void> {
    const d = await act({ action: 'autofill' });
    if (!d) return;
    const r = (d as BoardT & { filled: number; lines: number; need: number });
    setFlash(r.filled === 0 ? (r.need === 0 ? '채울 자리가 없습니다' : '넣을 수 있는 사람이 없습니다') : `${r.lines}개 라인에 ${r.filled}명을 넣었습니다. 확인 후 확정하세요.`);
  }
  async function confirm(): Promise<void> {
    if (!(await ask(`${total}명에게 알림을 보냅니다.`))) return;
    const d = await act({ action: 'confirm' });
    if (d) setFlash(`${twoStep ? '결정' : '확정'}했습니다 · 알림 ${(d as BoardT & { notified: number }).notified}건`);
  }
  /** 요청을 보낸 뒤: 누구에게 갔는지 띄우고, 그 자리 말풍선을 열어 한 명씩 취소할 수 있게 한다. */
  function afterSend(p: PostT, d: BoardT, prefix = ''): void {
    const r = d as BoardT & SendResult;
    const names = (r.candidates ?? []).map((c) => c.name);
    if (names.length === 0) { setFlash(`${prefix}보낼 후보가 없습니다`); setPop({ kind: 'vacancy', postId: p.id }); return; }
    setFlash(`${prefix}${names.join(' · ')}에게 요청`);
    setPop({ kind: 'vacancy', postId: p.id });
  }
  async function attend(p: PostT, personId: number, name: string, kind: AttendanceKind): Promise<void> {
    setPop(null);
    if (kind === '결근' && !(await ask(`${name} 결근 처리하고 후보 3명에게 요청을 보냅니다.`))) return;
    if ((kind === '연차' || kind === '병가') && !(await ask(`${name} ${kind}로 표시하고 자리를 비웁니다.`))) return;
    const d = await act({ action: 'attend', postId: p.id, personId, kind });
    if (!d) return;
    if (kind === '결근') afterSend(p, d); else setFlash(`${name} ${kind} 표시했습니다`);
  }

  return (
    <div className="flex flex-col gap-5">
      {/* 머리: 날짜 · 근무 · 공장 / 동작 */}
      <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
        <div>
          <div className="flex items-center gap-1 -ml-2">
            <button aria-label="전날" onClick={() => setDate(addDays(date, -1))} className="h-9 w-9 rounded-md text-ink-3 hover:bg-white hover:text-ink text-lg">‹</button>
            <label className="relative">
              <h1 className="h-9 px-1 inline-flex items-center text-[28px] font-bold tracking-tight cursor-pointer leading-none m-0">{fmtKo(date)}</h1>
              <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" aria-label="날짜" />
            </label>
            <button aria-label="다음날" onClick={() => setDate(addDays(date, 1))} className="h-9 w-9 rounded-md text-ink-3 hover:bg-white hover:text-ink text-lg">›</button>
          </div>
          <div className="mt-1.5 text-sm text-ink-2 flex flex-wrap items-center gap-x-2">
            {board?.status === '확정'
              ? <span className="inline-flex items-center gap-1.5 font-semibold text-ok"><i className="w-1.5 h-1.5 rounded-full bg-ok" />{twoStep ? '결정됨' : '확정됨'}{board?.confirmed_at && <span className="font-normal text-ink-3">{board.confirmed_at.slice(11, 16)}</span>}</span>
              : board?.status === '입안'
              ? <span className="inline-flex items-center gap-1.5 font-semibold text-brand"><i className="w-1.5 h-1.5 rounded-full bg-brand" />입안됨 · 결정 대기</span>
              : <span className="inline-flex items-center gap-1.5"><i className="w-1.5 h-1.5 rounded-full bg-ink-3" />작성 중</span>}
            {board && <>
              <span className="text-line">|</span>
              <span>근무 <b className="text-ink">{total}</b>명{(men || women) ? <span className="text-ink-3"> (남 {men} · 여 {women})</span> : null}</span>
              <span>가동 <b className="text-ink">{runningLines}</b>라인</span>
              {stoppedCount > 0 && <span>부동 <b className="text-ink">{stoppedCount}</b></span>}
              {vacantCount > 0 && <span className="text-vac">비어 있음 <b>{vacantCount}</b></span>}
              {waiting > 0 && <span>요청 대기 <b className="text-ink">{waiting}</b></span>}
            </>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Seg value={shift} options={[['주간', '주간'], ['야간', '야간']]} onChange={(v) => setShift(v as Shift)} />
          <Seg value={String(factory)} options={FACTORIES.map(([id, n]) => [String(id), n])} onChange={(v) => setFactory(Number(v))} />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <a href={`/print?${q}`} target="_blank" className="h-9 px-3 inline-flex items-center rounded-md border border-line bg-white text-sm text-ink-2 hover:text-ink hover:border-ink-3">인쇄</a>
          <a href={`/api/board/export?${q}`} className="h-9 px-3 inline-flex items-center rounded-md border border-line bg-white text-sm text-ink-2 hover:text-ink hover:border-ink-3">엑셀</a>
          <a href={`/api/attendance/export?month=${date.slice(0, 7)}&factory=${factory}`} className="h-9 px-3 inline-flex items-center rounded-md border border-line bg-white text-sm text-ink-2 hover:text-ink hover:border-ink-3">월 근태표</a>
          {!locked && <button onClick={autofill} disabled={busy} className="h-11 px-4 rounded-md border border-brand/30 bg-white text-[15px] font-semibold text-brand hover:border-brand hover:bg-brand-soft disabled:opacity-40">자동 채우기</button>}
          {locked
            ? <button onClick={() => act({ action: 'unconfirm' })} disabled={busy} className="h-11 px-4 rounded-md border border-line bg-white text-[15px] font-medium hover:border-ink-3">{twoStep ? '결정 해제' : '확정 해제'}</button>
            : twoStep && board?.status === '초안'
            ? <button onClick={() => act({ action: 'propose' }).then((d) => d && setFlash('입안했습니다. 팀장 결정을 기다립니다.'))} disabled={busy || total === 0} className="h-11 px-5 rounded-md bg-brand text-white text-[15px] font-semibold hover:bg-brand-2 disabled:opacity-40">입안</button>
            : <button onClick={confirm} disabled={busy || total === 0} className="h-11 px-5 rounded-md bg-brand text-white text-[15px] font-semibold hover:bg-brand-2 disabled:opacity-40">{twoStep ? '결정' : '확정'}</button>}
        </div>
      </div>

      {/* 표 + 오른쪽 요약 */}
      <div className="grid gap-5 items-start lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="bg-white border border-line rounded-xl overflow-visible min-w-0">
        <table className="w-full">
          <thead>
            <tr className="text-[13px] text-ink-3 border-b border-line">
              <th className="text-left font-medium pl-4 sm:pl-5 pr-2 sm:pr-3 py-2.5 w-20 sm:w-40">라인</th>
              <th className="text-left font-medium pr-2 sm:pr-3 py-2.5 w-24 sm:w-52">제품</th>
              <th className="text-left font-medium py-2.5">근무자</th>
              <th className="text-right font-medium pr-5 py-2.5 w-14 hidden sm:table-cell">인원</th>
            </tr>
          </thead>
          {groups.map((g) => {
            const isIdle = (p: PostT): boolean => p.kind === 'machine' && !p.unmanned && !p.stopped && !p.product && (byPost.get(p.id)?.length ?? 0) === 0 && Number(p.vacant) !== 1;
            const idleCount = g.posts.filter(isIdle).length;
            const collapse = idleCount > 1 && !showIdle[g.name];
            const shown = collapse ? g.posts.filter((p) => !isIdle(p)) : g.posts;
            return (
            <tbody key={g.name}>
              <tr><td colSpan={4} className="pl-4 sm:pl-5 pt-4 pb-1"><div className="flex items-center gap-3 text-[13px] font-semibold text-ink-3">{g.name}
                {idleCount > 1 && <button onClick={() => setShowIdle((v) => ({ ...v, [g.name]: !v[g.name] }))} className="font-normal text-ink-3 hover:text-ink underline decoration-line underline-offset-2">{collapse ? `쉬는 라인 ${idleCount}개 보기` : '쉬는 라인 접기'}</button>}
              </div></td></tr>
              {shown.map((p) => {
                const ppl = byPost.get(p.id) ?? [];
                const reqs = reqByPost.get(p.id) ?? [];
                const open = reqs.filter((r) => r.status === '발송').length;
                const vacant = isVacant(p);
                const machine = p.kind === 'machine';
                const unmanned = Number(p.unmanned) === 1, stopped = Number(p.stopped) === 1;
                const idle = machine && !unmanned && !stopped && !p.product && ppl.length === 0 && !vacant;
                return (
                  <tr key={p.id} className={`border-t border-line-2 ${vacant ? 'bg-vac-bg' : ''} ${idle || stopped ? 'text-ink-3' : ''} ${stopped ? 'bg-ground/60' : ''}`}>
                    <td className="pl-4 sm:pl-5 pr-2 sm:pr-3 py-2.5 align-middle">
                      <div className="relative flex items-center gap-2 sm:gap-2.5">
                        <i className={`w-1 h-5 rounded-full shrink-0 ${vacant ? 'bg-vac' : stopped || idle ? 'bg-line' : unmanned ? 'bg-ink-3' : 'bg-brand'}`} aria-hidden />
                        <button disabled={locked} onClick={() => setPop({ kind: 'line', postId: p.id })} className="text-left disabled:cursor-default">
                          <div className={`text-[16px] sm:text-[17px] font-semibold leading-5 ${idle || stopped ? 'text-ink-3' : 'text-ink'}`}>{p.code}{stopped && <span className="ml-1.5 text-[12px] font-semibold text-ink-2 bg-chip px-1.5 rounded">부동</span>}{unmanned && <span className="ml-1.5 text-[12px] font-normal text-ink-3">무인</span>}{Number(p.fixed) === 1 && <span className="ml-1.5 text-[12px] font-normal text-ink-3">직책</span>}</div>
                          {!machine && <div className="text-[13px] text-ink-3 leading-4">{p.name}</div>}
                        </button>
                        {pop?.kind === 'line' && pop.postId === p.id && (
                          <Pop ref={popRef}>
                            <div className="px-3 pt-2 pb-1.5 text-xs text-ink-3 border-b border-line-2">{p.name}{unmanned ? ' · 무인 라인' : ''}</div>
                            {machine && !unmanned && <PopBtn onClick={() => { setPop(null); act({ action: 'stop', postId: p.id, stopped: !stopped }).then((d) => d && setFlash(stopped ? `${p.code} 부동을 풀었습니다` : `${p.code} 부동. 이 라인 인원을 다른 자리로 옮기세요.`)); }}>{stopped ? '부동 해제' : '라인 부동 (세움)'}</PopBtn>}
                            {machine && <PopBtn onClick={() => { setPop(null); setEditing(p.id); }}>제품 바꾸기</PopBtn>}
                            <PopBtn onClick={() => { setPop({ kind: 'add', postId: p.id }); setQuery(''); }}>사람 넣기</PopBtn>
                          </Pop>
                        )}
                      </div>
                    </td>
                    <td className="pr-2 sm:pr-3 py-2.5 align-middle">
                      {machine && (editing === p.id
                        ? <input autoFocus defaultValue={p.product ?? ''} onBlur={async (e) => { setEditing(null); if (e.target.value !== (p.product ?? '')) await act({ action: 'product', postId: p.id, product: e.target.value }); }}
                            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} className="w-full h-8 px-2 border border-brand rounded-md text-[15px]" aria-label={`${p.code} 제품`} />
                        : <button disabled={locked} onClick={() => setEditing(p.id)} className={`h-8 -mx-2 px-2 rounded-md text-left text-[14px] sm:text-[15px] hover:bg-ground disabled:cursor-default truncate max-w-full ${p.product ? (stopped ? 'line-through text-ink-3' : 'font-medium') : 'text-ink-3'}`}>{p.product ?? '—'}</button>)}
                    </td>
                    <td className="py-2 align-middle">
                      <div className="relative flex flex-wrap items-center gap-1.5 whitespace-nowrap">
                        {ppl.map((a) => {
                          const att = attByPerson.get(a.person_id);
                          const away = a.home_factory_id && a.home_factory_id !== factory;
                          return (
                          <span key={a.id} className="relative">
                            <button data-chip="person" disabled={locked} onClick={() => setPop({ kind: 'person', postId: p.id, personId: a.person_id })}
                              className={`h-8 px-3 rounded-md text-sm font-medium disabled:cursor-default ${a.source === '대체' ? 'bg-ok-bg text-ok hover:bg-ok/15' : a.source === '자동' ? 'bg-brand-soft text-brand hover:bg-brand/15' : 'bg-chip text-ink hover:bg-line'}`}>
                              {a.name}{away ? <span className="ml-1 text-[11px] font-normal text-ink-3">{a.home_factory_id}공장</span> : null}{att && <span className="ml-1 text-[11px] font-semibold text-vac">{att.kind}</span>}
                            </button>
                            {pop?.kind === 'person' && pop.postId === p.id && pop.personId === a.person_id && (
                              <Pop ref={popRef} wide>
                                <div className="px-3 pt-2 pb-1.5 text-xs text-ink-3 border-b border-line-2">{[a.affiliation, a.unit, a.gender === 'M' ? '남' : a.gender === 'F' ? '여' : null].filter(Boolean).join(' · ') || '정보 없음'}{away ? ` · ${a.home_factory_id}공장 소속(지원)` : ''}</div>
                                <div className="grid grid-cols-2">
                                  {ATTENDANCE_KINDS.map((k) => <PopBtn key={k} onClick={() => attend(p, a.person_id, a.name, k)} muted={att?.kind === k}>{k === '결근' ? '결근 처리' : k}{att?.kind === k ? ' ✓' : ''}</PopBtn>)}
                                </div>
                                <div className="border-t border-line-2">
                                  {att && <PopBtn muted onClick={() => { setPop(null); act({ action: 'attend', postId: null, personId: a.person_id, kind: null }); }}>근태 표시 지우기</PopBtn>}
                                  <PopBtn onClick={() => { setPop(null); act({ action: 'remove', postId: p.id, personId: a.person_id }); }}>빼기 (다른 자리로)</PopBtn>
                                </div>
                              </Pop>
                            )}
                          </span>
                          );
                        })}
                        {unmanned && ppl.length === 0 && <span className="text-[13px] text-ink-3">자동 운전 · 설비관리가 봄</span>}
                        {vacant && (
                          <span className="relative">
                            <button data-chip="vacant" onClick={() => setPop({ kind: 'vacancy', postId: p.id })} className="h-8 px-3 rounded-md bg-white border border-vac/40 text-vac text-sm font-semibold hover:border-vac">
                              비어 있음{open > 0 && <span className="font-normal text-ink-2"> · 요청 {open}</span>}{reqs.some((r) => r.status === '거절') && open === 0 && <span className="font-normal text-ink-2"> · 응답 없음</span>}
                            </button>
                            {pop?.kind === 'vacancy' && pop.postId === p.id && (
                              <Pop ref={popRef} wide>
                                {reqs.length === 0 && <div className="px-3 py-2 text-sm text-ink-2">아직 요청하지 않았습니다</div>}
                                {reqs.map((r) => (
                                  <div key={r.id} className="px-3 py-1.5 text-sm flex items-center gap-3"><span className="font-medium w-16 shrink-0">{r.name}</span><StatusTag status={r.status} />
                                    {r.status === '발송' && <button onClick={() => act({ action: 'cancel_requests', postId: p.id, requestId: r.id }).then((d) => d && setFlash(`${r.name} 요청 취소`))} className="h-6 px-2 rounded text-[12px] font-semibold text-vac border border-vac/40 hover:bg-vac-bg shrink-0">취소</button>}</div>
                                ))}
                                <div className="border-t border-line-2 mt-1">
                                  {open > 0 && <PopBtn onClick={async () => { setPop(null); if (!(await ask(`${open}명에게 보낸 요청을 모두 취소합니다.`))) return; const d = await act({ action: 'cancel_requests', postId: p.id }); if (d) setFlash(`요청 ${(d as BoardT & { cancelled: number }).cancelled}건 취소`); }}>전체 취소 ({open}명)</PopBtn>}
                                  <PopBtn onClick={() => { setPop({ kind: 'add', postId: p.id }); setQuery(''); }}>다른 라인에서 옮겨 넣기 · 직접 넣기</PopBtn>
                                  {reqs.length === 0 ? <PopBtn onClick={async () => { setPop(null); const d = await act({ action: 'send', postId: p.id }); if (d) afterSend(p, d); }}>후보에게 요청</PopBtn>
                                    : <PopBtn onClick={async () => { setPop(null); const d = await act({ action: 'next', postId: p.id }); if (d) afterSend(p, d, '다음 후보 '); }}>다음 후보에게</PopBtn>}
                                  {machine && <PopBtn onClick={() => { setPop(null); act({ action: 'stop', postId: p.id, stopped: true }).then((d) => d && setFlash(`${p.code} 부동 처리했습니다`)); }}>라인 부동 (세움)</PopBtn>}
                                  {!(p.kind === 'machine' && p.product) && <PopBtn onClick={() => { setPop(null); act({ action: 'cancel', postId: p.id }); }} muted>자리 닫기</PopBtn>}
                                </div>
                              </Pop>
                            )}
                          </span>
                        )}
                        {!locked && !unmanned && (
                          <span className="relative">
                            <button data-chip="add" aria-label={`${p.code}에 이름 추가`} onClick={() => { setPop({ kind: 'add', postId: p.id }); setQuery(''); }} className={`h-8 w-8 rounded-md text-ink-3 hover:bg-chip hover:text-ink ${ppl.length === 0 && !vacant ? 'border border-dashed border-line' : ''}`}>+</button>
                            {pop?.kind === 'add' && pop.postId === p.id && (
                              <Pop ref={popRef} wide>
                                <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="이름 검색…" aria-label="이름 검색" autoComplete="off" spellCheck={false}
                                  onKeyDown={async (e) => { if (e.key === 'Enter' && query.trim()) { setPop(null); const d = await act({ action: 'add', postId: p.id, name: query.trim() }); if (d && !(d.assignments.some((a) => a.post_id === p.id && a.name === query.trim().replace(/\s+/g, '')))) setFlash('추가하지 못했습니다'); } }}
                                  className="mx-2 mt-2 mb-1 h-9 px-2.5 border border-line rounded-md w-[calc(100%-16px)] text-sm focus:border-brand" />
                                {(board!.suggestions[p.id] ?? []).filter((s) => !query || s.name.includes(query.replace(/\s+/g, ''))).slice(0, 8).map((s) => (
                                  <PopBtn key={s.id} onClick={() => { setPop(null); act({ action: 'add', postId: p.id, personId: s.id }); }}>
                                    <span className="font-medium">{s.name}</span><span className="ml-2 text-xs text-ink-3">{s.affiliation} · {s.hint}</span>
                                  </PopBtn>
                                ))}
                                {query.trim() && !(board!.suggestions[p.id] ?? []).some((s) => s.name === query.trim()) && (
                                  <PopBtn onClick={() => { setPop(null); act({ action: 'add', postId: p.id, name: query.trim() }); }}>‘{query.trim()}’ 새로 추가 (임시)</PopBtn>
                                )}
                              </Pop>
                            )}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className={`pr-5 py-2.5 text-right text-sm align-middle hidden sm:table-cell ${ppl.length ? 'text-ink-2' : 'text-ink-3'}`}>{ppl.length || ''}</td>
                  </tr>
                );
              })}
            </tbody>
            );
          })}
        </table>
        {!board && <div className="py-16 text-center text-ink-3">불러오는 중…</div>}
        {board && (
          <div className="px-4 sm:px-5 py-3 border-t border-line-2 text-[13px] flex items-start gap-3">
            <span className="text-ink-3 shrink-0 pt-0.5">비고</span>
            {noteEdit
              ? <input autoFocus defaultValue={board.note ?? ''} aria-label="비고" onBlur={async (e) => { setNoteEdit(false); if (e.target.value !== (board.note ?? '')) await act({ action: 'note', note: e.target.value }); }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} className="flex-1 h-8 px-2 border border-brand rounded-md text-[13px]" />
              : <button disabled={locked} onClick={() => setNoteEdit(true)} className={`flex-1 text-left h-8 -mx-2 px-2 rounded-md hover:bg-ground disabled:cursor-default ${board.note ? 'text-ink' : 'text-ink-3'}`}>{board.note ?? '검수 강화, 결원 대응 같은 그날의 특이 사항'}</button>}
          </div>
        )}
        {board?.copied_from && board.status === '초안' && board.assignments.every((a) => a.source === '복사') && (
          <div className="px-5 py-3 border-t border-line-2 text-[13px] text-ink-3">{board.copied_from} 표를 복사했습니다. 바뀐 곳만 고치고 {twoStep ? '입안' : '확정'}하세요.</div>
        )}
      </div>
      <Rail board={board} date={date} shift={shift} onCancel={(r) => act({ action: 'cancel_requests', postId: r.post_id, requestId: r.id }).then((d) => d && setFlash(`${r.name} 요청 취소`))} />
      </div>
      <div role="status" aria-live="polite" className={`fixed top-20 left-1/2 -translate-x-1/2 z-40 max-w-[calc(100vw-2rem)] bg-brand text-white text-sm px-4 py-2.5 rounded-lg shadow-lg ${flash ? '' : 'hidden'}`}>{flash}</div>
    </div>
  );
}

/** 오른쪽 요약: 오늘 대체 요청 현황·근태·근무조. */
function Rail({ board, date, shift, onCancel }: { board: BoardT | null; date: string; shift: Shift; onCancel?: (r: RequestRow) => void }): React.ReactElement {
  const g = groupsOn(date), gt = groupsOn(addDays(date, 1));
  const reqs = board?.requests ?? [];
  const byPost = new Map<string, RequestRow[]>();
  for (const r of reqs) { if (!byPost.has(r.post_code)) byPost.set(r.post_code, []); byPost.get(r.post_code)!.push(r); }
  const att = board?.attendance ?? [];
  return (
    <aside className="flex flex-col gap-5 lg:sticky lg:top-6">
      <section className="bg-white border border-line rounded-xl">
        <h2 className="px-4 pt-3.5 pb-2 text-[15px] font-semibold">대체 요청</h2>
        {reqs.length === 0 ? <p className="px-4 pb-4 text-[14px] text-ink-2">이름을 누르고 「결근 처리」를 하면 후보 3명에게 요청이 나가고 여기에 답이 쌓입니다.</p> : (
          <ul className="px-4 pb-3 flex flex-col gap-3">
            {[...byPost.entries()].map(([code, list]) => (
              <li key={code}>
                <div className="text-[14px] font-semibold">{code}<span className="ml-2 font-normal text-ink-2">{list[0].vacated_name ? `${list[0].vacated_name} 결근` : '빈 자리'}</span></div>
                <ul className="mt-1 flex flex-col">
                  {list.sort((a, b) => a.rank - b.rank).map((r) => (
                    <li key={r.id} className="flex items-center gap-2 h-7 text-[14px]"><span className="w-14 truncate">{r.name}</span><StatusTag status={r.status} />{r.status === '발송' && onCancel && <button onClick={() => onCancel(r)} className="h-6 px-2 rounded text-[12px] font-semibold text-vac border border-vac/40 hover:bg-vac-bg">취소</button>}<span className="ml-auto text-[13px] text-ink-3 tabular-nums">{r.sent_at.slice(11, 16)}</span></li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>
      {att.length > 0 && (
        <section className="bg-white border border-line rounded-xl">
          <h2 className="px-4 pt-3.5 pb-2 text-[15px] font-semibold">오늘 근태</h2>
          <ul className="px-4 pb-3 flex flex-col gap-1 text-[14px]">{att.map((a) => <li key={a.person_id} className="flex gap-2"><span className="w-16 truncate">{a.name}</span><span className="text-vac font-semibold">{a.kind}</span>{a.note && <span className="text-ink-3 truncate">{a.note}</span>}</li>)}</ul>
        </section>
      )}
      <section className="bg-white border border-line rounded-xl">
        <h2 className="px-4 pt-3.5 pb-2 text-[15px] font-semibold">근무조</h2>
        <dl className="px-4 pb-3 grid grid-cols-[4.5rem_1fr] gap-y-1 text-[14px]">
          <dt className="text-ink-2">{fmtShort(date)}</dt><dd>주간 <b>{g.day}조</b> · 야간 <b>{g.night}조</b> · <span className="text-ink-2">휴무 {g.off}조</span></dd>
          <dt className="text-ink-2">{fmtShort(addDays(date, 1))}</dt><dd>주간 <b>{gt.day}조</b> · 야간 <b>{gt.night}조</b> · <span className="text-ink-2">휴무 {gt.off}조</span></dd>
        </dl>
        <p className="px-4 pb-3.5 text-[13px] text-ink-3">{shift === '주간' ? `오늘 주간은 ${g.day}조 근무, ${g.off}조가 대체 1순위` : `오늘 야간은 ${g.night}조 근무, ${g.off}조가 대체 1순위`}</p>
      </section>
    </aside>
  );
}

function Seg({ value, options, onChange }: { value: string; options: readonly (readonly [string, string])[]; onChange: (v: string) => void }): React.ReactElement {
  return (
    <div className="inline-flex h-9 p-0.5 rounded-md bg-line-2" role="group">
      {options.map(([v, label]) => (
        <button key={v} onClick={() => onChange(v)} className={`px-3.5 rounded text-sm whitespace-nowrap transition-colors ${value === v ? 'bg-white text-ink font-semibold' : 'text-ink-2 hover:text-ink'}`}>{label}</button>
      ))}
    </div>
  );
}
const Pop = forwardRef<HTMLDivElement, { children: React.ReactNode; wide?: boolean }>(function Pop({ children, wide }, ref) {
  return <div ref={ref} className={`absolute z-20 top-9 left-0 ${wide ? 'w-80' : 'w-52'} py-1 bg-white border border-line rounded-lg shadow-[0_8px_24px_rgba(28,34,48,0.12)]`}>{children}</div>;
});
function PopBtn({ children, onClick, muted }: { children: React.ReactNode; onClick: () => void; muted?: boolean }): React.ReactElement {
  return <button onClick={onClick} className={`w-full text-left px-3 h-10 text-[15px] hover:bg-ground ${muted ? 'text-ink-3' : ''}`}>{children}</button>;
}

/** 요청 상태 표시: 대기(주황) · 수락(초록) · 취소/만료/거절(빨강·회색) */
export function StatusTag({ status }: { status: string }): React.ReactElement {
  const cls = status === '발송' ? 'text-wait bg-wait-bg' : status === '수락' ? 'text-ok bg-ok-bg' : status === '취소' ? 'text-vac bg-vac-bg' : 'text-ink-3 bg-chip';
  return <span className={`inline-flex items-center h-5 px-1.5 rounded text-[12px] font-semibold ${cls}`}>{status === '발송' ? '대기' : status}</span>;
}
