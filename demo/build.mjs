/* 브라우저 한 장 판 빌드: node demo/build.mjs [out.html]
   실제 앱 코드 + sql.js(WASM) + 시드 DB를 한 HTML에 넣는다. 서버 없이 열린다. */
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const abs = (p) => path.join(ROOT, p);
const out = process.argv[2] ?? abs('demo/dist/lineboard.html');

const js = await build({
  entryPoints: [abs('demo/main.tsx')], bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2020', minify: true,
  jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' }, tsconfig: abs('tsconfig.json'),
  alias: { 'next/link': abs('demo/next-shim.tsx'), 'next/navigation': abs('demo/next-shim.tsx') },
  plugins: [{ name: 'shims', setup(b) {
    b.onResolve({ filter: /^\.\/db$/ }, (a) => (a.importer.includes(path.join('src', 'lib')) ? { path: abs('demo/db-shim.ts') } : undefined));
    b.onResolve({ filter: /^node:crypto$/ }, () => ({ path: abs('demo/crypto-shim.ts') }));
  } }],
});
const bundle = js.outputFiles[0].text;

fs.mkdirSync(abs('demo/dist'), { recursive: true });
execSync(`npx @tailwindcss/cli -i demo/demo.css -o demo/dist/demo.css --minify`, { cwd: ROOT, stdio: 'inherit' });
const css = fs.readFileSync(abs('demo/dist/demo.css'), 'utf8');
const sqljs = fs.readFileSync(abs('node_modules/sql.js/dist/sql-wasm.js'), 'utf8');
const wasm = fs.readFileSync(abs('node_modules/sql.js/dist/sql-wasm.wasm')).toString('base64');
const db = fs.readFileSync(process.env.LINEBOARD_DB ?? abs('data/lineboard.db')).toString('base64');

const html = `<title>라인보드</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&display=swap">
<style>${css}</style>
<div id="root"></div>
<script>${sqljs}</script>
<script>window.__LB_WASM=${JSON.stringify(wasm)};window.__LB_DB=${JSON.stringify(db)};</script>
<script>${bundle}</script>
`;
fs.writeFileSync(out, html);
console.log('wrote', out, (fs.statSync(out).size / 1024 / 1024).toFixed(2) + 'MB');
