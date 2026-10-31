export default function PublicLayout({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <main className="min-h-screen bg-ground">
      <div className="mx-auto max-w-md min-h-screen bg-white px-5 py-6 flex flex-col gap-6">
        <div className="flex items-center gap-2 text-ink-3">
          <span className="grid grid-cols-2 gap-0.5 w-3.5 h-3.5" aria-hidden><i className="bg-brand rounded-[1px]" /><i className="bg-brand/40 rounded-[1px]" /><i className="bg-brand/40 rounded-[1px]" /><i className="bg-brand rounded-[1px]" /></span>
          <span className="text-sm font-semibold text-ink">새한프라텍</span>
          <span className="text-xs">근무자 화면</span>
        </div>
        {children}
      </div>
    </main>
  );
}
