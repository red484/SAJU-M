import assert from 'node:assert/strict';
import { chatCompletion, enabled, model, parseJsonReply } from '../src/cafe24-llm.mjs';

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

  console.log('PASS: Cafe24 LLM Router auth, request, response and JSON parsing.');
} finally {
  if (oldKey === undefined) delete process.env.CAFE24_LLM_API_KEY;
  else process.env.CAFE24_LLM_API_KEY = oldKey;
  if (oldModel === undefined) delete process.env.CAFE24_LLM_MODEL;
  else process.env.CAFE24_LLM_MODEL = oldModel;
  if (oldBaseUrl === undefined) delete process.env.CAFE24_LLM_BASE_URL;
  else process.env.CAFE24_LLM_BASE_URL = oldBaseUrl;
  globalThis.fetch = oldFetch;
}
