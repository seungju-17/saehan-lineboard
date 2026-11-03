import { describe, expect, it } from 'vitest';
import { filterByName, nameStartsWith } from '../src/lib/hangul';

describe('이름 찾기 (초성)', () => {
  it('ㄱ 하나로 ㄱ으로 시작하는 이름을 찾는다', () => {
    expect(nameStartsWith('김명희', 'ㄱ')).toBe(true);
    expect(nameStartsWith('박현주', 'ㄱ')).toBe(false);
    expect(nameStartsWith('박경숙', 'ㄱ')).toBe(false); // 중간에 ㄱ이 있어도 시작이 아니면 안 나온다
  });
  it('초성 여러 개와 글자 섞어도 된다', () => {
    expect(nameStartsWith('김명희', 'ㄱㅁ')).toBe(true);
    expect(nameStartsWith('김명희', '김ㅁ')).toBe(true);
    expect(nameStartsWith('김명희', '김명희')).toBe(true);
    expect(nameStartsWith('김명희', '김명희숙')).toBe(false);
    expect(nameStartsWith('김명희', 'ㄱㅎ')).toBe(false);
  });
  it('ㄲ·ㅆ 같은 된소리와 외국 이름도 처리한다', () => {
    expect(nameStartsWith('까밀라', 'ㄲ')).toBe(true);
    expect(nameStartsWith('까밀라', 'ㄱ')).toBe(false);
    expect(nameStartsWith('바트바야르', 'ㅂㅌ')).toBe(true);
  });
  it('빈 검색어는 전부, 아니면 시작하는 이름만', () => {
    const ppl = ['박현주', '이흥숙', '김명희', '한김자', '김순자'];
    expect(filterByName(ppl, '', (x) => x)).toEqual(ppl);
    expect(filterByName(ppl, 'ㄱ', (x) => x)).toEqual(['김명희', '김순자']);
    expect(filterByName(ppl, '김ㅅ', (x) => x)).toEqual(['김순자']);
  });
});
