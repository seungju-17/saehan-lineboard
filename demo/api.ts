/* 브라우저 판: /api/* 호출을 서버 없이 repo 함수로 바로 연결한다. src/app/api/* 와 같은 동작. */
import { getDb } from './db-shim';
import { type AttendanceKind, type Settings, getSettings, setSettings, setNeed, listAccounts, personByPhone, personByToken, addPerson, cancelRequests, proposeBoard, setAttendance, setNote, setStopped, allRequests, autoFill, clearVacancy, confirmBoard, findOrCreatePerson, getBoard, markRead, monthSummary, myWork, adminInbox, decideLeave, requestLeave, returnBoard, weekHoursFor, nextCandidates, people, removePerson, respond, sendRequests, setProduct, unconfirmBoard } from '../src/lib/repo';
import { currentShiftSeoul, todaySeoul, type Shift } from '../src/lib/shift';
import type { LeaveKind } from '../src/lib/rules';
import { getStats } from '../src/lib/stats';
import { ask, makeClient, explainApiError, type ChatMessage } from '../src/lib/assistant';

const json = (data: unknown, status = 200): Response => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

async function handle(url: string, init?: RequestInit): Promise<Response> {
  const u = new URL(url, 'http://local');
  const method = (init?.method ?? 'GET').toUpperCase();
  const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
  const path = u.pathname;
  try {
    if (path === '/api/board') {
      if (method === 'GET' && u.searchParams.get('month')) return json({ dates: monthSummary(u.searchParams.get('month')!, u.searchParams.get('shift') as Shift, Number(u.searchParams.get('factory'))) });
      const src = method === 'GET' ? Object.fromEntries(u.searchParams) : body;
      const date = String(src.date ?? ''), shift = String(src.shift ?? '') as Shift, factory = Number(src.factory);
      if (!date || !shift || !factory) return json({ error: 'date, shift, factory' }, 400);
      const board = getBoard(date, shift, factory);
      if (method === 'GET') return json(board);
      let extra: Record<string, unknown> = {};
      const postId = Number(body.postId), personId = Number(body.personId);
      switch (body.action) {
        case 'product': setProduct(board.id, postId, (body.product as string | null) ?? null); break;
        case 'add': addPerson(board.id, postId, body.personId ? personId : findOrCreatePerson(String(body.name ?? ''), factory).id); break;
        case 'remove': extra = removePerson(board.id, postId, personId, false); break;
        case 'absent': removePerson(board.id, postId, personId, true); extra = sendRequests(board.id, postId, personId); break;
        case 'send': extra = sendRequests(board.id, postId, null); break;
        case 'next': extra = nextCandidates(board.id, postId); break;
        case 'cancel': clearVacancy(board.id, postId); break;
        case 'cancel_requests': extra = cancelRequests(board.id, postId, body.requestId ? Number(body.requestId) : null); break;
        case 'need': setNeed(board.id, postId, body.need === null || body.need === undefined || body.need === '' ? null : Number(body.need)); break;
        case 'stop': setStopped(board.id, postId, !!body.stopped); break;
        case 'note': setNote(board.id, (body.note as string | null) ?? null); break;
        case 'attend': extra = setAttendance(board.id, body.postId ? postId : null, personId, (body.kind as AttendanceKind | null) ?? null, (body.note as string | null) ?? null, undefined, typeof body.request === 'boolean' ? body.request : undefined); break;
        case 'propose': proposeBoard(board.id); break;
        case 'return': returnBoard(board.id, (body.note as string | null) ?? null); break;
        case 'autofill': extra = autoFill(board.id); break;
        case 'confirm': extra = confirmBoard(board.id); break;
        case 'unconfirm': unconfirmBoard(board.id); break;
        default: return json({ error: 'unknown action' }, 400);
      }
      return json({ ...getBoard(date, shift, factory), ...extra });
    }
    if (path === '/api/stats') {
      const factory = Number(u.searchParams.get('factory') ?? 2), date = u.searchParams.get('date') ?? todaySeoul();
      const shift = (u.searchParams.get('shift') as Shift | null) ?? currentShiftSeoul(), days = Math.min(90, Math.max(7, Number(u.searchParams.get('days') ?? 30)));
      return json(getStats(date, shift, factory, days));
    }
    if (path === '/api/ask') {
      let key = ''; try { key = localStorage.getItem('lb_api_key') ?? ''; } catch { /* 저장소 없음 */ }
      if (!key) return json({ error: 'no_key', message: 'API 키를 넣으면 물어볼 수 있습니다.' }, 503);
      const msgs = (body.messages as ChatMessage[] | undefined) ?? [];
      try { return json(await ask(msgs.slice(-12), { client: makeClient(key, true) })); }
      catch (e) { const x = explainApiError(e); if (x.badKey) { try { localStorage.removeItem('lb_api_key'); } catch { /* 저장소 없음 */ } } return json({ error: x.badKey ? 'no_key' : 'api', message: x.message }, x.badKey ? 503 : 502); }
    }
    if (path === '/api/requests') return json(allRequests());
    if (path === '/api/leaves') {
      if (method === 'GET') return json(adminInbox());
      let who = '관리자'; try { const r = localStorage.getItem('lb_role'); if (r) who = (JSON.parse(r) as { name: string }).name; } catch { /* 저장소 없음 */ }
      const r = decideLeave(Number(body.id), !!body.approve, (body.reply as string | null) ?? null, who);
      return json(r, r.ok ? 200 : 409);
    }
    if (path === '/api/settings') { if (method === 'GET') return json(getSettings()); try { return json(setSettings(body as Partial<Settings>)); } catch (e) { return json({ error: (e as Error).message }, 400); } }
    if (path === '/api/people') {
      if (method === 'GET') { const h = weekHoursFor(todaySeoul()); return json(people(getDb(), false).map((p) => ({ ...p, week_hours: h.get(p.id) ?? 0 }))); }
      const { id, ...u2 } = body as { id: number } & Record<string, unknown>;
      const allowed = ['phone', 'grp', 'work_type', 'affiliation', 'active', 'home_factory_id', 'unit', 'gender'];
      const sets = allowed.filter((k) => k in u2);
      if (!id || !sets.length) return json({ error: 'nothing to update' }, 400);
      getDb().prepare(`UPDATE people SET ${sets.map((k) => `${k}=?`).join(', ')} WHERE id=?`).run(...sets.map((k) => u2[k] ?? null), id);
      return json({ ok: true });
    }
    if (path === '/api/login') {
      if (method === 'DELETE') { try { localStorage.removeItem('lb_role'); localStorage.removeItem('lb_me'); } catch { /* 저장소 없음 */ } return json({ ok: true }); }
      if (body.phone !== undefined) {
        const p = personByPhone(String(body.phone));
        if (!p) return json({ error: '등록된 전화번호가 아닙니다. 체험판은 직원 화면의 번호를 쓰세요.' }, 404);
        if (body.code === undefined) return json({ ok: true, name: p.name, sent: true, demoCode: '1234' });
        if (String(body.code).trim() !== '1234') return json({ error: '인증번호가 맞지 않습니다' }, 401);
        try { localStorage.setItem('lb_me', p.token); localStorage.removeItem('lb_role'); } catch { /* 저장소 없음 */ }
        return json({ ok: true, kind: 'worker', name: p.name });
      }
      // 체험판 관리자: 아이디만 맞으면 들어간다 (teamlead · staff · lead1 · lead2)
      const a = listAccounts().find((x) => x.username === String(body.username ?? '').trim());
      if (!a) return json({ error: '아이디는 teamlead · staff · lead1 · lead2 중 하나입니다' }, 401);
      try { localStorage.setItem('lb_role', JSON.stringify({ kind: 'admin', id: a.id, name: a.name, role: a.role, factory_id: a.factory_id })); localStorage.removeItem('lb_me'); } catch { /* 저장소 없음 */ }
      return json({ ok: true, kind: 'admin', name: a.name, role: a.role });
    }
    if (path === '/api/session') {
      let role: string | null = null, me: string | null = null;
      try { role = localStorage.getItem('lb_role'); me = localStorage.getItem('lb_me'); } catch { /* 저장소 없음 */ }
      if (role) return json(JSON.parse(role));
      const p = me ? personByToken(me) : null;
      if (p) return json({ kind: 'worker', name: p.name });
      // 체험판은 로그인 없이 담당자로 들어온 것으로 본다
      return json({ kind: 'admin', id: 0, name: '지원팀 담당자', role: '담당자', factory_id: null });
    }
    if (path === '/api/public/respond') {
      const r = respond(String(body.token ?? ''), body.action as 'accept' | 'decline');
      return json(r, r.ok ? 200 : 409);
    }
    if (path === '/api/public/me') {
      let me = ''; try { me = localStorage.getItem('lb_me') ?? ''; } catch { /* 저장소 없음 */ }
      const tok = (method === 'GET' ? u.searchParams.get('token') : (body.token as string | undefined)) || me;
      if (method === 'GET') { const d = myWork(tok); return d ? json(d) : json({ error: '로그인이 필요합니다' }, 401); }
      if (body.action === 'leave') { const p = personByToken(tok); if (!p) return json({ error: '로그인이 필요합니다' }, 401); const r = requestLeave(p.id, String(body.date ?? ''), body.shift as Shift, body.kind as LeaveKind, (body.note as string | null) ?? null); return json(r, r.ok ? 200 : 409); }
      return json({ ok: markRead(tok, Number(body.messageId)) });
    }
    return json({ error: 'not found' }, 404);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
}

export function installFetch(): void {
  const real = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    return url.startsWith('/api/') ? handle(url, init) : real(input, init);
  };
}
