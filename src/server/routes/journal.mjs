import { readBody, sendJson, validateOrigin } from '../http.mjs';
import { expiredSessionCookie, getSession, sessionCookie, sessionId } from '../session.mjs';
import { JournalConflictError } from '../repositories/file-journal-repository.mjs';

const validJournal = (data, revision) => data && typeof data === 'object'
  && Number.isInteger(revision) && revision >= 0
  && Array.isArray(data.records) && Array.isArray(data.conversations);

export function createJournalRoute(repository) {
  return async function journalRoute(req, res) {
    if (!['GET', 'PUT', 'DELETE'].includes(req.method)) {
      return sendJson(res, { error: '허용되지 않은 요청입니다.' }, 405);
    }
    if (req.method !== 'GET' && !validateOrigin(req)) {
      return sendJson(res, { error: '이 사이트에서 다시 시도해 주세요.' }, 403);
    }

    const session = getSession(req);
    const id = sessionId(session.token);
    const headers = session.fresh ? { 'Set-Cookie': sessionCookie(req, session) } : {};

    try {
      if (req.method === 'GET') {
        const journal = await repository.get(id);
        return sendJson(res, journal, 200, headers);
      }
      if (req.method === 'DELETE') {
        await repository.delete(id);
        return sendJson(res, { ok: true }, 200, { 'Set-Cookie': expiredSessionCookie(req) });
      }
      if (Number(req.headers['content-length'] || 0) > 1_000_000) {
        return sendJson(res, { error: '저장 용량을 초과했어요. 기록을 내보낸 뒤 정리해 주세요.' }, 413);
      }
      let body;
      try {
        body = JSON.parse(await readBody(req));
      } catch (error) {
        return sendJson(res, { error: error.status === 413 ? error.message : '저장할 내용을 확인해 주세요.' }, error.status || 400);
      }
      if (!validJournal(body.data, body.revision)) {
        return sendJson(res, { error: '데이터 형식이 올바르지 않아요.' }, 400);
      }
      const saved = await repository.put(id, body.data, body.revision);
      return sendJson(res, { ok: true, revision: saved.revision }, 200, headers);
    } catch (error) {
      if (error instanceof JournalConflictError) {
        return sendJson(res, { error: '다른 탭에서 기록이 변경됐어요. 먼저 내보내기로 현재 내용을 보관한 뒤 새로고침해 주세요.' }, 409);
      }
      console.error('Journal request failed', error?.message);
      return sendJson(res, { error: '저장소에 연결하지 못했어요. 입력 내용은 현재 화면에 유지됩니다. 잠시 후 다시 시도해 주세요.' }, 503);
    }
  };
}
