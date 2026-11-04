import { createRemoteJWKSet, jwtVerify } from 'jose';
import { readBody, sendJson, clientAddress } from './http.mjs';
import { createMemoryRateLimiter } from './rate-limit.mjs';
import { errorDetails } from './logging.mjs';

const appleKeys = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));
export const appleNotificationAudiences = () => String(process.env.APPLE_NOTIFICATION_AUDIENCES || process.env.APPLE_CLIENT_ID || '').split(',').map(value => value.trim()).filter(Boolean);
const signOutEvents = new Set(['consent-revoked', 'account-deleted', 'account-delete']);

export async function verifyAppleNotification(token, { audience = appleNotificationAudiences(), keys = appleKeys } = {}) {
  if (!audience || (Array.isArray(audience) && !audience.length)) throw new Error('Apple audience not configured');
  const { payload } = await jwtVerify(token, keys, {
    issuer: 'https://appleid.apple.com', audience, algorithms: ['RS256'],
    requiredClaims: ['iat', 'jti', 'events'], clockTolerance: 60
  });
  const now = Math.floor(Date.now() / 1000);
  const event = typeof payload.events === 'string' ? JSON.parse(payload.events) : payload.events;
  if (!Number.isSafeInteger(payload.iat) || payload.iat > now + 60 || typeof payload.jti !== 'string' || !payload.jti || payload.jti.length > 256 ||
      !event || typeof event !== 'object' || typeof event.type !== 'string' || event.type.length > 100 ||
      typeof event.sub !== 'string' || !event.sub || event.sub.length > 255 ||
      !Number.isSafeInteger(event.event_time) || event.event_time <= 0 || event.event_time > now || event.event_time > payload.iat + 60)
    throw new Error('Invalid Apple event');
  return { type: event.type, subject: event.sub, eventTime: event.event_time };
}

export function createAppleNotificationRoute(repository, { verify = verifyAppleNotification, audience = appleNotificationAudiences } = {}) {
  const allowed = createMemoryRateLimiter({ windowMs: 60_000, max: 120 });
  return async (req, res) => {
    if (req.method !== 'POST') return sendJson(res, { error: 'POST only' }, 405, { Allow: 'POST' });
    if (!audience()?.length || !repository?.revokeAppleSessions) return sendJson(res, { error: 'Notification service unavailable' }, 503);
    if (!allowed(clientAddress(req))) return sendJson(res, { error: 'Too many requests' }, 429);
    let event;
    try {
      const body = JSON.parse(await readBody(req, 32_768, 5000));
      if (typeof body?.payload !== 'string' || body.payload.length > 24_000) throw new Error('Missing payload');
      event = await verify(body.payload, { audience: audience() });
    } catch (error) {
      // A temporary key-fetch failure must be retried, not treated as a valid or bad signature.
      if (['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'ERR_JWKS_TIMEOUT'].includes(error?.code) || error instanceof TypeError)
        return sendJson(res, { error: 'Verification temporarily unavailable' }, 503);
      return sendJson(res, { error: 'Invalid notification' }, error.status === 413 ? 413 : 400);
    }
    try {
      if (signOutEvents.has(event.type)) await repository.revokeAppleSessions(event.subject, event.eventTime);
      // Unknown verified events are acknowledged without applying arbitrary changes.
      return sendJson(res, { ok: true });
    } catch (error) {
      console.error(JSON.stringify({ event: 'apple.notification_failed', ...errorDetails(error) }));
      return sendJson(res, { error: 'Notification processing unavailable' }, 503);
    }
  };
}
