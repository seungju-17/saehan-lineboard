'use client';
export function PrintButton(): React.ReactElement {
  return <button onClick={() => window.print()} className="h-10 px-4 rounded-md bg-ink text-white font-semibold print:hidden">인쇄</button>;
}
