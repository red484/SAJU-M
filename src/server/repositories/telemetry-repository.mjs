import { routingMetadata } from '../ai-routing.mjs';
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

  async routingReport() {
    const { rows } = await this.pool.query(`SELECT routing_provider, resolved_model, status, count(*)::text AS records
      FROM llm_requests WHERE provider='cafe24' AND created_at > now()-interval '30 days' AND created_at <= now()
      GROUP BY routing_provider,resolved_model,status ORDER BY routing_provider NULLS LAST,resolved_model NULLS LAST,status`);
    return { notice: '최종 응답의 라우팅 메타데이터별 운영 기록 건수입니다. 모든 외부 호출·중간 재시도·Router 내부 폴백의 수신 업체 목록이 아닙니다. null은 미확인이며 과거 기록·메타데이터 미제공·외부 호출 없는 안전 안내 등이 포함될 수 있습니다. 국가·법인·보존·학습 조건은 별도로 확인해야 합니다.', retention: '최근 30일', rows };
  }

  async finish(run, details = {}) {
    const status = details.status || 'completed';
    const routing = routingMetadata({ provider: details.routing?.provider, resolved_model_used: details.routing?.model });
    await this.pool.query(`UPDATE usage_sessions SET status = $2, completed_at = now() WHERE id = $1`, [run.id, status]);
    await this.pool.query(`INSERT INTO llm_requests
      (usage_session_id, provider, model, key_label, status, finish_reason, input_tokens, output_tokens, latency_ms, error_code, routing_provider, resolved_model)
      VALUES ($1, 'cafe24', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`, [
      run.id, details.model || null, details.keyLabel || null, status, details.finishReason || null,
      details.inputTokens || null, details.outputTokens || null, Date.now() - run.started, details.errorCode || null, routing.provider, routing.model
    ]);
  }
}

export class NullTelemetryRepository {
  async start() { return { id: null, started: Date.now() }; }
  async finish() {}
}
