/* 브라우저 판: better-sqlite3 대신 sql.js(WASM). repo.ts가 쓰는 prepare().get/all/run 만 맞춘다. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SqlDb = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DB = any;
let raw: SqlDb | null = null;
export function setDb(d: SqlDb): void { raw = d; d.run('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)'); try { d.run('ALTER TABLE board_posts ADD COLUMN need INTEGER'); } catch { /* 이미 있음 */ } try { d.run('ALTER TABLE boards ADD COLUMN return_note TEXT'); } catch { /* 이미 있음 */ } d.run("CREATE TABLE IF NOT EXISTS leave_requests (id INTEGER PRIMARY KEY, person_id INTEGER NOT NULL, date TEXT NOT NULL, shift TEXT NOT NULL, kind TEXT NOT NULL, note TEXT, status TEXT NOT NULL DEFAULT '신청', reply TEXT, decided_by TEXT, created_at TEXT DEFAULT (datetime('now','localtime')), decided_at TEXT)"); try { const sql = d.exec("SELECT sql FROM sqlite_master WHERE name='messages'")[0]?.values[0]?.[0] as string; if (sql && !sql.includes("'근태'")) d.run("ALTER TABLE messages RENAME TO messages_old; CREATE TABLE messages (id INTEGER PRIMARY KEY, person_id INTEGER NOT NULL, kind TEXT NOT NULL, body TEXT NOT NULL, link TEXT, channel TEXT NOT NULL DEFAULT '데모', sent_at TEXT DEFAULT (datetime('now','localtime')), read_at TEXT); INSERT INTO messages SELECT * FROM messages_old; DROP TABLE messages_old;"); } catch { /* 그대로 */ } d.run("CREATE TABLE IF NOT EXISTS accounts (id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL, factory_id INTEGER, password_hash TEXT NOT NULL, active INTEGER DEFAULT 1)"); }
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
