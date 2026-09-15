import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { coachReply, enabled as coachEnabled } from './server/services/coach-service.mjs';
import { epicReading, enabled as epicEnabled } from './server/services/epic-service.mjs';
import { extname, join, normalize, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sendJson, readBody, validateOrigin } from './server/http.mjs';
import { getSession, sessionId } from './server/session.mjs';
import { createMemoryRateLimiter } from './server/rate-limit.mjs';
import { FileJournalRepository } from './server/repositories/file-journal-repository.mjs';
import { createJournalRoute } from './server/routes/journal.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const clientRoot = join(root, 'dist', 'client');
const dataRoot = process.env.DALBIT_DATA_DIR || join(root, '.data');
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';
const handleJournal = createJournalRoute(new FileJournalRepository(dataRoot));

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

// 상담 중계. 키는 서버에만 두고, 없으면 503으로 답해 클라이언트가 규칙
// 기반 코칭으로 돌아가게 합니다.
// 잘림·이어받기·형식 어긋남을 로그에 남깁니다. Render 로그에서 바로 보입니다.
function logShape(feature, shape) {
  if (!shape) return;
  const flag = shape.truncated ? ' TRUNCATED' : '';
  const sec = shape.sections === false ? ' NO-SECTIONS' : '';
  const leak = shape.leaks?.length ? ` LEAK=${shape.leaks.join(',')}` : '';
  const bad = shape.faults ? ` FAULTS=${shape.faults}` : '';
  const why = shape.basis ? ` basis="${shape.basis}"` : ' NO-BASIS';
  const sch = shape.schema === false ? ' BAD-JSON' : '';
  console.log(`LLM ${feature} model=${shape.model || '?'} finish=${shape.finishReason} continuations=${shape.continuations}${flag}${sec}${leak || ''}${bad}${sch}${feature === 'coach' ? why : ''}`);
}

const coachAllowed = createMemoryRateLimiter({ windowMs: 60_000, max: 12 });

async function handleCoach(req, res) {
  if (req.method === 'GET') return sendJson(res, { available: coachEnabled() });
  if (req.method !== 'POST') return sendJson(res, { error: '허용되지 않은 요청입니다.' }, 405);
  if (!validateOrigin(req)) return sendJson(res, { error: '이 사이트에서 다시 시도해 주세요.' }, 403);
  if (!coachEnabled()) return sendJson(res, { error: '실제 상담이 연결되지 않았습니다.' }, 503);
  const session = getSession(req);
  if (!coachAllowed(sessionId(session.token))) return sendJson(res, { error: '잠시 뒤에 다시 물어봐 주세요.' }, 429);
  try {
    const body = JSON.parse(await readBody(req, 100_000));
    const out = await coachReply(body);
    logShape('coach', out.shape);
    if (out.error) return sendJson(res, { error: out.error, shape: out.shape }, out.status || 500);
    return sendJson(res, { text: out.text, offer: out.offer || null, source: out.source, shape: out.shape });
  } catch (error) {
    console.error('Coach request failed', error?.message);
    if (error?.status === 429) return sendJson(res, { error: 'AI 상담 사용량이 많습니다. 잠시 뒤에 다시 시도해 주세요.' }, 429);
    return sendJson(res, { error: '상담을 불러오지 못했어요. 잠시 뒤에 다시 시도해 주세요.' }, 502);
  }
}

// 대운 판독. 상담보다 훨씬 비싼 호출이라 한도를 따로, 더 좁게 둡니다.
const epicAllowed = createMemoryRateLimiter({ windowMs: 600_000, max: 4 });

async function handleEpic(req, res) {
  if (req.method === 'GET') return sendJson(res, { available: epicEnabled() });
  if (req.method !== 'POST') return sendJson(res, { error: '허용되지 않은 요청입니다.' }, 405);
  if (!validateOrigin(req)) return sendJson(res, { error: '이 사이트에서 다시 시도해 주세요.' }, 403);
  if (!epicEnabled()) return sendJson(res, { error: '판독이 연결되지 않았습니다.' }, 503);
  const session = getSession(req);
  if (!epicAllowed(sessionId(session.token))) return sendJson(res, { error: '판독은 10분에 네 번까지 열 수 있어요.' }, 429);
  try {
    const out = await epicReading(JSON.parse(await readBody(req, 100_000)));
    logShape('epic', out.shape);
    if (out.error) return sendJson(res, { error: out.error, shape: out.shape }, out.status || 500);
    return sendJson(res, { reading: out.reading, shape: out.shape });
  } catch (error) {
    console.error('Epic request failed', error?.message);
    if (error?.status === 429) return sendJson(res, { error: 'AI 판독 사용량이 많습니다. 잠시 뒤에 다시 시도해 주세요.' }, 429);
    return sendJson(res, { error: '판독을 불러오지 못했어요. 잠시 뒤에 다시 시도해 주세요.' }, 502);
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
    if (extname(target)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return void res.end('Not Found');
    }
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
  if (url.pathname === '/api/health') {
    if (!['GET', 'HEAD'].includes(req.method)) return sendJson(res, { error: '허용되지 않은 요청입니다.' }, 405);
    return sendJson(res, {
      ok: true,
      service: 'dalbit-saju',
      runtime: 'node',
      storage: 'filesystem',
      ai: {
        coach: coachEnabled(),
        epic: epicEnabled()
      }
    });
  }
  if (url.pathname === '/api/journal') return void handleJournal(req, res);
  if (url.pathname === '/api/coach') return void handleCoach(req, res);
  if (url.pathname === '/api/epic') return void handleEpic(req, res);
  if (url.pathname.startsWith('/api/')) return sendJson(res, { error: '없는 경로입니다.' }, 404);
  return void serveStatic(req, res).catch(error => {
    console.error('Static request failed', error?.message);
    res.writeHead(500);
    res.end('Internal Server Error');
  });
}).listen(port, host, () => {
  console.log(`Dalbit Saju listening on ${host}:${port}`);
  console.log(`Journal data directory: ${dataRoot}`);
});
