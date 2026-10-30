import { factoryName, getBoard } from '@/lib/repo';
import type { Shift } from '@/lib/shift';
import { PrintBoard } from '@/components/print-board';
import { PrintButton } from './print-button';

export const dynamic = 'force-dynamic';

export default async function PrintPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }): Promise<React.ReactElement> {
  const sp = await searchParams;
  const date = sp.date ?? '', shift = (sp.shift ?? '주간') as Shift, factory = Number(sp.factory ?? 1);
  if (!date) return <p className="text-ink-2">날짜가 없습니다.</p>;
  const b = getBoard(date, shift, factory);
  return <PrintBoard b={b} factoryName={factoryName(factory)} action={<PrintButton />} />;
}
