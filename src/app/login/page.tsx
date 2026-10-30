'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function Form(): React.ReactElement {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const next = useSearchParams().get('next') ?? '/today';
  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault(); setBusy(true);
    const res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pw }) });
    if (res.ok) { router.push(next); router.refresh(); } else { setErr('비밀번호가 맞지 않습니다. 다시 입력해 주세요.'); setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="w-full max-w-sm bg-white border border-line rounded-2xl p-8 flex flex-col gap-5">
      <div className="flex items-center gap-2.5">
        <span className="grid grid-cols-2 gap-0.5 w-5 h-5" aria-hidden><i className="bg-brand rounded-[1px]" /><i className="bg-brand/40 rounded-[1px]" /><i className="bg-brand/40 rounded-[1px]" /><i className="bg-brand rounded-[1px]" /></span>
        <span className="text-[22px] font-bold tracking-tight">라인보드</span>
      </div>
      <p className="text-sm text-ink-2 -mt-2">새한프라텍 인원 배치 · 결원 대체</p>
      <label htmlFor="password" className="flex flex-col gap-1.5 text-sm text-ink-2">비밀번호
        <input id="password" name="password" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus aria-describedby={err ? 'login-error' : undefined} className="h-11 px-3 border border-line rounded-md text-base text-ink focus:border-brand" />
      </label>
      <div id="login-error" role="alert" aria-live="polite" className={`text-sm text-vac -mt-2 ${err ? '' : 'hidden'}`}>{err}</div>
      <button type="submit" disabled={busy} className="h-11 rounded-md bg-brand text-white font-semibold hover:bg-brand-2 disabled:opacity-60">{busy ? '확인하는 중…' : '들어가기'}</button>
    </form>
  );
}
export default function Login(): React.ReactElement {
  return <main className="min-h-screen bg-ground flex items-center justify-center p-6"><Suspense><Form /></Suspense></main>;
}
