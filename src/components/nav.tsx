'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const items = [['/today', '오늘'], ['/requests', '요청'], ['/people', '사람']] as const;

export function Nav(): React.ReactElement {
  const path = usePathname();
  const router = useRouter();
  async function logout(): Promise<void> { await fetch('/api/login', { method: 'DELETE' }); router.push('/login'); }
  return (
    <header className="h-13 border-b border-line print:hidden">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 h-13 flex items-center gap-6">
        <span className="font-bold tracking-tight">라인보드</span>
        <nav className="flex gap-1">
          {items.map(([href, label]) => (
            <Link key={href} href={href} className={`px-3 h-9 inline-flex items-center rounded-md text-[15px] ${path.startsWith(href) ? 'bg-ground font-semibold' : 'text-ink-2 hover:text-ink'}`}>{label}</Link>
          ))}
        </nav>
        <button onClick={logout} className="ml-auto text-sm text-ink-3 hover:text-ink">나가기</button>
      </div>
    </header>
  );
}
