'use client';
import { Fragment, useEffect, useState } from 'react';
import type { PersonRow, SkillRow } from '@/lib/repo';
import type { SkillLevel } from '@/lib/engine';
import { zoneColor } from '@/lib/colors';

const FAC: Record<number, string> = { 1: '1공장', 2: '2공장' };
const UNITS = ['주전반', '교대반', '협력사 A조', '협력사 B조', '협력사 C조', 'PE 협력사', '지원', '임시'];
const sel = 'h-8 -ml-1 px-1 rounded bg-transparent hover:bg-ground text-[15px]';

type Row = PersonRow & { week_hours?: number };
export function People({ initial, maxHours = 52, shiftHours = 12 }: { initial: Row[]; maxHours?: number; shiftHours?: number }): React.ReactElement {
  const [rows, setRows] = useState<Row[]>(initial);
  const near = rows.filter((p) => p.active && (p.week_hours ?? 0) + shiftHours > maxHours);
  const [q, setQ] = useState('');
  const [withTemp, setWithTemp] = useState(false);
  const [grpF, setGrpF] = useState<string>('전체'); // 조별로 보기: A조끼리, B조끼리
  const [facF, setFacF] = useState<number>(0); // 공장별로 보기: 0은 전체
  const [skillOf, setSkillOf] = useState<number | null>(null); // 라인 숙련도 패널을 연 사람
  const inGroup = (p: Row): boolean => grpF === '전체' ? true : grpF === '주간고정' ? p.work_type === '주간고정' : grpF === '임시' ? p.work_type === '임시' : p.work_type === '교대' && p.grp === grpF;
  const inFactory = (p: Row): boolean => facF === 0 || p.home_factory_id === facF;
  const list = rows.filter((p) => p.active && (!q || p.name.includes(q)) && inFactory(p) && inGroup(p) && (withTemp || grpF === '임시' || p.work_type !== '임시'));
  const regular = rows.filter((p) => p.active && p.work_type !== '임시').length;
  const temps = rows.filter((p) => p.active && p.work_type === '임시').length;

  async function patch(id: number, u: Partial<PersonRow>): Promise<void> {
    await fetch('/api/people', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...u }) });
    setRows((r) => r.map((p) => p.id === id ? { ...p, ...u } : p));
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight leading-none">직원</h1>
          <div className="mt-1.5 text-sm text-ink-2">정직원 <b className="text-ink">{regular}</b>명 · 임시 <b className="text-ink">{temps}</b>명{near.length > 0 && <span className="ml-2 inline-flex items-center h-6 px-2 rounded bg-wait-bg text-wait font-semibold">이번 주 {maxHours}시간 임박 {near.length}명</span>}</div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <div role="group" aria-label="공장별 보기" className="inline-flex h-9 p-0.5 rounded-md bg-ground border border-line">
            {([[0, '전체'], [1, '1공장'], [2, '2공장']] as const).map(([id, n]) => <button key={id} type="button" aria-pressed={facF === id} onClick={() => setFacF(id)} className={`px-3 rounded text-sm whitespace-nowrap ${facF === id ? 'bg-white shadow-sm font-semibold text-ink' : 'text-ink-2 hover:text-ink'}`}>{n}</button>)}
          </div>
          <div role="group" aria-label="조별 보기" className="inline-flex h-9 p-0.5 rounded-md bg-ground border border-line">
            {['전체', 'A', 'B', 'C', '주간고정', '임시'].map((g) => <button key={g} type="button" aria-pressed={grpF === g} onClick={() => setGrpF(g)} className={`px-3 rounded text-sm whitespace-nowrap ${grpF === g ? 'bg-white shadow-sm font-semibold text-ink' : 'text-ink-2 hover:text-ink'}`}>{g === '전체' || g === '주간고정' || g === '임시' ? g : `${g}조`}</button>)}
          </div>
          <label className="text-sm text-ink-2 flex items-center gap-1.5"><input type="checkbox" checked={withTemp} onChange={(e) => setWithTemp(e.target.checked)} className="accent-brand" />임시 인원 포함</label>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름 검색…" aria-label="이름 검색" autoComplete="off" spellCheck={false} className="h-9 px-3 border border-line bg-white rounded-md w-44 text-sm focus:border-brand" />
        </div>
      </div>
      <div className="bg-white border border-line rounded-xl overflow-hidden">
        <table className="w-full">
          <thead><tr className="text-left text-xs text-ink-3 border-b border-line"><th className="pl-5 py-2.5 font-medium">이름</th><th className="py-2.5 font-medium">집단</th><th className="py-2.5 font-medium">소속</th><th className="py-2.5 font-medium">조</th><th className="py-2.5 font-medium">근무</th><th className="py-2.5 font-medium">성별</th><th className="py-2.5 font-medium">공장</th><th className="py-2.5 font-medium">전화</th><th className="py-2.5 font-medium pr-5 text-right">이번 주</th><th className="py-2.5 pr-5 font-medium text-right">숙련도</th></tr></thead>
          <tbody>
            {list.map((p) => (
              <Fragment key={p.id}>
              <tr className="border-b border-line-2 last:border-0 hover:bg-ground/60">
                <td className="pl-5 py-2 font-semibold text-[15px]">{p.name}</td>
                <td className="py-2"><select aria-label={`${p.name} 집단`} value={p.unit} onChange={(e) => patch(p.id, { unit: e.target.value })} className={sel}>{UNITS.map((a) => <option key={a}>{a}</option>)}</select></td>
                <td className="py-2"><select aria-label={`${p.name} 소속`} value={p.affiliation ?? ''} onChange={(e) => patch(p.id, { affiliation: e.target.value })} className={sel}>{['새한', '세영', '다연', '피너'].map((a) => <option key={a}>{a}</option>)}</select></td>
                <td className="py-2"><select aria-label={`${p.name} 조`} value={p.grp} onChange={(e) => patch(p.id, { grp: e.target.value })} className={sel}>{['A', 'B', 'C', '주전', '미정'].map((a) => <option key={a}>{a}</option>)}</select></td>
                <td className="py-2"><select aria-label={`${p.name} 근무 형태`} value={p.work_type} onChange={(e) => patch(p.id, { work_type: e.target.value as PersonRow['work_type'] })} className={sel}>{['교대', '주간고정', '임시'].map((a) => <option key={a}>{a}</option>)}</select></td>
                <td className="py-2"><select aria-label={`${p.name} 성별`} value={p.gender ?? ''} onChange={(e) => patch(p.id, { gender: e.target.value || null })} className={sel}><option value="">—</option><option value="M">남</option><option value="F">여</option></select></td>
                <td className="py-2"><select aria-label={`${p.name} 공장`} value={p.home_factory_id ?? ''} onChange={(e) => patch(p.id, { home_factory_id: Number(e.target.value) })} className={sel}><option value="">—</option>{Object.entries(FAC).map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select></td>
                <td className="py-2"><input type="tel" inputMode="tel" autoComplete="off" aria-label={`${p.name} 전화`} defaultValue={p.phone ?? ''} placeholder="010-0000-0000" onBlur={(e) => { if (e.target.value !== (p.phone ?? '')) patch(p.id, { phone: e.target.value }); }} className="h-8 px-2 w-36 border border-transparent hover:border-line focus:border-brand rounded-md text-sm" /></td>
                <td className="py-2 pr-5 text-right tabular-nums text-sm">{(() => { const h = p.week_hours ?? 0; const over = h + shiftHours > maxHours; return <span className={`inline-flex items-center h-6 px-2 rounded ${over ? 'bg-wait-bg text-wait font-semibold' : h ? 'text-ink-2' : 'text-ink-3'}`} title={over ? `한 교대 더하면 ${maxHours}시간을 넘어 대체 후보에서 빠집니다` : undefined}>{h}시간{over ? ' · 한도' : ''}</span>; })()}</td>
                <td className="py-2 pr-5 text-right"><button type="button" onClick={() => setSkillOf(skillOf === p.id ? null : p.id)} aria-expanded={skillOf === p.id} className={`h-8 px-2.5 rounded-md border text-sm ${skillOf === p.id ? 'border-brand bg-brand-soft text-brand' : 'border-line bg-white text-ink-2 hover:text-ink hover:border-ink-3'}`}>라인 숙련도</button></td>
              </tr>
              {skillOf === p.id && <tr className="border-b border-line-2"><td colSpan={10} className="px-5 py-3 bg-ground/60"><SkillPanel person={p} /></td></tr>}
              </Fragment>
            ))}
            {list.length === 0 && <tr><td colSpan={10} className="py-12 text-center text-ink-3">{grpF === '전체' && facF === 0 ? '검색 결과가 없습니다' : '고른 조건에 해당하는 사람이 없습니다'}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const LEVELS: { v: SkillLevel; label: string; cls: string }[] = [
  { v: '불가', label: '불가', cls: 'bg-vac-bg text-vac border-vac/30' }, { v: '가능', label: '가능', cls: 'bg-chip text-ink border-line' }, { v: '숙련', label: '숙련', cls: 'bg-ok-bg text-ok border-ok/30' },
];
/** 한 사람의 라인별 숙련도. 불가로 두면 그 라인 후보에서 빠지고, 숙련이면 먼저 올라온다. 안 정한 라인은 선 횟수로만 본다. */
function SkillPanel({ person }: { person: Row }): React.ReactElement {
  const [rows, setRows] = useState<SkillRow[] | null>(null);
  const [fac, setFac] = useState<number>(person.home_factory_id ?? 1);
  useEffect(() => { let on = true; fetch(`/api/skills?person=${person.id}`).then((r) => r.json()).then((d: SkillRow[]) => { if (on) setRows(d); }); return () => { on = false; }; }, [person.id]);
  async function set(postId: number, level: SkillLevel | null): Promise<void> {
    await fetch('/api/skills', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ person: person.id, post: postId, level }) });
    setRows((rs) => (rs ?? []).map((r) => r.post_id === postId ? { ...r, level } : r));
  }
  if (!rows) return <div className="text-sm text-ink-3">불러오는 중…</div>;
  const shown = rows.filter((r) => r.factory_id === fac);
  const n = (lv: SkillLevel) => rows.filter((r) => r.level === lv).length;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="font-semibold">{person.name} · 라인 숙련도</span>
        <span className="inline-flex h-8 p-0.5 rounded-md bg-white border border-line">{[1, 2].map((f) => <button key={f} type="button" onClick={() => setFac(f)} className={`px-2.5 rounded text-sm ${fac === f ? 'bg-brand-soft text-brand font-semibold' : 'text-ink-2'}`}>{FAC[f]}</button>)}</span>
        <span className="text-ink-3">불가 {n('불가')} · 가능 {n('가능')} · 숙련 {n('숙련')} · 정하지 않은 라인은 선 횟수로만 봅니다</span>
      </div>
      <ul className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
        {shown.map((r) => { const zc = zoneColor(r.zone); return (
          <li key={r.post_id} className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 bg-white ${r.level === '불가' ? 'border-vac/40' : r.level === '숙련' ? 'border-ok/40' : 'border-line'}`}>
            <b className="w-20 shrink-0" style={{ color: zc.ink }}>{r.code}</b>
            <span className="text-xs text-ink-3 w-14 shrink-0">{r.count ? `${r.count}회` : '기록 없음'}</span>
            <span className="ml-auto inline-flex gap-1">
              {LEVELS.map((l) => <button key={l.v} type="button" aria-pressed={r.level === l.v} aria-label={`${person.name} ${r.code} ${l.label}`} onClick={() => set(r.post_id, r.level === l.v ? null : l.v)} className={`h-7 px-2 rounded border text-xs font-semibold ${r.level === l.v ? l.cls : 'bg-white text-ink-3 border-line hover:text-ink'}`}>{l.label}</button>)}
            </span>
          </li>
        ); })}
      </ul>
    </div>
  );
}
