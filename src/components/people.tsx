'use client';
import { useState } from 'react';
import type { PersonRow } from '@/lib/repo';

const FAC: Record<number, string> = { 1: '1공장', 2: '2공장' };
const UNITS = ['주전반', '교대반', '협력사 A조', '협력사 B조', '협력사 C조', 'PE 협력사', '지원', '임시'];
const sel = 'h-8 -ml-1 px-1 rounded bg-transparent hover:bg-ground text-[15px]';

type Row = PersonRow & { week_hours?: number };
export function People({ initial, maxHours = 52, shiftHours = 12 }: { initial: Row[]; maxHours?: number; shiftHours?: number }): React.ReactElement {
  const [rows, setRows] = useState<Row[]>(initial);
  const near = rows.filter((p) => p.active && (p.week_hours ?? 0) + shiftHours > maxHours);
  const [q, setQ] = useState('');
  const [withTemp, setWithTemp] = useState(false);
  const list = rows.filter((p) => p.active && (!q || p.name.includes(q)) && (withTemp || p.work_type !== '임시'));
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
        <div className="ml-auto flex items-center gap-3">
          <label className="text-sm text-ink-2 flex items-center gap-1.5"><input type="checkbox" checked={withTemp} onChange={(e) => setWithTemp(e.target.checked)} className="accent-brand" />임시 인원 포함</label>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름 검색…" aria-label="이름 검색" autoComplete="off" spellCheck={false} className="h-9 px-3 border border-line bg-white rounded-md w-44 text-sm focus:border-brand" />
        </div>
      </div>
      <div className="bg-white border border-line rounded-xl overflow-hidden">
        <table className="w-full">
          <thead><tr className="text-left text-xs text-ink-3 border-b border-line"><th className="pl-5 py-2.5 font-medium">이름</th><th className="py-2.5 font-medium">집단</th><th className="py-2.5 font-medium">소속</th><th className="py-2.5 font-medium">조</th><th className="py-2.5 font-medium">근무</th><th className="py-2.5 font-medium">성별</th><th className="py-2.5 font-medium">공장</th><th className="py-2.5 font-medium">전화</th><th className="py-2.5 font-medium pr-5 text-right">이번 주</th></tr></thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id} className="border-b border-line-2 last:border-0 hover:bg-ground/60">
                <td className="pl-5 py-2 font-semibold text-[15px]">{p.name}</td>
                <td className="py-2"><select aria-label={`${p.name} 집단`} value={p.unit} onChange={(e) => patch(p.id, { unit: e.target.value })} className={sel}>{UNITS.map((a) => <option key={a}>{a}</option>)}</select></td>
                <td className="py-2"><select aria-label={`${p.name} 소속`} value={p.affiliation ?? ''} onChange={(e) => patch(p.id, { affiliation: e.target.value })} className={sel}>{['새한', '세영', '다연', '피너'].map((a) => <option key={a}>{a}</option>)}</select></td>
                <td className="py-2"><select aria-label={`${p.name} 조`} value={p.grp} onChange={(e) => patch(p.id, { grp: e.target.value })} className={sel}>{['A', 'B', 'C', '주전', '미정'].map((a) => <option key={a}>{a}</option>)}</select></td>
                <td className="py-2"><select aria-label={`${p.name} 근무 형태`} value={p.work_type} onChange={(e) => patch(p.id, { work_type: e.target.value as PersonRow['work_type'] })} className={sel}>{['교대', '주간고정', '임시'].map((a) => <option key={a}>{a}</option>)}</select></td>
                <td className="py-2"><select aria-label={`${p.name} 성별`} value={p.gender ?? ''} onChange={(e) => patch(p.id, { gender: e.target.value || null })} className={sel}><option value="">—</option><option value="M">남</option><option value="F">여</option></select></td>
                <td className="py-2"><select aria-label={`${p.name} 공장`} value={p.home_factory_id ?? ''} onChange={(e) => patch(p.id, { home_factory_id: Number(e.target.value) })} className={sel}><option value="">—</option>{Object.entries(FAC).map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select></td>
                <td className="py-2"><input type="tel" inputMode="tel" autoComplete="off" aria-label={`${p.name} 전화`} defaultValue={p.phone ?? ''} placeholder="010-0000-0000" onBlur={(e) => { if (e.target.value !== (p.phone ?? '')) patch(p.id, { phone: e.target.value }); }} className="h-8 px-2 w-36 border border-transparent hover:border-line focus:border-brand rounded-md text-sm" /></td>
                <td className="py-2 pr-5 text-right tabular-nums text-sm">{(() => { const h = p.week_hours ?? 0; const over = h + shiftHours > maxHours; return <span className={`inline-flex items-center h-6 px-2 rounded ${over ? 'bg-wait-bg text-wait font-semibold' : h ? 'text-ink-2' : 'text-ink-3'}`} title={over ? `한 교대 더하면 ${maxHours}시간을 넘어 대체 후보에서 빠집니다` : undefined}>{h}시간{over ? ' · 한도' : ''}</span>; })()}</td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={9} className="py-12 text-center text-ink-3">검색 결과가 없습니다</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
