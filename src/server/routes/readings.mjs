import { coachReply, enabled as coachEnabled } from '../services/coach-service.mjs';
import { epicReading, enabled as epicEnabled } from '../services/epic-service.mjs';
import { readBody, sendJson, validateOrigin } from '../http.mjs';
import { getSession, sessionId } from '../session.mjs';
import { createMemoryRateLimiter } from '../rate-limit.mjs';

const coachAllowed = createMemoryRateLimiter({ windowMs: 60_000, max: 12 });
const epicAllowed = createMemoryRateLimiter({ windowMs: 600_000, max: 4 });

function logShape(feature, shape) {
  if (!shape) return;
  console.log(JSON.stringify({ event: 'llm.response', feature, ...shape }));
}

const telemetryDetails = (shape, status, errorCode) => ({
  status,
  errorCode,
  model: shape?.model,
  keyLabel: shape?.keyLabel,
  finishReason: shape?.finishReason,
  inputTokens: shape?.usage?.in,
  outputTokens: shape?.usage?.out
});

export function createReadingRoutes(telemetry) {
  async function run(req, res, feature, enabled, allowed, execute) {
    if (req.method === 'GET') return sendJson(res, { available: enabled() });
    if (req.method !== 'POST') return sendJson(res, { error: '허용되지 않은 요청입니다.' }, 405);
    if (!validateOrigin(req)) return sendJson(res, { error: '이 사이트에서 다시 시도해 주세요.' }, 403);
    if (!enabled()) return sendJson(res, { error: feature === 'coach' ? '실제 상담이 연결되지 않았습니다.' : '판독이 연결되지 않았습니다.' }, 503);
    const id = sessionId(getSession(req).token);
    if (!allowed(id)) return sendJson(res, { error: feature === 'coach' ? '잠시 뒤에 다시 물어봐 주세요.' : '판독은 10분에 네 번까지 열 수 있어요.' }, 429);
    const usage = await telemetry.start(id, feature).catch(() => ({ id: null, started: Date.now() }));
    try {
      const out = await execute(JSON.parse(await readBody(req, 100_000)));
      logShape(feature, out.shape);
      await telemetry.finish(usage, telemetryDetails(out.shape, out.error ? 'failed' : 'completed', out.error ? 'UPSTREAM_RESPONSE' : null)).catch(() => {});
      if (out.error) return sendJson(res, { error: out.error, shape: out.shape }, out.status || 500);
      return feature === 'coach'
        ? sendJson(res, { text: out.text, offer: out.offer || null, source: out.source, shape: out.shape })
        : sendJson(res, { reading: out.reading, shape: out.shape });
    } catch (error) {
      console.error(JSON.stringify({ event: 'llm.error', feature, error: error?.message, status: error?.status }));
      await telemetry.finish(usage, telemetryDetails(null, 'failed', String(error?.status || 'UPSTREAM_ERROR'))).catch(() => {});
      if (error?.status === 429) return sendJson(res, { error: `AI ${feature === 'coach' ? '상담' : '판독'} 사용량이 많습니다. 잠시 뒤에 다시 시도해 주세요.` }, 429);
      return sendJson(res, { error: feature === 'coach' ? '상담을 불러오지 못했어요. 잠시 뒤에 다시 시도해 주세요.' : '판독을 불러오지 못했어요. 잠시 뒤에 다시 시도해 주세요.' }, 502);
    }
  }

  return {
    coach: (req, res) => run(req, res, 'coach', coachEnabled, coachAllowed, coachReply),
    epic: (req, res) => run(req, res, 'epic', epicEnabled, epicAllowed, epicReading),
    availability: () => ({ coach: coachEnabled(), epic: epicEnabled() })
  };
}
