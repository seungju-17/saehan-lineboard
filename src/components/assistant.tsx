'use client';
import { useEffect, useRef, useState } from 'react';
import type { AskResult, ChatMessage, Trace } from '@/lib/assistant';

const EXAMPLES = [
  '지난 30일 S-3에 가장 많이 선 사람은?',
  '오늘 쉬는 조 중에 2공장 S-7 경험 있는 사람 알려줘',
  '이번 달 임시 인원이 제일 많았던 날은?',
  '최근 대체 요청 수락률이 어떻게 돼?',
];
type Turn = ChatMessage & { trace?: Trace[]; error?: boolean };

/** 오른쪽 아래 「물어보기」. 배치표 DB를 읽어 답하는 봇. 표는 고치지 않는다. */
export function Assistant({ needsKey = false }: { needsKey?: boolean }): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [askKey, setAskKey] = useState(false);
  const [key, setKey] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [turns, busy]);
  useEffect(() => { if (!open || !needsKey) return; try { if (!localStorage.getItem('lb_api_key')) setAskKey(true); } catch { /* 저장소 없음 */ } }, [open, needsKey]);

  async function send(text: string): Promise<void> {
    const t = text.trim(); if (!t || busy) return;
    const history: ChatMessage[] = [...turns.filter((x) => !x.error).map(({ role, content }) => ({ role, content })), { role: 'user', content: t }];
    setTurns((v) => [...v, { role: 'user', content: t }]); setQ(''); setBusy(true);
    try {
      const r = await fetch('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: history }) });
      const d = await r.json() as AskResult & { error?: string; message?: string };
      if (!r.ok) {
        if (d.error === 'no_key' && needsKey) setAskKey(true);
        setTurns((v) => [...v, { role: 'assistant', content: d.message ?? '답을 가져오지 못했습니다.', error: true }]);
      } else setTurns((v) => [...v, { role: 'assistant', content: d.text, trace: d.trace }]);
    } catch (e) { setTurns((v) => [...v, { role: 'assistant', content: `연결하지 못했습니다: ${(e as Error).message}`, error: true }]); }
    finally { setBusy(false); }
  }
  function saveKey(): void { try { localStorage.setItem('lb_api_key', key.trim()); } catch { /* 저장소 없음 */ } setAskKey(false); setKey(''); }

  return (
    <>
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="assistant-panel"
        className="fixed bottom-5 right-5 z-40 h-12 px-4 rounded-full bg-brand text-white text-[15px] font-semibold shadow-[0_8px_24px_rgba(27,37,55,0.25)] hover:bg-brand-2 print:hidden">
        {open ? '닫기' : '물어보기'}
      </button>
      {open && (
        <section id="assistant-panel" aria-label="배치표 도우미" className="fixed bottom-20 right-5 z-40 w-[min(380px,calc(100vw-40px))] h-[min(560px,calc(100vh-120px))] bg-white border border-line rounded-2xl shadow-[0_16px_48px_rgba(27,37,55,0.18)] flex flex-col overflow-hidden print:hidden">
          <div className="px-4 py-3 border-b border-line-2">
            <div className="text-[15px] font-semibold">배치표 도우미</div>
            <div className="text-[12px] text-ink-3">배치표 기록을 읽어 답합니다. 표는 바꾸지 않습니다.</div>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3 text-[14px]">
            {turns.length === 0 && !askKey && (
              <div className="flex flex-col gap-2">
                <div className="text-ink-2">예를 들어 이렇게 물어보세요.</div>
                {EXAMPLES.map((e) => <button key={e} onClick={() => send(e)} className="text-left px-3 py-2 rounded-lg bg-chip hover:bg-line text-ink">{e}</button>)}
              </div>
            )}
            {askKey && (
              <div className="flex flex-col gap-2 p-3 rounded-lg bg-brand-soft">
                <div className="font-semibold">API 키가 필요합니다</div>
                <div className="text-[13px] text-ink-2">이 판은 서버가 없어서 본인 Claude API 키로 직접 묻습니다. 키는 이 브라우저에만 저장됩니다. console.anthropic.com 에서 발급.</div>
                <input value={key} onChange={(e) => setKey(e.target.value)} type="password" placeholder="sk-ant-…" aria-label="API 키" autoComplete="off" spellCheck={false} className="h-9 px-2.5 border border-line rounded-md bg-white text-[13px] focus:border-brand" />
                <div className="flex gap-2"><button onClick={saveKey} disabled={!key.trim()} className="h-9 px-3 rounded-md bg-brand text-white text-[13px] font-semibold disabled:opacity-40">저장</button><button onClick={() => setAskKey(false)} className="h-9 px-3 rounded-md text-[13px] text-ink-2">나중에</button></div>
              </div>
            )}
            {turns.map((t, i) => (
              <div key={i} className={t.role === 'user' ? 'self-end max-w-[85%] px-3 py-2 rounded-xl bg-brand text-white whitespace-pre-wrap' : `self-start max-w-[95%] whitespace-pre-wrap ${t.error ? 'text-vac' : ''}`}>
                {t.content}
                {t.trace && t.trace.length > 0 && (
                  <details className="mt-1.5 text-[12px] text-ink-3"><summary className="cursor-pointer">조회 {t.trace.length}회 보기</summary>
                    {t.trace.map((x, j) => <pre key={j} className="mt-1 p-2 rounded bg-ground overflow-x-auto text-[11px] leading-4 whitespace-pre-wrap break-all">{x.tool} {JSON.stringify(x.input)}\n{x.result.slice(0, 600)}{x.result.length > 600 ? '…' : ''}</pre>)}
                  </details>
                )}
              </div>
            ))}
            {busy && <div className="self-start text-ink-3">조회하는 중…</div>}
            <div ref={endRef} />
          </div>
          <form onSubmit={(e) => { e.preventDefault(); send(q); }} className="p-3 border-t border-line-2 flex gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="궁금한 것을 적어 주세요…" aria-label="질문" autoComplete="off" className="flex-1 h-10 px-3 border border-line rounded-md text-[14px] focus:border-brand min-w-0" />
            <button type="submit" disabled={busy || !q.trim()} className="h-10 px-4 rounded-md bg-brand text-white text-[14px] font-semibold disabled:opacity-40">보내기</button>
          </form>
        </section>
      )}
    </>
  );
}
