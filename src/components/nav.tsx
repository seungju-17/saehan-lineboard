'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useSession } from '@/lib/use-session';
import { CAN } from '@/lib/rules';
import { useEffect, useState } from 'react';
import { LOGO_WHITE } from '@/lib/logo';

/** 왼쪽 세로 메뉴(시프티처럼 진한 남회색 띠 + 선 아이콘). 좁은 화면에서는 위 가로 메뉴. 역할(팀장·담당자·반장)에 따라 직원·설정은 숨긴다. */
const ITEMS: { href: string; label: string; icon: React.ReactNode }[] = [
  { href: '/today', label: '오늘 배치', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></svg> },
  { href: '/dashboard', label: '현황', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg> },
  { href: '/requests', label: '대체 요청', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h13l-3-3M20 17H7l3 3" /></svg> },
  { href: '/inbox', label: '알림', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21h4" /></svg> },
  { href: '/people', label: '직원', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4.5-6.2" /></svg> },
  { href: '/settings', label: '설정', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg> },
];

export function Nav(): React.ReactElement {
  const path = usePathname();
  const router = useRouter();
  const s = useSession();
  const role = s?.kind === 'admin' ? s.role : undefined;
  async function logout(): Promise<void> { await fetch('/api/login', { method: 'DELETE' }); router.push('/login'); router.refresh(); }
  const shown = ITEMS.filter((it) => CAN.manage(role) || (it.href !== '/people' && it.href !== '/settings'));
  const [pending, setPending] = useState(0);
  useEffect(() => {
    let alive = true;
    const tick = async (): Promise<void> => { try { const j = await (await fetch('/api/leaves')).json() as { pending?: unknown[] }; if (alive) setPending(j.pending?.length ?? 0); } catch { /* 무시 */ } };
    tick(); const t = setInterval(tick, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, [path]);
  return (
    <aside className="print:hidden bg-rail text-white lg:w-[220px] lg:shrink-0 lg:min-h-screen lg:sticky lg:top-0 lg:self-start flex lg:flex-col">
      <div className="hidden lg:flex items-center px-5 h-16 border-b border-white/10">
        <Link href="/today" className="flex items-center"><img src={LOGO_WHITE} alt="새한프라텍" className="h-7 w-auto" /></Link>
      </div>
      <nav aria-label="주 메뉴" className="flex lg:flex-col gap-0.5 lg:gap-1 px-2 lg:px-3 lg:py-4 h-14 lg:h-auto items-center lg:items-stretch overflow-x-auto whitespace-nowrap flex-1">
        <Link href="/today" className="lg:hidden flex items-center pr-3 mr-1 border-r border-white/15 shrink-0"><img src={LOGO_WHITE} alt="새한프라텍" className="h-[18px] w-auto" /></Link>
        {shown.map((it) => {
          const on = path.startsWith(it.href);
          return (
            <Link key={it.href} href={it.href} aria-current={on ? 'page' : undefined}
              className={`flex items-center gap-2.5 h-10 lg:h-11 px-3 rounded-lg text-[14px] lg:text-[15px] shrink-0 ${on ? 'bg-white/15 text-white font-bold' : 'text-white/75 hover:bg-white/10 hover:text-white'}`}>
              <span className={on ? 'text-white' : 'text-white/70'}>{it.icon}</span>{it.label}{it.href === '/inbox' && pending > 0 && <span className="ml-auto min-w-5 h-5 px-1.5 rounded-full bg-vac text-white text-[11px] font-bold leading-5 text-center">{pending}</span>}
            </Link>
          );
        })}
      </nav>
      <div className="flex items-center gap-2 px-3 lg:px-4 lg:py-4 lg:border-t lg:border-white/10 text-[13px] shrink-0">
        {s?.kind === 'admin' && <span className="hidden sm:inline text-white/70 lg:flex-1 truncate"><b className="text-white">{s.name}</b> <span className="text-white/50">· {s.role}</span></span>}
        <button onClick={logout} className="h-8 px-2.5 rounded-md text-white/70 hover:bg-white/10 hover:text-white">나가기</button>
      </div>
    </aside>
  );
}
