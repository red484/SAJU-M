import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, validPassword } from '../src/server/password.mjs';
import { createAuthRoutes } from '../src/server/auth.mjs';

assert.equal(validPassword('short'), false);
assert.equal(validPassword('a'.repeat(129)), false);
assert.equal(validPassword(null), false);
const password = 'test-only-password-42';
const encoded = await hashPassword(password);
assert.notEqual(encoded, await hashPassword(password));
assert.equal(await verifyPassword(password, encoded), true);
assert.equal(await verifyPassword('wrong-password', encoded), false);
assert.equal(await verifyPassword(password, null), false);

let creates = 0;
const repository = {
  async userFromToken(token) { return token === 'already-in' ? { id: 'u1' } : null; },
  async registerPassword(value, id) { creates++; assert.equal(value, password); assert.match(id, /^[a-f0-9]{64}$/); return { token: 'secret-session', loginId: 'guest-' + 'a'.repeat(20) }; },
  async loginPassword(id, value) { return value === password ? { token: 'secret-session', loginId: id } : null; }
};
const route = createAuthRoutes(repository);
async function call(path, body, { origin = 'https://saju.test', cookie = '', method = 'POST', address = 'test' } = {}) {
  const req = { method, headers: { host: 'saju.test', origin, cookie }, socket: { encrypted: true, remoteAddress: address },
    async *[Symbol.asyncIterator]() { yield Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)); } };
  const res = { headers: {}, writeHead(status, headers) { this.status = status; this.headers = headers; }, end(payload) { this.body = JSON.parse(payload); } };
  await route(req, res, new URL(path, 'https://saju.test'));
  return res;
}
const register = '/api/auth/password/register', login = '/api/auth/password/login';
assert.equal((await call(register, { password }, { origin: 'https://evil.test' })).status, 403);
assert.equal((await call(register, { password }, { method: 'GET' })).status, 405);
assert.equal((await call(register, '{')).status, 400);
assert.equal((await call(register, { password: 'short' })).status, 400);
assert.equal((await call(register, { password })).status, 400);
assert.equal((await call(register, { password, acknowledgeRecovery: true }, { cookie: 'dalbit_auth=already-in' })).status, 409);
const created = await call(register, { password, acknowledgeRecovery: true });
assert.equal(created.status, 200); assert.equal(creates, 1);
assert.equal(created.body.token, undefined);
assert.match(created.headers['Set-Cookie'][1], /HttpOnly; SameSite=Lax.*Secure/);
const loginId = created.body.loginId;
assert.equal((await call(login, { loginId, password: 'incorrect-pass' })).status, 401);
assert.equal((await call(login, { loginId: loginId.toUpperCase(), password })).status, 200);
for (let i = 0; i < 8; i++) await call(login, { loginId, password: 'incorrect-pass' }, { address: 'other' });
assert.equal((await call(login, { loginId, password }, { address: 'other' })).status, 429);
console.log('PASS: salted password hashing, validation, cookies, CSRF, login and throttling.');
