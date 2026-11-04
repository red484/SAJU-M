import { sendJson, readBody, validateOrigin, clientAddress } from '../http.mjs';
import { createMemoryRateLimiter } from '../rate-limit.mjs';
import { validProductEvent } from '../../shared/product-events.mjs';
export function createProductEventsRoute(repository) {
  const allowed = createMemoryRateLimiter({ windowMs: 60_000, max: 60 });
  return async (req, res) => {
    if (req.method !== 'POST') return sendJson(res, { error: 'POST only' }, 405, { Allow: 'POST' });
    if (!validateOrigin(req)) return sendJson(res, { error: 'Origin rejected' }, 403);
    if (!allowed(clientAddress(req))) return sendJson(res, { error: 'Too many requests' }, 429);
    let value;
    try { value = JSON.parse(await readBody(req, 256, 5000)); }
    catch (error) { return sendJson(res, { error: 'Invalid event' }, error.status || 400); }
    if (!validProductEvent(value)) return sendJson(res, { error: 'Invalid event' }, 400);
    if (!repository?.recordProductEvent) return sendJson(res, { error: 'Metrics unavailable' }, 503);
    await repository.recordProductEvent(value);
    return sendJson(res, { ok: true }, 202);
  };
}
