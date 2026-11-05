import { createPool } from './db.mjs';
import { TelemetryRepository } from '../src/server/repositories/telemetry-repository.mjs';
import { errorDetails } from '../src/server/logging.mjs';
let pool;
try {
  pool = createPool();
  console.log(JSON.stringify(await new TelemetryRepository(pool).routingReport(), null, 2));
} catch (error) {
  console.error(JSON.stringify({ event: 'ai_routing.report_failed', ...errorDetails(error) }));
  process.exitCode = 1;
} finally { if (pool) await pool.end(); }
