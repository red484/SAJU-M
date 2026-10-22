import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createPool, migrate } from '../server/db.mjs';
import { AuthRepository } from '../src/server/repositories/auth-repository.mjs';
import { PostgresJournalRepository } from '../src/server/repositories/postgres-journal-repository.mjs';

// Only an explicitly supplied disposable database; never use DATABASE_URL.
if (!process.env.TEST_DATABASE_URL) throw new Error('Set TEST_DATABASE_URL to a disposable local database');
const pool = createPool(process.env.TEST_DATABASE_URL);
const session = () => randomBytes(32).toString('hex');
const journal = title => ({ profile: null, records: [{ id: title, title }], conversations: [], savedAnswers: [] });
const titles = async id => (await journals.get(id)).data?.records.map(record => record.title) || [];
const auth = new AuthRepository(pool), journals = new PostgresJournalRepository(pool);
const run = session().slice(0, 8);
const users = [];
const signIn = async (who, from, to) => {
  const signed = await auth.signIn({ provider: 'toss', subject: `isolation-${run}-${who}`, name: who }, from, to);
  users.push(signed.userId);
  return signed;
};
try {
  await migrate(pool);

  // Sign-in moves the account journal off the device's previous session.
  const device = session(), first = session();
  await journals.put(device, journal('A 기록'), 0);
  const a = await signIn('A', device, first);
  assert.deepEqual(await titles(first), ['A 기록']);
  assert.deepEqual(await titles(device), []);

  // A client that keeps its session after logout must not keep reading or writing A's journal.
  await auth.logout(a.token, first);
  assert.deepEqual(await titles(first), []);
  await journals.put(first, journal('익명 기록'), 0);
  assert.deepEqual(await titles(first), ['익명 기록']);

  // B signing in on that same device sees only the device's anonymous journal, never A's.
  const second = session();
  await signIn('B', first, second);
  assert.deepEqual(await titles(second), ['익명 기록']);

  // A's journal is intact for A on any device.
  const elsewhere = session();
  await signIn('A', session(), elsewhere);
  assert.deepEqual(await titles(elsewhere), ['A 기록']);

  // Rows written before this fix: an account journal still keyed by a session that was unlinked.
  const legacy = session();
  await journals.put(legacy, journal('C 기록'), 0);
  const c = await signIn('C', legacy, legacy);
  await pool.query('UPDATE anonymous_sessions SET user_id = NULL WHERE id = $1', [legacy]);
  assert.deepEqual(await titles(legacy), []);
  const dSession = session();
  await journals.put(dSession, journal('D 기록'), 0);
  await signIn('D', dSession, session());
  // D already has a journal; merging into C's old session used to collide on its primary key.
  const dNext = session();
  await signIn('D', legacy, dNext);
  assert.deepEqual(await titles(dNext), ['D 기록']);
  await journals.delete(legacy);
  const cAgain = session();
  await signIn('C', session(), cAgain);
  assert.deepEqual(await titles(cAgain), ['C 기록']);
  assert.ok(c.userId);
  console.log('PASS: PostgreSQL account journals stay isolated across logout, shared devices and legacy sessions.');
} finally {
  await pool.query('DELETE FROM app_users WHERE id = ANY($1::uuid[])', [[...new Set(users)]]).catch(() => {});
  await pool.end();
}
