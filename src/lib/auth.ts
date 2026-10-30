import crypto from 'node:crypto';

/** 관리자(팀장·담당자·반장) 세션과 근무자 세션. 쿠키에는 서명된 내용만 담고 비밀번호는 담지 않는다. */
const env = typeof process !== 'undefined' && process.env ? process.env : {} as Record<string, string | undefined>;
const PASSWORD = env.LINEBOARD_PASSWORD ?? 'saehan';
const SECRET = env.LINEBOARD_SECRET ?? 'lineboard-local-secret';
export const COOKIE = 'lb_session';
export const ME_COOKIE = 'lb_me';
/** 체험판 근무자 인증번호. 실제 도입 때는 문자로 보낸 번호와 맞춘다. */
export const DEMO_CODE = '1234';

import type { Role } from './rules';
export type { Role };
export type Session = { id: number; name: string; role: Role; factory_id: number | null };

export function defaultPassword(): string { return PASSWORD; }
export function hashPassword(pw: string): string { return crypto.createHash('sha256').update(`${SECRET}|${pw}`).digest('hex'); }
function sign(s: string): string { return crypto.createHmac('sha256', SECRET).update(s).digest('hex'); }

export function sessionCookie(s: Session): string {
  const body = Buffer.from(JSON.stringify(s), 'utf8').toString('base64url');
  return `${body}.${sign(body)}`;
}
export function parseSession(v: string | undefined | null): Session | null {
  if (!v) return null;
  const i = v.lastIndexOf('.');
  if (i < 0) return null;
  const body = v.slice(0, i), sig = v.slice(i + 1);
  const want = sign(body);
  if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  try { const s = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Session; return s && typeof s.id === 'number' && s.role ? s : null; } catch { return null; }
}
/** 근무자 쿠키: 사람 토큰에 서명을 붙인다 */
export function meCookie(token: string): string { return `${token}.${sign(token)}`; }
export function parseMe(v: string | undefined | null): string | null {
  if (!v) return null;
  const i = v.lastIndexOf('.');
  if (i < 0) return null;
  const tok = v.slice(0, i), sig = v.slice(i + 1), want = sign(tok);
  return sig.length === want.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want)) ? tok : null;
}
