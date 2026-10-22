import { createHash } from 'node:crypto';

export const COACH_LIMIT = 5;
export const QUOTA_NOTICE = '무료 상담을 모두 이용했어요. 추가 상담은 준비 중입니다.';
const quota = used => ({ limit: COACH_LIMIT, used, remaining: Math.max(0, COACH_LIMIT - used) });
const failure = (status, code, error, extra = {}) => ({ status, code, error, ...extra });

export class CoachQuotaRepository {
  constructor(pool, paid = null) { this.pool = pool; this.paid = paid; this.inFlight = new Set(); }
  async status(userId, client = this.pool) {
    const result = await client.query('SELECT count(*)::int AS used FROM coach_answers WHERE user_id = $1', [userId]);
    if (!this.paid) return quota(result.rows[0].used);
    const paid = await this.paid.allowance(userId, client);
    const free = quota(Math.max(0, result.rows[0].used - paid.consumed));
    return { ...free, freeRemaining: free.remaining, paidRemaining: paid.remaining, remaining: free.remaining + paid.remaining };
  }
  // Short transaction under the per-account lock; null when another worker holds it.
  async locked(userId, work) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const lock = await client.query('SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS locked', [`coach:${userId}`]);
      if (!lock.rows[0].locked) {
        await client.query('ROLLBACK');
        return null;
      }
      const value = await work(client);
      await client.query('COMMIT');
      return value;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }
  async replay(client, userId, requestId, hash) {
    const previous = await client.query('SELECT question_hash, response FROM coach_answers WHERE user_id = $1 AND request_id = $2', [userId, requestId]);
    if (!previous.rowCount) return null;
    return previous.rows[0].question_hash === hash
      ? { ...previous.rows[0].response, quota: await this.status(userId, client) }
      : failure(409, 'REQUEST_ID_CONFLICT', '다른 질문에는 새 요청이 필요합니다.');
  }
  // The AI call and Toss order checks run without a pooled connection; the charge is
  // re-checked and committed afterwards, so a concurrent answer can never overdraw.
  async run(userId, payload, execute) {
    if (!/^[a-zA-Z0-9_-]{8,100}$/.test(payload.requestId || ''))
      return failure(400, 'REQUEST_ID_REQUIRED', '화면을 새로고침한 뒤 다시 시도해 주세요.');
    const question = payload.messages?.filter(m => m.role === 'user').at(-1)?.text;
    if (typeof question !== 'string' || !question.trim()) return failure(400, 'QUESTION_REQUIRED', '질문을 입력해 주세요.');
    const hash = createHash('sha256').update(question).digest('hex');
    const busy = failure(409, 'COACH_BUSY', '앞선 답변이 끝난 뒤 다시 시도해 주세요.');
    // One in-flight answer per account, including requests from other devices.
    if (this.inFlight.has(userId)) return busy;
    this.inFlight.add(userId);
    try {
      const before = await this.locked(userId, async client => {
        const replayed = await this.replay(client, userId, payload.requestId, hash);
        if (replayed) return { done: replayed };
        const allowance = await this.status(userId, client);
        if (!allowance.remaining) return { done: failure(403, 'COACH_LIMIT_REACHED', QUOTA_NOTICE, { quota: allowance }) };
        return { allowance };
      });
      if (!before) return busy;
      if (before.done) return before.done;
      let paidOrder = null;
      if (this.paid && before.allowance.freeRemaining === 0) {
        paidOrder = await this.paid.availableOrder(userId);
        if (!paidOrder) return failure(403, 'COACH_LIMIT_REACHED', '사용 가능한 상담 이용권이 없어요.', { quota: await this.status(userId) });
      }
      const out = await execute(payload);
      const charge = !out.error && out.source === 'cafe24' && typeof out.text === 'string' && !!out.text.trim();
      if (!charge) return { ...out, quota: this.paid ? await this.status(userId) : before.allowance };
      const after = await this.locked(userId, async client => {
        const replayed = await this.replay(client, userId, payload.requestId, hash);
        if (replayed) return replayed;
        const allowance = await this.status(userId, client);
        if (!allowance.remaining) return failure(403, 'COACH_LIMIT_REACHED', QUOTA_NOTICE, { quota: allowance });
        if (this.paid && allowance.freeRemaining === 0 && !paidOrder) return busy;
        await client.query('INSERT INTO coach_answers (user_id, request_id, question_hash, response) VALUES ($1, $2, $3, $4::jsonb)', [userId, payload.requestId, hash, JSON.stringify(out)]);
        if (this.paid && allowance.freeRemaining === 0) await this.paid.consume(paidOrder, client);
        return { ...out, quota: this.paid ? await this.status(userId, client) : quota(allowance.used + 1) };
      });
      return after || busy;
    } finally { this.inFlight.delete(userId); }
  }
}
