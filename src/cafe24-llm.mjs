const DEFAULT_BASE_URL = 'https://llm-router.cafe24.com/api/v1';

const apiKey = () => process.env.CAFE24_LLM_API_KEY || process.env.LLM_ROUTER_KEY || '';
const baseUrl = () => (process.env.CAFE24_LLM_BASE_URL || process.env.LLM_ROUTER_URL || DEFAULT_BASE_URL)
  .replace(/\/+$/, '').replace(/\/api\/v1$/, '') + '/api/v1';

export const model = () => process.env.CAFE24_LLM_MODEL || 'cafe24/auto';
export const enabled = () => Boolean(apiKey());

const contentText = content => {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map(part => typeof part === 'string' ? part : part?.text || '').join('');
};

export async function chatCompletion({ messages, maxTokens, temperature, metadata }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch(`${baseUrl()}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model(),
        messages,
        max_tokens: maxTokens,
        temperature,
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
    const text = contentText(body?.choices?.[0]?.message?.content).trim();
    if (!text) throw new Error('Cafe24 LLM Router returned an empty response');
    return {
      text,
      model: body.model,
      usage: {
        in: body.usage?.prompt_tokens,
        out: body.usage?.completion_tokens
      }
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function parseJsonReply(text) {
  const clean = String(text).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(clean); } catch { /* try an object embedded in prose */ }
  const start = clean.indexOf('{'), end = clean.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('JSON object not found');
  return JSON.parse(clean.slice(start, end + 1));
}
