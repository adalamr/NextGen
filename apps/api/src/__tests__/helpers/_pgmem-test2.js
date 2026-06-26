const { newDb } = require("pg-mem");
const { v4: uuid } = require('uuid');
const db = newDb();

db.public.registerFunction({ name: 'gen_random_uuid', returns: 'text', implementation: () => uuid() });
db.public.registerFunction({ name: 'uuid_generate_v4', returns: 'text', implementation: () => uuid() });
db.public.registerFunction({ name: 'left', args: ['text','integer'], returns: 'text', implementation: (str, n) => str ? str.slice(0, n) : null });

db.public.none(`
  CREATE TABLE requirements (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    source TEXT,
    external_id TEXT,
    priority TEXT DEFAULT 'MEDIUM',
    status TEXT DEFAULT 'ACTIVE',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )
`);

const pg = db.adapters.createPg();
const pool = new pg.Pool();

async function run() {
  // Test BEGIN/COMMIT transaction
  const client = await pool.connect();
  await client.query('BEGIN');
  const r = await client.query(
    "INSERT INTO requirements(project_id, title, priority) VALUES($1,$2,$3) RETURNING *",
    ['proj1', 'Test Req', 'HIGH']
  );
  console.log("inserted:", JSON.stringify(r.rows[0]));
  await client.query('COMMIT');
  client.release();

  // Test ON CONFLICT DO NOTHING
  const r2 = await pool.query(
    `INSERT INTO requirements(id, project_id, title)
     VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING id`,
    [r.rows[0].id, 'proj1', 'duplicate']
  );
  console.log("on conflict do nothing result (should be empty):", r2.rows);

  // Test ROLLBACK
  const client2 = await pool.connect();
  await client2.query('BEGIN');
  await client2.query("INSERT INTO requirements(project_id,title) VALUES($1,$2)", ['proj1', 'to rollback']);
  await client2.query('ROLLBACK');
  client2.release();

  const count = await pool.query("SELECT COUNT(*) FROM requirements");
  console.log("count after rollback (should be 1):", count.rows[0]);

  // Test ILIKE
  const search = await pool.query(
    "SELECT id FROM requirements WHERE title ILIKE $1",
    ["%test%"]
  );
  console.log("ilike search (should find 1):", search.rows.length);

  // Test plpgsql function
  try {
    db.public.none(`
      CREATE OR REPLACE FUNCTION next_requirement_seq(proj_id TEXT)
      RETURNS INT AS $$
      DECLARE
        cnt INT;
      BEGIN
        SELECT COUNT(*) + 1 INTO cnt FROM requirements WHERE project_id = proj_id;
        RETURN cnt;
      END;
      $$ LANGUAGE plpgsql;
    `);
    const seq = await pool.query("SELECT next_requirement_seq($1) AS seq", ['proj1']);
    console.log("seq (should be 2):", seq.rows[0]);
  } catch(e) {
    console.log("plpgsql function not supported:", e.message.substring(0, 100));
  }

  await pool.end();
}

run().catch(e => { console.error("ERROR:", e.message); process.exit(1); });
