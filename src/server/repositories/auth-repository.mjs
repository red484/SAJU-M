import { createHash, randomBytes, randomUUID } from 'node:crypto';

const hash = value => createHash('sha256').update(value).digest('hex');

export class AuthRepository {
  constructor(pool) { this.pool = pool; }

  async userFromToken(token) {
    if (!token) return null;
    const result = await this.pool.query(`SELECT u.id, u.display_name, u.email
      FROM auth_sessions s JOIN app_users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > now()`, [hash(token)]);
    if (!result.rowCount) return null;
    await this.pool.query('UPDATE auth_sessions SET last_seen_at = now() WHERE token_hash = $1', [hash(token)]);
    return result.rows[0];
  }

  async signIn(identity, anonymousId) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      let found = await client.query(`SELECT u.id FROM auth_identities i JOIN app_users u ON u.id = i.user_id
        WHERE i.provider = $1 AND i.provider_subject = $2 FOR UPDATE`, [identity.provider, identity.subject]);
      let userId = found.rows[0]?.id;
      if (!userId) {
        userId = randomUUID();
        await client.query(`INSERT INTO app_users (id, display_name, email, last_login_at)
          VALUES ($1, $2, $3, now())`, [userId, identity.name || null, identity.email || null]);
        await client.query(`INSERT INTO auth_identities (id, user_id, provider, provider_subject, email)
          VALUES ($1, $2, $3, $4, $5)`, [randomUUID(), userId, identity.provider, identity.subject, identity.email || null]);
      } else {
        await client.query(`UPDATE app_users SET display_name = COALESCE($2, display_name), email = COALESCE($3, email),
          last_login_at = now(), updated_at = now() WHERE id = $1`, [userId, identity.name || null, identity.email || null]);
        await client.query(`UPDATE auth_identities SET email = COALESCE($3, email), last_login_at = now()
          WHERE provider = $1 AND provider_subject = $2`, [identity.provider, identity.subject, identity.email || null]);
      }
      await client.query(`INSERT INTO anonymous_sessions (id, user_id) VALUES ($1, $2)
        ON CONFLICT (id) DO UPDATE SET user_id = $2, last_seen_at = now()`, [anonymousId, userId]);
      await this.mergeJournal(client, anonymousId, userId);
      const token = randomBytes(32).toString('hex');
      await client.query(`INSERT INTO auth_sessions (token_hash, user_id, expires_at)
        VALUES ($1, $2, now() + interval '30 days')`, [hash(token), userId]);
      await client.query(`INSERT INTO audit_logs (anonymous_session_id, event_type, resource_type, resource_id)
        VALUES ($1, 'auth.signed_in', 'user', $2)`, [anonymousId, userId]);
      await client.query('COMMIT');
      return { token, userId };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  async mergeJournal(client, anonymousId, userId) {
    const rows = await client.query(`SELECT session_id, payload, revision, updated_at FROM saju_journals
      WHERE session_id = $1 OR user_id = $2 ORDER BY updated_at`, [anonymousId, userId]);
    if (!rows.rowCount) return;
    const merged = { profile: null, records: [], conversations: [], savedAnswers: [] };
    for (const row of rows.rows) {
      const payload = row.payload || {};
      if (payload.profile) merged.profile = payload.profile;
      for (const key of ['records', 'conversations', 'savedAnswers']) {
        const map = new Map(merged[key].map(item => [item.id, item]));
        for (const item of payload[key] || []) map.set(item.id, item);
        merged[key] = [...map.values()];
      }
    }
    await client.query('DELETE FROM saju_journals WHERE user_id = $1 OR session_id = $2', [userId, anonymousId]);
    await client.query(`INSERT INTO saju_journals (session_id, user_id, payload, revision)
      VALUES ($1, $2, $3::jsonb, 1)`, [anonymousId, userId, JSON.stringify(merged)]);
  }

  async logout(token) { if (token) await this.pool.query('DELETE FROM auth_sessions WHERE token_hash = $1', [hash(token)]); }

  async deleteAccount(userId, anonymousId) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM app_users WHERE id = $1', [userId]);
      await client.query('DELETE FROM anonymous_sessions WHERE id = $1', [anonymousId]);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
}

export class NullAuthRepository {
  async userFromToken() { return null; }
  async logout() {}
  async signIn() { throw new Error('Social login requires PostgreSQL'); }
  async deleteAccount() { throw new Error('Social login requires PostgreSQL'); }
}
