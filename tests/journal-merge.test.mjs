import assert from 'node:assert/strict';
import { mergeJournal } from '../src/client/journal-merge.js';

const base = { profile: { name: '테스트' }, records: [{ id: 'a', title: '기존' }], conversations: [], savedAnswers: [] };
const local = { ...base, records: [...base.records, { id: 'b', title: '내 기록' }] };
const remote = { ...base, records: [...base.records, { id: 'c', title: '다른 탭' }] };
assert.deepEqual(mergeJournal(base, local, remote).records.map(r => r.id), ['a', 'c', 'b']);
assert.deepEqual(mergeJournal(base, local, base), local);
assert.equal(mergeJournal(base, { ...base, records: [{ id: 'a', title: '내 수정' }] },
  { ...base, records: [{ id: 'a', title: '상대 수정' }] }), null);
assert.deepEqual(mergeJournal(base, { ...base, records: [] }, base).records, []);
assert.equal(mergeJournal(base, { ...base, profile: { name: '내 수정' } },
  { ...base, profile: { name: '상대 수정' } }), null);
console.log('PASS: independent journal edits merge; conflicting edits stay protected.');
