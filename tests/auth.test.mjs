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
  async logout(token, anonymousId) { this.loggedOut = token; this.loggedOutSession = anonymousId; },
  async registerPassword() { throw new Error('not used'); },
  async signIn(identity, anonymousId, destinationId) { this.identity = identity; this.anonymousId = anonymousId; this.destinationId = destinationId; return { token: 'toss-token', userId: 'toss-user' }; }
};
const route = createAuthRoutes(repository);

function response() {
  return { status: 0, headers: {}, body: '', writeHead(status, headers = {}) { this.status = status; this.headers = headers; }, end(body = '') { this.body = body; } };
}
async function call(path, { method = 'GET', cookie = '', origin = '', body = '', headers = {} } = {}) {
  const req = { method, headers: { host: 'saju.example.com', cookie, ...(origin ? { origin } : {}), ...headers }, socket: { encrypted: true }, async *[Symbol.asyncIterator]() { if (body) yield Buffer.from(body); } };
  const res = response();
  await route(req, res, new URL(path, 'https://saju.example.com'));
  return res;
}

let res = await call('/api/auth/providers');
assert.equal(res.status, 200);
assert.deepEqual(JSON.parse(res.body), { google: false, apple: false, toss: false, password: true });

res = await call('/api/auth/guest', { method: 'POST', origin: 'https://evil.example' });
assert.equal(res.status, 403);
res = await call('/api/auth/guest', { method: 'POST' });
assert.equal(res.status, 200);
assert.match(JSON.parse(res.body).guest.id, /^[a-f0-9]{64}$/);
assert.equal(JSON.parse(res.body).token, undefined);
const guestCookie = res.headers['Set-Cookie'].split(';')[0];
const firstGuest = JSON.parse(res.body).guest.id;
res = await call('/api/auth/guest', { method: 'POST', cookie: guestCookie });
assert.equal(JSON.parse(res.body).guest.id, firstGuest);
res = await call('/api/auth/me', { cookie: guestCookie });
assert.equal(JSON.parse(res.body).user, null);

res = await call('/api/auth/me', { cookie: 'dalbit_auth=signed-in' });
assert.equal(JSON.parse(res.body).user.email, 'moon@example.com');
res = await call('/api/auth/me', { headers: { authorization: 'Bearer signed-in' } });
assert.equal(JSON.parse(res.body).user.id, 'u1');

res = await call('/api/auth/logout', { method: 'POST', cookie: 'dalbit_auth=signed-in', origin: 'https://saju.example.com' });
assert.equal(res.status, 200);
assert.equal(repository.loggedOut, 'signed-in');
assert.match(repository.loggedOutSession, /^[a-f0-9]{64}$/);
assert.equal(Array.isArray(res.headers['Set-Cookie']), true);

process.env.TOSS_LOGIN_MOCK = 'true';
process.env.TOSS_ALLOWED_ORIGINS = '*';
const tossSession = 'a'.repeat(64);
res = await call('/api/auth/toss', { method: 'POST', origin: 'https://miniapp.toss.im',
  headers: { 'x-dalbit-session': tossSession },
  body: JSON.stringify({ authorizationCode: 'mock', referrer: 'LOCAL', mockUserKey: 'toss-1234',
    mockName: '홍길동', mockEmail: 'hong@example.com' }) });
delete process.env.TOSS_LOGIN_MOCK;
delete process.env.TOSS_ALLOWED_ORIGINS;
assert.equal(res.status, 200);
assert.equal(JSON.parse(res.body).token, 'toss-token');
assert.deepEqual(repository.identity, { provider: 'toss', subject: 'toss-1234', email: 'hong@example.com', name: '홍길동' });
assert.deepEqual(JSON.parse(res.body).user, { id: 'toss-user', name: '홍길동', email: 'hong@example.com' });
assert.equal(repository.anonymousId.length, 64);
// Login moves the account to a new session so the device's previous session cannot keep reading it.
const issuedSession = JSON.parse(res.body).session;
assert.match(issuedSession, /^[a-f0-9]{64}$/);
assert.notEqual(issuedSession, tossSession);
assert.notEqual(repository.destinationId, repository.anonymousId);
assert.equal(repository.destinationId.length, 64);

process.env.TOSS_LOGIN_MOCK = 'true';
const signIn = repository.signIn;
repository.signIn = async () => { throw new Error('connect ECONNREFUSED /app/secrets/toss/private.key'); };
const quietError = console.error;
try {
  console.error = () => {};
  res = await call('/api/auth/toss', { method: 'POST', body: JSON.stringify({ authorizationCode: 'mock' }) });
} finally { console.error = quietError; repository.signIn = signIn; delete process.env.TOSS_LOGIN_MOCK; }
assert.equal(res.status, 500);
assert.doesNotMatch(JSON.parse(res.body).error, /secrets|ECONNREFUSED/);

process.env.GOOGLE_CLIENT_ID = 'client-id';
process.env.GOOGLE_CLIENT_SECRET = 'client-secret';
process.env.AUTH_BASE_URL = 'https://saju.example.com';
res = await call('/api/auth/start?provider=google&returnTo=%2Fsettings');
assert.equal(res.status, 302);
assert.match(res.headers.Location, /^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?/);
assert.match(res.headers.Location, /redirect_uri=https%3A%2F%2Fsaju\.example\.com%2Fapi%2Fauth%2Fcallback%2Fgoogle/);
assert.equal(res.headers['Set-Cookie'].length, 3);
assert.match(res.headers.Location, /nonce=/);
assert.doesNotMatch(res.headers.Location, /access_type=offline/, '쓰지 않는 리프레시 토큰은 요청하지 않는다');
// Without account storage (local file mode) a configured provider still cannot finish signing in.
const fileMode = createAuthRoutes({ async userFromToken() { return null; }, async logout() {}, async signIn() { throw new Error('no accounts'); } });
const fileRes = response();
await fileMode({ method: 'GET', headers: { host: 'saju.example.com' }, socket: {} }, fileRes, new URL('https://saju.example.com/api/auth/providers'));
assert.deepEqual(JSON.parse(fileRes.body), { google: false, apple: false, toss: false, password: false });
const fileStart = response();
await fileMode({ method: 'GET', headers: { host: 'saju.example.com' }, socket: {} }, fileStart, new URL('https://saju.example.com/api/auth/start?provider=google'));
assert.equal(fileStart.status, 503);
res = await call(loginUrl('google'));
assert.ok(res.headers['Set-Cookie'].some(value => value.startsWith('dalbit_oauth_return=%2F%3Fauth%3Dsuccess;')));
// Browsers read "/\host" like "//host", so only plain same-origin paths survive.
for (const returnTo of ['//evil.example', '/\\evil.example', 'https://evil.example', '/\t/evil.example']) {
  res = await call(`/api/auth/start?provider=google&returnTo=${encodeURIComponent(returnTo)}`);
  assert.ok(res.headers['Set-Cookie'].some(value => value.startsWith('dalbit_oauth_return=%2Fsettings;')), returnTo);
}
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
