/**
 * Migration runner
 * Reads all SQL files from src/migrations/ in numeric order and runs
 * each one exactly once, tracked in a schema_migrations table.
 *
 * Usage:
 *   npm run db:migrate          (from packages/database)
 */
import * as fs   from 'fs';
import * as path from 'path';
import { getPool, closePool } from './client';

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function ensureMigrationsTable(): Promise<void> {
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename    VARCHAR(255) PRIMARY KEY,
      applied_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

async function getAppliedMigrations(): Promise<Set<string>> {
  const pool = getPool();
  const result = await pool.query('SELECT filename FROM schema_migrations');
  return new Set(result.rows.map((r: { filename: string }) => r.filename));
}

async function runMigrations(): Promise<void> {
  const pool = getPool();

  await ensureMigrationsTable();
  const applied = await getAppliedMigrations();

  // Collect .sql files sorted numerically by the leading number prefix
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();                          // lexicographic sort works for 001_, 002_, …

  let ran = 0;

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`  ✓ already applied: ${file}`);
      continue;
    }

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (filename) VALUES ($1)',
        [file],
      );
      await client.query('COMMIT');
      console.log(`  ↑ applied: ${file}`);
      ran++;
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`  ✗ failed:  ${file}`, err);
      throw err;                       // stop on first failure
    } finally {
      client.release();
    }
  }

  if (ran === 0) {
    console.log('  (no new migrations)');
  } else {
    console.log(`\n  ${ran} migration(s) applied.`);
  }
}

(async () => {
  console.log('\n── Running migrations ──────────────────────────');
  try {
    await runMigrations();
    console.log('── Done ────────────────────────────────────────\n');
  } finally {
    await closePool();
  }
})();
