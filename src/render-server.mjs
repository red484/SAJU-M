import { createHash, randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const clientRoot = join(root, 'dist', 'client');
const dataRoot = process.env.DALBIT_DATA_DIR || join(root, '.data');
const port = Number(process.env.PORT || 3000);
const encoder = new TextEncoder();

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

function sendJson(res, body, status = 200, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    ...headers
  });
  res.end(JSON.stringify(body));
}

function secureCookie(req) {
  const proto = req.headers['x-forwarded-proto'];
  return proto === 'https' || req.socket.encrypted ? '; Secure' : '';
}

function getSession(req) {
  const match = req.headers.cookie?.match(/(?:^|;\s*)dalbit_session=([a-f0-9]{64})(?:;|$)/);
  if (match) return { token: match[1], fresh: false };
  return { token: randomBytes(32).toString('hex'), fresh: true };
}

function journalPath(id) {
  return join(dataRoot, `${id}.json`);
}

function sessionId(token) {
  return createHash('sha256').update(token).digest('hex');
}

async function readBody(req, limit = 1_000_000) {
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

function validateOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  const host = req.headers.host;
  return origin === `https://${host}` || origin === `http://${host}`;
}

async function handleJournal(req, res) {
  if (!['GET', 'PUT', 'DELETE'].includes(req.method)) {
    return sendJson(res, { error: '허용되지 않은 요청입니다.' }, 405);
  }
  if (req.method !== 'GET' && !validateOrigin(req)) {
    return sendJson(res, { error: '이 사이트에서 다시 시도해 주세요.' }, 403);
  }

  const session = getSession(req);
  const id = sessionId(session.token);
  const cookie = `dalbit_session=${session.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000${secureCookie(req)}`;
  const headers = session.fresh ? { 'Set-Cookie': cookie } : {};
  const file = journalPath(id);

  try {
    await mkdir(dataRoot, { recursive: true });

    if (req.method === 'GET') {
      try {
        const row = JSON.parse(await readFile(file, 'utf8'));
        return sendJson(res, { data: row.payload, revision: row.revision || 0 }, 200, headers);
      } catch (error) {
        if (error.code === 'ENOENT') return sendJson(res, { data: null, revision: 0 }, 200, headers);
        throw error;
      }
    }

    if (req.method === 'DELETE') {
      await rm(file, { force: true });
      return sendJson(res, { ok: true }, 200, {
        'Set-Cookie': `dalbit_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secureCookie(req)}`
      });
    }

    const rawLength = Number(req.headers['content-length'] || 0);
    if (rawLength > 1_000_000) {
      return sendJson(res, { error: '저장 용량을 초과했어요. 기록을 내보낸 뒤 정리해 주세요.' }, 413);
    }

    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch (error) {
      return sendJson(res, { error: error.status === 413 ? error.message : '저장할 내용을 확인해 주세요.' }, error.status || 400);
    }

    const { data, revision } = body;
    const valid = data &&
      typeof data === 'object' &&
      Number.isInteger(revision) &&
      revision >= 0 &&
      Array.isArray(data.records) &&
      Array.isArray(data.conversations);

    if (!valid) {
      return sendJson(res, { error: '데이터 형식이 올바르지 않아요.' }, 400);
    }

    let current = null;
    try {
      current = JSON.parse(await readFile(file, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }

    if ((revision === 0 && current) || (revision > 0 && (!current || current.revision !== revision))) {
      return sendJson(res, { error: '다른 탭에서 기록이 변경됐어요. 먼저 내보내기로 현재 내용을 보관한 뒤 새로고침해 주세요.' }, 409);
    }

    const next = {
      payload: data,
      revision: revision + 1,
      updated_at: new Date().toISOString()
    };
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmp, JSON.stringify(next));
    await rename(tmp, file);
    return sendJson(res, { ok: true, revision: next.revision });
  } catch (error) {
    console.error('Journal request failed', error?.message);
    return sendJson(res, { error: '저장소에 연결하지 못했어요. 입력 내용은 현재 화면에 유지됩니다. 잠시 후 다시 시도해 주세요.' }, 503);
  }
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const requested = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
  const target = normalize(join(clientRoot, requested));
  const inside = relative(clientRoot, target);

  if (inside.startsWith('..') || inside.includes('..')) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  let file = target;
  let info;
  try {
    info = await stat(file);
  } catch {
    file = join(clientRoot, 'index.html');
    info = await stat(file);
  }

  const ext = extname(file);
  res.writeHead(200, {
    'Content-Type': types[ext] || 'application/octet-stream',
    'Content-Length': info.size,
    'Cache-Control': requested.startsWith('/assets/') ? 'public, max-age=86400' : 'no-cache',
    'X-Content-Type-Options': 'nosniff'
  });
  if (req.method === 'HEAD') return res.end();
  createReadStream(file).pipe(res);
}

createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname === '/api/journal') return void handleJournal(req, res);
  if (url.pathname.startsWith('/api/')) return sendJson(res, { error: '없는 경로입니다.' }, 404);
  return void serveStatic(req, res).catch(error => {
    console.error('Static request failed', error?.message);
    res.writeHead(500);
    res.end('Internal Server Error');
  });
}).listen(port, () => {
  console.log(`Dalbit Saju listening on ${port}`);
  console.log(`Journal data directory: ${dataRoot}`);
});
