'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Stats, Kpi } from '@/lib/stats';
import { currentShiftSeoul, fmtKo, fmtShort, todaySeoul, type Shift } from '@/lib/shift';
import { groupColor } from '@/lib/colors';

/* 차트 색: dataviz 검증기를 통과한 범주 팔레트 5칸(고정 순서). 글자는 항상 글자색. */
const SERIES = ['#2b63d9', '#e8932e', '#2a9d6f', '#8b919c', '#1e3a66'];
const FACTORIES = [[1, '1공장'], [2, '2공장']] as const;

export function Dashboard(): React.ReactElement {
  const [factory, setFactory] = useState<number>(2);
  const [shift, setShift] = useState<Shift>(currentShiftSeoul());
  const [days, setDays] = useState<number>(30);
  const [s, setS] = useState<Stats | null>(null);
  const date = useMemo(() => todaySeoul(), []);
  const load = useCallback(async (): Promise<void> => {
    const r = await fetch(`/api/stats?factory=${factory}&shift=${shift}&days=${days}&date=${date}`); if (r.ok) setS(await r.json());
  }, [factory, shift, days, date]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- 조회 결과 반영
  useEffect(() => { load(); }, [load]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight leading-none">현황</h1>
          <div className="mt-1.5 text-sm text-ink-2">{fmtKo(date)} {shift} 기준 · 추이는 최근 {days}일</div>
        </div>
        <div className="flex flex-wrap items-center gap-2 ml-auto">
          <Seg value={shift} options={[['주간', '주간'], ['야간', '야간']]} onChange={(v) => setShift(v as Shift)} />
          <Seg value={String(factory)} options={FACTORIES.map(([id, n]) => [String(id), n])} onChange={(v) => setFactory(Number(v))} />
          <Seg value={String(days)} options={[['14', '14일'], ['30', '30일'], ['90', '90일']]} onChange={(v) => setDays(Number(v))} />
        </div>
      </div>

      {!s ? <div className="py-16 text-center text-ink-3">불러오는 중…</div> : (
        <>
          {/* 1줄: 지표 카드 */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {s.kpis.map((k) => <KpiTile key={k.key} k={k} baseline={s.baseline} />)}
          </div>

          {/* 2줄: 라인별 인원 + 근무자 구성 */}
          <div className="grid gap-3 lg:grid-cols-[3fr_2fr]">
            <Card title={`라인별 평균 근무 인원`} sub={`최근 ${s.days}일, 가동한 날 기준`}>
              {s.byLine.length === 0 ? <Empty>기간 안에 가동한 라인이 없습니다.</Empty> : <HBars rows={s.byLine.map((r) => ({ label: r.code, value: r.avg, note: `${r.boards}회 가동` }))} unit="명" />}
            </Card>
            <Card title="오늘 근무자 구성" sub={`${s.kpis[0].value}명`}>
              <Segmented parts={s.composition} />
            </Card>
          </div>

          {/* 3줄: 깔때기 + 표 + 추이 */}
          <div className="grid gap-3 lg:grid-cols-3">
            <Card title="대체 요청 흐름" sub={`최근 ${s.days}일`}>
              {s.funnel[0].count === 0 ? <Empty>기간 안에 보낸 요청이 없습니다.</Empty> : <Funnel steps={s.funnel} />}
            </Card>
            <Card title="대체 근무 많이 선 사람" sub={`최근 ${s.days}일`}>
              {s.topSubs.length === 0 ? <Empty>아직 대체 근무 기록이 없습니다.</Empty> : (
                <table className="w-full text-[14px]">
                  <thead><tr className="text-[13px] text-ink-3"><th className="text-left font-medium py-1">이름</th><th className="text-right font-medium py-1">대체</th><th className="text-right font-medium py-1">수락</th><th className="text-right font-medium py-1">거절</th></tr></thead>
                  <tbody>
                    {s.topSubs.map((r) => (
                      <tr key={r.name} className="border-t border-line-2">
                        <td className="py-1.5"><div className="font-medium">{r.name}</div><div className="text-[12px] text-ink-3">{r.who}</div></td>
                        <td className="py-1.5 text-right tabular-nums">{r.subs}</td>
                        <td className="py-1.5 text-right tabular-nums">{r.accepted}</td>
                        <td className="py-1.5 text-right tabular-nums text-ink-3">{r.declined || '–'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
            <Card title="일별 근무 인원" sub="최근 14일 · 주간과 야간">
              <Lines rows={s.daily} />
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function KpiTile({ k, baseline }: { k: Kpi; baseline: { date: string; label: string } | null }): React.ReactElement {
  const up = k.delta !== null && k.delta > 0, down = k.delta !== null && k.delta < 0;
  const good = k.upIsGood === null ? null : (up && k.upIsGood) || (down && !k.upIsGood);
  const cls = k.delta === null || k.delta === 0 ? 'text-ink-3' : good === null ? 'text-ink-2' : good ? 'text-ok' : 'text-vac';
  const base = baseline ? `${fmtShort(baseline.date).split(' ')[0]} 같은 조 대비` : '비교할 지난 근무 없음';
  return (
    <div className="bg-white border border-line rounded-xl px-4 py-3.5 min-w-0 border-t-4" style={{ borderTopColor: k.key === 'vacant' ? (Number(k.value) > 0 ? '#c8362b' : '#2a9d6f') : k.key === 'waiting' ? (Number(k.value) > 0 ? '#d97f1f' : '#e3e7ee') : k.key === 'rate' ? '#2a9d6f' : k.key === 'temps' ? '#7c5a1e' : '#1e3a66' }}>
      <div className="text-[13px] text-ink-2 truncate">{k.label}</div>
      <div className={`mt-1 text-[28px] font-semibold leading-none tabular-nums ${k.small ? 'text-ink-2' : ''}`} style={{ color: k.key === 'vacant' && Number(k.value) > 0 ? '#c8362b' : k.key === 'waiting' && Number(k.value) > 0 ? '#d97f1f' : undefined }}>{k.value}<span className="ml-0.5 text-[14px] font-normal text-ink-3">{k.unit}</span></div>
      {k.denom && <div className="mt-1 text-[12px] text-ink-2 tabular-nums">{k.denom}{k.small && <span className="ml-1.5 text-ink-3 bg-chip px-1 rounded">표본 적음</span>}</div>}
      <div className={`mt-1 text-[12px] ${cls} tabular-nums`}>
        {k.delta === null ? <span className="text-ink-3">{k.key === 'waiting' ? '지금 기다리는 중' : k.key === 'rate' ? (k.small ? '5자리 넘으면 의미 있음' : '요청한 자리 기준') : base}</span>
          : k.delta === 0 ? <span>같음 <span className="text-ink-3">· {base}</span></span>
          : <>{up ? '▲' : '▼'} {Math.abs(k.delta)}{k.pct ? '%p' : k.unit} <span className="text-ink-3">· {base}</span></>}
      </div>
    </div>
  );
}

function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }): React.ReactElement {
  return (
    <section className="bg-white border border-line rounded-xl p-4 min-w-0">
      <div className="flex items-baseline justify-between gap-3 mb-3"><h2 className="text-[15px] font-semibold">{title}</h2>{sub && <span className="text-[12px] text-ink-3 truncate">{sub}</span>}</div>
      {children}
    </section>
  );
}
function Empty({ children }: { children: React.ReactNode }): React.ReactElement { return <p className="py-8 text-center text-[14px] text-ink-3">{children}</p>; }

/** 가로 막대: 한 계열, 한 색, 값은 글자색으로 직접 표기 */
function HBars({ rows, unit }: { rows: { label: string; value: number; note?: string }[]; unit: string }): React.ReactElement {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[3.5rem_1fr_auto] items-center gap-2 text-[14px]" title={`${r.label} 평균 ${r.value}${unit}${r.note ? ` · ${r.note}` : ''}`}>
          <span className="font-medium truncate">{r.label}</span>
          <span className="h-[18px] rounded-r bg-line-2 overflow-hidden"><span className="block h-full rounded-r" style={{ width: `${(r.value / max) * 100}%`, background: SERIES[0] }} /></span>
          <span className="tabular-nums w-16 text-right">{r.value}<span className="text-ink-3 text-[12px]">{unit}</span></span>
        </li>
      ))}
    </ul>
  );
}

/** 세로로 두툼한 분할 막대: 부분-전체를 한눈에. 도넛 대신. */
/** 근무자 구성 색은 배치표의 조 색과 같다 (A 파랑, B 초록, C 주황, 주간고정 갈색, 임시 회색) */
function compColor(label: string): string { return label === '주간고정' ? groupColor(null, '주간고정').ink : label === '임시' ? groupColor(null, '임시').ink : groupColor(label.replace('조', '')).ink; }
function Segmented({ parts }: { parts: { label: string; count: number }[] }): React.ReactElement {
  const total = parts.reduce((s, p) => s + p.count, 0);
  if (total === 0) return <Empty>오늘 배치된 사람이 없습니다.</Empty>;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-9 w-full gap-[2px] rounded overflow-hidden">
        {parts.map((p) => p.count > 0 && <div key={p.label} title={`${p.label} ${p.count}명`} style={{ width: `${(p.count / total) * 100}%`, background: compColor(p.label) }} />)}
      </div>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[14px]">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-2"><i className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: compColor(p.label) }} /><span className="flex-1 truncate">{p.label}</span><span className="tabular-nums">{p.count}<span className="text-ink-3 text-[12px]"> ({total ? Math.round((p.count / total) * 100) : 0}%)</span></span></li>
        ))}
      </ul>
    </div>
  );
}

/** 깔때기: 한 색의 밝기 단계, 첫 단계 대비 비율 */
function Funnel({ steps }: { steps: { label: string; count: number }[] }): React.ReactElement {
  const first = steps[0].count || 1;
  const shades = ['#2b63d9', '#6a94e6', '#aec4f1'];
  return (
    <ul className="flex flex-col gap-2.5">
      {steps.map((st, i) => (
        <li key={st.label} className="text-[14px]">
          <div className="flex justify-between mb-1"><span>{st.label}</span><span className="tabular-nums">{st.count}건 <span className="text-ink-3 text-[12px]">{Math.round((st.count / first) * 100)}%</span></span></div>
          <div className="h-5 rounded-r bg-line-2 overflow-hidden"><div className="h-full rounded-r" style={{ width: `${Math.max((st.count / first) * 100, st.count ? 2 : 0)}%`, background: shades[i] }} title={`${st.label} ${st.count}건`} /></div>
        </li>
      ))}
    </ul>
  );
}

/** 꺾은선 두 계열(주간·야간). 한 축, 범례, 끝점 직접 표기. */
function Lines({ rows }: { rows: { date: string; day: number | null; night: number | null }[] }): React.ReactElement {
  const W = 560, H = 190, L = 28, R = 12, T = 12, B = 28;
  const vals = rows.flatMap((r) => [r.day, r.night]).filter((v): v is number => v !== null);
  if (vals.length === 0) return <Empty>기간 안에 표가 없습니다.</Empty>;
  const max = Math.max(4, ...vals);
  const step = max <= 8 ? 2 : max <= 20 ? 5 : 10;
  const top = Math.ceil(max / step) * step;
  const x = (i: number): number => L + (i / (rows.length - 1)) * (W - L - R);
  const y = (v: number): number => T + (1 - v / top) * (H - T - B);
  const path = (key: 'day' | 'night'): string => {
    let d = '', pen = false;
    rows.forEach((r, i) => { const v = r[key]; if (v === null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)} `; pen = true; });
    return d;
  };
  // 표가 없는 날은 점선으로 건너뛴다. 없는 건 0이 아니라 "모름"이다.
  const gaps = (key: 'day' | 'night'): string => {
    let d = '', lastI = -1;
    rows.forEach((r, i) => { const v = r[key]; if (v === null) return; if (lastI >= 0 && i - lastI > 1) d += `M${x(lastI).toFixed(1)},${y(rows[lastI][key]!).toFixed(1)} L${x(i).toFixed(1)},${y(v).toFixed(1)} `; lastI = i; });
    return d;
  };
  const missing = rows.filter((r) => r.day === null && r.night === null).map((r) => r.date);
  const last = (key: 'day' | 'night'): { i: number; v: number } | null => { for (let i = rows.length - 1; i >= 0; i--) { const v = rows[i][key]; if (v !== null) return { i, v }; } return null; };
  const ticks = [0, top / 2, top];
  const series: { key: 'day' | 'night'; name: string; color: string }[] = [{ key: 'day', name: '주간', color: SERIES[0] }, { key: 'night', name: '야간', color: SERIES[1] }];
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex gap-4 text-[13px]">{series.map((sr) => <li key={sr.key} className="flex items-center gap-1.5"><i className="w-3 h-[2px]" style={{ background: sr.color }} />{sr.name}</li>)}</ul>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="최근 14일 일별 근무 인원, 주간과 야간">
        {ticks.map((t) => <g key={t}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="#eef1f5" /><text x={L - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#667085">{t}</text></g>)}
        {rows.map((r, i) => (i % 3 === 0 || i === rows.length - 1) && <text key={r.date} x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="#667085">{fmtShort(r.date).split(' ')[0]}</text>)}
        {series.map((sr) => <path key={sr.key + 'gap'} d={gaps(sr.key)} fill="none" stroke={sr.color} strokeWidth="1.5" strokeDasharray="3 4" opacity="0.6" />)}
        {series.map((sr) => <path key={sr.key} d={path(sr.key)} fill="none" stroke={sr.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />)}
        {series.map((sr) => { const e = last(sr.key); return e && <g key={sr.key + 'end'}><circle cx={x(e.i)} cy={y(e.v)} r="4" fill={sr.color} stroke="#fff" strokeWidth="2" /><text x={x(e.i) - 8} y={y(e.v) - 8} textAnchor="end" fontSize="12" fontWeight="600" fill="#1c2230">{e.v}</text></g>; })}
      </svg>
      <div className="text-[12px] text-ink-3">{missing.length === 0 ? '14일 모두 표가 있습니다' : `표 없는 날 ${missing.length}일: ${missing.map((d) => fmtShort(d).split(' ')[0]).join(', ')} (점선 구간)`}</div>
      <ul className="sr-only">{rows.map((r) => <li key={r.date}>{fmtShort(r.date)} 주간 {r.day ?? '없음'} 야간 {r.night ?? '없음'}</li>)}</ul>
    </div>
  );
}

function Seg({ value, options, onChange }: { value: string; options: readonly (readonly [string, string])[]; onChange: (v: string) => void }): React.ReactElement {
  return (
    <div className="inline-flex h-9 p-0.5 rounded-md bg-line-2" role="group">
      {options.map(([v, label]) => (
        <button key={v} onClick={() => onChange(v)} className={`px-3 rounded text-sm whitespace-nowrap transition-colors ${value === v ? 'bg-white text-ink font-semibold' : 'text-ink-2 hover:text-ink'}`}>{label}</button>
      ))}
    </div>
  );
}
