import { sendJson } from './http.mjs';
import { createJournalRoute } from './routes/journal.mjs';
import { createReadingRoutes } from './routes/readings.mjs';
import { createAuthRoutes } from './auth.mjs';

export function createApiHandler({ journalRepository, telemetryRepository, authRepository, readiness = async () => true }) {
  const journal = createJournalRoute(journalRepository);
  const readings = createReadingRoutes(telemetryRepository);
  const auth = createAuthRoutes(authRepository);
  return async function apiHandler(req, res) {
    const origin = String(req.headers.origin || '');
    const allowed = String(process.env.TOSS_ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
    if (origin && (allowed.includes('*') || allowed.includes(origin))) {
      const cors = {
        'Access-Control-Allow-Origin': allowed.includes('*') ? '*' : origin,
        'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Dalbit-Session',
        'Vary': 'Origin'
      };
      const writeHead = res.writeHead.bind(res);
      res.writeHead = (status, headers = {}) => writeHead(status, { ...cors, ...headers });
      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    }
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname === '/health' || url.pathname === '/api/health') {
      return sendJson(res, { ok: true, service: 'dalbit-saju-backend', ai: readings.availability() });
    }
    if (url.pathname === '/api/ready') {
      try {
        await readiness();
        return sendJson(res, { ok: true, ready: true });
      } catch {
        return sendJson(res, { ok: false, ready: false }, 503);
      }
    }
    if (url.pathname.startsWith('/api/auth/')) return auth(req, res, url);
    if (url.pathname === '/api/journal') return journal(req, res);
    if (url.pathname === '/api/coach') return readings.coach(req, res);
    if (url.pathname === '/api/epic') return readings.epic(req, res);
    if (url.pathname.startsWith('/api/')) return sendJson(res, { error: '없는 경로입니다.' }, 404);
    return false;
  };
}
