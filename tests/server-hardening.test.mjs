import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { clientAddress } from '../src/server/http.mjs';
import { createReadingRoutes } from '../src/server/routes/readings.mjs';

const request = (remoteAddress, headers = {}) => ({ socket: { remoteAddress }, headers });

test('client address trusts X-Real-IP only from the private proxy network', () => {
  assert.equal(clientAddress(request('172.18.0.5', { 'x-real-ip': '203.0.113.7' })), '203.0.113.7');
  assert.equal(clientAddress(request('::ffff:127.0.0.1', { 'x-real-ip': '203.0.113.8' })), '203.0.113.8');
  assert.equal(clientAddress(request('198.51.100.9', { 'x-real-ip': '203.0.113.7' })), '198.51.100.9');
  assert.equal(clientAddress(request('172.18.0.5')), '172.18.0.5');
});

function call(route, { body = '{}', ip = '198.51.100.20', cookie = '' } = {}) {
  const req = { method: 'POST', headers: cookie ? { cookie } : {}, socket: { remoteAddress: ip }, async *[Symbol.asyncIterator]() { yield Buffer.from(body); } };
  return new Promise(resolve => {
    let status;
    route(req, { writeHead(s) { status = s; }, end(text) { resolve({ status, body: JSON.parse(text || '{}') }); } });
  });
}

test('AI routes: malformed requests are 400, and fresh sessions cannot bypass the epic limit', async () => {
  process.env.CAFE24_LLM_API_KEY = 'test-only';
  const telemetry = { async start() { return { id: null, started: Date.now() }; }, async finish() {} };
  try {
    const routes = createReadingRoutes(telemetry, null, null);
    assert.equal((await call(routes.epic, { body: '{', ip: '198.51.100.30' })).status, 400);
    // No cookie means a brand-new session per request; the address still bounds them.
    const statuses = [];
    for (let i = 0; i < 21; i++) statuses.push((await call(routes.epic, { body: '{', ip: '198.51.100.31' })).status);
    assert.deepEqual(statuses.slice(0, 20), Array(20).fill(400));
    assert.equal(statuses[20], 429);
  } finally { delete process.env.CAFE24_LLM_API_KEY; }
});

test('static server answers directory paths instead of crashing', async () => {
  const port = 39000 + Math.floor(Math.random() * 1000);
  const server = spawn(process.execPath, ['src/render-server.mjs'], { env: { ...process.env, PORT: String(port), HOST: '127.0.0.1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await once(server.stdout, 'data');
    for (const path of ['/assets', '/assets/', '/']) {
      const response = await fetch(`http://127.0.0.1:${port}${path}`);
      await response.arrayBuffer();
      assert.ok(response.status < 500, `${path} -> ${response.status}`);
    }
    assert.equal(server.exitCode, null);
  } finally { server.kill(); }
});
