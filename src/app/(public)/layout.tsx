export default function PublicLayout({ children }: { children: React.ReactNode }): React.ReactElement {
  return <main className="min-h-screen bg-ground"><div className="mx-auto max-w-md min-h-screen bg-white px-5 py-6">{children}</div></main>;
}
