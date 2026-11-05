import test from 'node:test';
import assert from 'node:assert/strict';
import { LIFE_CHAPTERS, TODAY_QUESTIONS, TIMING_PURPOSES, bestDays, lifeFlow, monthlyPrompt, trend, yearLines, yearSummary } from '../src/client/growth-features.js';
import { PURPOSE } from '../src/client/constants.js';
import { compatibility, summaryOf, validSummary } from '../src/shared/compat.mjs';
import { calculate, fortune, dayReading, goodDays } from '../src/client/engine.js';
import { critique, noteSystemPrompt } from '../src/server/services/coach-service.mjs';
import { applyNoteRecords, noteJournal, validNoteConversations } from '../src/shared/note-journal.mjs';

const profile = { name: '', birth: '1995-05-17', calendar: 'solar', time: '15:30', city: '서울', zone: 'Asia/Seoul', longitude: 126.978, clock: 'civil', gender: 'female', topics: ['진로'] };
const TEN = ['비견', '겁재', '식신', '상관', '편재', '정재', '편관', '정관', '편인', '정인'];
const record = (date, extra = {}) => ({ id: date, title: `선택 ${date}`, date, topic: '진로', result: 'pending', ...extra });

test('every ten god has today and life-flow copy, with no fortune prediction words', () => {
  for (const ten of TEN) {
    assert.ok(TODAY_QUESTIONS[ten]); assert.equal(LIFE_CHAPTERS[ten].length, 2);
    assert.doesNotMatch(LIFE_CHAPTERS[ten].join(' '), /반드시|될 것입니다|대박|불행/);
  }
});

test('today and life flow run on the real engine', () => {
  const result = calculate(profile);
  assert.ok(TODAY_QUESTIONS[dayReading(result, '2026-11-05').ten]);
  const flow = lifeFlow(fortune(result, profile), [record('2026-03-01'), record('1990-01-01')], 2026);
  assert.equal(flow.length, 8);
  assert.equal(flow.filter(c => c.current).length, 1);
  const current = flow.find(c => c.current);
  assert.deepEqual(current.records.map(r => r.date), ['2026-03-01']);
  assert.equal(current.until, current.year + 9);
  assert.equal(lifeFlow(fortune(result, { ...profile, gender: '' }), [], 2026), null);
});

test('timing picks future days with a positive score and never offers medical dates', () => {
  assert.ok(!TIMING_PURPOSES.includes('치료'));
  for (const key of TIMING_PURPOSES) assert.ok(PURPOSE[key]);
  const days = bestDays(goodDays('2026-11', '계약'), '2026-11-10');
  assert.ok(days.length <= 3);
  for (const day of days) { assert.ok(day.iso >= '2026-11-10'); assert.ok(day.score > 0); }
  for (let i = 1; i < days.length; i++) assert.ok(days[i - 1].score >= days[i].score);
});

test('trend, monthly prompt and year review summarize saved records', () => {
  const records = [record('2026-11-01', { result: 'good', actual: '좋았어요', mood: '편안해요', criteriaLabel: '저녁 시간' }), record('2026-11-03'), record('2026-06-01', { result: 'neutral', criteriaLabel: '저녁 시간' }), record('2025-12-01')];
  const rows = trend(records, '2026-11');
  assert.deepEqual(rows.map(r => r.month), ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11']);
  assert.deepEqual([rows[5].total, rows[5].reviewed, rows[5].good], [2, 1, 1]);
  assert.equal(trend(records, '2026-01', 2)[0].month, '2025-12');
  const many = Array.from({ length: 30 }, (_, i) => record('2026-11-02', { title: '가'.repeat(70) + i }));
  assert.ok(monthlyPrompt(many, '2026-11').length <= 780);
  const summary = yearSummary(records, 2026);
  assert.deepEqual([summary.total, summary.reviewed, summary.good, summary.criteria], [3, 2, 1, '저녁 시간']);
  assert.equal(yearLines(yearSummary([], 2026)).length, 2);
});

test('compatibility covers all relations, is symmetric in direction and only accepts summaries', () => {
  const person = (element, name) => ({ name, element, cnt: [2, 2, 1, 2, 1] });
  for (let a = 0; a < 5; a++) for (let b = 0; b < 5; b++) {
    const out = compatibility(person(a, '가'), person(b, '나'));
    for (const value of Object.values(out)) { assert.ok(value); assert.doesNotMatch(value, /\{[ab]\}|undefined/); }
    assert.doesNotMatch(out.title + out.friction, /궁합이 좋|나쁜|점수/);
  }
  assert.match(compatibility(person(0, '가'), person(1, '나')).title, /가님이 나님을 밀어주기/);
  assert.match(compatibility(person(1, '가'), person(0, '나')).title, /나님이 가님을 밀어주기/);
  assert.match(compatibility(person(0, '가'), person(2, '나')).title, /가님이 나님을 다잡기/);
  assert.match(compatibility(person(2, '가'), person(0, '나')).title, /나님이 가님을 다잡기/);
  const summary = summaryOf(calculate(profile), '별명');
  assert.ok(validSummary(summary));
  assert.equal(validSummary({ ...summary, birth: '1995-05-17' }), false);
  assert.equal(validSummary({ ...summary, element: 7 }), false);
  assert.equal(validSummary({ ...summary, cnt: [1] }), false);
  assert.equal(validSummary({ ...summary, name: '가'.repeat(21) }), false);
});

test('note chat rejects saju wording and its history stays apart from saju consultations', () => {
  const body = '현실 확인\n조건을 짚어요.\n\n오늘 할 일\n한 줄 적어 보세요.';
  assert.deepEqual(critique(body, '조건', 2, true), []);
  assert.ok(critique(`${body}\n사주로 보면`, '조건', 2, true).some(fault => fault.includes('사주')));
  assert.deepEqual(critique(`${body}\n사주로 보면`, '조건', 2, false).filter(fault => fault.includes('다루지')), []);
  assert.doesNotMatch(noteSystemPrompt().replace(/\[절대 금지\][\s\S]*?\n\n/, ''), /사주|명리|운세/);
  const saved = applyNoteRecords({ profile: { birth: 'x' }, conversations: [{ id: 'saju' }], savedAnswers: [] }, [], [{ id: 'note', messages: [] }]);
  assert.deepEqual(saved.conversations, [{ id: 'saju' }]);
  assert.deepEqual(noteJournal(saved).conversations, [{ id: 'note', messages: [] }]);
  assert.equal(noteJournal(saved).profile, null);
  assert.equal(validNoteConversations([{ id: 'a', messages: [{ role: 'system', text: 'x' }] }]), false);
  assert.equal(validNoteConversations('x'), false);
});
