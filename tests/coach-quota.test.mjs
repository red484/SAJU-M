import test from 'node:test';
import assert from 'node:assert/strict';
import { CoachQuotaRepository } from '../src/server/repositories/coach-quota-repository.mjs';
import { createReadingRoutes } from '../src/server/routes/readings.mjs';

// Transactional pool double: locks shared by connections, inserts committed atomically.
function database() {
  const rows = new Map(), locks = new Set();
  const count = id => [...rows.values()].filter(r => r.user === id).length;
  return {
    async query(sql, args) { return { rows: [{ used: count(args[0]) }] }; },
    async connect() {
      let held, pending;
      return {
        async query(sql, args = []) {
          if (sql === 'BEGIN') return {};
          if (sql === 'COMMIT' || sql === 'ROLLBACK') {
            if (sql === 'COMMIT' && pending) rows.set(pending.key, pending);
            if (held) locks.delete(held);
            held = pending = null; return {};
          }
          if (sql.includes('pg_try_advisory')) {
            if (locks.has(args[0])) return { rows: [{ locked: false }] };
            held = args[0]; locks.add(held); return { rows: [{ locked: true }] };
          }
          if (sql.includes('count(*)')) return { rows: [{ used: count(args[0]) }] };
          if (sql.startsWith('SELECT question_hash')) {
            const row = rows.get(args[0] + args[1]); return { rowCount: row ? 1 : 0, rows: row ? [row] : [] };
          }
          if (sql.startsWith('INSERT')) { pending = { key: args[0] + args[1], user: args[0], question_hash: args[2], response: JSON.parse(args[3]) }; return {}; }
          throw new Error(sql);
        }, release() { assert.equal(held, null); }
      };
    }
  };
}
const payload = i => ({ requestId: `question-${i}`, messages: [{ role: 'user', text: `진로 고민 ${i}` }] });
const answer = async () => ({ text: '정상 상담 답변', source: 'cafe24' });
test('five lifetime answers, replay after exhaustion, new account independent', async () => {
  const repo = new CoachQuotaRepository(database());
  for (let i = 0; i < 5; i++) assert.equal((await repo.run('a', payload(i), answer)).quota.remaining, 4 - i);
  let called = false;
  const sixth = await repo.run('a', payload(5), async () => { called = true; return answer(); });
  assert.equal(sixth.code, 'COACH_LIMIT_REACHED'); assert.equal(called, false);
  assert.equal((await repo.run('a', payload(4), () => { throw Error('must replay'); })).text, '정상 상담 답변');
  assert.equal((await repo.status('a')).used, 5);
  assert.equal((await repo.run('b', payload(0), answer)).quota.remaining, 4);
});
test('errors, empty answers, scope and safety do not consume credit', async () => {
  const repo = new CoachQuotaRepository(database());
  for (const out of [{ error: 'failed' }, { text: '', source: 'cafe24' }, { text: '안내', source: 'scope' }, { text: '안전', source: 'safety' }])
    assert.equal((await repo.run('a', payload(0), async () => out)).quota.used, 0);
  await assert.rejects(repo.run('a', payload(0), async () => { throw Error('network'); }));
  assert.equal((await repo.run('a', payload(0), answer)).quota.used, 1);
});
test('concurrent requests cannot consume the last credit twice; mismatched retry rejected', async () => {
  const repo = new CoachQuotaRepository(database());
  for (let i = 0; i < 4; i++) await repo.run('a', payload(i), answer);
  let finish, entered;
  const ready = new Promise(r => { entered = r; });
  const running = repo.run('a', payload(4), async () => { entered(); return new Promise(r => { finish = r; }); });
  await ready;
  assert.equal((await repo.run('a', payload(5), answer)).code, 'COACH_BUSY');
  finish(await answer()); await running;
  const changed = payload(4); changed.messages[0].text = '다른 질문';
  assert.equal((await repo.run('a', changed, answer)).code, 'REQUEST_ID_CONFLICT');
  assert.equal((await repo.status('a')).used, 5);
});
test('anonymous POST is rejected before AI or telemetry', async () => {
  const routes = createReadingRoutes({ start() { throw Error('must not start'); } }, { async userFromToken() { return null; } });
  let status, body;
  await routes.coach({ method: 'POST', headers: {}, socket: {} }, { writeHead(s) { status = s; }, end(b) { body = JSON.parse(b); } });
  assert.equal(status, 401); assert.equal(body.code, 'LOGIN_REQUIRED');
});
