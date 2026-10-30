import { factoryName, getSettings, requestByToken } from '@/lib/repo';
import { fmtKo, SHIFT_HOURS } from '@/lib/shift';
import { Respond } from './respond';

export const dynamic = 'force-dynamic';
export default async function RespondPage({ params }: { params: Promise<{ token: string }> }): Promise<React.ReactElement> {
  const { token } = await params;
  const r = requestByToken(token);
  if (!r) return <p className="text-ink-2">요청을 찾을 수 없습니다.</p>;
  return (
    <div className="flex flex-col gap-6">
      <p className="text-ink-2">{r.name}님, 대체 근무 부탁드려도 될까요?</p>
      <div>
        <div className="text-3xl font-bold leading-tight">{fmtKo(r.date)}</div>
        <div className="text-3xl font-bold leading-tight">{r.shift} <span className="text-ink-3 text-xl font-medium">{SHIFT_HOURS[r.shift]}</span></div>
      </div>
      <dl className="grid grid-cols-[4rem_1fr] gap-y-2 text-lg">
        <dt className="text-ink-3">공장</dt><dd className="font-medium">{factoryName(r.factory_id)}</dd>
        <dt className="text-ink-3">라인</dt><dd className="font-medium">{r.post_name}</dd>
        <dt className="text-ink-3">제품</dt><dd className="font-medium">{r.product ?? '—'}</dd>
      </dl>
      {r.status === '발송' ? <Respond token={token} minutes={getSettings().expiry_minutes} /> : <div className="text-lg font-semibold">{r.status === '수락' ? '수락했습니다.' : r.status === '거절' ? '거절로 처리되었습니다.' : '마감된 요청입니다.'}</div>}
    </div>
  );
}
