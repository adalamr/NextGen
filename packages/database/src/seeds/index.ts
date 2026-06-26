/**
 * Seed runner
 * Reads all SQL files from src/seeds/ in numeric order and runs each one.
 * Seeds are intentionally re-runnable — every INSERT uses ON CONFLICT DO NOTHING.
 *
 * Usage:
 *   npm run db:seed          (from packages/database)
 */
import * as fs   from 'fs';
import * as path from 'path';
import { getPool, closePool } from '../client';

const SEEDS_DIR = path.join(__dirname);   // __dirname = compiled seeds/ folder

async function runSeeds(): Promise<void> {
  const pool = getPool();

  const files = fs
    .readdirSync(SEEDS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();                              // 001_… before 002_…

  if (files.length === 0) {
    console.log('  (no seed files found)');
    return;
  }

  for (const file of files) {
    const sql = fs.readFileSync(path.join(SEEDS_DIR, file), 'utf8');
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('COMMIT');
      console.log(`  ✓ seeded: ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`  ✗ failed: ${file}`, err);
      throw err;
    } finally {
      client.release();
    }
  }
}

(async () => {
  console.log('\n── Running seeds ───────────────────────────────');
  try {
    await runSeeds();
    console.log('── Done ────────────────────────────────────────\n');
  } finally {
    await closePool();
  }
})();
