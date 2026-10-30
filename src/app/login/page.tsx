'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function Form(): React.ReactElement {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const router = useRouter();
  const next = useSearchParams().get('next') ?? '/today';
  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pw }) });
    if (res.ok) { router.push(next); router.refresh(); } else setErr('비밀번호가 맞지 않습니다');
  }
  return (
    <form onSubmit={submit} className="w-full max-w-xs flex flex-col gap-4">
      <div className="text-xl font-bold">라인보드</div>
      <label className="flex flex-col gap-1 text-sm text-ink-2">비밀번호
        <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus className="h-11 px-3 border border-line rounded-md text-base text-ink" />
      </label>
      {err && <div className="text-sm text-vac">{err}</div>}
      <button type="submit" className="h-11 rounded-md bg-ink text-white font-semibold">들어가기</button>
    </form>
  );
}
export default function Login(): React.ReactElement {
  return <main className="min-h-screen flex items-center justify-center p-6"><Suspense><Form /></Suspense></main>;
}
