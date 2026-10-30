import { useEffect, useMemo, useState } from 'react';
import { Board } from '../src/components/board';
import { Nav } from '../src/components/nav';
import { Requests } from '../src/components/requests';
import { People } from '../src/components/people';
import { Dashboard } from '../src/components/dashboard';
import { Assistant } from '../src/components/assistant';
import { PrintBoard } from '../src/components/print-board';
import { Respond } from '../src/app/(public)/r/[token]/respond';
import { MyWork } from '../src/app/(public)/me/[token]/my-work';
import { allRequests, ensureToken, factoryName, getBoard, people, requestByToken } from '../src/lib/repo';
import { fmtKo, SHIFT_HOURS, type Shift } from '../src/lib/shift';
import { setAsk } from '../src/lib/ask';
import { getDb } from './db-shim';
import { usePathname, navigate } from './next-shim';

export let printParams = new URLSearchParams();
export function setPrintParams(p: URLSearchParams): void { printParams = p; }

function Mark(): React.ReactElement {
  return <span className="grid grid-cols-2 gap-0.5 w-3.5 h-3.5" aria-hidden><i className="bg-brand rounded-[1px]" /><i className="bg-brand/40 rounded-[1px]" /><i className="bg-brand/40 rounded-[1px]" /><i className="bg-brand rounded-[1px]" /></span>;
}

function Public({ children, back }: { children: React.ReactNode; back?: boolean }): React.ReactElement {
  return (
    <main className="min-h-screen bg-ground">
      <div className="mx-auto max-w-md min-h-screen bg-white px-5 py-6 flex flex-col gap-6">
        <div className="flex items-center gap-2 text-ink-3"><Mark /><span className="text-sm font-semibold text-ink">라인보드</span><span className="text-xs">새한프라텍 · 근무자 휴대폰 화면</span></div>
        {children}
        {back !== false && <a href="/today" className="mt-auto text-sm text-ink-3 underline underline-offset-2">담당자 화면으로 돌아가기</a>}
      </div>
    </main>
  );
}

function RespondPage({ token }: { token: string }): React.ReactElement {
  const r = requestByToken(token);
  if (!r) return <p className="text-ink-2">요청을 찾을 수 없습니다.</p>;
  const meTok = ensureToken(r.person_id);
  return (
    <div className="flex flex-col gap-6">
      <p className="text-ink-2">{r.name}님, 대체 근무 부탁드려도 될까요?</p>
      <div>
        <div className="text-3xl font-bold leading-tight">{fmtKo(r.date)}</div>
        <div className="text-3xl font-bold leading-tight">{r.shift} <span className="text-ink-3 text-xl font-medium">{SHIFT_HOURS[r.shift]}</span></div>
      </div>
      <dl className="grid grid-cols-[4rem_1fr] gap-y-2 text-lg">
        <dt className="text-ink-3">공장</dt><dd className="font-medium">{factoryName(r.factory_id)}</dd>
        <dt className="text-ink-3">라인</dt><dd className="font-medium">{r.post_name}</dd>
        <dt className="text-ink-3">제품</dt><dd className="font-medium">{r.product ?? '—'}</dd>
      </dl>
      {r.status === '발송' ? <Respond token={token} /> : <div className="text-lg font-semibold">{r.status === '수락' ? '수락했습니다.' : r.status === '거절' ? '거절로 처리되었습니다.' : '마감된 요청입니다.'}</div>}
      <a href={`/me/${meTok}`} className="text-sm text-ink-2 underline underline-offset-2">{r.name}님의 근무 화면 보기</a>
    </div>
  );
}

function PrintView(): React.ReactElement {
  const date = printParams.get('date') ?? '', shift = (printParams.get('shift') ?? '주간') as Shift, factory = Number(printParams.get('factory') ?? 2);
  if (!date) return <p className="text-ink-2">표 화면에서 「인쇄」를 누르면 여기로 옵니다.</p>;
  const b = getBoard(date, shift, factory);
  return <PrintBoard b={b} factoryName={factoryName(factory)} action={<span className="text-xs text-ink-3">A4 한 장으로 인쇄되는 모양</span>} />;
}

function Confirm({ q, onDone }: { q: { message: string; resolve: (v: boolean) => void } | null; onDone: () => void }): React.ReactElement | null {
  if (!q) return null;
  const answer = (v: boolean): void => { q.resolve(v); onDone(); };
  return (
    <div className="fixed inset-0 z-50 bg-ink/40 flex items-center justify-center p-6 overscroll-contain" onClick={() => answer(false)} onKeyDown={(e) => { if (e.key === 'Escape') answer(false); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="confirm-msg" className="bg-white rounded-xl p-5 w-full max-w-sm shadow-[0_16px_48px_rgba(27,37,55,0.25)]" onClick={(e) => e.stopPropagation()}>
        <div id="confirm-msg" className="text-[17px] font-semibold leading-snug">{q.message}</div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={() => answer(false)} className="h-10 px-4 rounded-md border border-line text-[15px] hover:border-ink-3">취소</button>
          <button autoFocus onClick={() => answer(true)} className="h-10 px-5 rounded-md bg-brand text-white text-[15px] font-semibold hover:bg-brand-2">확인</button>
        </div>
      </div>
    </div>
  );
}

export function App(): React.ReactElement {
  const path = usePathname();
  const [q, setQ] = useState<{ message: string; resolve: (v: boolean) => void } | null>(null);
  useEffect(() => { setAsk((message) => new Promise<boolean>((resolve) => setQ({ message, resolve }))); }, []);
  const requests = useMemo(() => (path === '/requests' ? allRequests() : []), [path]);
  const ppl = useMemo(() => (path === '/people' ? people(getDb(), false) : []), [path]);
  let page: React.ReactElement;
  if (path.startsWith('/r/')) return <><Public><RespondPage token={path.slice(3)} /></Public><Confirm q={q} onDone={() => setQ(null)} /></>;
  if (path.startsWith('/me/')) return <Public><MyWork token={path.slice(4)} /></Public>;
  if (path === '/requests') page = <Requests key="req" initial={requests} />;
  else if (path === '/people') page = <People key="ppl" initial={ppl} />;
  else if (path === '/dashboard') page = <Dashboard />;
  else if (path === '/print') page = <PrintView />;
  else if (path === '/login') page = <div className="bg-white border border-line rounded-xl p-8 max-w-sm"><div className="text-lg font-semibold">이 판에는 로그인이 없습니다</div><p className="mt-1 text-sm text-ink-2">설치판은 비밀번호 하나로 들어갑니다.</p><button onClick={() => navigate('/today')} className="mt-4 h-10 px-4 rounded-md bg-brand text-white font-semibold">오늘 배치로</button></div>;
  else page = <Board />;
  return (
    <div className="min-h-screen bg-ground">
      <Nav />
      <div className="bg-brand-soft text-brand text-[13px]"><div className="mx-auto max-w-6xl px-4 sm:px-6 py-1.5 flex flex-wrap items-center gap-x-2"><span className="font-semibold">브라우저 안에서 그대로 실행 중</span><span className="text-brand/80">새로고침하면 처음 상태로 돌아갑니다.</span></div></div>
      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-6 sm:py-8 pb-24">{page}</main>
      <Assistant needsKey />
      <Confirm q={q} onDone={() => setQ(null)} />
    </div>
  );
}
