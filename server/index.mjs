import { createServer } from 'node:http';
import { createPool, migrate } from './db.mjs';
import { createApiHandler } from '../src/server/api-handler.mjs';
import { PostgresJournalRepository } from '../src/server/repositories/postgres-journal-repository.mjs';
import { TelemetryRepository } from '../src/server/repositories/telemetry-repository.mjs';

const port = Number(process.env.PORT || 9090);
const host = process.env.HOST || '0.0.0.0';
const pool = createPool();
await migrate(pool);

const api = createApiHandler({
  journalRepository: new PostgresJournalRepository(pool),
  telemetryRepository: new TelemetryRepository(pool),
  readiness: async () => { await pool.query('SELECT 1'); }
});

const server = createServer((req, res) => void api(req, res).catch(error => {
  console.error(JSON.stringify({ event: 'request.error', error: error?.message }));
  if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: '서버 오류가 발생했습니다.' }));
}));

server.listen(port, host, () => console.log(`Dalbit Saju backend listening on ${host}:${port}`));

async function shutdown() {
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
