import { createRoot } from 'react-dom/client';
import { App, setPrintParams } from './app';
import { setDb } from './db-shim';
import { installFetch } from './api';
import { navigate } from './next-shim';

declare global { interface Window { initSqlJs: (c: { wasmBinary: Uint8Array }) => Promise<{ Database: new (d: Uint8Array) => unknown }>; __LB_WASM: string; __LB_DB: string } }

function b64(s: string): Uint8Array { const bin = atob(s); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; }

function toast(msg: string): void {
  const el = document.createElement('div');
  el.className = 'fixed bottom-6 left-1/2 -translate-x-1/2 bg-brand text-white text-sm px-4 py-2.5 rounded-lg shadow-lg z-50';
  el.textContent = msg; document.body.appendChild(el); setTimeout(() => el.remove(), 2500);
}

document.addEventListener('click', (e) => {
  const a = (e.target as Element).closest?.('a');
  if (!a) return;
  const href = a.getAttribute('href') ?? '';
  if (!href.startsWith('/')) return;
  e.preventDefault();
  if (href.startsWith('/api/board/export') || href.startsWith('/api/attendance/export')) { toast('엑셀 저장은 설치판에서 동작합니다'); return; }
  if (href.startsWith('/print')) setPrintParams(new URLSearchParams(href.split('?')[1] ?? ''));
  navigate(href);
});

async function start(): Promise<void> {
  const root = document.getElementById('root')!;
  root.innerHTML = '<div style="padding:48px;text-align:center;color:#8a93a3">불러오는 중</div>';
  const SQL = await window.initSqlJs({ wasmBinary: b64(window.__LB_WASM) });
  setDb(new SQL.Database(b64(window.__LB_DB)));
  installFetch();
  root.innerHTML = '';
  createRoot(root).render(<App />);
}
start().catch((e) => { document.getElementById('root')!.textContent = '시작하지 못했습니다: ' + (e as Error).message; });
