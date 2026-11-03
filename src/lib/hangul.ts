/** 한글 이름 찾기. 'ㄱ'처럼 초성만 쳐도 그 소리로 시작하는 이름이 나오고, '김명'처럼 글자를 쳐도 된다. 이름의 앞부분이 맞아야 한다. */
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';

function choseong(ch: string): string {
  const c = ch.charCodeAt(0);
  if (c >= 0xac00 && c <= 0xd7a3) return CHO[Math.floor((c - 0xac00) / 588)];
  return ch;
}

/** 글자 하나가 검색 글자와 맞는가. 검색 글자가 자음(ㄱ~ㅎ)이면 초성만 비교한다. */
function charMatch(nameCh: string, qCh: string): boolean {
  if (CHO.includes(qCh)) return choseong(nameCh) === qCh;
  return nameCh === qCh;
}

/** 이름이 검색어로 시작하는가. 공백·대소문자는 무시한다. 빈 검색어는 모두 맞는다. */
export function nameStartsWith(name: string, query: string): boolean {
  const n = name.replace(/\s+/g, '').toLowerCase(), q = query.replace(/\s+/g, '').toLowerCase();
  if (q.length > n.length) return false;
  for (let j = 0; j < q.length; j++) if (!charMatch(n[j], q[j])) return false;
  return true;
}

/** 검색어로 시작하는 것만 남긴다. */
export function filterByName<T>(items: T[], query: string, name: (t: T) => string): T[] {
  if (!query.trim()) return items;
  return items.filter((t) => nameStartsWith(name(t), query));
}
