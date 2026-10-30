import { describe, it, expect } from 'vitest';
import { openDb } from '../src/lib/db';
import { ask, runSql, runTool, systemPrompt, tools } from '../src/lib/assistant';
import type Anthropic from '@anthropic-ai/sdk';

function memDb() {
  const db = openDb(':memory:');
  db.prepare("INSERT INTO factories (id, code, name, sort) VALUES (2,'F2','2공장',2)").run();
  db.prepare("INSERT INTO posts (id, factory_id, code, name, kind, sort) VALUES (36,2,'S-3','S-3호','machine',8)").run();
  db.prepare("INSERT INTO people (id, name, grp, work_type) VALUES (1,'박현주','A','교대'),(2,'김순자','B','교대')").run();
  db.prepare("INSERT INTO boards (id, date, shift, factory_id, status) VALUES (1,'2026-10-20','주간',2,'확정')").run();
  db.prepare("INSERT INTO board_posts (board_id, post_id, product) VALUES (1,36,'신광야950')").run();
  db.prepare("INSERT INTO assignments (board_id, post_id, person_id, source) VALUES (1,36,1,'이력')").run();
  return db;
}

describe('runSql 보호', () => {
  it('SELECT만 허용하고 LIMIT을 붙인다', () => {
    const db = memDb();
    expect(runSql('select name from people order by name', db)).toBe('name\n김순자\n박현주');
    expect(() => runSql('DELETE FROM people', db)).toThrow();
    expect(() => runSql('select 1; select 2', db)).toThrow();
    expect(() => runSql('select * from people; pragma table_info(people)', db)).toThrow();
  });
});

describe('도구', () => {
  it('board 도구는 라인·제품·근무자를 돌려준다', () => {
    const db = memDb();
    const out = runTool('board', { date: '2026-10-20', shift: '주간', factory: 2 }, db);
    expect(out).toContain('S-3\t신광야950\t박현주');
  });
  it('groups 도구는 그날 조를 말한다', () => { expect(runTool('groups', { date: '2026-01-01' }, memDb())).toContain('주간 B조'); });
  it('도구 정의는 모두 strict', () => { for (const t of tools) expect(t.strict).toBe(true); });
  it('시스템 프롬프트에 오늘과 규칙이 있다', () => { const s = systemPrompt({ date: '2026-10-30', shift: '야간' }); expect(s).toContain('2026-10-30'); expect(s).toContain('표를 고치거나'); });
});

describe('ask 루프 (가짜 모델)', () => {
  it('도구 호출 → 결과 전달 → 최종 답', async () => {
    const db = memDb();
    const calls: Anthropic.Beta.MessageCreateParamsNonStreaming[] = [];
    const client = { beta: { messages: { create: async (p: Anthropic.Beta.MessageCreateParamsNonStreaming) => {
      calls.push(p);
      if (calls.length === 1) return { id: 'm1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'tool_use', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 },
        content: [{ type: 'tool_use', id: 't1', name: 'query', input: { sql: "select p.name, count(*) c from assignments a join people p on p.id=a.person_id join posts po on po.id=a.post_id where po.code='S-3' group by p.name order by c desc limit 1" } }] } as unknown as Anthropic.Beta.BetaMessage;
      return { id: 'm2', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 },
        content: [{ type: 'text', text: 'S-3에 가장 많이 선 사람은 박현주(1회)입니다.' }] } as unknown as Anthropic.Beta.BetaMessage;
    } } } };
    const r = await ask([{ role: 'user', content: 'S-3 제일 많이 선 사람?' }], { client, db, now: { date: '2026-10-30', shift: '주간' } });
    expect(r.text).toContain('박현주');
    expect(r.trace).toHaveLength(1);
    expect(r.trace[0].result).toContain('박현주\t1');
    // 두 번째 호출에는 도구 결과가 user 메시지로 들어간다
    const second = calls[1].messages;
    expect(second[second.length - 1].role).toBe('user');
  });
  it('거부 응답은 안내 문장으로', async () => {
    const client = { beta: { messages: { create: async () => ({ id: 'm', type: 'message', role: 'assistant', model: 'x', stop_reason: 'refusal', content: [], usage: { input_tokens: 1, output_tokens: 1 } } as unknown as Anthropic.Beta.BetaMessage) } } };
    const r = await ask([{ role: 'user', content: '?' }], { client, db: memDb() });
    expect(r.text).toContain('답할 수 없습니다');
  });
});
