/* 브라우저 판의 node:crypto 대용. 토큰 생성과, 체험판에서만 쓰는 간단한 해시·서명. 보안용이 아니다(설치판은 진짜 crypto). */
const hex = (a: Uint8Array): string => Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
function fnv(s: string): string {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0; h2 = Math.imul(h2 ^ c, 0x811c9dc5) >>> 0; }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}
function hasher(seed: string) {
  let acc = seed;
  const api = { update(s: string | Uint8Array) { acc += typeof s === 'string' ? s : hex(s); return api; }, digest(): string { return fnv(acc); } };
  return api;
}
const shim = {
  randomBytes(n: number): { toString(enc: string): string } {
    const a = new Uint8Array(n); crypto.getRandomValues(a);
    return { toString: () => hex(a) };
  },
  createHash(): ReturnType<typeof hasher> { return hasher('h:'); },
  createHmac(_alg: string, key: string): ReturnType<typeof hasher> { return hasher('m:' + key + ':'); },
  timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i]; return d === 0; },
};
export default shim;
