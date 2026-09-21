import { createHash, randomBytes } from 'node:crypto';

export function secureCookie(req) {
  const proto = req.headers['x-forwarded-proto'];
  return proto === 'https' || req.socket.encrypted ? '; Secure' : '';
}

export function getSession(req) {
  const header = String(req.headers['x-dalbit-session'] || '');
  if (/^[a-f0-9]{64}$/.test(header)) return { token: header, fresh: false };
  const match = req.headers.cookie?.match(/(?:^|;\s*)dalbit_session=([a-f0-9]{64})(?:;|$)/);
  if (match) return { token: match[1], fresh: false };
  return { token: randomBytes(32).toString('hex'), fresh: true };
}

export function sessionId(token) {
  return createHash('sha256').update(token).digest('hex');
}

export function sessionCookie(req, session) {
  return `dalbit_session=${session.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000${secureCookie(req)}`;
}

export function expiredSessionCookie(req) {
  return `dalbit_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secureCookie(req)}`;
}
