export class ReviewAccessRepository {
  async status(userId, client) {
    const { rows } = await client.query(`SELECT g.daily_limit, g.expires_at,
      (SELECT count(*)::int FROM coach_answers a WHERE a.user_id = g.user_id
        AND a.created_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul') AS used
      FROM review_access_grants g WHERE g.user_id = $1 AND g.expires_at > now()`, [userId]);
    if (!rows.length) return null;
    const { daily_limit: limit, used, expires_at: expiry } = rows[0];
    const remaining = Math.max(0, limit - used);
    return { limit, used, remaining, freeRemaining: 0, paidRemaining: remaining,
      paidNextExpiry: expiry, paidPacks: [], plan: 'review', planExpiry: expiry, reviewAccess: true };
  }
}
