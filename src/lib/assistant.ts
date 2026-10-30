/**
 * 물어보기 봇. 배치표 DB를 "읽는" 도구만 가진 Claude 대화.
 * 원칙: 숫자는 조회 결과에서만, 표는 절대 고치지 않음(변경은 담당자가 화면에서), 짧은 한국어 답.
 */
import Anthropic from '@anthropic-ai/sdk';
import { getDb, type DB } from './db';
import { candidatesFor, getBoard } from './repo';
import { groupsOn, todaySeoul, currentShiftSeoul, type Shift } from './shift';

export const MODEL = 'claude-opus-5-5';
export const MAX_TURNS = 8;

export type ChatMessage = { role: 'user' | 'assistant'; content: string };
export type Trace = { tool: string; input: Record<string, unknown>; result: string };
export type AskResult = { text: string; trace: Trace[]; served?: string };

const SCHEMA = `
factories(id, code, name)                       공장. 1=1공장 PET, 2=2공장
posts(id, factory_id, code, name, kind, sort)   라인(설비). kind: machine(생산 라인) | support | op | leader | etc. code 예: 'S-3','P-1','05','PE-2','기타','OP'
people(id, name, affiliation, grp, work_type, role, phone, home_factory_id, active)
                                                직원. grp: 'A','B','C','주전','미정'. work_type: '교대','주간고정','임시'. affiliation: 소속사(새한/세영/다연/피너)
boards(id, date, shift, factory_id, status, confirmed_at, copied_from)
                                                하루 한 근무의 배치표. date 'YYYY-MM-DD', shift '주간'|'야간', status '초안'|'확정'
board_posts(board_id, post_id, product, vacant) 그날 그 라인의 제품명과 비어 있음(1) 여부
assignments(id, board_id, post_id, person_id, source)
                                                누가 어느 라인에 섰는가. source: 이력(과거 자료)|복사|수동|대체(결원 대체로 들어감)|자동(자동 채우기)
requests(id, board_id, post_id, person_id, vacated_person_id, rank, reason, status, sent_at, responded_at)
                                                대체 요청. status: 발송(대기)|수락|거절|만료|취소
logs(id, board_id, post_id, person_id, action, detail, at)   변경 기록
`.trim();

export function systemPrompt(now = { date: todaySeoul(), shift: currentShiftSeoul() }): string {
  const g = groupsOn(now.date);
  return `당신은 새한프라텍 지원팀의 배치표 도우미입니다. 담당자가 엑셀을 뒤져야 알 수 있던 것을 배치표 DB에서 바로 찾아 답합니다.

오늘: ${now.date}, 지금 근무: ${now.shift}. 오늘 근무조: 주간 ${g.day}조, 야간 ${g.night}조, 휴무 ${g.off}조.
현장: 두 공장, 3조 2교대(4일 근무 → 2일 휴무 → 주/야 교대, 12일 주기). 라인마다 제품이 바뀌고 임시 인원이 섞입니다.

규칙
- 숫자·이름은 반드시 도구로 조회한 결과에서만 말합니다. 조회하지 않은 것은 "자료에 없다"고 합니다. 추정하지 않습니다.
- 표를 고치거나 요청을 보내는 일은 하지 않습니다(도구도 없습니다). 담당자가 할 일은 화면에서 어떻게 하는지 한 줄로 안내합니다: 이름 클릭→결근 처리, + 클릭→추가, 자동 채우기, 확정.
- 답은 짧게. 결론 먼저, 근거 숫자는 그다음. 기간을 명시합니다("최근 30일", "10/1~10/30").
- 사람을 추천할 때는 candidates 도구를 쓰고 이유(이 라인 n회, 휴무조)를 붙입니다.
- SQL은 SELECT만, 한 번에 한 질문만, LIMIT을 붙입니다. 날짜 비교는 문자열('2026-10-01')로 합니다.
- 한국어로, 담당자에게 말하듯 씁니다. 표 형식은 3줄 이상 나열할 때만.

DB 구조(SQLite)
${SCHEMA}`;
}

/** 읽기 전용 SQL 실행. SELECT/WITH만, 한 문장, 200행·4000자 제한. */
export function runSql(sql: string, db: DB = getDb()): string {
  const s = sql.trim().replace(/;\s*$/, '');
  if (!/^(select|with)\b/i.test(s)) throw new Error('SELECT 문만 실행할 수 있습니다');
  if (/;/.test(s) || /\b(pragma|attach|detach|insert|update|delete|drop|alter|create|replace|vacuum)\b/i.test(s)) throw new Error('읽기 전용입니다');
  const limited = /\blimit\s+\d+/i.test(s) ? s : `${s} LIMIT 200`;
  const rows = db.prepare(limited).all() as Record<string, unknown>[];
  if (rows.length === 0) return '(결과 없음)';
  const cols = Object.keys(rows[0]);
  const lines = [cols.join('\t'), ...rows.slice(0, 200).map((r) => cols.map((c) => String(r[c] ?? '')).join('\t'))];
  const text = lines.join('\n');
  return text.length > 4000 ? text.slice(0, 4000) + '\n…(잘림)' : text;
}

export const tools: Anthropic.Beta.BetaTool[] = [
  { name: 'query', description: '배치표 DB에 읽기 전용 SQL(SELECT)을 실행한다. 집계·검색·기간 비교에 쓴다. 결과는 탭 구분 표.',
    strict: true, input_schema: { type: 'object', properties: { sql: { type: 'string', description: 'SELECT 문 하나. LIMIT 포함' } }, required: ['sql'], additionalProperties: false } },
  { name: 'board', description: '특정 날짜·근무·공장의 배치표(라인, 제품, 근무자, 비어 있음)를 본다.',
    strict: true, input_schema: { type: 'object', properties: { date: { type: 'string', description: 'YYYY-MM-DD' }, shift: { type: 'string', enum: ['주간', '야간'] }, factory: { type: 'integer', enum: [1, 2] } }, required: ['date', 'shift', 'factory'], additionalProperties: false } },
  { name: 'candidates', description: '어느 라인에 설 수 있는 대체 후보를 경험 순으로 본다. 오늘 쉬는 조 우선, 이미 배치된 사람 제외.',
    strict: true, input_schema: { type: 'object', properties: { date: { type: 'string' }, shift: { type: 'string', enum: ['주간', '야간'] }, factory: { type: 'integer', enum: [1, 2] }, line: { type: 'string', description: "라인 코드, 예 'S-3', '05'" }, limit: { type: 'integer' } }, required: ['date', 'shift', 'factory', 'line', 'limit'], additionalProperties: false } },
  { name: 'groups', description: '특정 날짜에 어느 조가 주간·야간·휴무인지 본다.',
    strict: true, input_schema: { type: 'object', properties: { date: { type: 'string' } }, required: ['date'], additionalProperties: false } },
];

export function runTool(name: string, input: Record<string, unknown>, db: DB = getDb()): string {
  switch (name) {
    case 'query': return runSql(String(input.sql ?? ''), db);
    case 'board': {
      const b = getBoard(String(input.date), input.shift as Shift, Number(input.factory), db);
      const by = new Map<number, string[]>();
      for (const a of b.assignments) by.set(a.post_id, [...(by.get(a.post_id) ?? []), a.name + (a.source === '대체' ? '(대체)' : a.source === '자동' ? '(자동)' : '')]);
      const lines = b.posts.filter((p) => p.product || (by.get(p.id)?.length ?? 0) > 0 || p.vacant).map((p) => `${p.code}\t${p.product ?? ''}\t${(by.get(p.id) ?? []).join(', ') || (p.vacant || p.product ? '비어 있음' : '')}`);
      return `${b.date} ${b.shift} ${b.factory_id}공장 (${b.status}) 근무 ${b.assignments.length}명\n라인\t제품\t근무자\n${lines.join('\n') || '(가동 라인 없음)'}`;
    }
    case 'candidates': {
      const c = candidatesFor(String(input.date), input.shift as Shift, Number(input.factory), String(input.line), Math.min(10, Math.max(1, Number(input.limit) || 5)), db);
      return c.length ? c.map((x, i) => `${i + 1}. ${x.name} — ${x.reasons.join(' · ')}`).join('\n') : '(가능한 후보 없음)';
    }
    case 'groups': { const g = groupsOn(String(input.date)); return `${input.date}: 주간 ${g.day}조 · 야간 ${g.night}조 · 휴무 ${g.off}조`; }
    default: throw new Error(`없는 도구: ${name}`);
  }
}

type Client = { beta: { messages: { create: (p: Anthropic.Beta.MessageCreateParamsNonStreaming) => Promise<Anthropic.Beta.BetaMessage> } } };

export function makeClient(apiKey?: string, browser = false): Anthropic {
  return new Anthropic(apiKey ? { apiKey, dangerouslyAllowBrowser: browser } : {});
}

/** 대화 한 번. 도구를 최대 MAX_TURNS회 돌리고 글 답을 돌려준다. */
export async function ask(history: ChatMessage[], opts: { client: Client; db?: DB; now?: { date: string; shift: Shift } }): Promise<AskResult> {
  const db = opts.db ?? getDb();
  const messages: Anthropic.Beta.BetaMessageParam[] = history.map((m) => ({ role: m.role, content: m.content }));
  const trace: Trace[] = [];
  let served: string | undefined;
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const res = await opts.client.beta.messages.create({
      model: MODEL, max_tokens: 4000, system: systemPrompt(opts.now), tools, messages,
      output_config: { effort: 'low' },
      betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
    });
    if ((res.usage as { iterations?: { type: string }[] }).iterations?.some((e) => e.type === 'fallback_message')) served = res.model;
    if (res.stop_reason === 'refusal') return { text: '이 질문에는 답할 수 없습니다.', trace, served };
    const text = res.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text').map((b) => b.text).join('\n').trim();
    const uses = res.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
    if (res.stop_reason !== 'tool_use' || uses.length === 0) return { text: text || '답을 만들지 못했습니다. 다시 물어봐 주세요.', trace, served };
    messages.push({ role: 'assistant', content: res.content });
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const u of uses) {
      const input = (u.input ?? {}) as Record<string, unknown>;
      try { const out = runTool(u.name, input, db); trace.push({ tool: u.name, input, result: out }); results.push({ type: 'tool_result', tool_use_id: u.id, content: out }); }
      catch (e) { const msg = (e as Error).message; trace.push({ tool: u.name, input, result: `오류: ${msg}` }); results.push({ type: 'tool_result', tool_use_id: u.id, content: `오류: ${msg}`, is_error: true }); }
    }
    messages.push({ role: 'user', content: results });
  }
  return { text: '조회가 너무 길어져 멈췄습니다. 질문을 좁혀 주세요.', trace, served };
}

/** SDK 오류를 담당자가 읽을 문장으로. */
export function explainApiError(e: unknown): { message: string; badKey: boolean } {
  if (e instanceof Anthropic.AuthenticationError) return { message: 'API 키가 맞지 않습니다. 키를 다시 확인해 주세요.', badKey: true };
  if (e instanceof Anthropic.RateLimitError) return { message: '요청이 너무 잦습니다. 잠시 뒤 다시 물어봐 주세요.', badKey: false };
  if (e instanceof Anthropic.APIConnectionError) return { message: '연결하지 못했습니다. 인터넷 연결을 확인해 주세요.', badKey: false };
  if (e instanceof Anthropic.APIError) return { message: `API 오류 ${e.status ?? ''}: ${e.message}`, badKey: false };
  return { message: (e as Error).message, badKey: false };
}

export const EXAMPLES = [
  '지난 30일 S-3에 가장 많이 선 사람은?',
  '오늘 쉬는 조 중에 2공장 S-7 경험 있는 사람 알려줘',
  '이번 달 임시 인원이 제일 많았던 날은?',
  '최근 대체 요청 수락률이 어떻게 돼?',
];
