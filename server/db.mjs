import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const migrations = join(dirname(fileURLToPath(import.meta.url)), 'migrations');
const MIGRATION_LOCK = 482_901_337;

export function createPool(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error('DATABASE_URL is required');
  const pool = new pg.Pool({ connectionString, max: Number(process.env.DB_POOL_SIZE || 10) });
  // An idle client dropped by a Postgres restart emits here; unhandled, it would end the process.
  pool.on('error', error => console.error(JSON.stringify({ event: 'db.idle_error', error: error?.message })));
  return pool;
}

export async function migrate(pool) {
  const client = await pool.connect();
  try {
    // Instances starting together apply migrations one at a time; the second sees them done.
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK]);
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    for (const file of (await readdir(migrations)).filter(name => name.endsWith('.sql')).sort()) {
      const id = file.replace(/\.sql$/, '');
      if ((await client.query('SELECT 1 FROM schema_migrations WHERE id = $1', [id])).rowCount) continue;
      try {
        await client.query('BEGIN');
        await client.query(await readFile(join(migrations, file), 'utf8'));
        await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [id]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK]).catch(() => {});
    client.release();
  }
}
