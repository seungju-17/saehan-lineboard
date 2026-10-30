/* next/link, next/navigation 대용. 주소는 #today, #requests, #people, #r-<토큰>, #me-<토큰>, #print 로 다닌다. */
import { useSyncExternalStore } from 'react';

const subs = new Set<() => void>();
if (typeof window !== 'undefined') window.addEventListener('hashchange', () => subs.forEach((f) => f()));
const sub = (f: () => void): (() => void) => { subs.add(f); return () => subs.delete(f); };

export function toHash(path: string): string {
  const p = path.split('?')[0].replace(/^\//, '');
  if (p.startsWith('r/')) return 'r-' + p.slice(2);
  if (p.startsWith('me/')) return 'me-' + p.slice(3);
  return p || 'today';
}
export function currentPath(): string {
  const h = (typeof location !== 'undefined' ? location.hash : '').replace(/^#/, '');
  if (!h) return '/today';
  if (h.startsWith('r-')) return '/r/' + h.slice(2);
  if (h.startsWith('me-')) return '/me/' + h.slice(3);
  return '/' + h;
}
export function navigate(path: string): void { location.hash = toHash(path); }
export function usePathname(): string { return useSyncExternalStore(sub, currentPath, () => '/today'); }
export function useRouter(): { push: (p: string) => void; refresh: () => void } { return { push: navigate, refresh: () => undefined }; }
export function useSearchParams(): URLSearchParams { return new URLSearchParams(); }

export default function Link({ href, children, className, ...rest }: { href: string; children: React.ReactNode; className?: string } & Record<string, unknown>): React.ReactElement {
  return <a href={href} className={className} onClick={(e) => { e.preventDefault(); navigate(href); }} {...rest}>{children}</a>;
}
