'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { refreshSession } from '@/lib/use-session';

type Who = 'admin' | 'worker';

function Form(): React.ReactElement {
  const params = useSearchParams();
  const [who, setWho] = useState<Who>(params.get('who') === 'worker' ? 'worker' : 'admin');
  const [username, setUsername] = useState('');
  const [pw, setPw] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState<{ name: string; demoCode?: string } | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const next = params.get('next') ?? '/today';

  async function post(body: Record<string, string>): Promise<{ ok: boolean; data: Record<string, string> }> {
    const res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { ok: res.ok, data: await res.json() as Record<string, string> };
  }
  async function submitAdmin(e: React.FormEvent): Promise<void> {
    e.preventDefault(); setBusy(true); setErr('');
    const r = await post({ username, password: pw });
    if (r.ok) { await refreshSession(); router.push(next); router.refresh(); } else { setErr(r.data.error ?? '들어가지 못했습니다'); setBusy(false); }
  }
  async function submitWorker(e: React.FormEvent): Promise<void> {
    e.preventDefault(); setBusy(true); setErr('');
    if (!sent) {
      const r = await post({ phone });
      if (r.ok) setSent({ name: r.data.name, demoCode: r.data.demoCode }); else setErr(r.data.error ?? '찾지 못했습니다');
      setBusy(false); return;
    }
    const r = await post({ phone, code });
    if (r.ok) { await refreshSession(); router.push('/me'); router.refresh(); } else { setErr(r.data.error ?? '인증번호가 맞지 않습니다'); setBusy(false); }
  }
  const tab = (w: Who, label: string): React.ReactElement => (
    <button type="button" onClick={() => { setWho(w); setErr(''); setSent(null); }} className={`flex-1 h-11 text-[15px] font-semibold rounded-md ${who === w ? 'bg-brand text-white' : 'text-ink-2 hover:bg-ground'}`} aria-pressed={who === w}>{label}</button>
  );
  return (
    <div className="w-full max-w-sm bg-white border border-line rounded-2xl p-8 flex flex-col gap-5">
      <div className="flex items-center gap-2.5">
        <span className="grid grid-cols-2 gap-0.5 w-5 h-5" aria-hidden><i className="bg-brand rounded-[1px]" /><i className="bg-brand/40 rounded-[1px]" /><i className="bg-brand/40 rounded-[1px]" /><i className="bg-brand rounded-[1px]" /></span>
        <span className="text-[22px] font-bold tracking-tight">라인보드</span>
      </div>
      <p className="text-sm text-ink-2 -mt-2">새한프라텍 인원 배치 · 결원 대체</p>
      <div className="flex gap-1 p-1 bg-ground rounded-lg">{tab('admin', '관리자')}{tab('worker', '근무자')}</div>
      {who === 'admin' ? (
        <form onSubmit={submitAdmin} className="flex flex-col gap-4">
          <label htmlFor="username" className="flex flex-col gap-1.5 text-sm text-ink-2">아이디
            <input id="username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus className="h-11 px-3 border border-line rounded-md text-base text-ink focus:border-brand" />
          </label>
          <label htmlFor="password" className="flex flex-col gap-1.5 text-sm text-ink-2">비밀번호
            <input id="password" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} className="h-11 px-3 border border-line rounded-md text-base text-ink focus:border-brand" />
          </label>
          <div role="alert" aria-live="polite" className={`text-sm text-vac ${err ? '' : 'hidden'}`}>{err}</div>
          <button type="submit" disabled={busy} className="h-11 rounded-md bg-brand text-white font-semibold hover:bg-brand-2 disabled:opacity-60">{busy ? '확인하는 중…' : '들어가기'}</button>
          <p className="text-xs text-ink-3">팀장 teamlead · 담당자 staff · 반장 lead1, lead2. 비밀번호는 설치할 때 정한 값입니다.</p>
        </form>
      ) : (
        <form onSubmit={submitWorker} className="flex flex-col gap-4">
          <label htmlFor="phone" className="flex flex-col gap-1.5 text-sm text-ink-2">전화번호
            <input id="phone" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={!!sent} autoFocus placeholder="010-0000-0000" className="h-11 px-3 border border-line rounded-md text-base text-ink focus:border-brand disabled:bg-ground" />
          </label>
          {sent && (
            <label htmlFor="code" className="flex flex-col gap-1.5 text-sm text-ink-2">{sent.name}님, 문자로 받은 인증번호
              <input id="code" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} autoFocus className="h-11 px-3 border border-line rounded-md text-base text-ink focus:border-brand tracking-widest" />
              {sent.demoCode && <span className="text-xs text-wait">체험판이라 문자 대신 여기 보여 줍니다: {sent.demoCode}</span>}
            </label>
          )}
          <div role="alert" aria-live="polite" className={`text-sm text-vac ${err ? '' : 'hidden'}`}>{err}</div>
          <button type="submit" disabled={busy} className="h-11 rounded-md bg-brand text-white font-semibold hover:bg-brand-2 disabled:opacity-60">{busy ? '확인하는 중…' : sent ? '들어가기' : '인증번호 받기'}</button>
          {sent && <button type="button" onClick={() => { setSent(null); setCode(''); }} className="text-sm text-ink-3 underline underline-offset-2">번호 다시 입력</button>}
          <p className="text-xs text-ink-3">직원 명단에 등록된 전화번호로 들어갑니다. 한 번 들어오면 폰에 유지됩니다.</p>
        </form>
      )}
    </div>
  );
}
export default function Login(): React.ReactElement {
  return <main className="min-h-screen bg-ground flex items-center justify-center p-6"><Suspense><Form /></Suspense></main>;
}
