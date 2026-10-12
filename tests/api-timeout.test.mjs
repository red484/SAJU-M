import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

test('timeout gives a readable message and preserves AbortError classification', async () => {
  const source = readFileSync(new URL('../src/client/api/client.js', import.meta.url), 'utf8').replaceAll('export ', '');
  const ctx = vm.createContext({AbortController, setTimeout, clearTimeout,
    fetch: (_, {signal}) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason)))
  });
  vm.runInContext(source, ctx);
  await assert.rejects(vm.runInContext("apiRequest('/api/auth/me',{timeout:5})", ctx), error => {
    assert.equal(error.name, 'AbortError');
    assert.match(error.message, /서버 응답이 지연/);
    return true;
  });
});

test('auth status renders even when journal initialization failed', () => {
  const source = readFileSync(new URL('../src/client/app.js', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('async function loadAuth(){'), source.indexOf('// Warm the'));
  assert.doesNotMatch(body, /if\(loaded\)render/);
});

test('shared Docker network routes only to this app backend', () => {
  const config = readFileSync(new URL('../deploy/container-nginx/default.conf', import.meta.url), 'utf8');
  assert.doesNotMatch(config, /http:\/\/backend:/);
  assert.equal(config.match(/http:\/\/saju-backend:9090/g).length, 2);
});
