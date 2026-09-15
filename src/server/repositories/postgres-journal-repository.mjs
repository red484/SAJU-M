import { JournalConflictError } from './file-journal-repository.mjs';

export class PostgresJournalRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async ensureSession(client, id) {
    await client.query(`INSERT INTO anonymous_sessions (id) VALUES ($1)
      ON CONFLICT (id) DO UPDATE SET last_seen_at = now()`, [id]);
  }

  async get(id) {
    const client = await this.pool.connect();
    try {
      await this.ensureSession(client, id);
      const result = await client.query('SELECT payload, revision FROM saju_journals WHERE session_id = $1', [id]);
      return result.rowCount ? { data: result.rows[0].payload, revision: result.rows[0].revision } : { data: null, revision: 0 };
    } finally {
      client.release();
    }
  }

  async delete(id) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`INSERT INTO audit_logs (anonymous_session_id, event_type, resource_type, resource_id)
        SELECT $1, 'journal.deleted', 'journal', $1 WHERE EXISTS (SELECT 1 FROM anonymous_sessions WHERE id = $1)`, [id]);
      await client.query('DELETE FROM anonymous_sessions WHERE id = $1', [id]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async put(id, data, revision) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await this.ensureSession(client, id);
      let result;
      if (revision === 0) {
        result = await client.query(`INSERT INTO saju_journals (session_id, payload, revision)
          VALUES ($1, $2::jsonb, 1) ON CONFLICT DO NOTHING RETURNING revision`, [id, JSON.stringify(data)]);
      } else {
        result = await client.query(`UPDATE saju_journals SET payload = $2::jsonb, revision = revision + 1, updated_at = now()
          WHERE session_id = $1 AND revision = $3 RETURNING revision`, [id, JSON.stringify(data), revision]);
      }
      if (!result.rowCount) throw new JournalConflictError('Journal revision conflict');
      await client.query(`INSERT INTO audit_logs (anonymous_session_id, event_type, resource_type, resource_id)
        VALUES ($1, 'journal.saved', 'journal', $1)`, [id]);
      await client.query('COMMIT');
      return { revision: result.rows[0].revision };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
