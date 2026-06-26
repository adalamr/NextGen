-- ============================================================
-- Migration 002: Layer 1 – Context & Knowledge additions
-- Adds: sample_io_pairs, input_templates, output_templates,
--       knowledge_feedback, file_uploads, parsed_documents
-- ============================================================

-- ── 1A. Input Template ────────────────────────────────────────────────
-- Fixed JSON Schema that defines how requirements must be structured.
-- Org-level (shared across all projects in an org).
CREATE TABLE input_templates (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id       UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name         VARCHAR(255) NOT NULL,
  description  TEXT,
  schema       JSONB NOT NULL DEFAULT '{}',   -- JSON Schema definition
  is_active    BOOLEAN DEFAULT TRUE,
  created_by   UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, name)
);

-- ── 1B. Output Template ───────────────────────────────────────────────
-- Defines the mandatory structure for test case output.
-- Org-level (used to instruct LLM and validate responses).
CREATE TABLE output_templates (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id       UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name         VARCHAR(255) NOT NULL,
  description  TEXT,
  schema       JSONB NOT NULL DEFAULT '{}',   -- JSON Schema for test case output
  example      JSONB DEFAULT '{}',            -- Example test case matching this schema
  is_active    BOOLEAN DEFAULT TRUE,
  created_by   UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, name)
);

-- ── 1D. Sample I/O Pairs (Few-Shot Examples) ─────────────────────────
-- Org-level curated examples used as few-shot learning references in LLM prompts.
-- Categories: FINANCIAL, CRUD_API, AUTHENTICATION, FILE_PROCESSING,
--             WORKFLOW, STATE_TRANSITION, OTHER
CREATE TABLE sample_io_pairs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID REFERENCES organizations(id) ON DELETE CASCADE,
  title           VARCHAR(255) NOT NULL,
  description     TEXT,
  category        VARCHAR(100) NOT NULL DEFAULT 'OTHER',
  input_example   JSONB NOT NULL DEFAULT '{}',   -- the requirement / input
  output_example  JSONB NOT NULL DEFAULT '{}',   -- the ideal test case / output
  tags            JSONB DEFAULT '[]',
  is_active       BOOLEAN DEFAULT TRUE,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── 1E. App Model — Requirements Parsed from Sources ─────────────────
-- Already have app_model_api_contracts, app_model_pages, app_model_schema_graph
-- Adding parsed documents table to track extraction results
CREATE TABLE parsed_documents (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id     UUID REFERENCES projects(id) ON DELETE CASCADE,
  connector_id   UUID REFERENCES connectors(id) ON DELETE SET NULL,
  source_type    VARCHAR(100) NOT NULL,   -- FILE_UPLOAD | TEXT_INPUT | CSV_IMPORT
  file_name      VARCHAR(500),
  file_path      VARCHAR(1000),           -- local or S3 path
  mime_type      VARCHAR(100),
  raw_content    TEXT,                    -- extracted raw text
  parsed_content JSONB DEFAULT '{}',      -- structured extracted data
  status         VARCHAR(50) DEFAULT 'PENDING',  -- PENDING | PROCESSING | DONE | FAILED
  error_message  TEXT,
  page_count     INT DEFAULT 0,
  word_count     INT DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ── 1E. App Model — User Roles & Permissions (structured) ─────────────
CREATE TABLE app_model_user_roles (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id   UUID REFERENCES projects(id) ON DELETE CASCADE,
  role_name    VARCHAR(255) NOT NULL,
  permissions  JSONB DEFAULT '[]',        -- list of permission strings
  description  TEXT,
  version      VARCHAR(50),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── 1F. Knowledge Base — Human Feedback ──────────────────────────────
-- Users can rate generated test cases and mark them as gold standard.
-- match_percentage = how well this test case matches what the user expected.
ALTER TABLE test_cases
  ADD COLUMN IF NOT EXISTS is_gold_standard     BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS gold_standard_by     UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS gold_standard_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS match_percentage     DECIMAL(5,2),   -- 0-100 user-rated score
  ADD COLUMN IF NOT EXISTS feedback_notes       TEXT;

-- Feedback table for rich audit trail
CREATE TABLE knowledge_feedback (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id           UUID REFERENCES organizations(id) ON DELETE CASCADE,
  project_id       UUID REFERENCES projects(id) ON DELETE CASCADE,
  test_case_id     UUID REFERENCES test_cases(id) ON DELETE CASCADE,
  user_id          UUID REFERENCES users(id) ON DELETE SET NULL,
  match_percentage DECIMAL(5,2) NOT NULL,   -- 0-100 rated by user
  is_gold_standard BOOLEAN DEFAULT FALSE,
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────────────────
CREATE INDEX idx_input_templates_org    ON input_templates(org_id);
CREATE INDEX idx_output_templates_org   ON output_templates(org_id);
CREATE INDEX idx_sample_io_pairs_org    ON sample_io_pairs(org_id);
CREATE INDEX idx_sample_io_pairs_cat    ON sample_io_pairs(org_id, category);
CREATE INDEX idx_parsed_documents_proj  ON parsed_documents(project_id);
CREATE INDEX idx_parsed_documents_status ON parsed_documents(project_id, status);
CREATE INDEX idx_knowledge_feedback_proj ON knowledge_feedback(project_id);
CREATE INDEX idx_knowledge_feedback_tc   ON knowledge_feedback(test_case_id);
CREATE INDEX idx_test_cases_gold        ON test_cases(project_id, is_gold_standard) WHERE is_gold_standard = TRUE;
CREATE INDEX idx_app_model_roles_proj   ON app_model_user_roles(project_id);
