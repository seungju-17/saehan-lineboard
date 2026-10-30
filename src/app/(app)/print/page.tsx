import { factoryName, getBoard } from '@/lib/repo';
import { fmtKo, SHIFT_HOURS, type Shift } from '@/lib/shift';
import { PrintButton } from './print-button';

export const dynamic = 'force-dynamic';

export default async function PrintPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }): Promise<React.ReactElement> {
  const sp = await searchParams;
  const date = sp.date ?? '', shift = (sp.shift ?? '주간') as Shift, factory = Number(sp.factory ?? 1);
  if (!date) return <p className="text-ink-2">날짜가 없습니다.</p>;
  const b = getBoard(date, shift, factory);
  const byPost = new Map<number, string[]>();
  for (const a of b.assignments) byPost.set(a.post_id, [...(byPost.get(a.post_id) ?? []), a.name]);
  return (
    <div className="mx-auto max-w-3xl print:max-w-none">
      <div className="flex items-end justify-between mb-4 print:mb-3">
        <div>
          <div className="text-2xl font-bold">{factoryName(factory)} 배치표</div>
          <div className="text-ink-2">{fmtKo(date)} · {shift} {SHIFT_HOURS[shift]}{b.status === '확정' && <span className="ml-2 text-ok font-semibold">확정</span>}</div>
        </div>
        <PrintButton />
      </div>
      <table className="w-full text-[15px] border-t border-b border-ink">
        <thead><tr className="text-left text-sm text-ink-2 border-b border-line"><th className="py-1.5 w-32 font-normal">라인</th><th className="py-1.5 w-44 font-normal">제품</th><th className="py-1.5 font-normal">근무자</th></tr></thead>
        <tbody>
          {b.posts.map((p) => {
            const names = byPost.get(p.id) ?? [];
            const vacant = names.length === 0 && (p.vacant === 1 || (p.kind === 'machine' && !!p.product));
            return (
              <tr key={p.id} className={`border-b border-line-2 ${vacant ? 'bg-vac-bg' : p.kind !== 'machine' ? 'bg-ground/60' : ''}`}>
                <td className="py-1.5 font-bold">{p.code}</td>
                <td className="py-1.5">{p.product ?? ''}</td>
                <td className="py-1.5">{names.join(' · ')}{vacant && <span className="text-vac font-semibold">비어 있음</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
