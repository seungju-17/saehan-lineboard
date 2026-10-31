import { Nav } from '@/components/nav';
import { Assistant } from '@/components/assistant';

export default function AppLayout({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div className="min-h-screen lb-sky lg:flex">
      <Nav />
      <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-10 py-6 sm:py-8 pb-24 max-w-[1240px]">{children}</main>
      <Assistant />
    </div>
  );
}
