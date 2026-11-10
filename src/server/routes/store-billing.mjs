import { authToken } from '../auth.mjs';
import { readBody, sendJson, validateOrigin } from '../http.mjs';
import { createMemoryRateLimiter } from '../rate-limit.mjs';
import { STORE_PLAN_LIST } from '../../shared/store-products.mjs';

export function createStoreBillingRoute(auth, billing) {
  const allowed = createMemoryRateLimiter({ windowMs: 60_000, max: 20 });
  return async (req, res, url) => {
    if (url.pathname === '/api/store-billing/plans' && req.method === 'GET') {
      let enabled = !!billing && process.env.STORE_IAP_ENABLED === 'true';
      const testers = (process.env.STORE_IAP_TEST_USER_IDS || '').split(',').map(id => id.trim()).filter(Boolean);
      if (!enabled && billing && testers.length && /OngiFullService\/1/.test(req.headers['user-agent'] || '')) {
        try {
          const user = await auth?.userFromToken(authToken(req));
          enabled = !!user && testers.includes(String(user.id));
        } catch { enabled = false; }
      }
      return sendJson(res, { plans: STORE_PLAN_LIST, enabled });
    }
    if (req.method !== 'POST') return sendJson(res, { error: '허용되지 않은 요청입니다.' }, 405);
    if (!billing) return sendJson(res, { error: '결제 연결을 준비하고 있어요.' }, 503);
    try {
      if (url.pathname === '/api/store-billing/apple/notifications') {
        const { signedPayload } = JSON.parse(await readBody(req, 64_000));
        await billing.appleNotification(signedPayload);
        return sendJson(res, { ok: true });
      }
      if (url.pathname !== '/api/store-billing/sync') return sendJson(res, { error: '없는 경로입니다.' }, 404);
      if (!validateOrigin(req)) return sendJson(res, { error: '허용되지 않은 요청입니다.' }, 403);
      const user = await auth?.userFromToken(authToken(req));
      if (!user) return sendJson(res, { error: '로그인 후 이용해 주세요.' }, 401);
      if (!allowed(user.id)) return sendJson(res, { error: '잠시 후 다시 시도해 주세요.' }, 429);
      const body = JSON.parse(await readBody(req, 24_000));
      if (body.platform === 'apple') return sendJson(res, await billing.syncApple(user.id, body.jws));
      if (body.platform === 'google') return sendJson(res, await billing.syncGoogle(user.id, body.purchaseToken, body.productId));
      return sendJson(res, { error: '구매 정보를 확인하지 못했어요.' }, 400);
    } catch (error) {
      return sendJson(res, { error: error.status ? error.message : '구독을 확인하지 못했어요. 구매 복원으로 다시 시도해 주세요.' }, error.status || 502);
    }
  };
}
