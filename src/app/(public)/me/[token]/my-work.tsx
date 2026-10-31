'use client';
import { useCallback, useEffect, useState } from 'react';
import { addDays, fmtKo, fmtShort, SHIFT_HOURS } from '@/lib/shift';
import { groupColor } from '@/lib/colors';
import { LEAVE_KINDS, type LeaveKind } from '@/lib/rules';

type Data = {
  person: { id: number; name: string; affiliation: string | null; grp: string; work_type: string; phone: string | null };
  today: string; dayType: string;
  assignments: { date: string; shift: string; status: string; factory: string; post: string; product: string | null }[];
  messages: { id: number; kind: string; body: string; link: string | null; channel: string; sent_at: string; read_at: string | null }[];
  openRequests: { token: string; expires_at: string | null; date: string; shift: string; factory: string; post: string; product: string | null }[];
  week: { from: string; to: string; shifts: number; hours: number; max: number };
  attendance: { date: string; shift: string; kind: string; note: string | null }[];
  leaves: { id: number; date: string; shift: string; kind: string; note: string | null; status: string; reply: string | null }[];
  workDays: { date: string; shift: string }[];
  error?: string;
};
type Tab = 'work' | 'requests' | 'attendance' | 'inbox';
const W = ['일', '월', '화', '수', '목', '금', '토'];
/** 근태 종류별 색: 결근 빨강, 지각·조퇴·반차 주황, 연차 파랑, 병가 초록, 교육 회색 */
const ATT: Record<string, { ink: string; bg: string }> = {
  결근: { ink: '#c8362b', bg: '#fdecec' }, 지각: { ink: '#d97f1f', bg: '#fdf0e0' }, 조퇴: { ink: '#d97f1f', bg: '#fdf0e0' }, 반차: { ink: '#d97f1f', bg: '#fdf0e0' },
  연차: { ink: '#2b63d9', bg: '#e3ebfa' }, 병가: { ink: '#2a9d6f', bg: '#e1f4ec' }, 교육: { ink: '#4f5b73', bg: '#e8ecf3' },
};
const Chip = ({ kind }: { kind: string }): React.ReactElement => { const c = ATT[kind] ?? ATT['교육']; return <span className="inline-flex items-center h-6 px-2 rounded text-[12px] font-semibold" style={{ color: c.ink, background: c.bg }}>{kind}</span>; };

/** 근무자 화면. 개인 링크(token)로 열거나, 근무자 로그인 뒤 /me 로 연다. 폰 한 손 조작 기준. */
export function MyWork({ token }: { token?: string }): React.ReactElement {
  const [d, setD] = useState<Data | null>(null);
  const [tab, setTab] = useState<Tab>('work');
  const [note, setNote] = useState<string | null>(null);
  const [month, setMonth] = useState<string | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [lv, setLv] = useState<{ date: string; shift: '주간' | '야간'; kind: LeaveKind; note: string }>({ date: '', shift: '주간', kind: '연차', note: '' });
  const q = token ? `?token=${token}` : '';
  const load = useCallback(async (): Promise<void> => { setD(await (await fetch(`/api/public/me${q}`)).json()); }, [q]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- 조회 결과 반영
  useEffect(() => { load(); }, [load]);
  async function post(body: Record<string, unknown>): Promise<{ ok: boolean; message?: string; error?: string }> {
    const r = await fetch('/api/public/me', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, ...body }) });
    const j = await r.json() as { message?: string; error?: string }; return { ok: r.ok, ...j };
  }
  async function read(id: number): Promise<void> { await post({ messageId: id }); await load(); }
  async function respond(reqToken: string, action: 'accept' | 'decline'): Promise<void> {
    const r = await fetch('/api/public/respond', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: reqToken, action }) });
    const j = await r.json() as { message?: string; error?: string };
    setNote(j.message ?? j.error ?? '처리했습니다'); await load();
  }
  async function submitLeave(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const r = await post({ action: 'leave', date: lv.date, shift: lv.shift, kind: lv.kind, note: lv.note || null });
    setNote(r.message ?? r.error ?? '처리했습니다');
    if (r.ok) { setLeaveOpen(false); setLv({ date: '', shift: '주간', kind: '연차', note: '' }); await load(); }
  }
  if (!d) return <p className="text-ink-3">불러오는 중…</p>;
  if (d.error) return <div className="flex flex-col gap-3"><p className="text-ink-2">{d.error}</p><a href="/login?who=worker" className="h-12 inline-flex items-center justify-center rounded-lg bg-brand text-white font-semibold">근무자 로그인</a></div>;
  const gc = groupColor(d.person.grp, d.person.work_type);
  const unreadCount = d.messages.filter((m) => !m.read_at && m.kind !== '요청').length;
  const todayWork = d.assignments.filter((a) => a.date === d.today);
  const pendingLeaves = d.leaves.filter((l) => l.status === '신청').length;
  const tabs: { k: Tab; label: string; badge?: number }[] = [
    { k: 'work', label: '내 근무' }, { k: 'requests', label: '요청', badge: d.openRequests.length }, { k: 'attendance', label: '근태', badge: pendingLeaves }, { k: 'inbox', label: '알림', badge: unreadCount },
  ];
  // 근태 달력
  const mon = month ?? d.today.slice(0, 7);
  const [y, m] = mon.split('-').map(Number);
  const first = `${mon}-01`; const dow = new Date(first + 'T00:00:00Z').getUTCDay(); const start = addDays(first, -dow);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const attBy = new Map(d.attendance.map((a) => [a.date, a]));
  const workBy = new Set(d.workDays.map((w) => w.date));
  const leaveBy = new Map(d.leaves.filter((l) => l.status !== '거절').map((l) => [l.date, l]));
  const shiftMonth = (n: number): void => { const dt = new Date(Date.UTC(y, m - 1 + n, 1)); setMonth(dt.toISOString().slice(0, 7)); };
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
            <div className="mt-1.5 h-2 rounded bg-chip overflow-hidden"><div className="h-full rounded" style={{ width: `${Math.min(100, (d.week.hours / d.week.max) * 100)}%`, background: d.week.hours >= d.week.max ? '#c8362b' : '#2b63d9' }} /></div>
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
        <div className="flex flex-col gap-4">
          <button onClick={() => setLeaveOpen((v) => !v)} className="h-12 rounded-xl bg-brand text-white font-semibold">{leaveOpen ? '닫기' : '+ 휴가 신청 (연차 · 반차 · 병가)'}</button>
          {leaveOpen && (
            <form onSubmit={submitLeave} className="rounded-xl border border-line p-4 flex flex-col gap-3 bg-white">
              <label className="flex flex-col gap-1 text-sm text-ink-2">종류
                <div className="flex gap-2">{LEAVE_KINDS.map((k) => <button type="button" key={k} onClick={() => setLv({ ...lv, kind: k })} className={`h-10 flex-1 rounded-md border text-[15px] font-semibold ${lv.kind === k ? 'border-brand bg-brand-soft text-brand' : 'border-line text-ink-2'}`}>{k}</button>)}</div>
              </label>
              <label htmlFor="lv-date" className="flex flex-col gap-1 text-sm text-ink-2">날짜<input id="lv-date" type="date" required value={lv.date} min={d.today} onChange={(e) => setLv({ ...lv, date: e.target.value })} className="h-11 px-3 border border-line rounded-md text-base text-ink" /></label>
              <label className="flex flex-col gap-1 text-sm text-ink-2">근무
                <div className="flex gap-2">{(['주간', '야간'] as const).map((s) => <button type="button" key={s} onClick={() => setLv({ ...lv, shift: s })} className={`h-10 flex-1 rounded-md border text-[15px] font-semibold ${lv.shift === s ? 'border-brand bg-brand-soft text-brand' : 'border-line text-ink-2'}`}>{s}</button>)}</div>
              </label>
              <label htmlFor="lv-note" className="flex flex-col gap-1 text-sm text-ink-2">사유 (선택)<input id="lv-note" value={lv.note} onChange={(e) => setLv({ ...lv, note: e.target.value })} placeholder="예: 병원 진료" className="h-11 px-3 border border-line rounded-md text-base text-ink" /></label>
              <button type="submit" disabled={!lv.date} className="h-12 rounded-xl bg-brand text-white font-semibold disabled:opacity-40">신청 보내기</button>
              <p className="text-xs text-ink-3">담당자가 승인하면 그날 표에 반영되고 알림으로 알려 드립니다.</p>
            </form>
          )}
          {d.leaves.length > 0 && (
            <ul className="divide-y divide-line rounded-xl border border-line bg-white">
              {d.leaves.map((l) => (
                <li key={l.id} className="px-3 py-2.5 flex items-center gap-2 text-[15px]"><span className="w-24 shrink-0">{fmtShort(l.date)} {l.shift}</span><Chip kind={l.kind} /><span className={`ml-auto text-sm font-semibold ${l.status === '승인' ? 'text-ok' : l.status === '거절' ? 'text-vac' : 'text-wait'}`}>{l.status}</span>{l.reply && <span className="basis-full text-xs text-ink-3">답: {l.reply}</span>}</li>
              ))}
            </ul>
          )}
          <section className="rounded-xl border border-line bg-white p-3">
            <div className="flex items-center justify-between mb-2">
              <button onClick={() => shiftMonth(-1)} aria-label="지난달" className="h-8 w-8 rounded-md hover:bg-ground text-ink-2">‹</button>
              <div className="font-bold">{y}년 {m}월 근태</div>
              <button onClick={() => shiftMonth(1)} aria-label="다음달" className="h-8 w-8 rounded-md hover:bg-ground text-ink-2">›</button>
            </div>
            <div className="grid grid-cols-7 text-center text-[11px] text-ink-3 mb-1">{W.map((w, i) => <div key={w} className={i === 0 ? 'text-vac' : i === 6 ? 'text-brand' : ''}>{w}</div>)}</div>
            <div className="grid grid-cols-7 gap-1">
              {cells.map((c) => {
                const inM = c.startsWith(mon); const a = attBy.get(c); const l = leaveBy.get(c); const worked = workBy.has(c);
                const col = a ? ATT[a.kind] ?? ATT['교육'] : l ? (l.status === '승인' ? ATT[l.kind] : { ink: '#d97f1f', bg: '#fdf0e0' }) : null;
                return (
                  <div key={c} title={a ? `${a.kind}${a.note ? ' · ' + a.note : ''}` : l ? `${l.kind} ${l.status}` : worked ? '근무' : undefined}
                    className={`h-11 rounded-md text-[12px] flex flex-col items-center justify-center ${inM ? '' : 'opacity-25'} ${c === d.today ? 'ring-1 ring-brand' : ''}`} style={col ? { background: col.bg, color: col.ink, fontWeight: 700 } : worked ? { background: '#eef2f8' } : undefined}>
                    <span>{+c.slice(8, 10)}</span>{col && <span className="text-[9px] leading-3">{a ? a.kind : l!.status === '승인' ? l!.kind : '신청'}</span>}
                  </div>
                );
              })}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-3">
              <span className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm" style={{ background: '#eef2f8', border: '1px solid #e5eaf3' }} />근무</span>
              {Object.entries(ATT).filter(([k]) => ['결근', '지각', '연차', '병가'].includes(k)).map(([k, c]) => <span key={k} className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm" style={{ background: c.ink }} />{k}</span>)}
              <span>주황 「신청」은 승인 대기</span>
            </div>
          </section>
          {d.attendance.length === 0 ? <p className="text-ink-3 text-sm text-center">최근 두 달 근태 기록이 없습니다.</p> : (
            <ul className="divide-y divide-line">
              {d.attendance.map((a, i) => <li key={i} className="py-2.5 flex items-center gap-3"><span className="w-24 shrink-0 text-[15px]">{fmtShort(a.date)} {a.shift}</span><Chip kind={a.kind} />{a.note && <span className="text-sm text-ink-3">{a.note}</span>}</li>)}
            </ul>
          )}
          <p className="text-xs text-ink-3">기록이 다르면 담당자에게 말씀해 주세요. 월 근태표는 이 기록으로 만듭니다.</p>
        </div>
      )}

      {tab === 'inbox' && (
        <div className="flex flex-col gap-3">
          {d.messages.length === 0 && <p className="text-ink-3 py-6 text-center">받은 알림이 없습니다.</p>}
          {d.messages.map((msg) => {
            const unread = !msg.read_at && msg.kind !== '요청';
            return (
              <div key={msg.id} className={`rounded-xl p-4 flex flex-col gap-2 ${unread ? 'border-2 border-brand' : 'border border-line'}`}>
                <div className={`leading-snug ${unread ? 'text-lg' : 'text-[15px]'}`}>{msg.body}</div>
                <div className="text-xs text-ink-3 flex items-center gap-2"><span>{msg.sent_at.slice(5, 16)}</span><span className="bg-chip px-1.5 rounded">{msg.channel}</span>{msg.read_at && <span>확인함</span>}</div>
                {unread && <button onClick={() => read(msg.id)} className="h-11 rounded-lg bg-brand text-white font-semibold">확인했습니다</button>}
                {msg.kind === '요청' && msg.link && d.openRequests.some((r) => msg.link!.endsWith(r.token)) && <button onClick={() => setTab('requests')} className="h-11 rounded-lg border border-wait text-wait font-semibold">요청 보기</button>}
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
