import assert from 'node:assert/strict';
import { chatCompletion, enabled, model, parseJsonReply } from '../src/server/integrations/cafe24-llm.mjs';
import { hasSections, jargonLeaks, critique, readBasis, stripBasis } from '../src/server/services/coach-service.mjs';
import { signalsOf } from '../src/client/engine.js';

const oldKey = process.env.CAFE24_LLM_API_KEY;
const oldModel = process.env.CAFE24_LLM_MODEL;
const oldBaseUrl = process.env.CAFE24_LLM_BASE_URL;
const oldFetch = globalThis.fetch;

try {
  delete process.env.CAFE24_LLM_API_KEY;
  assert.equal(enabled(), false);

  process.env.CAFE24_LLM_API_KEY = 'sk-cafe24-test';
  process.env.CAFE24_LLM_MODEL = 'cafe24/auto';
  process.env.CAFE24_LLM_BASE_URL = 'https://llm-router.cafe24.com/api/v1/';
  assert.equal(enabled(), true);
  assert.equal(model(), 'cafe24/auto');

  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options, body: JSON.parse(options.body) };
    return new Response(JSON.stringify({
      model: 'resolved-model',
      choices: [{ message: { content: '상담 답변' } }],
      usage: { prompt_tokens: 12, completion_tokens: 8 }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  const result = await chatCompletion({
    messages: [{ role: 'user', content: '질문' }],
    maxTokens: 100,
    temperature: 0.7,
    metadata: { feature: 'test' }
  });
  assert.equal(request.url, 'https://llm-router.cafe24.com/api/v1/chat/completions');
  assert.equal(request.options.headers.Authorization, 'Bearer sk-cafe24-test');
  assert.equal(request.body.model, 'cafe24/auto');
  assert.equal(request.body.stream, false);
  assert.equal(request.body.metadata.project, 'dalbit-saju');
  assert.equal(result.text, '상담 답변');
  assert.deepEqual(result.usage, { in: 12, out: 8 });
  await assert.rejects(() => chatCompletion({
    messages: [{ role: 'user', content: '시간 초과 테스트' }], maxTokens: 10,
    deadlineAt: Date.now() - 1
  }), /deadline exceeded/);
  assert.deepEqual(parseJsonReply('```json\n{"ok":true}\n```'), { ok: true });

  // finish_reason을 읽어 올리는지.
  globalThis.fetch = async () => new Response(JSON.stringify({
    choices: [{ message: { content: '한 줄' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 1, completion_tokens: 1 }
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  const stopped = await chatCompletion({ messages: [{ role: 'user', content: 'q' }], maxTokens: 10 });
  assert.equal(stopped.finishReason, 'stop');
  assert.equal(stopped.truncated, false);
  assert.equal(stopped.continuations, 0);

  // 잘린 답을 이어받아 붙이는지. 두 번째 호출에 앞부분이 assistant로 실려 가야 합니다.
  const calls = [];
  const pieces = [
    { content: '사주 관점\n앞부분이 여기서', finish: 'length' },
    { content: ' 끊겼다가 이어집니다.', finish: 'stop' }
  ];
  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    calls.push(body.messages);
    const p = pieces[calls.length - 1];
    return new Response(JSON.stringify({
      choices: [{ message: { content: p.content }, finish_reason: p.finish }],
      usage: { prompt_tokens: 5, completion_tokens: 7 }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const joined = await chatCompletion({
    messages: [{ role: 'user', content: 'q' }], maxTokens: 10, continueOnLength: true
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].at(-2).role, 'assistant');
  assert.equal(calls[1].at(-2).content, '사주 관점\n앞부분이 여기서');
  assert.equal(joined.text, '사주 관점\n앞부분이 여기서 끊겼다가 이어집니다.');
  assert.equal(joined.truncated, false);
  assert.equal(joined.continuations, 1);
  assert.deepEqual(joined.usage, { in: 10, out: 14 });

  // 이어쓰기가 앞말을 되풀이하면 겹친 만큼 잘라내고 붙이는지.
  const repeat = [
    { content: '현실 확인 조건을 숫자로', finish: 'length' },
    { content: '조건을 숫자로 바꿔 적어보세요.', finish: 'stop' }
  ];
  let n = 0;
  globalThis.fetch = async () => {
    const p = repeat[n++];
    return new Response(JSON.stringify({
      choices: [{ message: { content: p.content }, finish_reason: p.finish }],
      usage: { prompt_tokens: 1, completion_tokens: 1 }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const deduped = await chatCompletion({
    messages: [{ role: 'user', content: 'q' }], maxTokens: 10, continueOnLength: true
  });
  assert.equal(deduped.text, '현실 확인 조건을 숫자로 바꿔 적어보세요.');

  // 계속 잘리면 무한정 매달리지 않고 멈추고, 잘렸다고 알리는지.
  let tries = 0;
  globalThis.fetch = async () => {
    tries++;
    return new Response(JSON.stringify({
      choices: [{ message: { content: '또 잘림' }, finish_reason: 'length' }],
      usage: { prompt_tokens: 1, completion_tokens: 1 }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const capped = await chatCompletion({
    messages: [{ role: 'user', content: 'q' }], maxTokens: 10, continueOnLength: true, maxContinuations: 2
  });
  assert.equal(tries, 3);
  assert.equal(capped.continuations, 2);
  assert.equal(capped.truncated, true);

  // 이어받기를 안 켜면 한 번만 부르고 잘린 채로 돌려주는지.
  tries = 0;
  const plain = await chatCompletion({ messages: [{ role: 'user', content: 'q' }], maxTokens: 10 });
  assert.equal(tries, 1);
  assert.equal(plain.truncated, true);

  // 제목 판정.
  const full = '사주 관점\n본문\n\n현실 확인\n본문\n\n오늘 할 일\n본문';
  assert.equal(hasSections(full), true);
  assert.equal(hasSections(full.replace('사주 관점\n', '')), false);
  assert.equal(hasSections('오늘 할 일을 사주 관점으로 현실 확인 했습니다'), false);

  // 명리 용어가 본문에 새면 잡아내는지.
  assert.deepEqual(
    jargonLeaks('일간 무토는 금 기운을 많이 쓰고 있습니다.'),
    ['일간', '무토', '금 기운']);
  assert.deepEqual(jargonLeaks('대운 흐름과 지장간을 보면 편재가 강합니다.').sort(),
    ['대운', '지장간', '편재']);

  // 일상어와 겹치는 말을 용어로 잘못 잡지 않는지.
  for (const clean of [
    '버티는 힘이 강해서 오래 참는 편인데, 그만큼 떠날 결심도 늦어집니다.',
    '그 일과는 상관없이 지금 통장 잔고부터 세어 보세요.',
    '상대에게 관대한 편이지만 자신에게는 그렇지 않습니다.',
    '자기 전에 목욕을 하고 누워도 잠이 오지 않는다면',
    '예정인데 일정이 밀렸습니다.',
    '일주일간 기록해 보세요.',
    '가족이 지지해 주는지 확인해 보세요.',
    '지지층이 두터운 편입니다.',
    '제왕절개 후 회복 중이라면 무리하지 마세요.',
    '도화선에 불이 붙듯 말이 커지기 쉽습니다.'
  ]) assert.deepEqual(jargonLeaks(clean), [], clean);

  // 근거 블록은 읽어서 보관하고 본문에서는 떼어냅니다.
  const withBasis = '사주 관점\n한 번 쥐면 놓지 않습니다.\n<근거>일간 무토, 많은 기운 금</근거>';
  assert.equal(readBasis(withBasis), '일간 무토, 많은 기운 금');
  assert.equal(stripBasis(withBasis), '사주 관점\n한 번 쥐면 놓지 않습니다.');
  assert.equal(readBasis('근거 없는 답'), null);

  // 근거 블록 안의 용어는 누출이 아닙니다. 거기 적으라고 만든 자리입니다.
  assert.deepEqual(jargonLeaks(stripBasis(withBasis)), []);

  // 실제로 돌아온 나쁜 답을 그대로 넣어 무엇이 걸리는지 확인합니다.
  const weak = ['사주 관점', '할 일을 미루지 않고 바로 시작하는 사람입니다.', '',
    '현실 확인', '몸이 보내는 신호에 귀 기울일 때입니다. 건강 검진 결과나 최근 혈액 검사 기록을 확인해 보는 것도 방법입니다. 필요하다면 상담하는 것이 좋습니다.', '',
    '오늘 할 일', '일찍 자세요.'].join('\n');
  const faults = critique(weak, readBasis(weak));
  assert.equal(faults.length, 3);
  assert.match(faults.join(' '), /근거/);
  assert.match(faults.join(' '), /건강 검진/);
  assert.match(faults.join(' '), /맺음이 흐립니다/);

  // 고친 답에는 지적이 남지 않아야 합니다.
  const solid = ['사주 관점', '한 번 쥐면 끝까지 놓지 않습니다.', '',
    '현실 확인', '실제 수면 — 지난 7일의 취침·기상 시각을 적으세요. 이어지면 진료로 확인하세요.', '',
    '오늘 할 일', '오늘 넘길 일 하나를 고르세요.', '<근거>일간 무토, 많은 기운 금</근거>'].join('\n');
  assert.deepEqual(critique(solid, readBasis(solid)), []);

  // 후속 답변은 제목 두 개만 쓰고, 사주 관점을 다시 펼치면 지적합니다.
  const first = ['사주 관점', '한 번 쥐면 놓지 않습니다.', '', '현실 확인', '지난 7일 취침 시각을 적으세요.', '',
    '오늘 할 일', '10분만 적으세요.', '<근거>일간 무</근거>'].join('\n');
  const later = ['현실 확인', '가져온 숫자부터 받겠습니다.', '', '오늘 할 일', '10분만 적으세요.', '<근거>해석 없음</근거>'].join('\n');
  assert.deepEqual(critique(first, readBasis(first), 1), []);
  assert.deepEqual(critique(later, readBasis(later), 2), []);
  assert.match(critique(first, readBasis(first), 2).join(' '), /다시 쓰지 않습니다/);
  assert.match(critique(later, readBasis(later), 1).join(' '), /빠진 것: 사주 관점/);
  assert.equal(hasSections(later, 2), true);
  assert.equal(hasSections(later, 1), false);

  // 누적 신호는 사용자 발화에서만, 두 번 이상 나온 것만, 최근 순으로.
  const at = n => '2026-09-' + String(n).padStart(2, '0');
  const sig = signalsOf([{ messages: [
    { role: 'user', text: '요즘 잠을 못 자요', at: at(1) },
    { role: 'assistant', text: '이직 이직 이직 팀장 팀장', at: at(2) },
    { role: 'user', text: '팀장이랑 부딪혀요', at: at(3) },
    { role: 'user', text: '또 잠을 설쳤어요', at: at(4) },
    { role: 'user', text: '팀장 때문에 힘들어요', at: at(5) },
    { role: 'user', text: '창업도 생각해요', at: at(6) }] }]);
  assert.deepEqual(sig, [{ name: '상사', count: 2 }, { name: '수면', count: 2 }]);

  // 일상어와 겹치는 소재를 신호로 잘못 세지 않는지.
  assert.deepEqual(signalsOf([{ messages: [
    { role: 'user', text: '아이디어가 없어요', at: at(1) },
    { role: 'user', text: '아이폰 샀어요', at: at(2) },
    { role: 'user', text: '집중이 안 돼요', at: at(3) },
    { role: 'user', text: '집안일이 많아요', at: at(4) }] }]), []);

  console.log('PASS: Cafe24 LLM Router auth, request, response, JSON parsing, finish_reason, truncation continue, section, jargon, basis, critique, turn split and signal checks.');
} finally {
  if (oldKey === undefined) delete process.env.CAFE24_LLM_API_KEY;
  else process.env.CAFE24_LLM_API_KEY = oldKey;
  if (oldModel === undefined) delete process.env.CAFE24_LLM_MODEL;
  else process.env.CAFE24_LLM_MODEL = oldModel;
  if (oldBaseUrl === undefined) delete process.env.CAFE24_LLM_BASE_URL;
  else process.env.CAFE24_LLM_BASE_URL = oldBaseUrl;
  globalThis.fetch = oldFetch;
}
