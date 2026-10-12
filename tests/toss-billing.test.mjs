import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { TossBillingRepository, verifiedOrder } from '../src/server/toss-billing.mjs';
import { CoachQuotaRepository } from '../src/server/repositories/coach-quota-repository.mjs';
import { createTossPurchaseClient } from '../src/client/toss-billing.js';
import { TOSS_PRODUCT } from '../src/shared/toss-product.mjs';

const orderId = 'test-order-123';
const envelope = (extra = {}) => ({ resultType: 'SUCCESS', success: { orderId, sku: TOSS_PRODUCT.sku, status: 'PAYMENT_COMPLETED', statusDeterminedAt: new Date().toISOString(), ...extra } });
test('only exact paid product and order accepted', () => {
  assert.equal(verifiedOrder(envelope(), orderId).sku, TOSS_PRODUCT.sku);
  for (const extra of [{ sku: 'other' }, { orderId: 'other' }, { status: 'FAILED' }, { status: 'ORDER_IN_PROGRESS' }, { statusDeterminedAt: 'bad' }])
    assert.throws(() => verifiedOrder(envelope(extra), orderId));
  assert.throws(() => verifiedOrder({ resultType: 'FAIL' }, orderId));
});
test('client grant callback fails closed; recovery acknowledges only after grant', async () => {
  let params, cleanup = 0, ok = false, completed = 0;
  const client = createTossPurchaseClient({
    request: async () => ({ response: { ok }, body: { granted: ok } }),
    iap: {
      createOneTimePurchaseOrder: value => { params = value; return () => cleanup++; },
      getPendingOrders: async () => ({ orders: [{ orderId, sku: TOSS_PRODUCT.sku }] }),
      completeProductGrant: async () => { completed++; return true; }
    }
  });
  const buying = client.purchase();
  assert.equal(await params.options.processProductGrant({ orderId }), false);
  await assert.rejects(client.restore()); assert.equal(completed, 0);
  ok = true;
  assert.equal(await params.options.processProductGrant({ orderId }), true);
  params.onEvent({ type: 'success' }); await buying; assert.equal(cleanup, 1);
  assert.equal(await client.restore(), 1); assert.equal(completed, 1);
});
test('Postgres: exact account, idempotent grant, consumption, rollback, expiry, refund', { skip: !process.env.PGLITE_MODULE }, async () => {
  const { PGlite } = await import(process.env.PGLITE_MODULE);
  const db = new PGlite();
  try {
    for (const file of (await readdir(new URL('../server/migrations/', import.meta.url))).filter(f => f.endsWith('.sql')).sort())
      await db.exec(await readFile(new URL('../server/migrations/' + file, import.meta.url), 'utf8'));
    const query = async (sql, args = []) => { const r = await db.query(sql, args); return { ...r, rowCount: r.rows.length || r.affectedRows || 0 }; };
    const pool = { query, async connect() { return { query, release() {} }; } };
    const user = '12345678-1234-1234-1234-123456789012';
    await query('INSERT INTO app_users(id) VALUES($1)', [user]);
    await query("INSERT INTO auth_identities(id,user_id,provider,provider_subject) VALUES($1,$1,'toss','verified-owner')", [user]);
    let status = 'PAYMENT_COMPLETED', calls = 0;
    const billing = new TossBillingRepository(pool, async (path, options) => {
      calls++; assert.equal(options.headers['x-toss-user-key'], 'verified-owner');
      return { status: 200, body: envelope({ orderId: options.body.orderId, status }) };
    });
    const quota = new CoachQuotaRepository(pool, billing);
    await billing.grant(user, orderId); await billing.grant(user, orderId);
    assert.equal((await quota.status(user)).remaining, 55);
    const answer = async () => ({ text: '정상 답변', source: 'cafe24' });
    const payload = i => ({ requestId: 'question-' + i, messages: [{ role: 'user', text: '질문' + i }] });
    for (let i = 0; i < 7; i++) await quota.run(user, payload(i), answer);
    assert.equal((await quota.status(user)).remaining, 48);
    await quota.run(user, payload(6), () => { throw Error('replay'); });
    await assert.rejects(quota.run(user, payload(7), () => { throw Error('AI failed'); }));
    assert.equal((await quota.status(user)).remaining, 48);
    await quota.run(user, payload(7), async () => ({ text: '주제 안내', source: 'scope' }));
    assert.equal((await quota.status(user)).remaining, 48);
    await billing.grant(user, orderId);
    assert.equal((await query('SELECT used FROM toss_coach_orders')).rows[0].used, 2);
    status = 'REFUNDED';
    assert.equal((await quota.run(user, payload(8), answer)).code, 'COACH_LIMIT_REACHED');
    assert.equal((await quota.status(user)).remaining, 0);
    status = 'PURCHASED'; await assert.rejects(billing.grant(user, orderId));
    await billing.grant(user, 'test-order-456');
    await query("UPDATE toss_coach_orders SET expires_at=now()-interval '1 day' WHERE order_id='test-order-456'");
    assert.equal((await quota.status(user)).remaining, 0);
    await billing.grant(user, 'test-order-456'); assert.equal((await quota.status(user)).remaining, 0);
    await query('DELETE FROM app_users WHERE id=$1', [user]);
    assert.equal((await query('SELECT user_id FROM toss_coach_orders LIMIT 1')).rows[0].user_id, null);
    assert.ok(calls > 5);
  } finally { await db.close(); }
});
