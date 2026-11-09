import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ReviewAccessRepository } from '../src/server/repositories/review-access-repository.mjs';

test('review access is limited by account, expiry, and daily usage', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE review_access_grants (user_id uuid PRIMARY KEY, expires_at timestamptz, daily_limit int);
      CREATE TABLE coach_answers (user_id uuid, created_at timestamptz NOT NULL DEFAULT now());`);
    const id = '00000000-0000-0000-0000-000000000001';
    await db.query("INSERT INTO review_access_grants VALUES ($1, now() + interval '1 day', 2)", [id]);
    const repo = new ReviewAccessRepository();
    assert.equal((await repo.status(id, db)).remaining, 2);
    assert.equal(await repo.status('00000000-0000-0000-0000-000000000002', db), null);
    await db.query('INSERT INTO coach_answers (user_id) VALUES ($1), ($1)', [id]);
    assert.equal((await repo.status(id, db)).remaining, 0);
    await db.query("UPDATE review_access_grants SET expires_at = now() - interval '1 second' WHERE user_id = $1", [id]);
    assert.equal(await repo.status(id, db), null);
  } finally { await db.close(); }
});
