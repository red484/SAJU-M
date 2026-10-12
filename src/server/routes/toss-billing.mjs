import { authToken } from '../auth.mjs';
import { readBody, sendJson, validateOrigin } from '../http.mjs';
import { createMemoryRateLimiter } from '../rate-limit.mjs';
import { TOSS_PRODUCT } from '../../shared/toss-product.mjs';

export function createTossBillingRoute(auth, billing) {
  const allowed = createMemoryRateLimiter({ windowMs: 60_000, max: 20 });
  return async (req, res, url) => {
    if (url.pathname === '/api/toss-billing/product' && req.method === 'GET')
      return sendJson(res, { product: TOSS_PRODUCT, enabled: !!billing && process.env.TOSS_IAP_ENABLED === 'true' });
    if (url.pathname !== '/api/toss-billing/grant') return sendJson(res, { error: '없는 경로입니다.' }, 404);
    if (req.method !== 'POST') return sendJson(res, { error: '허용되지 않은 요청입니다.' }, 405);
    if (!validateOrigin(req)) return sendJson(res, { error: '허용되지 않은 요청입니다.' }, 403);
    if (!billing) return sendJson(res, { error: '결제 연결을 준비하고 있어요.' }, 503);
    try {
      const user = await auth?.userFromToken(authToken(req));
      if (!user) return sendJson(res, { error: '토스 로그인 후 이용해 주세요.' }, 401);
      if (!allowed(user.id)) return sendJson(res, { error: '잠시 후 다시 시도해 주세요.' }, 429);
      const { orderId } = JSON.parse(await readBody(req, 4096));
      // Recovery remains available even when new purchases are disabled.
      return sendJson(res, await billing.grant(user.id, orderId));
    } catch (error) {
      return sendJson(res, { error: error.status ? error.message : '구매 확인에 실패했어요. 구매 복원으로 다시 시도해 주세요.' }, error.status || 502);
    }
  };
}
