import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS factories (id INTEGER PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, sort INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY, factory_id INTEGER NOT NULL REFERENCES factories(id), code TEXT NOT NULL, name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('machine','support','op','leader','etc')), sort INTEGER DEFAULT 0, active INTEGER DEFAULT 1,
  zone TEXT NOT NULL DEFAULT '', unmanned INTEGER DEFAULT 0, fixed INTEGER DEFAULT 0,
  UNIQUE (factory_id, code));
CREATE TABLE IF NOT EXISTS people (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, affiliation TEXT DEFAULT '새한', grp TEXT NOT NULL DEFAULT '미정',
  work_type TEXT NOT NULL DEFAULT '교대' CHECK (work_type IN ('교대','주간고정','임시')), role TEXT DEFAULT '미정', gender TEXT, phone TEXT,
  home_factory_id INTEGER REFERENCES factories(id), active INTEGER DEFAULT 1, token TEXT UNIQUE, created_at TEXT DEFAULT (datetime('now','localtime')),
  unit TEXT NOT NULL DEFAULT '임시');
CREATE INDEX IF NOT EXISTS idx_people_name ON people(name);
CREATE TABLE IF NOT EXISTS boards (
  id INTEGER PRIMARY KEY, date TEXT NOT NULL, shift TEXT NOT NULL CHECK (shift IN ('주간','야간')), factory_id INTEGER NOT NULL REFERENCES factories(id),
  status TEXT NOT NULL DEFAULT '초안' CHECK (status IN ('초안','입안','확정')), confirmed_at TEXT, copied_from TEXT, note TEXT, UNIQUE (date, shift, factory_id));
CREATE TABLE IF NOT EXISTS board_posts (
  board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE, post_id INTEGER NOT NULL REFERENCES posts(id),
  product TEXT, vacant INTEGER DEFAULT 0, stopped INTEGER DEFAULT 0, PRIMARY KEY (board_id, post_id));
CREATE TABLE IF NOT EXISTS assignments (
  id INTEGER PRIMARY KEY, board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE, post_id INTEGER NOT NULL REFERENCES posts(id),
  person_id INTEGER NOT NULL REFERENCES people(id), source TEXT NOT NULL DEFAULT '수동' CHECK (source IN ('이력','복사','수동','대체','자동')),
  UNIQUE (board_id, post_id, person_id));
CREATE INDEX IF NOT EXISTS idx_assign_person ON assignments(person_id);
CREATE INDEX IF NOT EXISTS idx_assign_board ON assignments(board_id);
CREATE TABLE IF NOT EXISTS logs (id INTEGER PRIMARY KEY, board_id INTEGER REFERENCES boards(id) ON DELETE CASCADE, post_id INTEGER, person_id INTEGER,
  action TEXT NOT NULL, detail TEXT, at TEXT DEFAULT (datetime('now','localtime')));
CREATE TABLE IF NOT EXISTS requests (
  id INTEGER PRIMARY KEY, board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE, post_id INTEGER NOT NULL REFERENCES posts(id),
  person_id INTEGER NOT NULL REFERENCES people(id), vacated_person_id INTEGER REFERENCES people(id), rank INTEGER NOT NULL, reason TEXT,
  status TEXT NOT NULL DEFAULT '발송' CHECK (status IN ('발송','수락','거절','만료','취소')), token TEXT NOT NULL UNIQUE, channel TEXT NOT NULL DEFAULT '데모',
  sent_at TEXT DEFAULT (datetime('now','localtime')), expires_at TEXT, responded_at TEXT);
CREATE INDEX IF NOT EXISTS idx_req_board ON requests(board_id, post_id);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY, person_id INTEGER NOT NULL REFERENCES people(id), kind TEXT NOT NULL CHECK (kind IN ('배치','변경','요청')),
  body TEXT NOT NULL, link TEXT, channel TEXT NOT NULL DEFAULT '데모', sent_at TEXT DEFAULT (datetime('now','localtime')), read_at TEXT);
CREATE INDEX IF NOT EXISTS idx_msg_person ON messages(person_id, sent_at);
CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER PRIMARY KEY, date TEXT NOT NULL, shift TEXT NOT NULL CHECK (shift IN ('주간','야간')), person_id INTEGER NOT NULL REFERENCES people(id),
  kind TEXT NOT NULL CHECK (kind IN ('결근','연차','반차','지각','조퇴','병가','교육')), note TEXT, at TEXT DEFAULT (datetime('now','localtime')),
  UNIQUE (date, shift, person_id));
CREATE INDEX IF NOT EXISTS idx_att_person ON attendance(person_id, date);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

export type DB = Database.Database;
let cached: DB | null = null;

export function openDb(file: string): DB {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const d = new Database(file);
  d.pragma('journal_mode = WAL');
  d.pragma('foreign_keys = ON');
  d.exec(SCHEMA);
  return d;
}
export function getDb(): DB {
  if (!cached) cached = openDb(process.env.LINEBOARD_DB ?? path.join(process.cwd(), 'data', 'lineboard.db'));
  return cached;
}
