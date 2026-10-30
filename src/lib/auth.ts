import crypto from 'node:crypto';

const PASSWORD = process.env.LINEBOARD_PASSWORD ?? 'saehan';
const SECRET = process.env.LINEBOARD_SECRET ?? 'lineboard-local-secret';
export const COOKIE = 'lb_session';

export function sessionValue(): string {
  return crypto.createHmac('sha256', SECRET).update(PASSWORD).digest('hex');
}
export function checkPassword(pw: string): boolean { return pw === PASSWORD; }
