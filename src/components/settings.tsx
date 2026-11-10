'use client';
import { useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import type { Settings } from '@/lib/rules';
import { monthTemplate, parseMonthSheet, type ImportSummary, type MonthRow, type ParseResult } from '@/lib/month-import';
import type { ProductRow } from '@/lib/repo';
import { fmtKo, todaySeoul } from '@/lib/shift';

const FIELDS: { key: keyof Settings; label: string; unit: string; help: string; min: number; max: number }[] = [
  { key: 'expiry_minutes', label: '대체 요청 만료', unit: '분', help: '이 시간 안에 답이 없으면 요청이 만료되고 「다음 후보에게」를 누를 수 있습니다.', min: 5, max: 240 },
  { key: 'shift_hours', label: '한 교대 근무시간', unit: '시간', help: '이번 주 근무시간을 셀 때 교대 한 번을 몇 시간으로 보는지. 3조 2교대는 보통 12시간입니다.', min: 4, max: 24 },
  { key: 'week_max_hours', label: '주 최대 근무시간', unit: '시간', help: '이번 주 근무시간에 한 교대를 더하면 이 값을 넘는 사람은 대체 후보에서 뺍니다. 근로기준법 기본값은 52시간입니다. 회사 규정이 있으면 그 값으로 바꾸세요.', min: 12, max: 84 },
  { key: 'max_consecutive_days', label: '연속 근무 최대 일수', unit: '일', help: '월 근무표를 짤 때 이 일수를 넘겨 연달아 서게 하지 않습니다. 3조 2교대는 보통 4일 근무 뒤 휴무입니다.', min: 2, max: 14 },
  { key: 'fair_night', label: '야간 형평', unit: '', help: '1이면 이번 달 야간을 많이 선 사람을 야간 자리에서 뒤로 미룹니다. 0이면 숙련·경험만 봅니다.', min: 0, max: 1 },
  { key: 'fair_weekend', label: '주말 형평', unit: '', help: '1이면 이번 달 주말에 많이 선 사람을 주말 자리에서 뒤로 미룹니다.', min: 0, max: 1 },
];

export function SettingsForm({ initial, lines = [] }: { initial: Settings; lines?: { factory: number; code: string; name: string }[] }): React.ReactElement {
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
      <ProductNeeds />
      <MonthUpload lines={lines} />
    </div>
  );
}

/** 월 근무표 올리기: 엑셀을 브라우저에서 읽어 미리 보여 주고, 올리면 날짜·교대·공장마다 표가 초안으로 들어간다. */
function MonthUpload({ lines }: { lines: { factory: number; code: string; name: string }[] }): React.ReactElement {
  const [parsed, setParsed] = useState<ParseResult & { file: string } | null>(null);
  const [result, setResult] = useState<ImportSummary | { error: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const nextMonth = (() => { const t = todaySeoul(); const y = +t.slice(0, 4), m = +t.slice(5, 7); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`; })();
  async function pick(f: File | undefined): Promise<void> {
    setResult(null); if (!f) { setParsed(null); return; }
    try {
      const buf = new Uint8Array(await f.arrayBuffer());
      setParsed({ ...parseMonthSheet(buf), file: f.name });
    } catch (e) {
      setParsed({ rows: [], problems: [`파일을 읽지 못했습니다: ${e instanceof Error ? e.message : String(e)}`], sheet: null, file: f.name });
    }
  }
  async function upload(): Promise<void> {
    if (!parsed?.rows.length) return;
    setBusy(true);
    const r = await fetch('/api/import/month', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows: parsed.rows satisfies MonthRow[] }) });
    setResult(await r.json() as ImportSummary | { error: string }); setBusy(false);
  }
  const boards = parsed ? new Set(parsed.rows.map((r) => `${r.date}|${r.shift}|${r.factory}`)).size : 0;
  const dates = parsed?.rows.map((r) => r.date).sort() ?? [];
  return (
    <section className="bg-white border border-line rounded-xl p-5 flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[17px] font-bold">월 근무표 · 생산 계획 올리기</h2>
        <button type="button" onClick={() => XLSX.writeFile(monthTemplate(lines, nextMonth), `월근무표_양식_${nextMonth}.xlsx`)} className="text-sm text-brand hover:underline">양식 내려받기 (.xlsx)</button>
      </div>
      <p className="text-sm text-ink-2">열은 날짜 · 교대 · 공장 · 라인 · 제품 · 인원 · 근무자입니다. 근무자까지 적으면 짜 둔 월 근무표가 그대로 들어가고, 근무자를 비우고 인원만 적으면 「생산 계획」이 되어 「월 근무표」 화면의 「이 달 근무표 짜기」로 사람을 채웁니다. 이미 확정된 날은 건너뛰고, 아직 확정하지 않은 날은 파일 내용으로 바뀝니다.</p>
      <div className="flex flex-wrap items-center gap-3">
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" aria-label="월 근무표 파일" onChange={(e) => pick(e.target.files?.[0])} className="text-sm file:mr-3 file:h-10 file:px-4 file:rounded-md file:border file:border-line file:bg-white file:text-sm file:font-semibold file:text-ink hover:file:border-ink-3" />
        <button type="button" onClick={upload} disabled={busy || !parsed?.rows.length} className="h-10 px-5 rounded-md bg-brand text-white text-[15px] font-semibold hover:bg-brand-2 disabled:opacity-40">{busy ? '올리는 중…' : '올리기'}</button>
      </div>
      {parsed && (
        <div className="rounded-lg bg-ground px-4 py-3 text-sm">
          <div><b>{parsed.file}</b> · {parsed.rows.length}줄{dates.length ? <> · {fmtKo(dates[0])} ~ {fmtKo(dates[dates.length - 1])}</> : null} · 표 {boards}개 ({[1, 2].map((f) => `${f}공장 ${new Set(parsed.rows.filter((r) => r.factory === f).map((r) => `${r.date}|${r.shift}`)).size}`).join(' · ')})</div>
          {parsed.problems.length > 0 && <ul className="mt-1 text-vac list-disc pl-5">{parsed.problems.map((x) => <li key={x}>{x}</li>)}</ul>}
          {parsed.rows.length === 0 && <div className="mt-1 text-vac">읽을 줄이 없습니다. 양식을 내려받아 열 이름을 맞춰 주세요.</div>}
        </div>
      )}
      {result && ('error' in result
        ? <div role="status" className="text-sm text-vac">{result.error}</div>
        : <div role="status" className="rounded-lg bg-ok-bg text-ok px-4 py-3 text-sm">
            <div className="font-semibold">표 {result.boards}개를 넣었습니다{result.from ? ` (${fmtKo(result.from)} ~ ${fmtKo(result.to!)})` : ''}.</div>
            <div className="mt-0.5 text-ink-2">새로 만든 표 {result.created}개 · 바뀐 표 {result.updated}개 · 확정이라 건너뛴 표 {result.skipped.length}개 · 배치 {result.assignments}명{result.newPeople.length ? ` · 명단에 없어 임시로 넣은 이름 ${result.newPeople.length}명 (${result.newPeople.slice(0, 8).join(', ')}${result.newPeople.length > 8 ? ' …' : ''})` : ''}{result.unknownLines.length ? ` · 모르는 라인은 「기타」로: ${result.unknownLines.join(', ')}` : ''}</div>
          </div>)}
    </section>
  );
}

/** 제품별 표준 인원. 정해 두면 제품을 고르거나 자동 배치할 때 이 인원을 쓴다. 비우면 기록에서 본 보통 인원. */
function ProductNeeds(): React.ReactElement {
  const [fac, setFac] = useState(1);
  const [rows, setRows] = useState<ProductRow[] | null>(null);
  const [q, setQ] = useState('');
  // eslint-disable-next-line react-hooks/set-state-in-effect -- 공장을 바꾸면 비우고 다시 불러온다
  useEffect(() => { let on = true; setRows(null); fetch(`/api/products?factory=${fac}`).then((r) => r.json()).then((d: ProductRow[]) => { if (on) setRows(d); }); return () => { on = false; }; }, [fac]);
  async function set(name: string, need: number | null): Promise<void> {
    await fetch('/api/products', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ factory: fac, name, need }) });
    setRows((rs) => (rs ?? []).map((r) => r.name === name ? { ...r, need } : r));
  }
  const shown = (rows ?? []).filter((r) => !q || r.name.includes(q));
  return (
    <section className="bg-white border border-line rounded-xl p-5 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-[17px] font-bold">제품별 표준 인원</h2>
        <span className="inline-flex h-9 p-0.5 rounded-md bg-ground border border-line">{[1, 2].map((f) => <button key={f} type="button" onClick={() => setFac(f)} className={`px-3 rounded text-sm ${fac === f ? 'bg-white shadow-sm font-semibold text-ink' : 'text-ink-2'}`}>{f}공장</button>)}</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="제품 찾기…" aria-label="제품 찾기" className="h-9 px-3 border border-line bg-white rounded-md w-40 text-sm focus:border-brand" />
        <span className="text-sm text-ink-3">최근 1년 표에 나온 제품 {rows?.length ?? '…'}개 · 비우면 기록에서 본 보통 인원을 씁니다</span>
      </div>
      {!rows ? <div className="text-sm text-ink-3">불러오는 중…</div> : (
        <ul className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3 max-h-80 overflow-auto pr-1">
          {shown.map((r) => (
            <li key={r.name} className="flex items-center gap-2 rounded-md border border-line px-2.5 py-1.5 bg-white">
              <span className="truncate font-medium" title={r.name}>{r.name}</span>
              <span className="text-xs text-ink-3 shrink-0">{r.times}회 · 보통 {r.typical}명</span>
              <input type="number" min={0} max={20} aria-label={`${r.name} 표준 인원`} value={r.need ?? ''} placeholder={String(r.typical)} onChange={(e) => set(r.name, e.target.value === '' ? null : Number(e.target.value))} className="ml-auto h-8 w-16 rounded-md border border-line px-2 text-sm text-right focus:border-brand" />
            </li>
          ))}
          {shown.length === 0 && <li className="text-sm text-ink-3">해당 제품이 없습니다.</li>}
        </ul>
      )}
    </section>
  );
}
