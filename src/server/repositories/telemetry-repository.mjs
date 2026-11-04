import { randomUUID } from 'node:crypto';

export class TelemetryRepository {
  constructor(pool) { this.pool = pool; }

  async recordProductEvent({ event, channel }) {
    await this.pool.query(`INSERT INTO product_event_counts (event, channel) VALUES ($1,$2)
      ON CONFLICT (day, channel, event) DO UPDATE SET count = product_event_counts.count + 1`, [event, channel]);
  }

  async deleteExpiredLogs() {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const deleted = {};
      // Fixed table names only. Transactions stay small while the caller drains any backlog.
      for (const [table, timestamp] of [
        ['llm_requests', 'created_at'],
        ['audit_logs', 'created_at'],
        ['usage_sessions', 'COALESCE(completed_at, started_at)'],
        ['product_event_counts', "day::timestamp AT TIME ZONE 'Asia/Seoul'"]
      ]) {
        const result = await client.query(`DELETE FROM ${table} WHERE id IN (
          SELECT id FROM ${table} WHERE ${timestamp} <= now() - interval '30 days'
          ORDER BY ${timestamp} LIMIT 1000 FOR UPDATE SKIP LOCKED
        )`);
        deleted[table] = result.rowCount;
      }
      await client.query('COMMIT');
      return deleted;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

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
