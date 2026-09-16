import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { importPKCS8 } from 'jose';
import { applePrivateKey, createAuthRoutes } from '../src/server/auth.mjs';
import { loginUrl } from '../src/client/api/auth.js';

const {privateKey} = generateKeyPairSync('ec', {namedCurve:'P-256'});
const pem = privateKey.export({type:'pkcs8',format:'pem'}).toString().trim();
process.env.APPLE_PRIVATE_KEY_B64 = Buffer.from(pem).toString('base64');
assert.equal(applePrivateKey(), pem);
await importPKCS8(applePrivateKey(), 'ES256');
delete process.env.APPLE_PRIVATE_KEY_B64;
process.env.APPLE_PRIVATE_KEY = pem.replace(/\n/g, '\\n');
assert.equal(applePrivateKey(), pem);
delete process.env.APPLE_PRIVATE_KEY;

for (const provider of ['google', 'apple']) {
  const url = new URL(loginUrl(provider), 'https://saju.example.com');
  assert.equal(url.searchParams.get('provider'), provider);
  assert.equal(url.searchParams.get('returnTo'), '/?auth=success');
}

const repository = {
  async userFromToken(token) { return token === 'signed-in' ? { id: 'u1', display_name: '달빛', email: 'moon@example.com' } : null; },
  async logout(token) { this.loggedOut = token; }
};
const route = createAuthRoutes(repository);

function response() {
  return { status: 0, headers: {}, body: '', writeHead(status, headers = {}) { this.status = status; this.headers = headers; }, end(body = '') { this.body = body; } };
}
async function call(path, { method = 'GET', cookie = '', origin = '', body = '' } = {}) {
  const req = { method, headers: { host: 'saju.example.com', cookie, ...(origin ? { origin } : {}) }, socket: { encrypted: true }, async *[Symbol.asyncIterator]() { if (body) yield Buffer.from(body); } };
  const res = response();
  await route(req, res, new URL(path, 'https://saju.example.com'));
  return res;
}

let res = await call('/api/auth/providers');
assert.equal(res.status, 200);
assert.deepEqual(JSON.parse(res.body), { google: false, apple: false });

res = await call('/api/auth/me', { cookie: 'dalbit_auth=signed-in' });
assert.equal(JSON.parse(res.body).user.email, 'moon@example.com');

res = await call('/api/auth/logout', { method: 'POST', cookie: 'dalbit_auth=signed-in', origin: 'https://saju.example.com' });
assert.equal(res.status, 200);
assert.equal(repository.loggedOut, 'signed-in');
assert.equal(Array.isArray(res.headers['Set-Cookie']), true);

process.env.GOOGLE_CLIENT_ID = 'client-id';
process.env.GOOGLE_CLIENT_SECRET = 'client-secret';
process.env.AUTH_BASE_URL = 'https://saju.example.com';
res = await call('/api/auth/start?provider=google&returnTo=%2Fsettings');
assert.equal(res.status, 302);
assert.match(res.headers.Location, /^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?/);
assert.match(res.headers.Location, /redirect_uri=https%3A%2F%2Fsaju\.example\.com%2Fapi%2Fauth%2Fcallback%2Fgoogle/);
assert.equal(res.headers['Set-Cookie'].length, 3);
assert.match(res.headers.Location, /nonce=/);
res = await call(loginUrl('google'));
assert.ok(res.headers['Set-Cookie'].some(value => value.startsWith('dalbit_oauth_return=%2F%3Fauth%3Dsuccess;')));
delete process.env.GOOGLE_CLIENT_ID;
delete process.env.GOOGLE_CLIENT_SECRET;
delete process.env.AUTH_BASE_URL;

process.env.APPLE_CLIENT_ID = 'saju.web';
process.env.APPLE_TEAM_ID = 'TESTTEAM';
process.env.APPLE_KEY_ID = 'TESTKEY';
process.env.APPLE_PRIVATE_KEY = 'malformed';
const originalError = console.error;
try {
  console.error = () => {};
  res = await call('/api/auth/callback/apple', {
    method: 'POST', cookie: 'dalbit_oauth_state=abc; dalbit_oauth_nonce=xyz',
    body: 'state=abc&code=sample'
  });
} finally {
  console.error = originalError;
  for (const name of ['APPLE_CLIENT_ID', 'APPLE_TEAM_ID', 'APPLE_KEY_ID', 'APPLE_PRIVATE_KEY']) delete process.env[name];
}
assert.equal(res.status, 302);
assert.equal(res.headers.Location, '/?auth=failed');

console.log('PASS: auth provider status, current user, logout cookies and Google OAuth redirect.');
