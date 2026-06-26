-- ============================================================
-- Migration 001: Initial Schema
-- AI Test Platform - PostgreSQL + pgvector
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ============================================================
-- CORE: Organizations, Users, Projects
-- ============================================================

CREATE TABLE organizations (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          VARCHAR(255) NOT NULL,
  slug          VARCHAR(255) UNIQUE NOT NULL,
  plan          VARCHAR(50) DEFAULT 'FREE',
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email           VARCHAR(255) UNIQUE NOT NULL,
  password_hash   VARCHAR(255) NOT NULL,
  first_name      VARCHAR(100),
  last_name       VARCHAR(100),
  org_id          UUID REFERENCES organizations(id) ON DELETE CASCADE,
  role            VARCHAR(50) DEFAULT 'MEMBER',  -- SUPER_ADMIN | ORG_ADMIN | MEMBER
  is_active       BOOLEAN DEFAULT TRUE,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE projects (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id                UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name                  VARCHAR(255) NOT NULL,
  description           TEXT,
  slug                  VARCHAR(255) NOT NULL,
  status                VARCHAR(50) DEFAULT 'ACTIVE',  -- ACTIVE | ARCHIVED | DRAFT
  created_by            UUID REFERENCES users(id),
  -- LLM Configuration (user-provided, per project)
  llm_endpoint          VARCHAR(500),
  llm_api_key_encrypted TEXT,   -- encrypted at app level before storing
  llm_model             VARCHAR(255),
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, slug)
);

CREATE TABLE project_members (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id  UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  role        VARCHAR(50) DEFAULT 'MEMBER',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, user_id)
);

-- ============================================================
-- LAYER 1: Ingestion & Indexing
-- ============================================================

CREATE TABLE connectors (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id  UUID REFERENCES projects(id) ON DELETE CASCADE,
  name        VARCHAR(255) NOT NULL,
  type        VARCHAR(100) NOT NULL,  -- SPEC | CODE_REPO | API_SPEC | DB_SCHEMA | UI_DOM | DEFECTS | LOGS | TEST_RESULTS
  config      JSONB DEFAULT '{}',
  is_active   BOOLEAN DEFAULT TRUE,
  last_run_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE ingestion_runs (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  connector_id  UUID REFERENCES connectors(id) ON DELETE CASCADE,
  trigger       VARCHAR(50) NOT NULL,  -- PR_MERGED | SPEC_UPDATED | NIGHTLY | MANUAL
  status        VARCHAR(50) DEFAULT 'QUEUED',  -- QUEUED | RUNNING | COMPLETED | FAILED
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  error_message TEXT,
  stats         JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- App Model: Digital Twin
CREATE TABLE app_model_api_contracts (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id  UUID REFERENCES projects(id) ON DELETE CASCADE,
  endpoint    VARCHAR(500) NOT NULL,
  method      VARCHAR(10) NOT NULL,
  params      JSONB DEFAULT '{}',
  schemas     JSONB DEFAULT '{}',
  auth        JSONB DEFAULT '{}',
  rate_limits JSONB DEFAULT '{}',
  version     VARCHAR(50),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE app_model_pages (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id  UUID REFERENCES projects(id) ON DELETE CASCADE,
  name        VARCHAR(255) NOT NULL,
  url_pattern VARCHAR(500),
  elements    JSONB DEFAULT '[]',   -- [{name, locator, type, attributes}]
  actions     JSONB DEFAULT '[]',
  version     VARCHAR(50),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE app_model_schema_graph (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id  UUID REFERENCES projects(id) ON DELETE CASCADE,
  table_name  VARCHAR(255) NOT NULL,
  columns     JSONB DEFAULT '[]',
  relations   JSONB DEFAULT '[]',
  constraints JSONB DEFAULT '[]',
  indexes     JSONB DEFAULT '[]',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Knowledge Base: Vector Index (pgvector)
CREATE TABLE knowledge_vectors (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id  UUID REFERENCES projects(id) ON DELETE CASCADE,
  doc_type    VARCHAR(100) NOT NULL,  -- REQUIREMENT | DOC | DEFECT | INCIDENT | TEST_RESULT
  doc_id      VARCHAR(255),
  content     TEXT NOT NULL,
  embedding   vector(1536),          -- OpenAI/Bedrock embedding dimensions
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON knowledge_vectors USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Traceability Matrix
CREATE TABLE requirements (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id    UUID REFERENCES projects(id) ON DELETE CASCADE,
  title         VARCHAR(500) NOT NULL,
  description   TEXT,
  source        VARCHAR(100),   -- jira | manual | spec
  external_id   VARCHAR(255),
  priority      VARCHAR(50) DEFAULT 'MEDIUM',
  status        VARCHAR(50) DEFAULT 'ACTIVE',
  metadata      JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE trace_links (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id    UUID REFERENCES projects(id) ON DELETE CASCADE,
  source_type   VARCHAR(100) NOT NULL,  -- REQUIREMENT | TEST_CASE | CODE_PATH | DEFECT
  source_id     VARCHAR(255) NOT NULL,
  target_type   VARCHAR(100) NOT NULL,
  target_id     VARCHAR(255) NOT NULL,
  relationship  VARCHAR(100) DEFAULT 'COVERS',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(source_type, source_id, target_type, target_id)
);

-- ============================================================
-- LAYER 2: Test Design
-- ============================================================

CREATE TABLE technique_library (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(255) NOT NULL UNIQUE,
  category    VARCHAR(100),   -- functional | boundary | state | combinatorial
  description TEXT,
  when_to_use TEXT,
  examples    JSONB DEFAULT '[]',
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE risk_assessments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id      UUID REFERENCES projects(id) ON DELETE CASCADE,
  requirement_id  UUID REFERENCES requirements(id),
  likelihood      DECIMAL(3,2),   -- 0.00 to 1.00
  impact          DECIMAL(3,2),
  risk_score      DECIMAL(3,2) GENERATED ALWAYS AS (likelihood * impact) STORED,
  risk_level      VARCHAR(20),    -- HIGH | MEDIUM | LOW
  factors         JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- LAYER 3: Generation
-- ============================================================

CREATE TABLE generation_jobs (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id    UUID REFERENCES projects(id) ON DELETE CASCADE,
  created_by    UUID REFERENCES users(id),
  input_data    JSONB DEFAULT '{}',
  status        VARCHAR(50) DEFAULT 'QUEUED',  -- QUEUED | RUNNING | COMPLETED | FAILED
  result_count  INT DEFAULT 0,
  error         TEXT,
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE test_cases (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id        UUID REFERENCES projects(id) ON DELETE CASCADE,
  generation_job_id UUID REFERENCES generation_jobs(id),
  title             VARCHAR(500) NOT NULL,
  description       TEXT,
  preconditions     JSONB DEFAULT '[]',
  steps             JSONB DEFAULT '[]',   -- [{order, action, expectedOutcome}]
  expected_results  JSONB DEFAULT '[]',
  postconditions    JSONB DEFAULT '[]',
  status            VARCHAR(50) DEFAULT 'DRAFT',
  priority          VARCHAR(50) DEFAULT 'MEDIUM',
  technique         VARCHAR(100),
  risk_score        DECIMAL(3,2),
  tags              JSONB DEFAULT '[]',
  reviewed_by       UUID REFERENCES users(id),
  review_reason     TEXT,
  reviewed_at       TIMESTAMPTZ,
  version           INT DEFAULT 1,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE scripts (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id    UUID REFERENCES projects(id) ON DELETE CASCADE,
  test_case_id  UUID REFERENCES test_cases(id) ON DELETE CASCADE,
  framework     VARCHAR(50) NOT NULL,   -- PLAYWRIGHT | CYPRESS | SELENIUM | REST_ASSURED | K6
  language      VARCHAR(50) DEFAULT 'typescript',
  content       TEXT NOT NULL,
  file_path     VARCHAR(500),
  status        VARCHAR(50) DEFAULT 'GENERATED',
  version       INT DEFAULT 1,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE test_data_sets (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id    UUID REFERENCES projects(id) ON DELETE CASCADE,
  test_case_id  UUID REFERENCES test_cases(id),
  name          VARCHAR(255),
  data_type     VARCHAR(100),   -- VALID | INVALID | BOUNDARY | SYNTHETIC
  data          JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- LAYER 4: Execution & Orchestration
-- ============================================================

CREATE TABLE environments (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id  UUID REFERENCES projects(id) ON DELETE CASCADE,
  name        VARCHAR(255) NOT NULL,
  type        VARCHAR(50),   -- DEV | QA | STAGING | PROD
  config      JSONB DEFAULT '{}',
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE execution_runs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id      UUID REFERENCES projects(id) ON DELETE CASCADE,
  environment_id  UUID REFERENCES environments(id),
  triggered_by    UUID REFERENCES users(id),
  trigger_type    VARCHAR(50),   -- MANUAL | CICD | SCHEDULED
  status          VARCHAR(50) DEFAULT 'QUEUED',
  runner_type     VARCHAR(50),   -- UI | API | PERFORMANCE | OTHER
  total_tests     INT DEFAULT 0,
  passed          INT DEFAULT 0,
  failed          INT DEFAULT 0,
  skipped         INT DEFAULT 0,
  duration_ms     BIGINT,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE execution_results (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id        UUID REFERENCES execution_runs(id) ON DELETE CASCADE,
  script_id     UUID REFERENCES scripts(id),
  test_case_id  UUID REFERENCES test_cases(id),
  status        VARCHAR(50),   -- PASS | FAIL | FLAKY | SKIPPED
  duration_ms   BIGINT,
  error_message TEXT,
  stack_trace   TEXT,
  artifacts     JSONB DEFAULT '[]',   -- screenshots, videos, logs
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE cicd_integrations (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id    UUID REFERENCES projects(id) ON DELETE CASCADE,
  provider      VARCHAR(50) NOT NULL,   -- AZURE_DEVOPS | JENKINS
  config        JSONB DEFAULT '{}',
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- LAYER 5: Analysis, Triage, Self-Healing
-- ============================================================

CREATE TABLE failure_clusters (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id    UUID REFERENCES projects(id) ON DELETE CASCADE,
  name          VARCHAR(255),
  hypothesis    VARCHAR(100),   -- DEFECT | TEST_BRITTLENESS | ENVIRONMENT
  pattern       TEXT,
  result_ids    JSONB DEFAULT '[]',
  confidence    DECIMAL(3,2),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE healing_proposals (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id        UUID REFERENCES projects(id) ON DELETE CASCADE,
  script_id         UUID REFERENCES scripts(id) ON DELETE CASCADE,
  broken_locator    TEXT NOT NULL,
  proposed_locator  TEXT NOT NULL,
  confidence        DECIMAL(3,2),
  reason            TEXT,
  status            VARCHAR(50) DEFAULT 'PENDING_REVIEW',
  approved_by       UUID REFERENCES users(id),
  approved_at       TIMESTAMPTZ,
  rejected_by       UUID REFERENCES users(id),
  reject_reason     TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE coverage_analytics (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id                UUID REFERENCES projects(id) ON DELETE CASCADE,
  snapshot_date             DATE DEFAULT CURRENT_DATE,
  requirement_coverage_pct  DECIMAL(5,2),
  risk_coverage_pct         DECIMAL(5,2),
  code_impact_coverage_pct  DECIMAL(5,2),
  gap_list                  JSONB DEFAULT '[]',
  created_at                TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- LAYER 6: Governance & Human-in-the-Loop
-- ============================================================

CREATE TABLE review_gates (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id    UUID REFERENCES projects(id) ON DELETE CASCADE,
  type          VARCHAR(100) NOT NULL,   -- TEST_CASE_APPROVAL | HEALING_PROPOSAL | SCRIPT_CHANGE | COVERAGE_SIGN_OFF
  reference_id  UUID NOT NULL,
  title         VARCHAR(500) NOT NULL,
  description   TEXT,
  priority      VARCHAR(50) DEFAULT 'MEDIUM',
  status        VARCHAR(50) DEFAULT 'PENDING',  -- PENDING | APPROVED | REJECTED
  assigned_to   UUID REFERENCES users(id),
  reviewed_by   UUID REFERENCES users(id),
  comments      TEXT,
  reject_reason TEXT,
  reviewed_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE versions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id    UUID REFERENCES projects(id) ON DELETE CASCADE,
  entity_type   VARCHAR(100),   -- APP_MODEL | TEST_CASE | SCRIPT
  entity_id     UUID NOT NULL,
  version       INT NOT NULL,
  snapshot      JSONB NOT NULL,
  created_by    UUID REFERENCES users(id),
  release_tag   VARCHAR(100),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE audit_logs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      UUID REFERENCES organizations(id),
  project_id  UUID REFERENCES projects(id),
  user_id     UUID REFERENCES users(id),
  action      VARCHAR(255) NOT NULL,
  entity_type VARCHAR(100),
  entity_id   UUID,
  old_value   JSONB,
  new_value   JSONB,
  ip_address  INET,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDEXES for performance
-- ============================================================
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_org ON users(org_id);
CREATE INDEX idx_projects_org ON projects(org_id);
CREATE INDEX idx_test_cases_project ON test_cases(project_id);
CREATE INDEX idx_test_cases_status ON test_cases(project_id, status);
CREATE INDEX idx_scripts_test_case ON scripts(test_case_id);
CREATE INDEX idx_trace_links_source ON trace_links(source_type, source_id);
CREATE INDEX idx_trace_links_target ON trace_links(target_type, target_id);
CREATE INDEX idx_execution_results_run ON execution_results(run_id);
CREATE INDEX idx_review_gates_status ON review_gates(project_id, status);
CREATE INDEX idx_audit_logs_org ON audit_logs(org_id, created_at DESC);
CREATE INDEX idx_requirements_project ON requirements(project_id);
CREATE INDEX idx_healing_proposals_status ON healing_proposals(project_id, status);
