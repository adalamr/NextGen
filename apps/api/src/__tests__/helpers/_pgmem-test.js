const { newDb } = require("pg-mem");
const { v4: uuid } = require('uuid');
const db = newDb();

// Register missing functions
db.public.registerFunction({ name: 'gen_random_uuid', returns: 'text', implementation: () => uuid() });
db.public.registerFunction({ name: 'uuid_generate_v4', returns: 'text', implementation: () => uuid() });
db.public.registerFunction({ name: 'left', args: ['text','integer'], returns: 'text', implementation: (str, n) => str ? str.slice(0, n) : null });

db.public.none(`
  CREATE TABLE knowledge_vectors (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id TEXT NOT NULL,
    doc_type TEXT NOT NULL,
    doc_id TEXT,
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    embedding_status TEXT DEFAULT 'PENDING',
    embedding_error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`);
const pg = db.adapters.createPg();
const pool = new pg.Pool();
pool.query(
  "INSERT INTO knowledge_vectors(project_id,doc_type,content) VALUES($1,$2,$3) RETURNING id,embedding_status",
  ["p1","requirement","hello world"]
)
.then(r => {
  console.log("inserted:", JSON.stringify(r.rows[0]));
  return pool.query(
    "SELECT id, LEFT(content,300) AS excerpt FROM knowledge_vectors WHERE content ILIKE $1",
    ["%hello%"]
  );
})
.then(r => { console.log("search:", JSON.stringify(r.rows[0])); return pool.end(); })
.catch(e => { console.error("ERR:", e.message); process.exit(1); });
