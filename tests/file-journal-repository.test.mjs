import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FileJournalRepository, JournalConflictError } from '../src/server/repositories/file-journal-repository.mjs';

const root = await mkdtemp(join(tmpdir(), 'dalbit-journal-'));
try {
  const repository = new FileJournalRepository(root);
  assert.deepEqual(await repository.get('session'), { data: null, revision: 0 });
  assert.deepEqual(await repository.put('session', { records: [], conversations: [] }, 0), { revision: 1 });
  assert.equal((await repository.get('session')).revision, 1);
  await assert.rejects(repository.put('session', { records: [], conversations: [] }, 0), JournalConflictError);
  assert.deepEqual(await repository.put('session', { records: [], conversations: [] }, 1), { revision: 2 });
  await repository.delete('session');
  assert.deepEqual(await repository.get('session'), { data: null, revision: 0 });
  console.log('PASS: file journal repository read, write, conflict and delete.');
} finally {
  await rm(root, { recursive: true, force: true });
}
