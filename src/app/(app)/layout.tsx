import { Nav, TopBar } from '@/components/nav';
import { Assistant } from '@/components/assistant';

export default function AppLayout({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div className="min-h-screen lb-sky flex flex-col">
      <TopBar />
      <div className="flex-1 lg:flex">
        <Nav />
        <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-5 sm:py-6 pb-24 max-w-[1280px]">{children}</main>
      </div>
      <Assistant />
    </div>
  );
}
