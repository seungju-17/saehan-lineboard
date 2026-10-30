import type { Board } from '@/lib/repo';
import { isVacantPost, needFor } from '@/lib/rules';
import { fmtKo, SHIFT_HOURS } from '@/lib/shift';
import { groupColor, zoneColor } from '@/lib/colors';

/** 인쇄용 배치표. 구역별 색 띠, 굵은 라인 번호, 조별 색 이름표. 2공장은 결재란(팀장·입안·심사/합의·결정)을 양식대로 둔다. */
export function PrintBoard({ b, factoryName, action }: { b: Board; factoryName: string; action?: React.ReactNode }): React.ReactElement {
  const byPost = new Map<number, Board['assignments']>();
  for (const a of b.assignments) byPost.set(a.post_id, [...(byPost.get(a.post_id) ?? []), a]);
  const men = b.assignments.filter((a) => a.gender === 'M').length, women = b.assignments.filter((a) => a.gender === 'F').length;
  const twoStep = b.factory_id === 2;
  const att = b.attendance;
  const groups: { name: string; posts: Board['posts'] }[] = [];
  for (const p of b.posts) {
    const show = (byPost.get(p.id)?.length ?? 0) > 0 || p.product || p.unmanned || p.stopped || isVacantPost(p, 0);
    if (!show) continue;
    const last = groups[groups.length - 1];
    if (last && last.name === (p.zone || '라인')) last.posts.push(p); else groups.push({ name: p.zone || '라인', posts: [p] });
  }
  const running = b.posts.filter((p) => p.kind === 'machine' && !p.unmanned && !p.stopped && (p.product || (byPost.get(p.id)?.length ?? 0) > 0)).length;
  const vacantCount = b.posts.filter((p) => isVacantPost(p, byPost.get(p.id)?.length ?? 0)).length;
  return (
    <div className="mx-auto max-w-3xl print:max-w-none bg-white border border-line rounded-xl p-6 print:border-0 print:p-0 print:rounded-none text-ink">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <div className="text-[26px] font-extrabold leading-tight">{factoryName} 인원 배치표</div>
          <div className="mt-1 text-[17px] font-semibold">{fmtKo(b.date)} · {b.shift} <span className="font-normal text-ink-2">{SHIFT_HOURS[b.shift]}</span></div>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[14px]">
            <span>근무 <b>{b.assignments.length}</b>명 <span className="text-ink-2">(남 {men} · 여 {women})</span></span>
            <span>가동 <b>{running}</b>라인</span>
            {vacantCount > 0 && <span className="font-bold" style={{ color: '#c8362b' }}>비어 있음 {vacantCount}</span>}
          </div>
        </div>
        {twoStep ? (
          <table className="text-[12px] border-2 border-ink text-center shrink-0">
            <thead><tr>{['팀장', '입안', '심사/합의', '결정'].map((h) => <th key={h} className="border border-ink px-3 py-1 font-semibold bg-ground">{h}</th>)}</tr></thead>
            <tbody><tr>
              <td className="border border-ink h-12 w-16" />
              <td className="border border-ink h-12 w-16 align-bottom text-ink-2">{b.status !== '초안' ? '입안' : ''}</td>
              <td className="border border-ink h-12 w-16" />
              <td className="border border-ink h-12 w-16 align-bottom font-bold" style={{ color: '#1d7a4a' }}>{b.status === '확정' ? '결정' : ''}</td>
            </tr></tbody>
          </table>
        ) : (b.status === '확정' && <span className="inline-flex items-center h-7 px-2.5 rounded font-bold text-white" style={{ background: '#1d7a4a' }}>확정</span>)}
        {action}
      </div>
      <table className="w-full text-[15px] border-collapse border-2 border-ink">
        <thead><tr className="text-left text-[13px] bg-ink text-white"><th className="py-1.5 pl-2 w-28 font-semibold">라인</th><th className="py-1.5 w-44 font-semibold">제품</th><th className="py-1.5 font-semibold">근무자</th><th className="py-1.5 pr-2 w-14 text-right font-semibold">인원</th></tr></thead>
        {groups.map((g) => {
          const zc = zoneColor(g.name);
          return (
            <tbody key={g.name}>
              <tr><td colSpan={4} className="py-1 pl-2 text-[13px] font-bold border-t border-ink" style={{ background: zc.band, color: zc.ink }}>{g.name}</td></tr>
              {g.posts.map((p) => {
                const ppl = byPost.get(p.id) ?? [];
                const vacant = isVacantPost(p, ppl.length);
                const need = needFor(p, ppl.length);
                return (
                  <tr key={p.id} className="border-t border-line" style={vacant ? { background: '#fdecec' } : p.stopped ? { background: '#f1f3f6' } : p.kind !== 'machine' ? { background: '#f8f9fb' } : undefined}>
                    <td className="py-1.5 pl-2 align-middle">
                      <span className="inline-flex items-center gap-1.5"><i className="w-1.5 h-5 rounded-sm" style={{ background: vacant ? '#c8362b' : p.stopped ? '#c9cfd8' : zc.ink }} /><b className="text-[17px]" style={{ color: vacant ? '#c8362b' : p.stopped ? '#667085' : zc.ink }}>{p.code}</b></span>
                      {p.stopped ? <span className="ml-1.5 text-[12px] font-semibold text-ink-2">부동</span> : null}{p.unmanned ? <span className="ml-1.5 text-[12px] text-ink-3">무인</span> : null}
                    </td>
                    <td className={`py-1.5 align-middle ${p.stopped ? 'line-through text-ink-3' : 'font-medium'}`}>{p.product ?? ''}</td>
                    <td className="py-1 align-middle">
                      <span className="inline-flex flex-wrap gap-1">
                        {ppl.map((a) => { const gc = a.source === '대체' ? { ink: '#1d7a4a', bg: '#e8f5ee' } : groupColor(a.grp, a.work_type); const k = att.find((t) => t.person_id === a.person_id); return (
                          <span key={a.id} className="inline-flex items-center h-6 pl-1.5 pr-2 rounded-sm font-semibold border-l-4" style={{ background: gc.bg, borderLeftColor: gc.ink }}>{a.name}{a.home_factory_id && a.home_factory_id !== b.factory_id ? <span className="ml-1 text-[11px] font-normal text-ink-3">{a.home_factory_id}공장</span> : null}{k ? <span className="ml-1 text-[11px]" style={{ color: '#c8362b' }}>{k.kind}</span> : null}</span>
                        ); })}
                        {vacant && <span className="inline-flex items-center h-6 px-2 rounded-sm font-bold text-white" style={{ background: '#c8362b' }}>비어 있음{need > 1 ? ` ${ppl.length}/${need}` : ''}</span>}
                        {p.unmanned && ppl.length === 0 ? <span className="text-ink-3 text-[13px]">자동 운전 · 설비관리가 봄</span> : null}
                      </span>
                    </td>
                    <td className="py-1.5 pr-2 text-right align-middle tabular-nums" style={vacant ? { color: '#c8362b', fontWeight: 700 } : undefined}>{ppl.length || (need ? '0' : '')}{ppl.length < need ? ` / ${need}` : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          );
        })}
      </table>
      <div className="mt-3 text-[14px] flex flex-col gap-1">
        <div><span className="font-semibold mr-2">비고</span>{b.note ?? ''}</div>
        {att.length > 0 && <div><span className="font-semibold mr-2">근태</span>{att.map((a) => <span key={a.person_id} className="mr-2">{a.name} <b style={{ color: '#c8362b' }}>{a.kind}</b>{a.note ? <span className="text-ink-3"> {a.note}</span> : null}</span>)}</div>}
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-ink-2">
          {(['A', 'B', 'C'] as const).map((x) => <span key={x} className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm" style={{ background: groupColor(x).ink }} />{x}조</span>)}
          <span className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm" style={{ background: groupColor(null, '주간고정').ink }} />주간고정</span>
          <span className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm" style={{ background: groupColor(null, '임시').ink }} />임시</span>
          <span className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm" style={{ background: '#1d7a4a' }} />대체 투입</span>
        </div>
      </div>
    </div>
  );
}
