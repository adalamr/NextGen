-- ============================================================
-- Migration 004: Knowledge Base — Structured / Graph Store
--
-- Adds the three Structured Store tables from the Layer 1 spec
-- (Sub-Component 3.3, Store B):
--
--   kb_defects               – past defects with affected components
--   kb_incidents             – historical production incidents
--   kb_requirement_relations – requirement linkage graph
--
-- Also adds missing app_model_business_rules table (Sub-Component 3.2).
-- ============================================================

-- ── Store B: Defects ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS kb_defects (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id           UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  defect_id            VARCHAR(100) NOT NULL,          -- e.g. DEF-IVA-001
  title                VARCHAR(500) NOT NULL,
  description          TEXT,
  severity             VARCHAR(20),                    -- critical | high | medium | low
  affected_components  TEXT[],                         -- ['DocumentExportService', ...]
  related_requirements TEXT[],                         -- ['REQ-IVA-EXPORT', ...]
  discovered_at        TIMESTAMPTZ,
  status               VARCHAR(20) DEFAULT 'open',     -- open | fixed | wontfix
  metadata             JSONB DEFAULT '{}',
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (project_id, defect_id)
);

CREATE INDEX IF NOT EXISTS idx_kb_defects_project
  ON kb_defects (project_id);
CREATE INDEX IF NOT EXISTS idx_kb_defects_severity
  ON kb_defects (project_id, severity);
CREATE INDEX IF NOT EXISTS idx_kb_defects_status
  ON kb_defects (project_id, status);

-- ── Store B: Incidents ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS kb_incidents (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id           UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  incident_id          VARCHAR(100) NOT NULL,          -- e.g. INC-IVA-001
  title                VARCHAR(500) NOT NULL,
  description          TEXT,
  impact               VARCHAR(20),                    -- critical | high | medium | low
  affected_components  TEXT[],
  occurred_at          TIMESTAMPTZ,
  resolved_at          TIMESTAMPTZ,
  root_cause           TEXT,
  metadata             JSONB DEFAULT '{}',
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (project_id, incident_id)
);

CREATE INDEX IF NOT EXISTS idx_kb_incidents_project
  ON kb_incidents (project_id);
CREATE INDEX IF NOT EXISTS idx_kb_incidents_impact
  ON kb_incidents (project_id, impact);

-- ── Store B: Related Requirements (relationship graph) ────────────────
CREATE TABLE IF NOT EXISTS kb_requirement_relations (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id       UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  from_requirement VARCHAR(100) NOT NULL,
  to_requirement   VARCHAR(100) NOT NULL,
  relation_type    VARCHAR(50),                        -- related | depends_on | blocks | duplicates
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (project_id, from_requirement, to_requirement, relation_type)
);

CREATE INDEX IF NOT EXISTS idx_kb_req_relations_project
  ON kb_requirement_relations (project_id);
CREATE INDEX IF NOT EXISTS idx_kb_req_relations_from
  ON kb_requirement_relations (project_id, from_requirement);

-- ── App Model: Business Rules ─────────────────────────────────────────
-- Sub-Component 3.2 — cross-cutting business rules used in LLM prompts.
CREATE TABLE IF NOT EXISTS app_model_business_rules (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id       UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  rule_text        TEXT NOT NULL,
  category         VARCHAR(100),                       -- routing | validation | authorization | workflow | integration
  related_entities TEXT[],                             -- e.g. ['Document', 'PurchaseOrder']
  is_active        BOOLEAN DEFAULT TRUE,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_model_business_rules_project
  ON app_model_business_rules (project_id);
CREATE INDEX IF NOT EXISTS idx_app_model_business_rules_category
  ON app_model_business_rules (project_id, category);
