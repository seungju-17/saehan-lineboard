/* 브라우저 판: better-sqlite3 대신 sql.js(WASM). repo.ts가 쓰는 prepare().get/all/run 만 맞춘다. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SqlDb = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DB = any;
let raw: SqlDb | null = null;
export function setDb(d: SqlDb): void { raw = d; d.run('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)'); try { d.run('ALTER TABLE board_posts ADD COLUMN need INTEGER'); } catch { /* 이미 있음 */ } d.run("CREATE TABLE IF NOT EXISTS accounts (id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL, factory_id INTEGER, password_hash TEXT NOT NULL, active INTEGER DEFAULT 1)"); }
export function rawDb(): SqlDb { return raw; }
const norm = (p: unknown[]): unknown[] => p.map((v) => (v === undefined ? null : v));

export function getDb(): DB {
  if (!raw) throw new Error('db not ready');
  const d = raw;
  return {
    prepare(sql: string) {
      return {
        get(...p: unknown[]) { const s = d.prepare(sql); try { s.bind(norm(p)); return s.step() ? s.getAsObject() : undefined; } finally { s.free(); } },
        all(...p: unknown[]) { const s = d.prepare(sql); const out: unknown[] = []; try { s.bind(norm(p)); while (s.step()) out.push(s.getAsObject()); } finally { s.free(); } return out; },
        run(...p: unknown[]) { d.run(sql, norm(p)); const r = d.exec('SELECT last_insert_rowid() AS id'); return { lastInsertRowid: Number(r[0]?.values[0]?.[0] ?? 0), changes: d.getRowsModified() }; },
      };
    },
  };
}
export function openDb(): DB { return getDb(); }
