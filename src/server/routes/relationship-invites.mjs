import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { authToken } from '../auth.mjs';
import { clientAddress, readBody, sendJson, validateOrigin } from '../http.mjs';
import { createMemoryRateLimiter } from '../rate-limit.mjs';
import { validSummary } from '../../shared/compat.mjs';

const hash = token => createHash('sha256').update(token).digest('hex');
const TOKEN = /^[A-Za-z0-9_-]{32,64}$/;
const MAX_ACTIVE = 20;

export class RelationshipInviteRepository {
  constructor(pool) { this.pool = pool; }
  async create(ownerId, summary) {
    const active = await this.pool.query('SELECT count(*)::int AS n FROM relationship_invites WHERE owner_id = $1 AND expires_at > now()', [ownerId]);
    if (active.rows[0].n >= MAX_ACTIVE) return null;
    const token = randomBytes(24).toString('base64url'), id = randomUUID();
    await this.pool.query(`INSERT INTO relationship_invites (id, token_hash, owner_id, owner_summary, expires_at)
      VALUES ($1, $2, $3, $4::jsonb, now() + interval '30 days')`, [id, hash(token), ownerId, JSON.stringify(summary)]);
    return { id, token };
  }
  async list(ownerId) {
    const { rows } = await this.pool.query(`SELECT id, owner_summary, guest_summary, expires_at FROM relationship_invites
      WHERE owner_id = $1 AND expires_at > now() ORDER BY created_at DESC`, [ownerId]);
    return rows.map(row => ({ id: row.id, owner: row.owner_summary, guest: row.guest_summary, expiresAt: row.expires_at }));
  }
  async remove(ownerId, id) {
    const result = await this.pool.query('DELETE FROM relationship_invites WHERE owner_id = $1 AND id = $2', [ownerId, id]);
    return result.rowCount === 1;
  }
  async open(token) {
    const { rows } = await this.pool.query(`SELECT owner_summary, guest_summary FROM relationship_invites
      WHERE token_hash = $1 AND expires_at > now()`, [hash(token)]);
    return rows[0] ? { ownerName: rows[0].owner_summary.name, answered: !!rows[0].guest_summary } : null;
  }
  async accept(token, summary) {
    const { rows } = await this.pool.query(`UPDATE relationship_invites SET guest_summary = $2::jsonb
      WHERE token_hash = $1 AND expires_at > now() AND guest_summary IS NULL RETURNING owner_summary`, [hash(token), JSON.stringify(summary)]);
    return rows[0]?.owner_summary || null;
  }
  async deleteExpired() {
    const result = await this.pool.query('DELETE FROM relationship_invites WHERE expires_at <= now()');
    return result.rowCount;
  }
}

export function createRelationshipInviteRoute(auth, invites) {
  const byAddress = createMemoryRateLimiter({ windowMs: 60_000, max: 20 });
  return async (req, res, url) => {
    if (!invites) return sendJson(res, { error: '관계 초대를 준비하고 있어요.' }, 503);
    if (req.method !== 'GET' && !validateOrigin(req)) return sendJson(res, { error: '허용되지 않은 요청입니다.' }, 403);
    if (!byAddress(clientAddress(req))) return sendJson(res, { error: '잠시 후 다시 시도해 주세요.' }, 429);
    const rest = url.pathname.slice('/api/relationship-invites'.length).split('/').filter(Boolean);
    try {
      if (rest[0] === 'public') {
        const token = rest[1];
        if (!TOKEN.test(token || '')) return sendJson(res, { error: '초대 링크를 확인해 주세요.' }, 400);
        if (req.method === 'GET') {
          const invite = await invites.open(token);
          return invite ? sendJson(res, invite) : sendJson(res, { error: '만료되었거나 없는 초대예요.' }, 404);
        }
        if (req.method !== 'POST') return sendJson(res, { error: '허용되지 않은 요청입니다.' }, 405);
        const { summary } = JSON.parse(await readBody(req, 2048));
        if (!validSummary(summary)) return sendJson(res, { error: '입력 내용을 확인해 주세요.' }, 400);
        const owner = await invites.accept(token, summary);
        return owner ? sendJson(res, { owner }) : sendJson(res, { error: '이미 응답했거나 만료된 초대예요.' }, 409);
      }
      const user = await auth?.userFromToken(authToken(req));
      if (!user) return sendJson(res, { error: '로그인 후 이용해 주세요.' }, 401);
      if (req.method === 'GET') return sendJson(res, { invites: await invites.list(user.id) });
      if (req.method === 'DELETE') return sendJson(res, { ok: await invites.remove(user.id, rest[0]) });
      if (req.method !== 'POST') return sendJson(res, { error: '허용되지 않은 요청입니다.' }, 405);
      const { summary } = JSON.parse(await readBody(req, 2048));
      if (!validSummary(summary)) return sendJson(res, { error: '프로필을 확인해 주세요.' }, 400);
      const created = await invites.create(user.id, summary);
      return created ? sendJson(res, created) : sendJson(res, { error: '진행 중인 초대가 너무 많아요. 지난 초대를 삭제해 주세요.' }, 409);
    } catch (error) {
      return sendJson(res, { error: error instanceof SyntaxError ? '요청 형식을 확인해 주세요.' : '관계 초대를 처리하지 못했어요. 잠시 후 다시 시도해 주세요.' }, error instanceof SyntaxError ? 400 : 503);
    }
  };
}
