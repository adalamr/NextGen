const { newDb } = require("pg-mem");
const { v4: uuid } = require('uuid');

function makeDb() {
  const db = newDb({ autoCreateForeignKeyIndices: true });
  db.public.registerFunction({ name: 'gen_random_uuid', returns: 'text', implementation: () => uuid() });
  db.public.registerFunction({ name: 'uuid_generate_v4', returns: 'text', implementation: () => uuid() });
  db.public.registerFunction({ name: 'left', args: ['text','integer'], returns: 'text', implementation: (str, n) => str ? str.slice(0, n) : null });
  return db;
}

async function testPlpgsql() {
  const db = makeDb();
  db.public.none(`
    CREATE TABLE requirements (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id TEXT NOT NULL,
      title TEXT NOT NULL
    )
  `);
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
    const pg = db.adapters.createPg();
    const pool = new pg.Pool();
    await pool.query("INSERT INTO requirements(project_id,title) VALUES($1,$2)", ['p1', 'req 1']);
    const seq = await pool.query("SELECT next_requirement_seq($1) AS seq", ['p1']);
    console.log("plpgsql seq (should be 2):", seq.rows[0].seq);
    await pool.end();
  } catch(e) {
    console.log("plpgsql NOT supported:", e.message.substring(0, 150));
  }
}

async function testOnConflict() {
  const db = makeDb();
  db.public.none(`
    CREATE TABLE trace_links (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
      source_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      UNIQUE(source_id, target_id)
    )
  `);
  const pg = db.adapters.createPg();
  const pool = new pg.Pool();
  await pool.query("INSERT INTO trace_links(source_id,target_id) VALUES($1,$2)", ['a','b']);
  try {
    await pool.query("INSERT INTO trace_links(source_id,target_id) VALUES($1,$2) ON CONFLICT (source_id,target_id) DO NOTHING", ['a','b']);
    console.log("ON CONFLICT DO NOTHING: worked (no error)");
  } catch(e) {
    console.log("ON CONFLICT DO NOTHING: threw error (pg-mem limitation):", e.message.substring(0,80));
  }
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
  await pool.query("INSERT INTO trace_links(source_id,target_id) VALUES($1,$2)", ['req1',tc1]);
  await pool.query("INSERT INTO trace_links(source_id,target_id) VALUES($1,$2)", ['req1',tc2]);

  const r = await pool.query(
    `SELECT COUNT(DISTINCT tl.target_id) AS test_case_count,
            COUNT(DISTINCT tc.technique) AS technique_count
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
  await pool.query("INSERT INTO test_cases(technique) VALUES($1)", ['BOUNDARY']);
  await pool.query("INSERT INTO test_cases(technique) VALUES($1)", ['EQUIVALENCE']);
  try {
    const r = await pool.query(
      `SELECT COALESCE(json_agg(DISTINCT technique) FILTER (WHERE technique IS NOT NULL), '[]') AS techniques FROM test_cases`
    );
    console.log("json_agg:", JSON.stringify(r.rows[0]));
  } catch(e) {
    console.log("json_agg not supported:", e.message.substring(0,100));
  }
  await pool.end();
}

Promise.all([testPlpgsql(), testOnConflict(), testCountDistinct(), testJsonAgg()])
  .catch(e => { console.error("FATAL:", e.message); process.exit(1); });
