/**
 * Rollback runner — removes the last applied migration record so it can
 * be re-applied on the next `db:migrate` run.
 *
 * NOTE: This does NOT reverse the SQL statements (no down migrations).
 *       It simply removes the tracking row so the file runs again.
 *
 * Usage:
 *   npm run db:rollback          (from packages/database)
 */
import { getPool, closePool } from './client';

async function rollbackLast(): Promise<void> {
  const pool = getPool();

  const result = await pool.query(
    'SELECT filename FROM schema_migrations ORDER BY applied_at DESC LIMIT 1',
  );

  if (!result.rows.length) {
    console.log('  (nothing to roll back)');
    return;
  }

  const { filename } = result.rows[0];

  await pool.query(
    'DELETE FROM schema_migrations WHERE filename = $1',
    [filename],
  );

  console.log(`  ↓ rolled back tracking for: ${filename}`);
  console.log(`    Re-run "npm run db:migrate" to re-apply it.`);
}

(async () => {
  console.log('\n── Rolling back last migration ─────────────────');
  try {
    await rollbackLast();
    console.log('── Done ────────────────────────────────────────\n');
  } finally {
    await closePool();
  }
})();
