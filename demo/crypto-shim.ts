const hex = (a: Uint8Array): string => Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
const shim = {
  randomBytes(n: number): { toString(enc: string): string } {
    const a = new Uint8Array(n); crypto.getRandomValues(a);
    return { toString: () => hex(a) };
  },
  createHmac(): never { throw new Error('not in browser build'); },
};
export default shim;
