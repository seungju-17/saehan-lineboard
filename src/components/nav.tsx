'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useSession } from '@/lib/use-session';
import { CAN } from '@/lib/rules';
import { LOGO } from '@/lib/logo';
import { toggleRail, useRailWide } from '@/lib/rail-state';

/** 시프티식 틀: 위에 흰 막대(≡, 로고, 이름·역할, 근무자 화면, 나가기), 왼쪽에 진한 남색 아이콘 띠. ≡ 로 띠를 넓히거나 좁힌다. */
const ITEMS: { href: string; label: string; icon: React.ReactNode }[] = [
  { href: '/today', label: '오늘 배치', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></svg> },
  { href: '/dashboard', label: '현황', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg> },
  { href: '/requests', label: '대체 요청', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h13l-3-3M20 17H7l3 3" /></svg> },
  { href: '/inbox', label: '알림', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21h4" /></svg> },
  { href: '/people', label: '직원', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4.5-6.2" /></svg> },
  { href: '/settings', label: '설정', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg> },
];

function usePending(path: string): number {
  const [pending, setPending] = useState(0);
  useEffect(() => {
    let alive = true;
    const tick = async (): Promise<void> => { try { const j = await (await fetch('/api/leaves')).json() as { pending?: unknown[] }; if (alive) setPending(j.pending?.length ?? 0); } catch { /* 무시 */ } };
    tick(); const t = setInterval(tick, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, [path]);
  return pending;
}

/** 위 흰 막대 */
export function TopBar(): React.ReactElement {
  const router = useRouter();
  const s = useSession();
  async function logout(): Promise<void> { await fetch('/api/login', { method: 'DELETE' }); router.push('/login'); router.refresh(); }
  return (
    <header className="print:hidden bg-white border-b border-line h-14 flex items-center gap-3 px-3 sm:px-4 sticky top-0 z-30">
      <button onClick={toggleRail} aria-label="메뉴 넓히기/좁히기" className="hidden lg:inline-flex h-9 w-9 items-center justify-center rounded-md text-ink-2 hover:bg-ground"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg></button>
      <Link href="/today" className="flex items-center"><img src={LOGO} alt="새한프라텍" className="h-6 w-auto" /></Link>
      <span className="hidden sm:inline text-xs text-ink-3 pl-3 border-l border-line">인원 배치 · 지원팀</span>
      <span className="ml-auto flex items-center gap-2 text-sm">
        {s?.kind === 'admin' && <span className="hidden sm:inline text-ink-2 mr-1"><b className="text-ink">{s.name}</b> <span className="text-ink-3">· {s.role}</span></span>}
        <Link href="/login?who=worker" className="h-9 px-3 inline-flex items-center gap-1.5 rounded-md border border-line text-ink-2 hover:border-brand hover:text-brand"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="7" y="2" width="10" height="20" rx="2" /><path d="M11 18h2" /></svg>근무자 화면</Link>
        <button onClick={logout} className="h-9 px-3 rounded-md text-ink-2 hover:bg-ground">나가기</button>
      </span>
    </header>
  );
}

/** 왼쪽 남색 아이콘 띠 (좁은 화면에서는 위 가로 메뉴) */
export function Nav(): React.ReactElement {
  const path = usePathname();
  const s = useSession();
  const role = s?.kind === 'admin' ? s.role : undefined;
  const wide = useRailWide();
  const shown = ITEMS.filter((it) => CAN.manage(role) || (it.href !== '/people' && it.href !== '/settings'));
  const pending = usePending(path);
  return (
    <aside className={`print:hidden bg-rail text-white lg:shrink-0 lg:min-h-[calc(100vh-3.5rem)] lg:sticky lg:top-14 lg:self-start ${wide ? 'lg:w-[200px]' : 'lg:w-[72px]'}`}>
      <nav aria-label="주 메뉴" className="flex lg:flex-col gap-0.5 lg:gap-1 px-2 lg:py-3 h-12 lg:h-auto items-center lg:items-stretch overflow-x-auto whitespace-nowrap">
        {shown.map((it) => {
          const on = path.startsWith(it.href);
          return (
            <Link key={it.href} href={it.href} aria-current={on ? 'page' : undefined} title={wide ? undefined : it.label}
              className={`relative flex items-center gap-3 h-10 lg:h-12 px-3 rounded-lg text-[13px] lg:text-[14px] shrink-0 ${wide ? '' : 'lg:flex-col lg:gap-0.5 lg:justify-center lg:px-1'} ${on ? 'bg-white/15 text-white font-bold' : 'text-white/75 hover:bg-white/10 hover:text-white'}`}>
              <span className={on ? 'text-white' : 'text-white/75'}>{it.icon}</span>
              <span className={wide ? '' : 'lg:text-[10px] lg:leading-3'}>{it.label}</span>
              {it.href === '/inbox' && pending > 0 && <span className={`min-w-[18px] h-[18px] px-1 rounded-full bg-vac text-white text-[11px] font-bold leading-[18px] text-center ${wide ? 'ml-auto' : 'lg:absolute lg:top-1 lg:right-2'}`}>{pending}</span>}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
