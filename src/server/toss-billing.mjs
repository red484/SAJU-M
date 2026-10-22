import { tossJson } from './toss-auth.mjs';
import { TOSS_PRODUCT } from '../shared/toss-product.mjs';

const fail = (status, message) => Object.assign(new Error(message), { status });
export function verifiedOrder(body, orderId) {
  const order = body?.resultType === 'SUCCESS' && body.success;
  if (!order || order.orderId !== orderId || order.sku !== TOSS_PRODUCT.sku)
    throw fail(409, '구매 계정과 상품을 확인하지 못했어요.');
  if (!['PAYMENT_COMPLETED', 'PURCHASED', 'REFUNDED'].includes(order.status))
    throw fail(409, '아직 결제가 완료되지 않았어요.');
  // API timestamps without an offset are Korea local time, not server local time.
  const value = String(order.statusDeterminedAt || '');
  const date = new Date(/(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : `${value}+09:00`);
  if (!Number.isFinite(date.getTime()) || date.getTime() > Date.now() + 60_000)
    throw fail(502, '결제 시각을 확인하지 못했어요.');
  return { ...order, date };
}

export class TossBillingRepository {
  constructor(pool, request = tossJson) { this.pool = pool; this.request = request; }
  async verify(userId, orderId, client = this.pool) {
    if (typeof orderId !== 'string' || !/^[a-zA-Z0-9-]{8,100}$/.test(orderId)) throw fail(400, '잘못된 주문번호입니다.');
    const identity = await client.query("SELECT provider_subject FROM auth_identities WHERE user_id = $1 AND provider = 'toss'", [userId]);
    const key = identity.rows[0]?.provider_subject;
    if (!key) throw fail(403, '구매한 토스 계정으로 로그인해 주세요.');
    // Never accept a userKey or purchase status supplied by the browser.
    const result = await this.request('/api-partner/v1/apps-in-toss/order/get-order-status', {
      method: 'POST', headers: { 'x-toss-user-key': key }, body: { orderId }, timeout: 8_000
    });
    if (result.status !== 200) throw fail(502, '토스 결제 내역을 확인하지 못했어요. 잠시 후 구매 복원을 눌러 주세요.');
    return verifiedOrder(result.body, orderId);
  }
  async grant(userId, orderId) {
    // Toss is asked before the transaction so a slow API never holds a pooled connection.
    const order = await this.verify(userId, orderId);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`coach:${userId}`]);
      const prior = await client.query('SELECT * FROM toss_coach_orders WHERE order_id = $1 FOR UPDATE', [orderId]);
      if (prior.rowCount && prior.rows[0].user_id !== userId) throw fail(409, '다른 계정에 연결된 주문입니다.');
      if (order.status === 'REFUNDED') {
        await client.query('UPDATE toss_coach_orders SET refunded = true WHERE order_id = $1', [orderId]);
        await client.query('COMMIT');
        return { granted: false, refunded: true };
      }
      if (prior.rows[0]?.refunded) throw fail(409, '환불된 주문입니다.');
      await client.query(`INSERT INTO toss_coach_orders (order_id, user_id, sku, purchased_at, expires_at)
        VALUES ($1, $2, $3, $4, $4::timestamptz + interval '30 days') ON CONFLICT (order_id) DO NOTHING`,
      [orderId, userId, order.sku, order.date]);
      // A concurrent claim of the same order must not report success to a different user.
      const saved = await client.query('SELECT user_id, expires_at FROM toss_coach_orders WHERE order_id = $1', [orderId]);
      if (saved.rows[0]?.user_id !== userId) throw fail(409, '다른 계정에 연결된 주문입니다.');
      await client.query('COMMIT');
      return { granted: true, expiresAt: saved.rows[0].expires_at };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  async allowance(userId, client = this.pool) {
    const { rows } = await client.query(`SELECT COALESCE(sum(used),0)::int AS consumed,
      COALESCE(sum(CASE WHEN NOT refunded AND expires_at > now() THEN 50-used ELSE 0 END),0)::int AS remaining
      FROM toss_coach_orders WHERE user_id = $1`, [userId]);
    return rows[0];
  }
  async availableOrder(userId) {
    const { rows } = await this.pool.query(`SELECT order_id FROM toss_coach_orders
      WHERE user_id=$1 AND NOT refunded AND used<50 AND expires_at>now() ORDER BY expires_at`, [userId]);
    // Runs outside any transaction; consume() re-checks refunded/used when the answer is charged.
    for (const row of rows) {
      const order = await this.verify(userId, row.order_id);
      if (order.status === 'REFUNDED') {
        await this.pool.query('UPDATE toss_coach_orders SET refunded=true WHERE order_id=$1', [row.order_id]);
      } else return row.order_id;
    }
    return null;
  }
  async consume(orderId, client) {
    const result = await client.query('UPDATE toss_coach_orders SET used=used+1 WHERE order_id=$1 AND used<50 AND NOT refunded RETURNING order_id', [orderId]);
    if (result.rowCount !== 1) throw fail(409, '상담 이용권을 확인하지 못했어요.');
  }
}
