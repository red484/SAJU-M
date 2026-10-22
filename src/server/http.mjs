export function sendJson(res, body, status = 200, headers = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
    ...headers
  });
  if (res.req?.method === 'HEAD') return res.end();
  res.end(payload);
}

export async function readBody(req, limit = 1_000_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) {
      const error = new Error('저장 용량을 초과했어요.');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

const privatePeer = address => /^(?:::ffff:)?(?:127\.|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(address) || address === '::1' || /^f[cd]/i.test(address);

// The backend is reachable only through nginx on the private network, which sets X-Real-IP.
export function clientAddress(req) {
  const peer = String(req.socket?.remoteAddress || '');
  const forwarded = String(req.headers['x-real-ip'] || '').trim();
  return (privatePeer(peer) && forwarded) || peer || 'unknown';
}

export function validateOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  const allowed = String(process.env.TOSS_ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
  if (allowed.includes('*') || allowed.includes(origin)) return true;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || (req.socket.encrypted ? 'https' : 'http');
  return origin === `${proto}://${host}`;
}
