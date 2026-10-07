import assert from 'node:assert/strict';
import { createPool, migrate } from '../server/db.mjs';
import { AuthRepository } from '../src/server/repositories/auth-repository.mjs';
import { PostgresJournalRepository } from '../src/server/repositories/postgres-journal-repository.mjs';

// Only an explicitly supplied disposable database; never use DATABASE_URL.
if (!process.env.TEST_DATABASE_URL) throw new Error('Set TEST_DATABASE_URL to a disposable local database');
const pool = createPool(process.env.TEST_DATABASE_URL);
try {
  await migrate(pool);
  const auth = new AuthRepository(pool), journals = new PostgresJournalRepository(pool);
  const first = 'a'.repeat(64), second = 'b'.repeat(64), rotated = 'c'.repeat(64), next = 'd'.repeat(64);
  const data = { profile: null, records: [{ id: 'test-record', title: '검증 기록' }], conversations: [], savedAnswers: [] };
  await journals.put(first, data, 0);
  const previewId = 'guest-1234567890abcdef1234';
  const signed = await auth.registerPassword('test-only-password-42', first, rotated, previewId);
  assert.equal(signed.loginId, previewId);
  await assert.rejects(auth.registerPassword('different-password-42', second, next, previewId), error => error.code === '23505');
  assert.equal(await auth.loginPassword(previewId, 'different-password-42', second), null);
  assert.match(signed.loginId, /^guest-[a-f0-9]{20}$/);
  assert.equal((await auth.userFromToken(signed.token)).login_id, signed.loginId);
  assert.equal((await journals.get(first)).data, null);
  assert.deepEqual((await journals.get(rotated)).data.records, data.records);
  await auth.logout(signed.token);
  assert.equal(await auth.userFromToken(signed.token), null);
  assert.equal(await auth.loginPassword(signed.loginId, 'wrong-password-42', second), null);
  assert.equal(await auth.loginPassword('guest-' + '0'.repeat(20), 'test-only-password-42', second), null);
  const again = await auth.loginPassword(signed.loginId, 'test-only-password-42', second, next);
  assert.equal(again.userId, signed.userId);
  assert.deepEqual((await journals.get(next)).data.records, data.records);
  assert.deepEqual((await journals.get(rotated)).data.records, data.records);
  assert.equal((await journals.get(second)).data, null);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM app_users')).rows[0].n, 1);
  assert.match((await pool.query('SELECT password_hash FROM password_accounts')).rows[0].password_hash, /^scrypt1:/);
  await auth.deleteAccount(signed.userId, next);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM password_accounts')).rows[0].n, 0);
  assert.equal(await auth.userFromToken(again.token), null);
  console.log('PASS: PostgreSQL guest creation, journal migration, cross-device login, logout and account deletion.');
} finally { await pool.end(); }
