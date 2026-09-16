const DEFAULT_BASE_URL = 'https://llm-router.cafe24.com/api/v1';

const apiKeys = () => {
  const values = [process.env.CAFE24_LLM_API_KEY || process.env.LLM_ROUTER_KEY || '',
    ...(process.env.CAFE24_LLM_API_KEYS || '').split(',')].map(value => value.trim()).filter(Boolean);
  const labels = (process.env.CAFE24_LLM_KEY_LABELS || '').split(',').map(value => value.trim());
  return [...new Set(values)].map((key, index) => ({ key, label: labels[index] || `key-${index + 1}` }));
};
const baseUrl = () => (process.env.CAFE24_LLM_BASE_URL || process.env.LLM_ROUTER_URL || DEFAULT_BASE_URL)
  .replace(/\/+$/, '').replace(/\/api\/v1$/, '') + '/api/v1';

export const model = () => process.env.CAFE24_LLM_MODEL || 'cafe24/auto';
const reasoningEffort = () => process.env.CAFE24_LLM_REASONING_EFFORT || 'none';
export const enabled = () => apiKeys().length > 0;

const contentText = content => {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map(part => typeof part === 'string' ? part : part?.text || '').join('');
};

// 이어쓰기를 시킬 때 앞말을 되풀이하는 모델이 있습니다. 겹치는 꼬리를
// 찾아 잘라내고 붙입니다. 겹침이 없으면 그대로 이어 붙여요.
function join(head, tail) {
  if (!head) return tail;
  if (!tail) return head;
  const max = Math.min(head.length, tail.length, 200);
  for (let n = max; n >= 6; n--) {
    const lap = tail.slice(0, n);
    if (lap.trim() && head.slice(-n) === lap) return head + tail.slice(n);
  }
  return head + tail;
}

const CONTINUE_PROSE = '끊긴 지점에서 바로 이어서 계속 쓰세요. 앞서 쓴 문장을 다시 쓰지 말고, 인사나 설명도 붙이지 마세요.';
const CONTINUE_JSON = '위 JSON이 중간에서 끊겼습니다. 끊긴 지점의 다음 글자부터 이어서 출력해 JSON을 완성하세요. 앞부분을 다시 쓰지 말고, 코드펜스나 설명도 붙이지 마세요.';

async function onceWithKey(keyEntry, { messages, maxTokens, temperature, metadata, deadlineAt = Infinity }) {
  const controller = new AbortController();
  const remaining = Math.min(45_000, deadlineAt - Date.now());
  if (remaining <= 0) throw new Error('Cafe24 LLM Router deadline exceeded');
  const timeout = setTimeout(() => controller.abort(), remaining);
  try {
    const response = await fetch(`${baseUrl()}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${keyEntry.key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model(),
        messages,
        max_tokens: maxTokens,
        temperature,
        // Gemini 2.5 Flash는 기본값에서 동적 사고가 켜져 있어 짧은 상담에도
        // 출력 예산을 전부 사고 토큰으로 쓸 수 있습니다. OpenAI 호환 옵션으로
        // 이를 끄되, 운영 환경변수로 필요할 때 다시 조절할 수 있게 합니다.
        reasoning_effort: reasoningEffort(),
        stream: false,
        metadata: { project: 'dalbit-saju', ...metadata }
      }),
      signal: controller.signal
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(body?.error?.message || `Cafe24 LLM Router HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    const choice = body?.choices?.[0];
    const text = contentText(choice?.message?.content);
    if (!text.trim()) throw new Error('Cafe24 LLM Router returned an empty response');
    return {
      text,
      // 라우터가 어느 이름으로 주든 잡습니다. 'length'면 토큰이 모자라 끊긴 겁니다.
      finishReason: choice?.finish_reason ?? choice?.finishReason ?? null,
      model: body.model,
      keyLabel: keyEntry.label,
      usage: {
        in: body.usage?.prompt_tokens,
        out: body.usage?.completion_tokens
      }
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function once(options) {
  const keys = apiKeys();
  if (!keys.length) throw new Error('Cafe24 LLM Router key is not configured');
  let lastError;
  for (const key of keys) {
    try {
      return await onceWithKey(key, options);
    } catch (error) {
      lastError = error;
      if (![429, 500, 502, 503, 504].includes(error?.status)) throw error;
    }
  }
  throw lastError;
}

// 답이 max_tokens에 걸려 잘리면 이어서 받아옵니다. 같은 요청을 처음부터
// 다시 돌리면 또 같은 자리에서 끊기므로, 받아둔 부분을 assistant 차례로
// 되돌려주고 그다음부터 쓰게 합니다.
export async function chatCompletion({ messages, maxTokens, temperature, metadata, continueOnLength = false, json = false, maxContinuations = 2, deadlineAt = Infinity }) {
  let res = await once({ messages, maxTokens, temperature, metadata, deadlineAt });
  let text = res.text;
  const usage = { in: res.usage.in || 0, out: res.usage.out || 0 };
  let rounds = 0;
  while (continueOnLength && res.finishReason === 'length' && rounds < maxContinuations) {
    rounds++;
    res = await once({
      messages: [...messages,
        { role: 'assistant', content: text },
        { role: 'user', content: json ? CONTINUE_JSON : CONTINUE_PROSE }],
      maxTokens, temperature, metadata: { ...metadata, continuation: rounds }, deadlineAt
    });
    text = join(text, res.text);
    usage.in += res.usage.in || 0;
    usage.out += res.usage.out || 0;
  }
  return {
    text: text.trim(),
    finishReason: res.finishReason,
    // 이어받고도 여전히 'length'면 답이 완결되지 않은 채 끝난 것입니다.
    truncated: res.finishReason === 'length',
    continuations: rounds,
    model: res.model,
    keyLabel: res.keyLabel,
    usage
  };
}

export function parseJsonReply(text) {
  const clean = String(text).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(clean); } catch { /* try an object embedded in prose */ }
  const start = clean.indexOf('{'), end = clean.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('JSON object not found');
  return JSON.parse(clean.slice(start, end + 1));
}
