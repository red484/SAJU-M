import assert from 'node:assert/strict';
import { NOTE_PAGES, reminderId, resolveNoteMode, reviewReminders } from '../src/client/app-mode.js';

const memory = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k) }; };

// iOS is always the note app; Android and the web stay 달빛 사주 unless asked.
assert.equal(resolveNoteMode({ platform: 'ios' }), true);
assert.equal(resolveNoteMode({ platform: 'android', search: '', storage: memory() }), false);
assert.equal(resolveNoteMode({ platform: 'web', search: '', storage: memory() }), false);

// ?app=note sticks for the tab, ?app=saju turns it off again.
const tab = memory();
assert.equal(resolveNoteMode({ platform: 'web', search: '?app=note', storage: tab }), true);
assert.equal(resolveNoteMode({ platform: 'web', search: '', storage: tab }), true);
assert.equal(resolveNoteMode({ platform: 'web', search: '?app=saju', storage: tab }), false);
assert.equal(resolveNoteMode({ platform: 'web', search: '?app=note', storage: { getItem() { throw new Error(); }, setItem() { throw new Error(); } } }), true);

// No saju, daily-flow or consultation screens in the note app.
for (const page of ['birth', 'topic', 'result', 'today', 'chat']) assert.equal(NOTE_PAGES.includes(page), false);

const id = '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed';
assert.equal(reminderId(id), reminderId(id));
assert.ok(Number.isInteger(reminderId(id)) && reminderId(id) > 0 && reminderId(id) <= 2 ** 31);
assert.notEqual(reminderId(id), reminderId(id.replace('1b', '2b')));

const now = new Date(2026, 9, 28, 12).getTime();
const record = (n, due, result = 'pending') => ({ id: `r${n}`, title: `선택 ${n}`, due, result });
const reminders = reviewReminders([
  record(1, '2026-10-30'),
  record(2, '2026-10-29'),
  record(3, '2026-10-27'),            // already past
  record(4, '2026-10-31', 'good'),    // already reviewed
  record(5, ''),                      // no review date
  record(6, '2026-10-28')             // today, 20:00 is still ahead
], now);
assert.deepEqual(reminders.map(r => r.extra.recordId), ['r6', 'r2', 'r1']);
assert.equal(reminders[0].at.getHours(), 20);
assert.match(reminders[1].body, /선택 2/);

const many = Array.from({ length: 80 }, (_, i) => record(i, `2026-11-${String(1 + (i % 28)).padStart(2, '0')}`));
assert.equal(reviewReminders(many, now).length, 60);

console.log('app mode tests passed');
