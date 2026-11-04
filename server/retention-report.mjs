import { createPool } from './db.mjs';
import { retentionAudit } from '../src/server/retention-audit.mjs';
import { errorDetails } from '../src/server/logging.mjs';
let pool;
try {
  pool = createPool();
  console.log(JSON.stringify(await retentionAudit(pool), null, 2));
} catch (error) {
  console.error(JSON.stringify({ event: 'retention.report_failed', ...errorDetails(error) }));
  process.exitCode = 1;
} finally { if (pool) await pool.end(); }
