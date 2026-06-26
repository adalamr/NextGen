/**
 * Integration tests — pgvector cosine similarity search
 *
 * These tests require a real PostgreSQL instance with the pgvector extension.
 * They are SKIPPED automatically when TEST_DATABASE_URL is not set, so the
 * standard unit-test run (which uses pg-mem) is unaffected.
 *
 * To run locally:
 *   TEST_DATABASE_URL=postgres://user:pass@localhost:5432/test_db npx jest pgvector.search
 *
 * The suite provisions its own schema in a dedicated test schema, then tears
 * it down after all tests complete.
 */

import { Pool } from 'pg';
import { v4 as uuid } from 'uuid';

// ── Skip the entire file when no real DB is configured ───────────────────────
const TEST_DB_URL = process.env['TEST_DATABASE_URL'];
const describeOrSkip = TEST_DB_URL ? describe : describe.skip;

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Builds a normalised float vector of a given dimension. */
function makeVector(dims: number, seed: number): number[] {
  const v: number[] = [];
  for (let i = 0; i < dims; i++) {
    v.push(Math.sin(seed + i * 0.1));
  }
  // L2-normalise so cosine distance ≈ Euclidean distance
  const mag = Math.sqrt(v.reduce((acc, x) => acc + x * x, 0));
  return v.map((x) => x / mag);
}

/** Returns the cosine similarity (0–1) between two equal-length vectors. */
function cosineSim(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot; // both are unit vectors, so dot product === cosine similarity
}

// ── Tests ────────────────────────────────────────────────────────────────────

describeOrSkip('pgvector integration — cosine similarity search', () => {
  let pool: Pool;
  let testSchema: string;
  let projectId: string;

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DB_URL });
    testSchema = `pgvector_test_${uuid().replace(/-/g, '').slice(0, 12)}`;
    projectId = uuid();

    await pool.query(`CREATE SCHEMA "${testSchema}"`);
    await pool.query(`SET search_path TO "${testSchema}", public`);
    await pool.query(`CREATE EXTENSION IF NOT EXISTS vector`);

    // Minimal schema needed for the search query
    await pool.query(`
      CREATE TABLE "${testSchema}".knowledge_vectors (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id       UUID NOT NULL,
        doc_type         TEXT NOT NULL,
        doc_id           TEXT,
        content          TEXT NOT NULL,
        embedding        vector(8),
        metadata         JSONB DEFAULT '{}',
        embedding_status TEXT DEFAULT 'PENDING'
      )
    `);
  });

  afterAll(async () => {
    await pool.query(`DROP SCHEMA IF EXISTS "${testSchema}" CASCADE`);
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query(`DELETE FROM "${testSchema}".knowledge_vectors`);
  });

  // ── Test 1: basic <=> operator ─────────────────────────────────────────────

  it('orders rows by cosine distance to query vector', async () => {
    const queryVec  = makeVector(8, 0.0);
    const nearVec   = makeVector(8, 0.1);  // very close to query
    const farVec    = makeVector(8, 5.0);  // very far from query

    await pool.query(
      `INSERT INTO "${testSchema}".knowledge_vectors
         (project_id, doc_type, content, embedding, embedding_status)
       VALUES
         ($1, 'requirement', 'Near doc',  $2::vector, 'embedded'),
         ($1, 'requirement', 'Far doc',   $3::vector, 'embedded')`,
      [projectId, JSON.stringify(nearVec), JSON.stringify(farVec)],
    );

    const result = await pool.query(
      `SELECT content, 1 - (embedding <=> $2::vector) AS similarity
       FROM "${testSchema}".knowledge_vectors
       WHERE project_id = $1
         AND embedding_status = 'embedded'
         AND embedding IS NOT NULL
       ORDER BY embedding <=> $2::vector
       LIMIT 10`,
      [projectId, JSON.stringify(queryVec)],
    );

    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].content).toBe('Near doc');
    expect(result.rows[1].content).toBe('Far doc');

    const nearSim = parseFloat(result.rows[0].similarity);
    const farSim  = parseFloat(result.rows[1].similarity);
    expect(nearSim).toBeGreaterThan(farSim);
  });

  // ── Test 2: similarity scores are in expected range ────────────────────────

  it('returns similarity score in [0, 1] for unit vectors', async () => {
    const queryVec = makeVector(8, 1.0);
    const docVec   = makeVector(8, 1.1);

    await pool.query(
      `INSERT INTO "${testSchema}".knowledge_vectors
         (project_id, doc_type, content, embedding, embedding_status)
       VALUES ($1, 'requirement', 'Doc', $2::vector, 'embedded')`,
      [projectId, JSON.stringify(docVec)],
    );

    const result = await pool.query(
      `SELECT 1 - (embedding <=> $2::vector) AS similarity
       FROM "${testSchema}".knowledge_vectors
       WHERE project_id = $1 AND embedding IS NOT NULL`,
      [projectId, JSON.stringify(queryVec)],
    );

    const sim = parseFloat(result.rows[0].similarity);
    expect(sim).toBeGreaterThanOrEqual(0);
    expect(sim).toBeLessThanOrEqual(1);

    // Verify JS cosine matches pgvector result (within floating-point tolerance)
    const expectedSim = cosineSim(queryVec, docVec);
    expect(Math.abs(sim - expectedSim)).toBeLessThan(0.001);
  });

  // ── Test 3: doc_type filter is respected ───────────────────────────────────

  it('filters by doc_type correctly', async () => {
    const vec = makeVector(8, 2.0);

    await pool.query(
      `INSERT INTO "${testSchema}".knowledge_vectors
         (project_id, doc_type, content, embedding, embedding_status)
       VALUES
         ($1, 'requirement', 'Req doc',  $2::vector, 'embedded'),
         ($1, 'api',         'API doc',  $2::vector, 'embedded')`,
      [projectId, JSON.stringify(vec)],
    );

    const result = await pool.query(
      `SELECT content FROM "${testSchema}".knowledge_vectors
       WHERE project_id = $1
         AND doc_type    = $2
         AND embedding_status = 'embedded'
       ORDER BY embedding <=> $3::vector
       LIMIT 10`,
      [projectId, 'requirement', JSON.stringify(vec)],
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].content).toBe('Req doc');
  });

  // ── Test 4: rows with NULL embedding are excluded ─────────────────────────

  it('excludes rows with NULL embedding', async () => {
    const vec = makeVector(8, 3.0);

    await pool.query(
      `INSERT INTO "${testSchema}".knowledge_vectors
         (project_id, doc_type, content, embedding_status)
       VALUES ($1, 'requirement', 'Pending doc', 'PENDING')`,
      [projectId],
    );
    await pool.query(
      `INSERT INTO "${testSchema}".knowledge_vectors
         (project_id, doc_type, content, embedding, embedding_status)
       VALUES ($1, 'requirement', 'Embedded doc', $2::vector, 'embedded')`,
      [projectId, JSON.stringify(vec)],
    );

    const result = await pool.query(
      `SELECT content FROM "${testSchema}".knowledge_vectors
       WHERE project_id = $1
         AND embedding_status = 'embedded'
         AND embedding IS NOT NULL
       ORDER BY embedding <=> $2::vector`,
      [projectId, JSON.stringify(vec)],
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].content).toBe('Embedded doc');
  });

  // ── Test 5: top-K limiting works ─────────────────────────────────────────

  it('respects LIMIT for top-K retrieval', async () => {
    const queryVec = makeVector(8, 4.0);
    const inserts = Array.from({ length: 10 }, (_, i) => makeVector(8, 4.0 + i * 0.5));

    for (const vec of inserts) {
      await pool.query(
        `INSERT INTO "${testSchema}".knowledge_vectors
           (project_id, doc_type, content, embedding, embedding_status)
         VALUES ($1, 'requirement', 'Doc', $2::vector, 'embedded')`,
        [projectId, JSON.stringify(vec)],
      );
    }

    const result = await pool.query(
      `SELECT content FROM "${testSchema}".knowledge_vectors
       WHERE project_id = $1
         AND embedding_status = 'embedded'
         AND embedding IS NOT NULL
       ORDER BY embedding <=> $2::vector
       LIMIT 3`,
      [projectId, JSON.stringify(queryVec)],
    );

    expect(result.rows).toHaveLength(3);
  });

  // ── Test 6: multi-project isolation ──────────────────────────────────────

  it('does not return rows from other projects', async () => {
    const vec        = makeVector(8, 6.0);
    const otherProjId = uuid();

    await pool.query(
      `INSERT INTO "${testSchema}".knowledge_vectors
         (project_id, doc_type, content, embedding, embedding_status)
       VALUES
         ($1, 'requirement', 'My project doc',    $3::vector, 'embedded'),
         ($2, 'requirement', 'Other project doc', $3::vector, 'embedded')`,
      [projectId, otherProjId, JSON.stringify(vec)],
    );

    const result = await pool.query(
      `SELECT content FROM "${testSchema}".knowledge_vectors
       WHERE project_id = $1
         AND embedding_status = 'embedded'
         AND embedding IS NOT NULL
       ORDER BY embedding <=> $2::vector`,
      [projectId, JSON.stringify(vec)],
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].content).toBe('My project doc');
  });
});
