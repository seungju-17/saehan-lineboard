/** 확인 창. 기본은 브라우저 confirm. 브라우저 안에서 도는 판(데모)은 화면 안 확인 창으로 바꿔 끼운다. */
export type Ask = (message: string) => Promise<boolean>;
let impl: Ask = async (m) => window.confirm(m);
export const ask: Ask = (m) => impl(m);
export function setAsk(f: Ask): void { impl = f; }
