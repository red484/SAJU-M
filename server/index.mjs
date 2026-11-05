import { errorDetails } from '../src/server/logging.mjs';
import { createServer } from 'node:http';
import { createPool, migrate } from './db.mjs';
import { createApiHandler } from '../src/server/api-handler.mjs';
import { PostgresJournalRepository } from '../src/server/repositories/postgres-journal-repository.mjs';
import { TelemetryRepository } from '../src/server/repositories/telemetry-repository.mjs';
import { AuthRepository } from '../src/server/repositories/auth-repository.mjs';
import { CoachQuotaRepository } from '../src/server/repositories/coach-quota-repository.mjs';
import { TossBillingRepository } from '../src/server/toss-billing.mjs';
import { CoachPaidAllowance, StoreBillingRepository } from '../src/server/store-billing.mjs';
import { RelationshipInviteRepository } from '../src/server/routes/relationship-invites.mjs';

const port = Number(process.env.PORT || 9090);
const host = process.env.HOST || '0.0.0.0';
const pool = createPool();
await migrate(pool);
const tossBilling = new TossBillingRepository(pool);
const storeBilling = new StoreBillingRepository(pool);
const relationshipInvites = new RelationshipInviteRepository(pool);
const authRepository = new AuthRepository(pool);
const telemetryRepository = new TelemetryRepository(pool);

const api = createApiHandler({
  journalRepository: new PostgresJournalRepository(pool),
  telemetryRepository,
  authRepository,
  coachQuotaRepository: new CoachQuotaRepository(pool, new CoachPaidAllowance(tossBilling, storeBilling)),
  tossBillingRepository: tossBilling,
  storeBillingRepository: storeBilling,
  relationshipInviteRepository: relationshipInvites,
  readiness: async () => { await pool.query('SELECT 1'); }
});

const server = createServer((req, res) => void api(req, res).catch(error => {
  console.error(JSON.stringify({ event: 'request.error', ...errorDetails(error) }));
  if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: '서버 오류가 발생했습니다.' }));
}));

server.listen(port, host, () => console.log(`Dalbit Saju backend listening on ${host}:${port}`));

async function cleanExpiredInvites() {
  try {
    const deleted = await relationshipInvites.deleteExpired();
    console.log(JSON.stringify({ event: 'relationship_invites.expired_cleaned', deleted }));
  } catch (error) {
    console.error(JSON.stringify({ event: 'relationship_invites.cleanup_failed', ...errorDetails(error) }));
  }
}
const inviteTimer = setInterval(cleanExpiredInvites, 60 * 60 * 1000);
inviteTimer.unref();
void cleanExpiredInvites();

let cleaningData = false;
async function cleanExpiredData() {
  if (cleaningData) return;
  cleaningData = true;
  try {
    try {
      const deleted = await authRepository.deleteExpiredSessions();
      console.log(JSON.stringify({ event: 'auth.expired_sessions_cleaned', deleted }));
    } catch (error) {
      console.error(JSON.stringify({ event: 'auth.session_cleanup_failed', ...errorDetails(error) }));
    }
    try {
      const totals = { llm_requests: 0, audit_logs: 0, usage_sessions: 0, product_event_counts: 0 };
      let batch;
      do {
        batch = await telemetryRepository.deleteExpiredLogs();
        for (const table of Object.keys(totals)) totals[table] += batch[table];
      } while (Object.values(batch).some(count => count === 1000));
      console.log(JSON.stringify({ event: 'operational.expired_logs_cleaned', deleted: totals }));
    } catch (error) {
      console.error(JSON.stringify({ event: 'operational.log_cleanup_failed', ...errorDetails(error) }));
    }
  } finally { cleaningData = false; }
}
const retentionTimer = setInterval(cleanExpiredData, 60 * 60 * 1000);
retentionTimer.unref();
void cleanExpiredData();

async function shutdown() {
  clearInterval(retentionTimer);
  clearInterval(inviteTimer);
  // Idle keep-alive sockets would otherwise hold close() open until Docker sends SIGKILL.
  setTimeout(() => process.exit(1), 10_000).unref();
  server.closeIdleConnections();
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
