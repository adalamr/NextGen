const { newDb } = require("pg-mem");
const { v4: uuid } = require('uuid');

// Key insight: pg-mem caches the result of pure functions within a query.
// We need to mark uuid function as 'impure' or use a counter.
let _seq = 0;

function makeDb() {
  const db = newDb({ autoCreateForeignKeyIndices: true });
  // Mark as impure (deterministic: false) so it's called fresh each row
  db.public.registerFunction({
    name: 'gen_random_uuid',
    returns: 'text',
    impure: true,
    implementation: () => uuid()
  });
  db.public.registerFunction({
    name: 'uuid_generate_v4',
    returns: 'text',
    impure: true,
    implementation: () => uuid()
  });
  db.public.registerFunction({
    name: 'left',
    args: ['text','integer'],
    returns: 'text',
    implementation: (str, n) => str ? str.slice(0, n) : null
  });
  return db;
}

async function testMultipleInserts() {
  const db = makeDb();
  db.public.none(`
    CREATE TABLE test_cases (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
      technique TEXT
    )
  `);
  const pg = db.adapters.createPg();
  const pool = new pg.Pool();
  await pool.query("INSERT INTO test_cases(technique) VALUES($1)", ['BOUNDARY']);
  await pool.query("INSERT INTO test_cases(technique) VALUES($1)", ['EQUIVALENCE']);
  const r = await pool.query("SELECT COUNT(*) FROM test_cases");
  console.log("Multiple inserts count (should be 2):", r.rows[0].count);
  await pool.end();
}

async function testCountDistinct() {
  const db = makeDb();
  db.public.none(`
    CREATE TABLE test_cases (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id TEXT NOT NULL,
      technique TEXT
    )
  `);
  db.public.none(`
    CREATE TABLE trace_links (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
      source_id TEXT NOT NULL,
      target_id TEXT NOT NULL
    )
  `);
  const pg = db.adapters.createPg();
  const pool = new pg.Pool();
  const tc1 = uuid(), tc2 = uuid();
  await pool.query("INSERT INTO test_cases(id,project_id,technique) VALUES($1,$2,$3)", [tc1,'p1','BOUNDARY']);
  await pool.query("INSERT INTO test_cases(id,project_id,technique) VALUES($1,$2,$3)", [tc2,'p1','EQUIVALENCE']);
  await pool.query("INSERT INTO trace_links(id,source_id,target_id) VALUES($1,$2,$3)", [uuid(),'req1',tc1]);
  await pool.query("INSERT INTO trace_links(id,source_id,target_id) VALUES($1,$2,$3)", [uuid(),'req1',tc2]);

  const r = await pool.query(
    `SELECT COUNT(DISTINCT tl.target_id)::text AS test_case_count,
            COUNT(DISTINCT tc.technique)::text AS technique_count
     FROM trace_links tl
     LEFT JOIN test_cases tc ON tc.id = tl.target_id
     WHERE tl.source_id = $1`,
    ['req1']
  );
  console.log("COUNT DISTINCT:", JSON.stringify(r.rows[0]));
  await pool.end();
}

async function testJsonAgg() {
  const db = makeDb();
  db.public.none(`
    CREATE TABLE test_cases (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
      technique TEXT
    )
  `);
  const pg = db.adapters.createPg();
  const pool = new pg.Pool();
  const tc1 = uuid(), tc2 = uuid();
  await pool.query("INSERT INTO test_cases(id,technique) VALUES($1,$2)", [tc1,'BOUNDARY']);
  await pool.query("INSERT INTO test_cases(id,technique) VALUES($1,$2)", [tc2,'EQUIVALENCE']);
  try {
    const r = await pool.query(
      `SELECT COALESCE(json_agg(DISTINCT technique) FILTER (WHERE technique IS NOT NULL), '[]') AS techniques FROM test_cases`
    );
    console.log("json_agg:", JSON.stringify(r.rows[0]));
  } catch(e) {
    console.log("json_agg not supported:", e.message.substring(0,120));
  }
  await pool.end();
}

async function testTransaction() {
  const db = makeDb();
  db.public.none(`
    CREATE TABLE requirements (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id TEXT NOT NULL,
      title TEXT NOT NULL
    )
  `);
  const pg = db.adapters.createPg();
  const pool = new pg.Pool();
  const client = await pool.connect();
  await client.query('BEGIN');
  await client.query("INSERT INTO requirements(id,project_id,title) VALUES($1,$2,$3)", [uuid(),'p1','req1']);
  await client.query('COMMIT');
  client.release();

  // ROLLBACK test
  const client2 = await pool.connect();
  await client2.query('BEGIN');
  await client2.query("INSERT INTO requirements(id,project_id,title) VALUES($1,$2,$3)", [uuid(),'p1','req-rollback']);
  await client2.query('ROLLBACK');
  client2.release();

  const r = await pool.query("SELECT COUNT(*) FROM requirements");
  console.log("After rollback count (pg-mem doesn't support rollback, may be 2):", r.rows[0].count);
  await pool.end();
}

Promise.all([testMultipleInserts(), testCountDistinct(), testJsonAgg(), testTransaction()])
  .catch(e => { console.error("FATAL:", e.message); process.exit(1); });
