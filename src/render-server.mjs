import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FileJournalRepository } from './server/repositories/file-journal-repository.mjs';
import { NullTelemetryRepository } from './server/repositories/telemetry-repository.mjs';
import { createApiHandler } from './server/api-handler.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const clientRoot = join(root, 'dist', 'client');
const dataRoot = process.env.DALBIT_DATA_DIR || join(root, '.data');
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';
const api = createApiHandler({
  journalRepository: new FileJournalRepository(dataRoot),
  telemetryRepository: new NullTelemetryRepository()
});

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

createServer((req, res) => void api(req, res).then(handled => {
  if (handled !== false) return;
  return serveStatic(req, res);
}).catch(error => {
    console.error('Static request failed', error?.message);
    res.writeHead(500);
    res.end('Internal Server Error');
  })).listen(port, host, () => {
  console.log(`Dalbit Saju listening on ${host}:${port}`);
  console.log(`Journal data directory: ${dataRoot}`);
});
