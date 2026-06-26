-- ============================================================
-- Migration 003: Knowledge Base — embedding status tracking
--
-- Adds two columns to knowledge_vectors:
--   embedding_status  VARCHAR(20)  PENDING | embedded | failed
--   embedding_error   TEXT         last error message when status = 'failed'
--
-- Also adds a supporting index so admins can quickly query failed rows.
-- ============================================================

ALTER TABLE knowledge_vectors
  ADD COLUMN IF NOT EXISTS embedding_status  VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS embedding_error   TEXT;

-- Allow fast admin queries: "show me all failed entries for project X"
CREATE INDEX IF NOT EXISTS idx_kv_embedding_status
  ON knowledge_vectors (project_id, embedding_status);

-- Comment the allowed values for clarity
COMMENT ON COLUMN knowledge_vectors.embedding_status IS
  'PENDING = inserted but not yet embedded | embedded = vector stored | failed = all retries exhausted';

-- ============================================================
-- Migration 003b: Risk Assessments — unique constraint
-- Ensures one assessment row per (project, requirement) so
-- the batch-assess upsert works correctly.
-- ============================================================
ALTER TABLE risk_assessments
  ADD COLUMN IF NOT EXISTS requirement_id UUID REFERENCES requirements(id);

DROP INDEX IF EXISTS idx_risk_assessments_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_risk_assessments_unique
  ON risk_assessments (project_id, requirement_id)
  WHERE requirement_id IS NOT NULL;

-- Also add a supporting index used by the listing query
CREATE INDEX IF NOT EXISTS idx_risk_assessments_level
  ON risk_assessments (project_id, risk_level);
