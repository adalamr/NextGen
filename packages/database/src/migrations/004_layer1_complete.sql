-- ============================================================
-- Migration 004: Layer 1 — Complete
--
-- Adds:
--   1. project_requirement_sequences  — per-project atomic counter
--   2. next_requirement_seq()         — PL/pgSQL function (Option C)
--   3. traceability_defect_links      — spec-defined defect link table
--   4. knowledge_feedback columns     — clarity / correctness / coverage
--   5. test_cases columns             — gold_standard_candidate flag
-- ============================================================

-- ── 1. Per-project requirement sequence ──────────────────────────────
CREATE TABLE IF NOT EXISTS project_requirement_sequences (
  project_id  UUID PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  next_val    INT NOT NULL DEFAULT 1
);

-- ── 2. Atomic sequence function ──────────────────────────────────────
-- Returns the CURRENT next_val, then increments it.
-- Uses INSERT … ON CONFLICT so the first call for a project
-- auto-initialises the row.
CREATE OR REPLACE FUNCTION next_requirement_seq(p_project_id UUID)
RETURNS INT AS $$
DECLARE
  v_seq INT;
BEGIN
  INSERT INTO project_requirement_sequences (project_id, next_val)
  VALUES (p_project_id, 2)
  ON CONFLICT (project_id) DO UPDATE
    SET next_val = project_requirement_sequences.next_val + 1
  RETURNING next_val - 1 INTO v_seq;
  RETURN v_seq;
END;
$$ LANGUAGE plpgsql;

-- ── 3. Traceability defect links ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS traceability_defect_links (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id      UUID NOT NULL REFERENCES projects(id)      ON DELETE CASCADE,
  requirement_id  UUID NOT NULL REFERENCES requirements(id)  ON DELETE CASCADE,
  defect_id       VARCHAR(100) NOT NULL,    -- e.g. DEF-IVA-001 (external ID string)
  linked_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (requirement_id, defect_id)
);

CREATE INDEX IF NOT EXISTS idx_defect_links_project
  ON traceability_defect_links (project_id);
CREATE INDEX IF NOT EXISTS idx_defect_links_req
  ON traceability_defect_links (requirement_id);

-- ── 4. knowledge_feedback — 3-dimension scores ───────────────────────
ALTER TABLE knowledge_feedback
  ADD COLUMN IF NOT EXISTS clarity      SMALLINT CHECK (clarity     BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS correctness  SMALLINT CHECK (correctness BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS coverage_score SMALLINT CHECK (coverage_score BETWEEN 1 AND 5);

-- ── 5. test_cases — gold standard candidate flag ──────────────────────
ALTER TABLE test_cases
  ADD COLUMN IF NOT EXISTS gold_standard_candidate     BOOLEAN     DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS gold_standard_candidate_at  TIMESTAMPTZ;

-- Supporting index — review queue: "show all candidates for project X"
CREATE INDEX IF NOT EXISTS idx_test_cases_gs_candidate
  ON test_cases (project_id, gold_standard_candidate)
  WHERE gold_standard_candidate = TRUE;
