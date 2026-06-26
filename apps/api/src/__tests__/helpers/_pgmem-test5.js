// Test specific SQL patterns from requirements service
const { newDb } = require("pg-mem");
const { v4: uuid } = require('uuid');

function makeDb() {
  const db = newDb({ autoCreateForeignKeyIndices: true });
  db.public.registerFunction({ name: 'gen_random_uuid', returns: 'text', impure: true, implementation: () => uuid() });
  db.public.registerFunction({ name: 'left', args: ['text','integer'], returns: 'text', implementation: (str, n) => str ? str.slice(0, n) : null });
  return db;
}

async function testUpdateReturning() {
  const db = makeDb();
  db.public.none(`
    CREATE TABLE requirements (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      priority TEXT DEFAULT 'MEDIUM',
      status TEXT DEFAULT 'ACTIVE',
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  const pg = db.adapters.createPg();
  const pool = new pg.Pool();
  const id = uuid();
  await pool.query("INSERT INTO requirements(id,project_id,title) VALUES($1,$2,$3)", [id,'p1','req1']);

  // Test UPDATE with dynamic SET and RETURNING
  const result = await pool.query(
    `UPDATE requirements SET title = $1, updated_at = $2
     WHERE (id::text = $3 OR external_id = $3) AND project_id = $4
     RETURNING *`,
    ['Updated Title', new Date(), id, 'p1']
  );
  console.log("UPDATE result:", JSON.stringify(result.rows[0]));

  // Test uuid cast: id::text
  const r2 = await pool.query(
    'SELECT id FROM requirements WHERE project_id = $1 AND (id::text = $2 OR id::text = $2) LIMIT 1',
    ['p1', id]
  );
  console.log("UUID cast id::text:", r2.rows[0]?.id === id ? 'OK' : 'FAIL');
  await pool.end();
}

async function testDeleteReturning() {
  const db = makeDb();
  db.public.none(`
    CREATE TABLE requirements (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL
    )
  `);
  const pg = db.adapters.createPg();
  const pool = new pg.Pool();
  const id = uuid();
  await pool.query("INSERT INTO requirements(id,project_id,title) VALUES($1,$2,$3)", [id,'p1','req1']);
  const r = await pool.query(
    `DELETE FROM requirements WHERE (id::text = $1 OR id::text = $1) AND project_id = $2 RETURNING id`,
    [id, 'p1']
  );
  console.log("DELETE RETURNING:", r.rows[0]?.id === id ? 'OK' : 'FAIL');
  await pool.end();
}

async function testConnectorsInsert() {
  const db = makeDb();
  db.public.none(`
    CREATE TABLE connectors (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      config JSONB DEFAULT '{}'
    )
  `);
  const pg = db.adapters.createPg();
  const pool = new pg.Pool();
  const r = await pool.query(
    `INSERT INTO connectors (project_id, name, type, config)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    ['p1', 'MyConn', 'SPEC', JSON.stringify({ url: 'http://example.com' })]
  );
  console.log("Connector insert:", r.rows[0]?.name === 'MyConn' ? 'OK' : 'FAIL');
  await pool.end();
}

async function testFeedbackMatchPercentage() {
  // Test the feedback score calculation (pure JS - no DB needed)
  const clarity = 4, correctness = 4, coverage = 4;
  const matchPct = Math.round(((clarity + correctness + coverage) / 15) * 100);
  console.log("Match % for 4,4,4 (should be 80):", matchPct);

  const low = Math.round(((2 + 2 + 2) / 15) * 100);
  console.log("Match % for 2,2,2 (should be 40):", low);

  const high = Math.round(((5 + 5 + 5) / 15) * 100);
  console.log("Match % for 5,5,5 (should be 100):", high);
}

async function testTraceabilityCoverage() {
  // Test the coverage calculation (pure JS - mirrors TraceabilityService)
  const REQUIRED = { CRITICAL: 3, HIGH: 2, MEDIUM: 1, LOW: 1 };
  const calcPct = (actual, priority) => {
    const req = REQUIRED[priority?.toUpperCase()] ?? 1;
    return Math.min(100, Math.round((actual / req) * 100));
  };
  console.log("Coverage CRITICAL 3 techniques (should be 100):", calcPct(3, 'CRITICAL'));
  console.log("Coverage HIGH 1 technique (should be 50):", calcPct(1, 'HIGH'));
  console.log("Coverage MEDIUM 1 technique (should be 100):", calcPct(1, 'MEDIUM'));
  console.log("Coverage MEDIUM 0 techniques (should be 0):", calcPct(0, 'MEDIUM'));
}

Promise.all([
  testUpdateReturning(),
  testDeleteReturning(),
  testConnectorsInsert(),
  testFeedbackMatchPercentage(),
  testTraceabilityCoverage(),
]).catch(e => { console.error("FATAL:", e.message); process.exit(1); });
