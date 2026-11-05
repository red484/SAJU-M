import { STORE_PLANS, PLUS_ANSWERS, UNLIMITED_DAILY_LIMIT } from '../shared/store-products.mjs';
import { appleSubscription, fail, fetchGoogleSubscription, googleConfigured, verifyAppleJws } from './store-verification.mjs';

const today = "(now() AT TIME ZONE 'Asia/Seoul')::date";
const RECHECK_MS = 6 * 60 * 60 * 1000;
const UNLIMITED_ID = Object.values(STORE_PLANS).find(plan => plan.unlimited).id;

export class StoreBillingRepository {
  constructor(pool, { verifyApple = verifyAppleJws, fetchGoogle = fetchGoogleSubscription } = {}) {
    this.pool = pool; this.verifyApple = verifyApple; this.fetchGoogle = fetchGoogle;
  }
  async syncApple(userId, jws) {
    return this.save(userId, appleSubscription(this.verifyApple(jws)));
  }
  async syncGoogle(userId, token, productId) {
    return this.save(userId, await this.fetchGoogle(token, productId));
  }
  // The stores are asked before the transaction so a slow API never holds a pooled connection.
  async save(userId, sub) {
    if (sub.accountToken && sub.accountToken !== userId) throw fail(409, '다른 계정에서 구매한 구독입니다.');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`coach:${userId}`]);
      const prior = await client.query('SELECT user_id FROM store_subscriptions WHERE subscription_key = $1 FOR UPDATE', [sub.key]);
      if (prior.rows[0]?.user_id && prior.rows[0].user_id !== userId) throw fail(409, '다른 계정에 연결된 구독입니다.');
      await client.query(`INSERT INTO store_subscriptions (subscription_key, user_id, platform, product_id, purchase_token, period_start, expires_at, revoked)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (subscription_key) DO UPDATE SET
          user_id = EXCLUDED.user_id,
          period_used = CASE WHEN EXCLUDED.period_start > store_subscriptions.period_start THEN 0 ELSE store_subscriptions.period_used END,
          product_id = CASE WHEN EXCLUDED.expires_at >= store_subscriptions.expires_at THEN EXCLUDED.product_id ELSE store_subscriptions.product_id END,
          period_start = GREATEST(EXCLUDED.period_start, store_subscriptions.period_start),
          expires_at = GREATEST(EXCLUDED.expires_at, store_subscriptions.expires_at),
          revoked = EXCLUDED.revoked, checked_at = now()`,
      [sub.key, userId, sub.platform, sub.productId, sub.token, sub.periodStart, sub.expiresAt, sub.revoked]);
      await client.query('COMMIT');
      return { granted: !sub.revoked && sub.expiresAt.getTime() > Date.now(), plan: STORE_PLANS[sub.productId].plan, expiresAt: sub.expiresAt };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  // App Store Server Notifications V2: renewals and refunds reach us without the app being opened.
  async appleNotification(signedPayload) {
    const notice = this.verifyApple(signedPayload);
    const signed = notice?.data?.signedTransactionInfo;
    if (!signed) return { handled: false };
    const sub = appleSubscription(this.verifyApple(signed));
    const revoked = sub.revoked || notice.notificationType === 'REFUND' || notice.notificationType === 'REVOKE';
    const result = await this.pool.query(`UPDATE store_subscriptions SET
        period_used = CASE WHEN $2::timestamptz > period_start THEN 0 ELSE period_used END,
        period_start = GREATEST($2::timestamptz, period_start),
        product_id = CASE WHEN $3::timestamptz >= expires_at THEN $4 ELSE product_id END,
        expires_at = GREATEST($3::timestamptz, expires_at),
        revoked = $5, checked_at = now()
      WHERE subscription_key = $1`, [sub.key, sub.periodStart, sub.expiresAt, sub.productId, revoked]);
    return { handled: result.rowCount === 1 };
  }
  // Google has no push here: a stale or lapsed row is asked again, at most every six hours.
  async refresh(userId) {
    if (!googleConfigured()) return;
    const { rows } = await this.pool.query(`SELECT purchase_token, product_id FROM store_subscriptions
      WHERE user_id = $1 AND platform = 'google' AND NOT (revoked AND expires_at < now() - interval '30 days') AND checked_at < $2`,
    [userId, new Date(Date.now() - RECHECK_MS)]);
    for (const row of rows) {
      try { await this.save(userId, await this.fetchGoogle(row.purchase_token, row.product_id)); }
      catch { /* Keep the last known period when Google is unavailable. */ }
    }
  }
  async allowance(userId, client = this.pool) {
    const { rows } = await client.query(`SELECT product_id, expires_at, period_used, total_used,
        revoked, expires_at > now() AS live, CASE WHEN day_key = ${today} THEN day_used ELSE 0 END AS day_used
      FROM store_subscriptions WHERE user_id = $1`, [userId]);
    const live = rows.filter(row => row.live && !row.revoked);
    const unlimited = live.find(row => row.product_id === UNLIMITED_ID);
    const plus = live.filter(row => row.product_id !== UNLIMITED_ID);
    const plusLeft = plus.reduce((sum, row) => sum + Math.max(0, PLUS_ANSWERS - row.period_used), 0);
    return {
      consumed: rows.reduce((sum, row) => sum + row.total_used, 0),
      remaining: unlimited ? Math.max(0, UNLIMITED_DAILY_LIMIT - unlimited.day_used) : plusLeft,
      next_expiry: (unlimited || plus[0])?.expires_at || null,
      packs: [],
      plan: unlimited ? 'unlimited' : plus.length ? 'plus' : null
    };
  }
  async availableOrder(userId) {
    await this.refresh(userId);
    const { rows } = await this.pool.query(`SELECT subscription_key FROM store_subscriptions
      WHERE user_id = $1 AND NOT revoked AND expires_at > now()
        AND ((product_id = $2 AND (day_key IS DISTINCT FROM ${today} OR day_used < $3)) OR (product_id <> $2 AND period_used < $4))
      ORDER BY (product_id = $2) DESC, expires_at`, [userId, UNLIMITED_ID, UNLIMITED_DAILY_LIMIT, PLUS_ANSWERS]);
    return rows[0]?.subscription_key || null;
  }
  async consume(key, client) {
    const result = await client.query(`UPDATE store_subscriptions SET
        period_used = period_used + 1, total_used = total_used + 1,
        day_used = CASE WHEN day_key = ${today} THEN day_used + 1 ELSE 1 END, day_key = ${today}
      WHERE subscription_key = $1 AND NOT revoked AND expires_at > now()
        AND ((product_id = $2 AND (day_key IS DISTINCT FROM ${today} OR day_used < $3)) OR (product_id <> $2 AND period_used < $4))
      RETURNING subscription_key`, [key, UNLIMITED_ID, UNLIMITED_DAILY_LIMIT, PLUS_ANSWERS]);
    if (result.rowCount !== 1) throw fail(409, '구독 이용 한도를 확인하지 못했어요.');
  }
}

// One allowance over Toss packs and store subscriptions, so CoachQuotaRepository stays unchanged.
const STORE_PREFIX = 'store:';
export class CoachPaidAllowance {
  constructor(toss, store) { this.toss = toss; this.store = store; }
  async allowance(userId, client) {
    const [toss, store] = [await this.toss.allowance(userId, client), await this.store.allowance(userId, client)];
    const dates = [toss.next_expiry, store.next_expiry].filter(Boolean).map(value => new Date(value));
    return {
      consumed: toss.consumed + store.consumed,
      remaining: toss.remaining + store.remaining,
      next_expiry: dates.length ? new Date(Math.min(...dates)) : null,
      packs: toss.packs || [],
      plan: store.plan,
      planExpiry: store.next_expiry
    };
  }
  async availableOrder(userId) {
    const key = await this.store.availableOrder(userId);
    return key ? STORE_PREFIX + key : this.toss.availableOrder(userId);
  }
  async consume(order, client) {
    return order.startsWith(STORE_PREFIX) ? this.store.consume(order.slice(STORE_PREFIX.length), client) : this.toss.consume(order, client);
  }
  refresh(userId) { return this.store.refresh(userId); }
}
