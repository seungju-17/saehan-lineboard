'use client';
import { useCallback, useEffect, useState } from 'react';
import { fmtShort } from '@/lib/shift';

type Data = {
  person: { name: string; affiliation: string | null; grp: string; work_type: string };
  today: string;
  assignments: { date: string; shift: string; status: string; factory: string; post: string; product: string | null }[];
  messages: { id: number; kind: string; body: string; link: string | null; sent_at: string; read_at: string | null }[];
  error?: string;
};

export function MyWork({ token }: { token: string }): React.ReactElement {
  const [d, setD] = useState<Data | null>(null);
  const load = useCallback(async (): Promise<void> => { setD(await (await fetch(`/api/public/me?token=${token}`)).json()); }, [token]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- 조회 결과 반영
  useEffect(() => { load(); }, [load]);
  async function read(id: number): Promise<void> {
    await fetch('/api/public/me', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, messageId: id }) }); await load();
  }
  if (!d) return <p className="text-ink-3">불러오는 중</p>;
  if (d.error) return <p className="text-ink-2">{d.error}</p>;
  const unread = d.messages.filter((m) => !m.read_at && m.kind !== '요청');
  return (
    <div className="flex flex-col gap-6">
      <div><div className="text-sm text-ink-3">{[d.person.affiliation, d.person.work_type === '임시' ? '임시' : `${d.person.grp}조`].filter(Boolean).join(' · ')}</div><div className="text-2xl font-bold">{d.person.name}님의 근무</div></div>
      {unread.map((m) => (
        <div key={m.id} className="border-2 border-brand rounded-xl p-4 flex flex-col gap-3">
          <div className="text-lg leading-snug">{m.body}</div>
          <button onClick={() => read(m.id)} className="h-12 rounded-lg bg-brand text-white font-semibold hover:bg-brand-2">확인했습니다</button>
        </div>
      ))}
      <ul className="divide-y divide-line">
        {d.assignments.length === 0 && <li className="py-3 text-ink-3">이번 주 배치 없음</li>}
        {d.assignments.map((a, i) => (
          <li key={i} className={`py-3 flex items-center gap-3 ${a.date === d.today ? 'font-semibold' : ''}`}>
            <span className="w-24 shrink-0">{fmtShort(a.date)} {a.shift}</span>
            <span className="flex-1">{a.factory} {a.post}{a.product && <span className="block text-sm text-ink-3 font-normal">{a.product}</span>}</span>
            <span className={`text-xs px-2 py-0.5 rounded ${a.status === '확정' ? 'bg-ok-bg text-ok' : 'bg-ground text-ink-3'}`}>{a.status === '확정' ? '확정' : '예정'}</span>
          </li>
        ))}
      </ul>
      <ul className="text-sm text-ink-2 flex flex-col gap-2">
        {d.messages.filter((m) => m.read_at || m.kind === '요청').map((m) => (
          <li key={m.id}>{m.body} <span className="text-ink-3">· {m.sent_at.slice(5, 16)}</span>{m.kind === '요청' && m.link && <a href={m.link} className="ml-2 underline">응답</a>}</li>
        ))}
      </ul>
    </div>
  );
}
