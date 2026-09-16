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
      const result = await client.query(`SELECT j.payload, j.revision FROM anonymous_sessions s
        LEFT JOIN saju_journals j ON j.session_id = s.id OR (s.user_id IS NOT NULL AND j.user_id = s.user_id)
        WHERE s.id = $1 AND j.session_id IS NOT NULL ORDER BY j.updated_at DESC LIMIT 1`, [id]);
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
      const owner = await client.query('SELECT user_id FROM anonymous_sessions WHERE id = $1', [id]);
      if (owner.rows[0]?.user_id) await client.query('DELETE FROM saju_journals WHERE user_id = $1', [owner.rows[0].user_id]);
      else await client.query('DELETE FROM saju_journals WHERE session_id = $1', [id]);
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
      const owner = await client.query('SELECT user_id FROM anonymous_sessions WHERE id = $1', [id]);
      const userId = owner.rows[0]?.user_id || null;
      const existing = await client.query(`SELECT session_id, revision FROM saju_journals
        WHERE session_id = $1 OR ($2::uuid IS NOT NULL AND user_id = $2) ORDER BY updated_at DESC LIMIT 1 FOR UPDATE`, [id, userId]);
      let result;
      if (revision === 0) {
        if (existing.rowCount) throw new JournalConflictError('Journal revision conflict');
        result = await client.query(`INSERT INTO saju_journals (session_id, user_id, payload, revision)
          VALUES ($1, $2, $3::jsonb, 1) RETURNING revision`, [id, userId, JSON.stringify(data)]);
      } else {
        result = await client.query(`UPDATE saju_journals SET payload = $2::jsonb, revision = revision + 1, updated_at = now()
          WHERE session_id = $1 AND revision = $3 RETURNING revision`, [existing.rows[0]?.session_id || id, JSON.stringify(data), revision]);
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
