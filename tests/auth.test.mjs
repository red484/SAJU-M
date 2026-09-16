import assert from 'node:assert/strict';
import { createAuthRoutes } from '../src/server/auth.mjs';

const repository = {
  async userFromToken(token) { return token === 'signed-in' ? { id: 'u1', display_name: '달빛', email: 'moon@example.com' } : null; },
  async logout(token) { this.loggedOut = token; }
};
const route = createAuthRoutes(repository);

function response() {
  return { status: 0, headers: {}, body: '', writeHead(status, headers = {}) { this.status = status; this.headers = headers; }, end(body = '') { this.body = body; } };
}
async function call(path, { method = 'GET', cookie = '', origin = '' } = {}) {
  const req = { method, headers: { host: 'saju.example.com', cookie, ...(origin ? { origin } : {}) }, socket: { encrypted: true }, async *[Symbol.asyncIterator]() {} };
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
delete process.env.GOOGLE_CLIENT_ID;
delete process.env.GOOGLE_CLIENT_SECRET;
delete process.env.AUTH_BASE_URL;

console.log('PASS: auth provider status, current user, logout cookies and Google OAuth redirect.');
