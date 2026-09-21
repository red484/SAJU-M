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

export function validateOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  const allowed = String(process.env.TOSS_ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
  if (allowed.includes('*') || allowed.includes(origin)) return true;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || (req.socket.encrypted ? 'https' : 'http');
  return origin === `${proto}://${host}`;
}
