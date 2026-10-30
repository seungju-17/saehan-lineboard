/** 확인 창. 기본은 브라우저 confirm. 브라우저 안에서 도는 판(데모)은 화면 안 확인 창으로 바꿔 끼운다. */
export type AskOpts = { ok?: string; cancel?: string };
export type Ask = (message: string, opts?: AskOpts) => Promise<boolean>;
let impl: Ask = async (m, o) => window.confirm(o?.ok || o?.cancel ? `${m}\n(확인: ${o.ok ?? '확인'} / 취소: ${o.cancel ?? '취소'})` : m);
export const ask: Ask = (m, o) => impl(m, o);
export function setAsk(f: Ask): void { impl = f; }
