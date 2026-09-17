import assert from 'node:assert/strict';
import { epicQualityIssues, epicReading } from '../src/server/services/epic-service.mjs';

const originalFetch = globalThis.fetch;
const originalKey = process.env.CAFE24_LLM_API_KEY;
const originalUrl = process.env.CAFE24_LLM_BASE_URL;
const clean = {
  en: 'STILL WATER', kr: '고요', idx: '문 · 방 · 발소리',
  pull: '잠시 멈춰 서서\n다음 길을 살핍니다.',
  chapters: [
    { age: '14–23세', en: 'OPEN DOOR', kr: '첫문', pillar: '甲子 · 편관 · 장생', gate: '처음 길을 살피는 자리', body: '새 선택을 앞두고 무엇을 지킬지 돌아볼 수 있는 자리입니다.', essay: '먼저 할 일을 정리하고 주변의 반응을 살펴볼 수 있습니다.' },
    { age: '24–33세', en: 'QUIET ROOM', kr: '쉼표', pillar: '乙丑 · 정관 · 쇠', gate: '속도를 조절하는 자리', body: '여러 책임 가운데 내 몫을 구분해 볼 수 있는 자리입니다.', essay: '당장 결론을 내기보다 약속과 여력을 확인하는 편이 도움이 됩니다.' },
    { age: '34–43세', en: 'NEW PATH', kr: '새길', pillar: '丙寅 · 편인 · 태', gate: '다음 방향을 찾는 자리', body: '새로 배울 것과 유지할 것을 나눠 보는 자리입니다.', essay: '가능성을 넓히되 실제로 쓸 수 있는 시간을 함께 살핍니다.' }
  ],
  closing: '어느 구간도 정답은 아닙니다. 지금의 조건을 확인하며 다음 방향을 고를 수 있습니다.'
};
const input = {
  name: '테스트', pillars: ['甲子', '乙丑', '丙寅', '丁卯'], dayStem: '병', element: '화',
  strong: ['화'], weak: ['금'], forward: true, start: 4, currentAge: 29,
  cycles: [
    { age: 14, gz: '甲子', label: '갑자', ten: '편관', stage: '장생' },
    { age: 24, gz: '乙丑', label: '을축', ten: '정관', stage: '쇠' },
    { age: 34, gz: '丙寅', label: '병인', ten: '편인', stage: '태' }
  ]
};

try {
  assert.deepEqual(epicQualityIssues(clean), []);
  assert.deepEqual(epicQualityIssues(null), ['schema']);
  const english = structuredClone(clean);
  english.chapters[0].essay = 'Previously 쌓인 것을 Slowly 내려놓습니다.';
  assert.ok(epicQualityIssues(english).includes('latin-in-korean-text'));
  const invented = structuredClone(clean);
  invented.chapters[0].essay = '그 무렵 모든 것을 잃었습니다.';
  assert.ok(epicQualityIssues(invented).includes('unverified-past-fact'));

  process.env.CAFE24_LLM_API_KEY = 'test-key';
  process.env.CAFE24_LLM_BASE_URL = 'https://llm-router.cafe24.com/api/v1/';
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    const content = JSON.stringify(calls === 1 ? english : clean);
    return new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }] }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    });
  };
  const recovered = await epicReading(input);
  assert.equal(calls, 2, '불량 판독은 한 번만 재생성한다');
  assert.deepEqual(recovered.reading, clean);

  calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(english) }, finish_reason: 'stop' }] }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    });
  };
  const rejected = await epicReading(input);
  assert.equal(calls, 2);
  assert.equal(rejected.status, 502);
  assert.equal(rejected.reading, undefined);
  assert.ok(rejected.shape.qualityIssues.includes('latin-in-korean-text'));
  console.log('PASS: epic reading rejects mixed-language and invented-history prose, retries once, then fails closed.');
} finally {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.CAFE24_LLM_API_KEY;
  else process.env.CAFE24_LLM_API_KEY = originalKey;
  if (originalUrl === undefined) delete process.env.CAFE24_LLM_BASE_URL;
  else process.env.CAFE24_LLM_BASE_URL = originalUrl;
}
