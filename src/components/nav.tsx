'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const items = [['/today', '오늘 배치'], ['/dashboard', '현황'], ['/requests', '대체 요청'], ['/people', '직원'], ['/settings', '설정']] as const;

export function Nav(): React.ReactElement {
  const path = usePathname();
  const router = useRouter();
  async function logout(): Promise<void> { await fetch('/api/login', { method: 'DELETE' }); router.push('/login'); }
  return (
    <header className="bg-brand text-white print:hidden">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 h-14 flex items-center gap-4 sm:gap-8 whitespace-nowrap overflow-x-auto">
        <Link href="/today" className="flex items-center gap-2.5">
          <span className="grid grid-cols-2 gap-0.5 w-4 h-4" aria-hidden><i className="bg-white rounded-[1px]" /><i className="bg-white/50 rounded-[1px]" /><i className="bg-white/50 rounded-[1px]" /><i className="bg-white rounded-[1px]" /></span>
          <span className="font-bold text-[17px] tracking-tight">라인보드</span>
          <span className="hidden sm:inline text-xs text-white/55 pl-2 border-l border-white/20">새한프라텍 지원팀</span>
        </Link>
        <nav className="flex gap-0 sm:gap-1 -ml-3 shrink-0">
          {items.map(([href, label]) => {
            const on = path.startsWith(href);
            return <Link key={href} href={href} className={`relative px-2.5 sm:px-3 h-14 inline-flex items-center text-[14px] sm:text-[15px] ${on ? 'text-white font-semibold' : 'text-white/65 hover:text-white'}`}>{label}{on && <span className="absolute left-3 right-3 bottom-0 h-0.5 bg-white rounded-t" />}</Link>;
          })}
        </nav>
        <button onClick={logout} className="ml-auto shrink-0 text-sm text-white/65 hover:text-white">나가기</button>
      </div>
    </header>
  );
}
