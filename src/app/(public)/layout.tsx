import { LOGO } from '@/lib/logo';

export default function PublicLayout({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <main className="min-h-screen bg-ground">
      <div className="mx-auto max-w-md min-h-screen bg-white px-5 py-6 flex flex-col gap-6">
        <div className="flex items-center gap-2.5 text-ink-3">
          <img src={LOGO} alt="새한프라텍" className="h-[18px] w-auto" />
          <span className="text-xs">근무자 화면</span>
        </div>
        {children}
      </div>
    </main>
  );
}
