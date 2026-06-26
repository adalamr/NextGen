/**
 * Test DB helper – creates an in-memory PostgreSQL instance using pg-mem.
 *
 * Key pg-mem limitations handled here:
 *  1. gen_random_uuid() must be registered manually with impure:true (otherwise
 *     duplicate IDs across INSERT statements in the same pool)
 *  2. LEFT(text, n) must be registered manually
 *  3. plpgsql language is NOT supported — tests that call generateExternalId
 *     must mock the function or use explicit externalId values
 *  4. ROLLBACK is silently ignored — each test should use a fresh DbHelper
 *  5. pgvector <=> operator is not available — search() tests mock generateEmbedding
 *
 * Usage:
 *   const helper = new DbHelper();
 *   await helper.setup();   // creates tables, registers functions, seeds fixtures
 *   const pool = helper.getPool();  // pg.Pool-compatible
 *   await helper.teardown();
 */
import { newDb, IMemoryDb, DataType } from 'pg-mem';
import { v4 as uuid } from 'uuid';

// ── schema matching real migrations (without plpgsql / pgvector) ──────────
const SCHEMA_SQL = `
CREATE TABLE organizations (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  slug        TEXT UNIQUE NOT NULL,
  plan        TEXT DEFAULT 'FREE',
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE users (
  id              TEXT PRIMARY KEY,
  email           TEXT UNIQUE NOT NULL,
  password_hash   TEXT NOT NULL,
  first_name      TEXT,
  last_name       TEXT,
  org_id          TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  role            TEXT DEFAULT 'MEMBER',
  is_active       BOOLEAN DEFAULT TRUE,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE projects (
  id                    TEXT PRIMARY KEY,
  org_id                TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  description           TEXT,
  slug                  TEXT NOT NULL,
  status                TEXT DEFAULT 'ACTIVE',
  created_by            TEXT REFERENCES users(id),
  llm_endpoint          TEXT,
  llm_api_key_encrypted TEXT,
  llm_model             TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, slug)
);

CREATE TABLE connectors (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  TEXT REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL,
  config      JSONB DEFAULT '{}',
  is_active   BOOLEAN DEFAULT TRUE,
  last_run_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE ingestion_runs (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_id  TEXT REFERENCES connectors(id) ON DELETE CASCADE,
  trigger       TEXT NOT NULL,
  status        TEXT DEFAULT 'QUEUED',
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  error_message TEXT,
  stats         JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE requirements (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  TEXT REFERENCES projects(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT,
  source      TEXT,
  external_id TEXT,
  priority    TEXT DEFAULT 'MEDIUM',
  status      TEXT DEFAULT 'ACTIVE',
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE knowledge_vectors (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       TEXT REFERENCES projects(id) ON DELETE CASCADE,
  doc_type         TEXT NOT NULL,
  doc_id           TEXT,
  content          TEXT NOT NULL,
  embedding        TEXT,
  metadata         JSONB DEFAULT '{}',
  embedding_status TEXT DEFAULT 'PENDING',
  embedding_error  TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE test_cases (
  id                          TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id                  TEXT REFERENCES projects(id) ON DELETE CASCADE,
  generation_job_id           TEXT,
  title                       TEXT NOT NULL,
  description                 TEXT,
  preconditions               JSONB DEFAULT '[]',
  steps                       JSONB DEFAULT '[]',
  expected_results            JSONB DEFAULT '[]',
  postconditions              JSONB DEFAULT '[]',
  status                      TEXT DEFAULT 'DRAFT',
  priority                    TEXT DEFAULT 'MEDIUM',
  technique                   TEXT,
  risk_score                  NUMERIC,
  tags                        JSONB DEFAULT '[]',
  reviewed_by                 TEXT,
  review_reason               TEXT,
  reviewed_at                 TIMESTAMPTZ,
  version                     INT DEFAULT 1,
  created_by                  TEXT,
  match_percentage            NUMERIC,
  gold_standard_candidate     BOOLEAN DEFAULT FALSE,
  is_gold_standard_candidate  BOOLEAN DEFAULT FALSE,
  gold_standard_candidate_at  TIMESTAMPTZ,
  feedback_notes              TEXT,
  is_gold_standard            BOOLEAN DEFAULT FALSE,
  gold_standard_by            TEXT,
  gold_standard_at            TIMESTAMPTZ,
  created_at                  TIMESTAMPTZ DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE trace_links (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    TEXT REFERENCES projects(id) ON DELETE CASCADE,
  source_type   TEXT NOT NULL,
  source_id     TEXT NOT NULL,
  target_type   TEXT NOT NULL,
  target_id     TEXT NOT NULL,
  relationship  TEXT DEFAULT 'COVERS',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(source_type, source_id, target_type, target_id)
);

CREATE TABLE traceability_defect_links (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      TEXT,
  requirement_id  TEXT REFERENCES requirements(id) ON DELETE CASCADE,
  defect_id       TEXT NOT NULL,
  linked_by       TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(requirement_id, defect_id)
);

CREATE TABLE knowledge_feedback (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           TEXT,
  project_id       TEXT REFERENCES projects(id) ON DELETE CASCADE,
  test_case_id     TEXT REFERENCES test_cases(id) ON DELETE CASCADE,
  user_id          TEXT REFERENCES users(id),
  clarity          INT,
  correctness      INT,
  coverage_score   INT,
  match_percentage INT,
  is_gold_standard BOOLEAN DEFAULT FALSE,
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
`;

/** Creates a configured pg-mem db instance with all required custom functions */
export function createMemDb(): IMemoryDb {
  const db = newDb({ autoCreateForeignKeyIndices: true });

  // gen_random_uuid — must be impure so each INSERT row gets a unique UUID
  db.public.registerFunction({
    name: 'gen_random_uuid',
    returns: DataType.text,
    impure: true,
    implementation: () => uuid(),
  });

  // LEFT(text, n) — used by listDocuments for excerpt generation
  db.public.registerFunction({
    name: 'left',
    args: [DataType.text, DataType.integer],
    returns: DataType.text,
    implementation: (str: string, n: number) => (str ? str.slice(0, n) : null),
  });

  // next_requirement_seq — JS replacement for the plpgsql function
  // Takes project_id and returns COUNT+1 (same semantics as the real function)
  db.public.registerFunction({
    name: 'next_requirement_seq',
    args: [DataType.text],
    returns: DataType.integer,
    impure: true,
    implementation: (_projectId: string) => {
      // pg-mem doesn't support plpgsql, so we return a simple incrementing value.
      // The actual count is computed via SQL in the real function.
      // Tests that care about the exact external_id value should pass externalId explicitly.
      return 1;
    },
  });

  return db;
}

export class DbHelper {
  private db: IMemoryDb | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _pgAdapter: any = null;

  /** Seeded fixture IDs */
  public orgId = '';
  public userId = '';
  public projectId = '';

  async setup(): Promise<void> {
    this.db = createMemDb();
    this.db.public.none(SCHEMA_SQL);
    this._pgAdapter = this.db.adapters.createPg();

    // Seed base fixtures with deterministic IDs
    this.orgId     = uuid();
    this.userId    = uuid();
    this.projectId = uuid();

    const pool = this.getPool();
    await pool.query(
      'INSERT INTO organizations(id,name,slug) VALUES($1,$2,$3)',
      [this.orgId, 'Test Org', 'test-org'],
    );
    await pool.query(
      'INSERT INTO users(id,email,password_hash,org_id) VALUES($1,$2,$3,$4)',
      [this.userId, 'user@test.com', 'hash', this.orgId],
    );
    await pool.query(
      `INSERT INTO projects(id,org_id,name,slug,created_by,llm_endpoint,llm_api_key_encrypted,llm_model)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [this.projectId, this.orgId, 'Test Project', 'test', this.userId,
       'https://api.example.com/v1', 'sk-test', 'claude-sonnet-4.6'],
    );
    await pool.end();
  }

  /**
   * Returns a NEW pg.Pool instance backed by the in-memory DB.
   * Create a new pool per service under test — each service lazily
   * initialises its own pool reference via getPool() which we override
   * in the test via jest.mock / jest.spyOn.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getPool(): any {
    if (!this._pgAdapter) throw new Error('DbHelper not set up — call setup() first');
    return new this._pgAdapter.Pool();
  }

  teardown(): void {
    this.db = null;
    this._pgAdapter = null;
  }
}
