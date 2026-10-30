'use client';
import { useState } from 'react';

export function Respond({ token }: { token: string }): React.ReactElement {
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function go(action: 'accept' | 'decline'): Promise<void> {
    setBusy(true);
    const r = await fetch('/api/public/respond', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, action }) });
    const d = await r.json() as { message?: string; error?: string };
    setDone(d.message ?? d.error ?? '처리되었습니다'); setBusy(false);
  }
  if (done) return <div className="text-lg font-semibold">{done}</div>;
  return (
    <div className="flex flex-col gap-3 pt-2">
      <button onClick={() => go('accept')} disabled={busy} className="h-16 rounded-xl bg-ok text-white text-xl font-bold disabled:opacity-50">수락</button>
      <button onClick={() => go('decline')} disabled={busy} className="h-14 rounded-xl border border-line text-lg disabled:opacity-50">이번엔 어렵습니다</button>
      <p className="text-sm text-ink-3">20분 안에 답이 없으면 다른 분께 넘어갑니다.</p>
    </div>
  );
}
