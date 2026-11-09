import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createPrivateKey, createSign, X509Certificate } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appleSubscription, googleSubscription, verifyAppleJws } from '../src/server/store-verification.mjs';
import { CoachPaidAllowance } from '../src/server/store-billing.mjs';

// A throwaway chain shaped like Apple's: root, intermediate and leaf with the documented marker OIDs.
function chain(root = 'test-root', markers = true) {
  const dir = mkdtempSync(join(tmpdir(), 'store-chain-'));
  const run = (...args) => execFileSync('openssl', args, { cwd: dir, stdio: 'pipe' });
  const key = name => run('ecparam', '-name', 'prime256v1', '-genkey', '-noout', '-out', `${name}.key`);
  const cnf = (name, body) => writeFileSync(join(dir, name), body);
  for (const name of ['root', 'mid', 'leaf']) key(name);
  run('req', '-x509', '-new', '-key', 'root.key', '-subj', `/CN=${root}`, '-days', '30', '-out', 'root.pem');
  cnf('mid.ext', `basicConstraints=critical,CA:TRUE\n${markers ? '1.2.840.113635.100.6.2.1=ASN1:NULL\n' : ''}`);
  cnf('leaf.ext', `basicConstraints=critical,CA:FALSE\n${markers ? '1.2.840.113635.100.6.11.1=ASN1:NULL\n' : ''}`);
  run('req', '-new', '-key', 'mid.key', '-subj', '/CN=mid', '-out', 'mid.csr');
  run('x509', '-req', '-in', 'mid.csr', '-CA', 'root.pem', '-CAkey', 'root.key', '-CAcreateserial', '-days', '30', '-extfile', 'mid.ext', '-out', 'mid.pem');
  run('req', '-new', '-key', 'leaf.key', '-subj', '/CN=leaf', '-out', 'leaf.csr');
  run('x509', '-req', '-in', 'leaf.csr', '-CA', 'mid.pem', '-CAkey', 'mid.key', '-CAcreateserial', '-days', '30', '-extfile', 'leaf.ext', '-out', 'leaf.pem');
  const read = name => new X509Certificate(readFileSync(join(dir, `${name}.pem`)));
  return { x5c: ['leaf', 'mid', 'root'].map(name => read(name).raw.toString('base64')), fingerprint: read('root').fingerprint256,
    leafKey: createPrivateKey(readFileSync(join(dir, 'leaf.key'))) };
}
function sign({ x5c, leafKey }, claims) {
  const part = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const body = `${part({ alg: 'ES256', x5c })}.${part(claims)}`;
  return `${body}.${createSign('SHA256').update(body).sign({ key: leafKey, dsaEncoding: 'ieee-p1363' }, 'base64url')}`;
}
const NOW = Date.now();
const claims = { bundleId: 'com.ashwoodfriends.ongi', productId: 'ongi_plus_monthly', originalTransactionId: '100', purchaseDate: NOW, expiresDate: NOW + 1000, appAccountToken: 'u1' };

test('Apple JWS is accepted only with the pinned root, marker OIDs and a valid signature', () => {
  const good = chain();
  const jws = sign(good, claims);
  assert.equal(verifyAppleJws(jws, { rootFingerprint: good.fingerprint }).productId, 'ongi_plus_monthly');
  assert.throws(() => verifyAppleJws(jws), /구매 정보/);
  const [head, , tail] = jws.split('.');
  const forged = `${head}.${Buffer.from(JSON.stringify({ ...claims, productId: 'ongi_unlimited_monthly' })).toString('base64url')}.${tail}`;
  assert.throws(() => verifyAppleJws(forged, { rootFingerprint: good.fingerprint }), /구매 정보/);
  const plain = chain('plain-root', false);
  assert.throws(() => verifyAppleJws(sign(plain, claims), { rootFingerprint: plain.fingerprint }), /구매 정보/);
  assert.throws(() => verifyAppleJws('nope'), /구매 정보/);
});

test('Apple transactions must match this app and a known product', () => {
  const sub = appleSubscription(claims);
  assert.equal(sub.key, 'apple:100'); assert.equal(sub.revoked, false); assert.equal(sub.accountToken, 'u1');
  assert.equal(appleSubscription({ ...claims, revocationDate: NOW }).revoked, true);
  assert.throws(() => appleSubscription({ ...claims, bundleId: 'other' }), /상품/);
  assert.throws(() => appleSubscription({ ...claims, productId: 'other' }), /상품/);
});

test('Google states map to usable periods, and renewal moves the period start', () => {
  const body = state => ({ subscriptionState: state, startTime: '2026-01-01T00:00:00Z', lineItems: [{ productId: 'ongi_plus_monthly', expiryTime: '2026-06-01T00:00:00Z' }] });
  assert.equal(googleSubscription(body('SUBSCRIPTION_STATE_ACTIVE'), 't', 'ongi_plus_monthly').revoked, false);
  assert.equal(googleSubscription(body('SUBSCRIPTION_STATE_CANCELED'), 't', 'ongi_plus_monthly').revoked, false);
  assert.equal(googleSubscription(body('SUBSCRIPTION_STATE_EXPIRED'), 't', 'ongi_plus_monthly').revoked, true);
  assert.equal(googleSubscription(body('SUBSCRIPTION_STATE_ACTIVE'), 't', 'ongi_plus_monthly').periodStart.toISOString().slice(0, 7), '2026-05');
  assert.throws(() => googleSubscription({ lineItems: [{ productId: 'x', expiryTime: '2026-06-01T00:00:00Z' }] }, 't', 'x'), /상품/);
});

test('paid allowance prefers subscriptions and routes each charge to its source', async () => {
  const charged = [];
  const toss = { allowance: async () => ({ consumed: 2, remaining: 48, next_expiry: null, packs: [{ remaining: 48 }] }), availableOrder: async () => 'order-1', consume: async order => charged.push(order) };
  const store = { allowance: async () => ({ consumed: 3, remaining: 200, next_expiry: new Date(NOW), packs: [], plan: 'unlimited' }), availableOrder: async () => 'apple:9', consume: async key => charged.push(key), refresh: async () => {} };
  const paid = new CoachPaidAllowance(toss, store);
  const merged = await paid.allowance('u');
  assert.deepEqual([merged.consumed, merged.remaining, merged.plan], [5, 248, 'unlimited']);
  const order = await paid.availableOrder('u');
  assert.equal(order, 'store:apple:9');
  await paid.consume(order); await paid.consume('order-1');
  assert.deepEqual(charged, ['apple:9', 'order-1']);
  store.availableOrder = async () => null;
  assert.equal(await paid.availableOrder('u'), 'order-1');
});
