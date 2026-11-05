import { X509Certificate, createSign, createVerify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { STORE_PLANS } from '../shared/store-products.mjs';

// https://www.apple.com/certificateauthority/AppleRootCA-G3.cer
export const APPLE_ROOT_G3_SHA256 = '63:34:3A:BF:B8:9A:6A:03:EB:B5:7E:9B:3F:5F:A7:BE:7C:4F:5C:75:6F:30:17:B3:A8:C4:88:C3:65:3E:91:79';
// DER-encoded OIDs Apple documents for App Store signing certificates.
const LEAF_OID = Buffer.from('2a864886f76364060b01', 'hex');
const INTERMEDIATE_OID = Buffer.from('2a864886f76364060201', 'hex');

export const fail = (status, message) => Object.assign(new Error(message), { status });
const decode = part => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
const certificate = der => new X509Certificate(Buffer.from(der, 'base64'));

// Verifies an App Store signed payload against the pinned Apple root and returns its claims.
export function verifyAppleJws(jws, { rootFingerprint = APPLE_ROOT_G3_SHA256, now = Date.now() } = {}) {
  if (typeof jws !== 'string' || jws.length > 20_000) throw fail(400, '구매 정보를 확인하지 못했어요.');
  const parts = jws.split('.');
  if (parts.length !== 3) throw fail(400, '구매 정보를 확인하지 못했어요.');
  try {
    const header = decode(parts[0]);
    if (header.alg !== 'ES256' || !Array.isArray(header.x5c) || header.x5c.length !== 3) throw new Error('header');
    const [leaf, intermediate, root] = header.x5c.map(certificate);
    if (root.fingerprint256 !== rootFingerprint) throw new Error('root');
    if (!intermediate.ca || !intermediate.verify(root.publicKey) || !leaf.verify(intermediate.publicKey)) throw new Error('chain');
    if (!intermediate.raw.includes(INTERMEDIATE_OID) || !leaf.raw.includes(LEAF_OID)) throw new Error('role');
    for (const cert of [leaf, intermediate, root]) {
      if (now < Date.parse(cert.validFrom)) throw new Error('validity');
    }
    const verifier = createVerify('SHA256');
    verifier.update(`${parts[0]}.${parts[1]}`);
    if (!verifier.verify({ key: leaf.publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(parts[2], 'base64url'))) throw new Error('signature');
    return decode(parts[1]);
  } catch {
    throw fail(403, '구매 정보를 확인하지 못했어요.');
  }
}

export const appleBundleId = () => process.env.APPLE_IAP_BUNDLE_ID || 'com.ashwoodfriends.dalbitsaju';
export const googlePackage = () => process.env.GOOGLE_PLAY_PACKAGE || 'com.ashwoodfriends.dalbitsaju';

export function appleSubscription(claims, bundleId = appleBundleId()) {
  if (claims?.bundleId !== bundleId || !STORE_PLANS[claims.productId] || !claims.originalTransactionId) throw fail(403, '구매한 상품을 확인하지 못했어요.');
  const start = new Date(claims.purchaseDate), expires = new Date(claims.expiresDate);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(expires.getTime())) throw fail(403, '구독 기간을 확인하지 못했어요.');
  return { key: `apple:${claims.originalTransactionId}`, platform: 'apple', productId: claims.productId, token: null, periodStart: start, expiresAt: expires, revoked: !!claims.revocationDate, accountToken: claims.appAccountToken || null };
}

// CANCELED means auto-renew is off; the paid period still runs until expiryTime.
const ACTIVE_GOOGLE = new Set(['SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD', 'SUBSCRIPTION_STATE_CANCELED']);
export function googleSubscription(body, token, productId) {
  const line = body?.lineItems?.find(item => item.productId === productId) || body?.lineItems?.[0];
  if (!line || !STORE_PLANS[line.productId]) throw fail(403, '구매한 상품을 확인하지 못했어요.');
  const expires = new Date(line.expiryTime), start = new Date(body.startTime);
  if (!Number.isFinite(expires.getTime()) || !Number.isFinite(start.getTime())) throw fail(403, '구독 기간을 확인하지 못했어요.');
  // Google keeps startTime across renewals, so the current month is derived from the expiry.
  const monthBefore = new Date(expires); monthBefore.setMonth(monthBefore.getMonth() - 1);
  return { key: `google:${token}`, platform: 'google', productId: line.productId, token, periodStart: monthBefore > start ? monthBefore : start, expiresAt: expires,
    revoked: !ACTIVE_GOOGLE.has(body.subscriptionState),
    accountToken: body.externalAccountIdentifiers?.obfuscatedExternalAccountId || null };
}

function serviceAccount() {
  const raw = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
  if (raw) return JSON.parse(raw);
  const path = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_FILE;
  return path ? JSON.parse(readFileSync(path, 'utf8')) : null;
}
export const googleConfigured = () => !!(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_FILE);

let cachedToken = null;
async function googleAccessToken(request) {
  if (cachedToken && cachedToken.expires > Date.now() + 60_000) return cachedToken.value;
  const account = serviceAccount();
  if (!account) throw fail(503, '구독 확인을 준비하고 있어요.');
  const iat = Math.floor(Date.now() / 1000);
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iss: account.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher', aud: 'https://oauth2.googleapis.com/token', iat, exp: iat + 3600 })}`;
  const signature = createSign('RSA-SHA256').update(unsigned).sign(account.private_key, 'base64url');
  const response = await request('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }), signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw fail(502, 'Google 구독을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.');
  const body = await response.json();
  cachedToken = { value: body.access_token, expires: Date.now() + (body.expires_in || 3000) * 1000 };
  return cachedToken.value;
}

export async function fetchGoogleSubscription(token, productId, request = fetch) {
  if (typeof token !== 'string' || !token || token.length > 2048) throw fail(400, '구매 정보를 확인하지 못했어요.');
  const access = await googleAccessToken(request);
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(googlePackage())}/purchases/subscriptionsv2/tokens/${encodeURIComponent(token)}`;
  const response = await request(url, { headers: { Authorization: `Bearer ${access}` }, signal: AbortSignal.timeout(8_000) });
  if (response.status === 404 || response.status === 410) throw fail(403, '구매 정보를 확인하지 못했어요.');
  if (!response.ok) throw fail(502, 'Google 구독을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.');
  return googleSubscription(await response.json(), token, productId);
}
