import assert from 'node:assert/strict';
import { chatCompletion, enabled, model, parseJsonReply } from '../src/cafe24-llm.mjs';
import { hasSections, jargonLeaks } from '../src/coach-server.mjs';

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

  console.log('PASS: Cafe24 LLM Router auth, request, response, JSON parsing, finish_reason, truncation continue, section and jargon checks.');
} finally {
  if (oldKey === undefined) delete process.env.CAFE24_LLM_API_KEY;
  else process.env.CAFE24_LLM_API_KEY = oldKey;
  if (oldModel === undefined) delete process.env.CAFE24_LLM_MODEL;
  else process.env.CAFE24_LLM_MODEL = oldModel;
  if (oldBaseUrl === undefined) delete process.env.CAFE24_LLM_BASE_URL;
  else process.env.CAFE24_LLM_BASE_URL = oldBaseUrl;
  globalThis.fetch = oldFetch;
}
