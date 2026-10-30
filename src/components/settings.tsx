'use client';
import { useState } from 'react';
import type { Settings } from '@/lib/rules';

const FIELDS: { key: keyof Settings; label: string; unit: string; help: string; min: number; max: number }[] = [
  { key: 'expiry_minutes', label: '대체 요청 만료', unit: '분', help: '이 시간 안에 답이 없으면 요청이 만료되고 「다음 후보에게」를 누를 수 있습니다.', min: 5, max: 240 },
  { key: 'shift_hours', label: '한 교대 근무시간', unit: '시간', help: '이번 주 근무시간을 셀 때 교대 한 번을 몇 시간으로 보는지. 3조 2교대는 보통 12시간입니다.', min: 4, max: 24 },
  { key: 'week_max_hours', label: '주 최대 근무시간', unit: '시간', help: '이번 주 근무시간에 한 교대를 더하면 이 값을 넘는 사람은 대체 후보에서 뺍니다. 근로기준법 기본값은 52시간입니다. 회사 규정이 있으면 그 값으로 바꾸세요.', min: 12, max: 84 },
];

export function SettingsForm({ initial }: { initial: Settings }): React.ReactElement {
  const [v, setV] = useState<Settings>(initial);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function save(): Promise<void> {
    setBusy(true); setSaved(null);
    const r = await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v) });
    const d = await r.json() as Settings & { error?: string };
    setBusy(false);
    if (!r.ok) { setSaved(d.error ?? '저장하지 못했습니다'); return; }
    setV(d); setSaved('저장했습니다. 다음 요청부터 적용됩니다.');
  }
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[26px] font-bold tracking-tight leading-none">설정</h1>
        <div className="mt-1.5 text-sm text-ink-2">대체 요청과 후보 규칙에 쓰는 값입니다. 주는 월요일부터 일요일까지로 셉니다.</div>
      </div>
      <section className="bg-white border border-line rounded-xl divide-y divide-line-2">
        {FIELDS.map((f) => (
          <div key={f.key} className="px-5 py-4 flex flex-wrap items-center gap-x-6 gap-y-2">
            <label htmlFor={`s-${f.key}`} className="w-44 text-[15px] font-semibold">{f.label}</label>
            <span className="inline-flex items-center gap-2">
              <input id={`s-${f.key}`} type="number" min={f.min} max={f.max} value={v[f.key]} onChange={(e) => setV({ ...v, [f.key]: Number(e.target.value) })} className="h-10 w-24 rounded-md border border-line px-3 text-[15px] text-right tabular-nums" />
              <span className="text-sm text-ink-2">{f.unit}</span>
            </span>
            <p className="basis-full sm:basis-auto sm:flex-1 text-sm text-ink-3">{f.help}</p>
          </div>
        ))}
      </section>
      <div className="flex items-center gap-4">
        <button onClick={save} disabled={busy} className="h-11 px-5 rounded-md bg-brand text-white text-[15px] font-semibold hover:bg-brand-2 disabled:opacity-40">저장</button>
        {saved && <span role="status" className="text-sm text-ink-2">{saved}</span>}
      </div>
    </div>
  );
}
