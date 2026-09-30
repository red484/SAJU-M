import { createHash } from 'node:crypto';

export const COACH_LIMIT = 5;
export const QUOTA_NOTICE = '무료 상담을 모두 이용했어요. 추가 상담은 준비 중입니다.';
const quota = used => ({ limit: COACH_LIMIT, used, remaining: Math.max(0, COACH_LIMIT - used) });
const failure = (status, code, error, extra = {}) => ({ status, code, error, ...extra });

export class CoachQuotaRepository {
  constructor(pool) { this.pool = pool; }
  async status(userId, client = this.pool) {
    const result = await client.query('SELECT count(*)::int AS used FROM coach_answers WHERE user_id = $1', [userId]);
    return quota(result.rows[0].used);
  }
  async run(userId, payload, execute) {
    if (!/^[a-zA-Z0-9_-]{8,100}$/.test(payload.requestId || ''))
      return failure(400, 'REQUEST_ID_REQUIRED', '화면을 새로고침한 뒤 다시 시도해 주세요.');
    const question = payload.messages?.filter(m => m.role === 'user').at(-1)?.text;
    if (typeof question !== 'string' || !question.trim()) return failure(400, 'QUESTION_REQUIRED', '질문을 입력해 주세요.');
    const hash = createHash('sha256').update(question).digest('hex');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // One in-flight answer per account, including requests from other devices/workers.
      const lock = await client.query('SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS locked', [`coach:${userId}`]);
      if (!lock.rows[0].locked) {
        await client.query('ROLLBACK');
        return failure(409, 'COACH_BUSY', '앞선 답변이 끝난 뒤 다시 시도해 주세요.');
      }
      const previous = await client.query('SELECT question_hash, response FROM coach_answers WHERE user_id = $1 AND request_id = $2', [userId, payload.requestId]);
      const allowance = await this.status(userId, client);
      if (previous.rowCount) {
        await client.query('COMMIT');
        return previous.rows[0].question_hash === hash
          ? { ...previous.rows[0].response, quota: allowance }
          : failure(409, 'REQUEST_ID_CONFLICT', '다른 질문에는 새 요청이 필요합니다.');
      }
      if (!allowance.remaining) {
        await client.query('COMMIT');
        return failure(403, 'COACH_LIMIT_REACHED', QUOTA_NOTICE, { quota: allowance });
      }
      const out = await execute(payload);
      const charge = !out.error && out.source === 'cafe24' && typeof out.text === 'string' && !!out.text.trim();
      if (charge) await client.query('INSERT INTO coach_answers (user_id, request_id, question_hash, response) VALUES ($1, $2, $3, $4::jsonb)', [userId, payload.requestId, hash, JSON.stringify(out)]);
      await client.query('COMMIT');
      return { ...out, quota: quota(allowance.used + (charge ? 1 : 0)) };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }
}
