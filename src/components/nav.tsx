'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useSession } from '@/lib/use-session';
import { CAN } from '@/lib/rules';

const items = [['/today', '오늘 배치'], ['/dashboard', '현황'], ['/requests', '대체 요청'], ['/people', '직원'], ['/settings', '설정']] as const;

/** 관리자 화면 위 메뉴. 역할(팀장·담당자·반장)에 따라 직원·설정은 숨긴다. */
export function Nav(): React.ReactElement {
  const path = usePathname();
  const router = useRouter();
  const s = useSession();
  const role = s?.kind === 'admin' ? s.role : undefined;
  async function logout(): Promise<void> { await fetch('/api/login', { method: 'DELETE' }); router.push('/login'); router.refresh(); }
  const shown = items.filter(([href]) => CAN.manage(role) || (href !== '/people' && href !== '/settings'));
  return (
    <header className="bg-white border-b border-line print:hidden">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 h-14 flex items-center gap-4 sm:gap-8 whitespace-nowrap overflow-x-auto">
        <Link href="/today" className="flex items-center gap-2.5">
          <span className="grid grid-cols-2 gap-0.5 w-4 h-4" aria-hidden><i className="bg-brand rounded-[1px]" /><i className="bg-brand/40 rounded-[1px]" /><i className="bg-brand/40 rounded-[1px]" /><i className="bg-brand rounded-[1px]" /></span>
          <span className="font-extrabold text-[18px] tracking-tight text-ink">새한프라텍</span>
          <span className="hidden sm:inline text-xs text-ink-3 pl-2 border-l border-line">인원 배치 · 지원팀</span>
        </Link>
        <nav className="flex gap-0 sm:gap-1 -ml-3 shrink-0">
          {shown.map(([href, label]) => {
            const on = path.startsWith(href);
            return <Link key={href} href={href} className={`relative px-2.5 sm:px-3 h-14 inline-flex items-center text-[14px] sm:text-[15px] font-medium ${on ? 'text-brand font-bold' : 'text-ink-2 hover:text-ink'}`}>{label}{on && <span className="absolute left-3 right-3 bottom-0 h-[3px] bg-brand rounded-t" />}</Link>;
          })}
        </nav>
        <span className="ml-auto shrink-0 flex items-center gap-3 text-sm">
          {s?.kind === 'admin' && <span className="text-ink-2"><b className="text-ink">{s.name}</b> <span className="text-ink-3">· {s.role}</span></span>}
          <button onClick={logout} className="h-9 px-3 rounded-lg border border-line text-ink-2 hover:border-brand hover:text-brand">나가기</button>
        </span>
      </div>
    </header>
  );
}
