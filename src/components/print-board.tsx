import type { Board } from '@/lib/repo';
import { isVacantPost } from '@/lib/repo';
import { fmtKo, SHIFT_HOURS } from '@/lib/shift';

/** 인쇄용 배치표. 2공장은 결재란(팀장·입안·심사/합의·결정)을 양식대로 둔다. */
export function PrintBoard({ b, factoryName, action }: { b: Board; factoryName: string; action?: React.ReactNode }): React.ReactElement {
  const byPost = new Map<number, string[]>();
  for (const a of b.assignments) byPost.set(a.post_id, [...(byPost.get(a.post_id) ?? []), a.name]);
  const men = b.assignments.filter((a) => a.gender === 'M').length, women = b.assignments.filter((a) => a.gender === 'F').length;
  const twoStep = b.factory_id === 2;
  const att = b.attendance;
  return (
    <div className="mx-auto max-w-3xl print:max-w-none bg-white border border-line rounded-xl p-6 print:border-0 print:p-0 print:rounded-none">
      <div className="flex items-start justify-between gap-4 mb-4 print:mb-3">
        <div>
          <div className="text-2xl font-bold">{factoryName} 인원 배치표</div>
          <div className="text-ink-2">{fmtKo(b.date)} · {b.shift} {SHIFT_HOURS[b.shift]}</div>
          <div className="mt-1 text-[13px] text-ink-2">남자인력 {men} · 여자인력 {women} · 근무 {b.assignments.length}명</div>
        </div>
        {twoStep ? (
          <table className="text-[12px] border border-ink text-center shrink-0">
            <thead><tr>{['팀장', '입안', '심사/합의', '결정'].map((h) => <th key={h} className="border border-ink px-3 py-1 font-medium">{h}</th>)}</tr></thead>
            <tbody><tr>
              <td className="border border-ink h-12 w-16" />
              <td className="border border-ink h-12 w-16 align-bottom text-ink-2">{b.status !== '초안' ? '입안' : ''}</td>
              <td className="border border-ink h-12 w-16" />
              <td className="border border-ink h-12 w-16 align-bottom text-ok font-semibold">{b.status === '확정' ? '결정' : ''}</td>
            </tr></tbody>
          </table>
        ) : (b.status === '확정' && <span className="text-ok font-semibold">확정</span>)}
        {action}
      </div>
      <table className="w-full text-[15px] border-t border-b border-ink">
        <thead><tr className="text-left text-sm text-ink-2 border-b border-line"><th className="py-1.5 w-32 font-normal">라인</th><th className="py-1.5 w-44 font-normal">제품</th><th className="py-1.5 font-normal">근무자</th></tr></thead>
        <tbody>
          {b.posts.map((p) => {
            const names = byPost.get(p.id) ?? [];
            const vacant = isVacantPost(p, names.length);
            return (
              <tr key={p.id} className={`border-b border-line-2 ${vacant ? 'bg-vac-bg' : p.kind !== 'machine' ? 'bg-ground/60' : ''}`}>
                <td className="py-1.5 font-bold">{p.code}{p.stopped ? <span className="ml-1 text-[12px] font-normal">부동</span> : null}</td>
                <td className={`py-1.5 ${p.stopped ? 'line-through text-ink-3' : ''}`}>{p.product ?? ''}</td>
                <td className="py-1.5">{names.join(' · ')}{vacant && <span className="text-vac font-semibold">비어 있음</span>}{p.unmanned && names.length === 0 ? <span className="text-ink-3 text-[13px]">자동 운전</span> : null}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="mt-3 text-[13px] flex flex-col gap-1">
        <div><span className="text-ink-3 mr-2">비고</span>{b.note ?? ''}</div>
        {att.length > 0 && <div><span className="text-ink-3 mr-2">근태</span>{att.map((a) => `${a.name} ${a.kind}`).join(' · ')}</div>}
      </div>
    </div>
  );
}
