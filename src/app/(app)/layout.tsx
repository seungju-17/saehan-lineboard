import { Nav } from '@/components/nav';
import { Assistant } from '@/components/assistant';

export default function AppLayout({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div className="min-h-screen lb-sky">
      <Nav />
      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-6 sm:py-8 pb-24">{children}</main>
      <Assistant />
    </div>
  );
}
