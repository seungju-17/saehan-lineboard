/* 브라우저 판: /api/* 호출을 서버 없이 repo 함수로 바로 연결한다. src/app/api/* 와 같은 동작. */
import { getDb } from './db-shim';
import { addPerson, allRequests, autoFill, clearVacancy, confirmBoard, findOrCreatePerson, getBoard, markRead, myWork, nextCandidates, people, removePerson, respond, sendRequests, setProduct, unconfirmBoard } from '../src/lib/repo';
import { currentShiftSeoul, todaySeoul, type Shift } from '../src/lib/shift';
import { getStats } from '../src/lib/stats';

const json = (data: unknown, status = 200): Response => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

async function handle(url: string, init?: RequestInit): Promise<Response> {
  const u = new URL(url, 'http://local');
  const method = (init?.method ?? 'GET').toUpperCase();
  const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
  const path = u.pathname;
  try {
    if (path === '/api/board') {
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
        case 'remove': removePerson(board.id, postId, personId, false); break;
        case 'absent': removePerson(board.id, postId, personId, true); extra = sendRequests(board.id, postId, personId); break;
        case 'send': extra = sendRequests(board.id, postId, null); break;
        case 'next': extra = nextCandidates(board.id, postId); break;
        case 'cancel': clearVacancy(board.id, postId); break;
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
    if (path === '/api/requests') return json(allRequests());
    if (path === '/api/people') {
      if (method === 'GET') return json(people(getDb(), false));
      const { id, ...u2 } = body as { id: number } & Record<string, unknown>;
      const allowed = ['phone', 'grp', 'work_type', 'affiliation', 'active', 'home_factory_id'];
      const sets = allowed.filter((k) => k in u2);
      if (!id || !sets.length) return json({ error: 'nothing to update' }, 400);
      getDb().prepare(`UPDATE people SET ${sets.map((k) => `${k}=?`).join(', ')} WHERE id=?`).run(...sets.map((k) => u2[k] ?? null), id);
      return json({ ok: true });
    }
    if (path === '/api/login') return json({ ok: true });
    if (path === '/api/public/respond') {
      const r = respond(String(body.token ?? ''), body.action as 'accept' | 'decline');
      return json(r, r.ok ? 200 : 409);
    }
    if (path === '/api/public/me') {
      if (method === 'GET') { const d = myWork(u.searchParams.get('token') ?? ''); return d ? json(d) : json({ error: '링크가 올바르지 않습니다' }, 404); }
      return json({ ok: markRead(String(body.token ?? ''), Number(body.messageId)) });
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
