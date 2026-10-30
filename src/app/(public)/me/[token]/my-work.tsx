'use client';
import { useCallback, useEffect, useState } from 'react';
import { fmtKo, fmtShort, SHIFT_HOURS } from '@/lib/shift';
import { groupColor } from '@/lib/colors';

type Data = {
  person: { id: number; name: string; affiliation: string | null; grp: string; work_type: string; phone: string | null };
  today: string; dayType: string;
  assignments: { date: string; shift: string; status: string; factory: string; post: string; product: string | null }[];
  messages: { id: number; kind: string; body: string; link: string | null; channel: string; sent_at: string; read_at: string | null }[];
  openRequests: { token: string; expires_at: string | null; date: string; shift: string; factory: string; post: string; product: string | null }[];
  week: { from: string; to: string; shifts: number; hours: number; max: number };
  attendance: { date: string; shift: string; kind: string; note: string | null }[];
  error?: string;
};
type Tab = 'work' | 'requests' | 'attendance' | 'inbox';

/** 근무자 화면. 개인 링크(token)로 열거나, 근무자 로그인 뒤 /me 로 연다. 폰 한 손 조작 기준. */
export function MyWork({ token }: { token?: string }): React.ReactElement {
  const [d, setD] = useState<Data | null>(null);
  const [tab, setTab] = useState<Tab>('work');
  const [note, setNote] = useState<string | null>(null);
  const q = token ? `?token=${token}` : '';
  const load = useCallback(async (): Promise<void> => { setD(await (await fetch(`/api/public/me${q}`)).json()); }, [q]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- 조회 결과 반영
  useEffect(() => { load(); }, [load]);
  async function read(id: number): Promise<void> {
    await fetch('/api/public/me', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, messageId: id }) }); await load();
  }
  async function respond(reqToken: string, action: 'accept' | 'decline'): Promise<void> {
    const r = await fetch('/api/public/respond', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: reqToken, action }) });
    const j = await r.json() as { message?: string; error?: string };
    setNote(j.message ?? j.error ?? '처리했습니다'); await load();
  }
  if (!d) return <p className="text-ink-3">불러오는 중…</p>;
  if (d.error) return <div className="flex flex-col gap-3"><p className="text-ink-2">{d.error}</p><a href="/login?who=worker" className="h-12 inline-flex items-center justify-center rounded-lg bg-brand text-white font-semibold">근무자 로그인</a></div>;
  const gc = groupColor(d.person.grp, d.person.work_type);
  const unreadCount = d.messages.filter((m) => !m.read_at && m.kind !== '요청').length;
  const todayWork = d.assignments.filter((a) => a.date === d.today);
  const tabs: { k: Tab; label: string; badge?: number }[] = [
    { k: 'work', label: '내 근무' }, { k: 'requests', label: '요청', badge: d.openRequests.length }, { k: 'attendance', label: '근태' }, { k: 'inbox', label: '알림', badge: unreadCount },
  ];
  return (
    <div className="flex flex-col gap-5 pb-20">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm text-ink-3 flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm" style={{ background: gc.ink }} />{[d.person.affiliation, gc.label || d.person.grp].filter(Boolean).join(' · ')}</div>
          <div className="text-2xl font-bold">{d.person.name}님</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-ink-3">{fmtShort(d.today)}</div>
          <div className={`inline-flex items-center h-7 px-2 rounded font-semibold text-sm ${d.dayType === '휴무' ? 'bg-chip text-ink-2' : 'bg-brand text-white'}`}>{d.dayType === '교대' ? '근무' : d.dayType}</div>
        </div>
      </div>
      {note && <div role="status" className="bg-ok-bg text-ok rounded-lg px-4 py-3 font-semibold">{note}</div>}

      {tab === 'work' && (
        <div className="flex flex-col gap-4">
          <section className="rounded-xl border-2 border-brand p-4">
            <div className="text-sm text-ink-3">오늘</div>
            {todayWork.length === 0 ? <div className="text-lg font-semibold mt-0.5">{d.dayType === '휴무' ? '휴무입니다' : '오늘 배치가 아직 없습니다'}</div>
              : todayWork.map((a, i) => <div key={i} className="mt-0.5"><div className="text-2xl font-bold">{a.factory} {a.post}</div><div className="text-ink-2">{a.shift} {SHIFT_HOURS[a.shift as '주간' | '야간']}{a.product ? ` · ${a.product}` : ''}<span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${a.status === '확정' ? 'bg-ok-bg text-ok' : 'bg-chip text-ink-3'}`}>{a.status === '확정' ? '확정' : '예정'}</span></div></div>)}
          </section>
          <section>
            <div className="text-sm font-semibold text-ink-2 mb-1">이번 주</div>
            <div className="text-[15px]">{d.week.shifts}교대 · <b>{d.week.hours}시간</b> <span className="text-ink-3">/ 최대 {d.week.max}시간 ({fmtShort(d.week.from)}~{fmtShort(d.week.to)})</span></div>
            <div className="mt-1.5 h-2 rounded bg-chip overflow-hidden"><div className="h-full rounded" style={{ width: `${Math.min(100, (d.week.hours / d.week.max) * 100)}%`, background: d.week.hours >= d.week.max ? '#c8362b' : '#1b2537' }} /></div>
          </section>
          <ul className="divide-y divide-line">
            {d.assignments.length === 0 && <li className="py-3 text-ink-3">이번 주 배치 없음</li>}
            {d.assignments.map((a, i) => (
              <li key={i} className={`py-3 flex items-center gap-3 ${a.date === d.today ? 'font-semibold' : ''}`}>
                <span className="w-24 shrink-0">{fmtShort(a.date)} {a.shift}</span>
                <span className="flex-1">{a.factory} {a.post}{a.product && <span className="block text-sm text-ink-3 font-normal">{a.product}</span>}</span>
                <span className={`text-xs px-2 py-0.5 rounded ${a.status === '확정' ? 'bg-ok-bg text-ok' : 'bg-chip text-ink-3'}`}>{a.status === '확정' ? '확정' : '예정'}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === 'requests' && (
        <div className="flex flex-col gap-4">
          {d.openRequests.length === 0 && <p className="text-ink-3 py-6 text-center">지금 기다리는 대체 요청이 없습니다.</p>}
          {d.openRequests.map((r) => (
            <section key={r.token} className="rounded-xl border-2 border-wait p-4 flex flex-col gap-3">
              <div className="text-ink-2">대체 근무 부탁드려도 될까요?</div>
              <div><div className="text-2xl font-bold">{fmtKo(r.date)}</div><div className="text-xl font-bold">{r.shift} <span className="text-ink-3 text-base font-medium">{SHIFT_HOURS[r.shift as '주간' | '야간']}</span></div></div>
              <div className="text-[15px]">{r.factory} · {r.post}{r.product ? ` · ${r.product}` : ''}</div>
              <button onClick={() => respond(r.token, 'accept')} className="h-14 rounded-xl bg-ok text-white text-lg font-bold">수락</button>
              <button onClick={() => respond(r.token, 'decline')} className="h-12 rounded-xl border border-line text-ink-2">이번엔 어렵습니다</button>
              {r.expires_at && <div className="text-xs text-ink-3">답이 없으면 {r.expires_at.slice(11, 16)}에 다른 분께 넘어갑니다</div>}
            </section>
          ))}
        </div>
      )}

      {tab === 'attendance' && (
        <div className="flex flex-col gap-3">
          <div className="text-sm text-ink-3">최근 한 달</div>
          {d.attendance.length === 0 && <p className="text-ink-3 py-6 text-center">근태 기록이 없습니다.</p>}
          <ul className="divide-y divide-line">
            {d.attendance.map((a, i) => <li key={i} className="py-3 flex items-center gap-3"><span className="w-24 shrink-0">{fmtShort(a.date)} {a.shift}</span><b style={{ color: '#c8362b' }}>{a.kind}</b>{a.note && <span className="text-sm text-ink-3">{a.note}</span>}</li>)}
          </ul>
          <p className="text-xs text-ink-3">기록이 다르면 담당자에게 말씀해 주세요. 월 근태표는 이 기록으로 만듭니다.</p>
        </div>
      )}

      {tab === 'inbox' && (
        <div className="flex flex-col gap-3">
          {d.messages.length === 0 && <p className="text-ink-3 py-6 text-center">받은 알림이 없습니다.</p>}
          {d.messages.map((m) => {
            const unread = !m.read_at && m.kind !== '요청';
            return (
              <div key={m.id} className={`rounded-xl p-4 flex flex-col gap-2 ${unread ? 'border-2 border-brand' : 'border border-line'}`}>
                <div className={`leading-snug ${unread ? 'text-lg' : 'text-[15px]'}`}>{m.body}</div>
                <div className="text-xs text-ink-3 flex items-center gap-2"><span>{m.sent_at.slice(5, 16)}</span><span className="bg-chip px-1.5 rounded">{m.channel}</span>{m.read_at && <span>확인함</span>}</div>
                {unread && <button onClick={() => read(m.id)} className="h-11 rounded-lg bg-brand text-white font-semibold">확인했습니다</button>}
                {m.kind === '요청' && m.link && d.openRequests.some((r) => m.link!.endsWith(r.token)) && <button onClick={() => setTab('requests')} className="h-11 rounded-lg border border-wait text-wait font-semibold">요청 보기</button>}
              </div>
            );
          })}
        </div>
      )}

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-line" aria-label="근무자 메뉴">
        <div className="mx-auto max-w-md grid grid-cols-4">
          {tabs.map((t) => (
            <button key={t.k} onClick={() => { setTab(t.k); setNote(null); }} aria-current={tab === t.k ? 'page' : undefined} className={`h-14 text-[13px] font-semibold flex flex-col items-center justify-center gap-0.5 ${tab === t.k ? 'text-brand' : 'text-ink-3'}`}>
              <span className="relative">{t.label}{t.badge ? <span className="absolute -top-1.5 -right-4 min-w-4 h-4 px-1 rounded-full bg-vac text-white text-[10px] leading-4 text-center">{t.badge}</span> : null}</span>
              <i className={`w-6 h-0.5 rounded ${tab === t.k ? 'bg-brand' : 'bg-transparent'}`} />
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
