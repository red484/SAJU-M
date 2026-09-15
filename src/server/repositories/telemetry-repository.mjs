import { randomUUID } from 'node:crypto';

export class TelemetryRepository {
  constructor(pool) { this.pool = pool; }

  async start(sessionId, feature) {
    const id = randomUUID();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`INSERT INTO anonymous_sessions (id) VALUES ($1)
        ON CONFLICT (id) DO UPDATE SET last_seen_at = now()`, [sessionId]);
      await client.query(`INSERT INTO usage_sessions (id, anonymous_session_id, feature, status)
        VALUES ($1, $2, $3, 'started')`, [id, sessionId, feature]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return { id, started: Date.now() };
  }

  async finish(run, details = {}) {
    const status = details.status || 'completed';
    await this.pool.query(`UPDATE usage_sessions SET status = $2, completed_at = now() WHERE id = $1`, [run.id, status]);
    await this.pool.query(`INSERT INTO llm_requests
      (usage_session_id, provider, model, key_label, status, finish_reason, input_tokens, output_tokens, latency_ms, error_code)
      VALUES ($1, 'cafe24', $2, $3, $4, $5, $6, $7, $8, $9)`, [
      run.id, details.model || null, details.keyLabel || null, status, details.finishReason || null,
      details.inputTokens || null, details.outputTokens || null, Date.now() - run.started, details.errorCode || null
    ]);
  }
}

export class NullTelemetryRepository {
  async start() { return { id: null, started: Date.now() }; }
  async finish() {}
}
