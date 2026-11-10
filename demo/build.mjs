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
// 체험판의 「오늘」: 2025년 자료를 날짜 그대로 쓰므로 자료가 끝난 다음 날을 오늘로 본다. 그 이후 표는 넣지 않는다.
/** 외부 챗봇 위젯(지원봇): src/lib/chat-widget.json 의 값으로 script 태그를 만든다 */
function chatWidgetTag() {
  const cfg = JSON.parse(fs.readFileSync(abs('src/lib/chat-widget.json'), 'utf8'));
  if (!cfg.src) return '';
  const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  return `\n<script src="${esc(cfg.src)}" data-slug="${esc(cfg.slug)}" data-title="${esc(cfg.title)}" defer></script>`;
}
const DEMO_TODAY = process.env.DEMO_TODAY ?? '2026-11-10'; // 화요일, C조 주간·B조 야간·A조 휴무
const DEMO_PLAN = process.env.DEMO_PLAN ?? '2026-11-30'; // 2026년 11월 예시 월 근무표를 받아 둔 표(초안)로 넣는다
let dbFile = process.env.LINEBOARD_DB;
if (!dbFile) { dbFile = abs('demo/dist/demo.db'); execSync(`npx tsx scripts/seed.ts ${DEMO_TODAY} ${DEMO_PLAN}`, { cwd: ROOT, stdio: 'inherit', env: { ...process.env, LINEBOARD_DB: dbFile } }); }
const db = fs.readFileSync(dbFile).toString('base64');

const html = `<title>새한프라텍 인원 배치</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&display=swap">
<style>${css}</style>
<div id="root"></div>
<script>${sqljs}</script>
<script>window.__LB_WASM=${JSON.stringify(wasm)};window.__LB_DB=${JSON.stringify(db)};window.__LB_TODAY=${JSON.stringify(DEMO_TODAY)};</script>
<script>${bundle}</script>
`;
fs.writeFileSync(out, html);
console.log('wrote', out, (fs.statSync(out).size / 1024 / 1024).toFixed(2) + 'MB');

// GitHub Pages용 완전한 문서 (docs/index.html)
const pages = `<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<meta name="description" content="새한프라텍 인원 배치·결원 대체 (브라우저 판)">\n`
  + html.replace('<title>새한프라텍 인원 배치</title>', '<title>새한프라텍 인원 배치 (체험판)</title>')
        .replace('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&display=swap">', '<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">')
        .replace('<div id="root"></div>', '</head>\n<body>\n<div id="root"></div>')
  + chatWidgetTag() + '\n</body>\n</html>\n';
fs.mkdirSync(abs('docs'), { recursive: true });
fs.writeFileSync(abs('docs/index.html'), pages);
fs.writeFileSync(abs('docs/.nojekyll'), '');
console.log('wrote docs/index.html (GitHub Pages)');
