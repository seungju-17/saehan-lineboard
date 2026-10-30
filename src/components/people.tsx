'use client';
import { useState } from 'react';
import type { PersonRow } from '@/lib/repo';

const FAC: Record<number, string> = { 1: '1공장', 2: '2공장' };

export function People({ initial }: { initial: PersonRow[] }): React.ReactElement {
  const [rows, setRows] = useState(initial);
  const [q, setQ] = useState('');
  const [withTemp, setWithTemp] = useState(false);
  const list = rows.filter((p) => p.active && (!q || p.name.includes(q)) && (withTemp || p.work_type !== '임시'));

  async function patch(id: number, u: Partial<PersonRow>): Promise<void> {
    await fetch('/api/people', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...u }) });
    setRows((r) => r.map((p) => p.id === id ? { ...p, ...u } : p));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름" className="h-10 px-3 border border-line rounded-md w-48" />
        <label className="text-sm text-ink-2 flex items-center gap-1.5"><input type="checkbox" checked={withTemp} onChange={(e) => setWithTemp(e.target.checked)} />임시 인원 포함</label>
        <span className="ml-auto text-sm text-ink-3">{list.length}명</span>
      </div>
      <table className="w-full text-[15px] border-t border-line">
        <thead><tr className="text-left text-sm text-ink-3"><th className="py-2 font-normal">이름</th><th className="py-2 font-normal">소속</th><th className="py-2 font-normal">조</th><th className="py-2 font-normal">근무</th><th className="py-2 font-normal">공장</th><th className="py-2 font-normal">전화</th></tr></thead>
        <tbody>
          {list.map((p) => (
            <tr key={p.id} className="border-b border-line-2">
              <td className="py-2 font-medium">{p.name}</td>
              <td className="py-2"><select value={p.affiliation ?? ''} onChange={(e) => patch(p.id, { affiliation: e.target.value })} className="h-8 bg-transparent">{['새한', '세영', '다연', '피너'].map((a) => <option key={a}>{a}</option>)}</select></td>
              <td className="py-2"><select value={p.grp} onChange={(e) => patch(p.id, { grp: e.target.value })} className="h-8 bg-transparent">{['A', 'B', 'C', '주전', '미정'].map((a) => <option key={a}>{a}</option>)}</select></td>
              <td className="py-2"><select value={p.work_type} onChange={(e) => patch(p.id, { work_type: e.target.value as PersonRow['work_type'] })} className="h-8 bg-transparent">{['교대', '주간고정', '임시'].map((a) => <option key={a}>{a}</option>)}</select></td>
              <td className="py-2"><select value={p.home_factory_id ?? ''} onChange={(e) => patch(p.id, { home_factory_id: Number(e.target.value) })} className="h-8 bg-transparent"><option value="">—</option>{Object.entries(FAC).map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select></td>
              <td className="py-2"><input defaultValue={p.phone ?? ''} placeholder="010-" onBlur={(e) => { if (e.target.value !== (p.phone ?? '')) patch(p.id, { phone: e.target.value }); }} className="h-8 px-2 w-36 border border-transparent hover:border-line focus:border-ink rounded-md" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
