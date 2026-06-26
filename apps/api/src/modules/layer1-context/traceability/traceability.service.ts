import { getPool } from '../../../config/database.config';
import { ApiError } from '../../../utils/api-error';
import { childLogger } from '../../../utils/logger';

const log = childLogger('layer1:traceability');

/**
 * Layer 1 - Traceability Service
 *
 * pg-mem compatibility notes:
 *   - 4+ LEFT JOINs with COUNT(DISTINCT) in one GROUP BY crashes pg-mem.
 *     Defect data is fetched in a separate query and merged in JS.
 *   - Correlated subqueries referencing outer table aliases are unsupported.
 *   - GROUP BY must include ALL non-aggregate selected columns explicitly.
 */
export class TraceabilityService {

  private readonly REQUIRED_TECHNIQUES: Record<string, number> = {
    CRITICAL: 3,
    HIGH: 2,
    MEDIUM: 1,
    LOW: 1,
  };

  async getMatrix(projectId: string) {
    log.info('getMatrix', { projectId });
    const pool = getPool();

    const rows = await pool.query(
      `SELECT
         r.id, r.external_id, r.title, r.description, r.priority, r.status, r.created_at,
         COUNT(DISTINCT tl.target_id)   AS test_case_count,
         COUNT(DISTINCT tc.technique)   AS technique_count,
         COALESCE(
           json_agg(DISTINCT tc.technique) FILTER (WHERE tc.technique IS NOT NULL),
           '[]'
         ) AS techniques
       FROM requirements r
       LEFT JOIN trace_links tl
         ON tl.source_id = r.id::text AND tl.source_type = 'REQUIREMENT' AND tl.target_type = 'TEST_CASE'
       LEFT JOIN test_cases tc ON tc.id::text = tl.target_id
       WHERE r.project_id = $1
       GROUP BY r.id, r.external_id, r.title, r.description, r.priority, r.status, r.created_at
       ORDER BY r.priority DESC, r.created_at`,
      [projectId],
    );

    const defects = await pool.query(
      `SELECT requirement_id, COUNT(*) AS defect_count, json_agg(defect_id) AS defect_ids
       FROM traceability_defect_links WHERE project_id = $1 GROUP BY requirement_id`,
      [projectId],
    );
    const defectMap = new Map<string, { defect_count: number; defect_ids: string[] }>();
    for (const d of defects.rows) {
      defectMap.set(d.requirement_id, {
        defect_count: parseInt(d.defect_count, 10),
        defect_ids: Array.isArray(d.defect_ids) ? d.defect_ids : [],
      });
    }

    const requirements = rows.rows.map((r: any) => {
      const d = defectMap.get(r.id) ?? { defect_count: 0, defect_ids: [] };
      return this.mapMatrixRow({ ...r, ...d });
    });

    return { projectId, requirements, summary: this.buildSummary(requirements) };
  }

  async getRequirementRow(reqId: string, projectId: string) {
    log.info('getRequirementRow', { reqId, projectId });
    const pool = getPool();

    const row = await pool.query(
      `SELECT
         r.id, r.external_id, r.title, r.description, r.priority, r.status, r.created_at,
         COUNT(DISTINCT tl.target_id) AS test_case_count,
         COUNT(DISTINCT tc.technique) AS technique_count,
         COALESCE(
           json_agg(DISTINCT tc.technique) FILTER (WHERE tc.technique IS NOT NULL),
           '[]'
         ) AS techniques
       FROM requirements r
       LEFT JOIN trace_links tl
         ON tl.source_id = r.id::text AND tl.source_type = 'REQUIREMENT' AND tl.target_type = 'TEST_CASE'
       LEFT JOIN test_cases tc ON tc.id::text = tl.target_id
       WHERE r.project_id = $1 AND (r.id::text = $2 OR r.external_id = $2)
       GROUP BY r.id, r.external_id, r.title, r.description, r.priority, r.status, r.created_at`,
      [projectId, reqId],
    );

    if (!row.rows.length) {
      log.warn('getRequirementRow: not found', { reqId, projectId });
      throw new ApiError(404, 'Requirement not found');
    }

    const requirementId = row.rows[0].id as string;

    const tcRows = await pool.query(
      `SELECT tc.id, tc.title, tc.technique, tc.priority
       FROM test_cases tc
       JOIN trace_links tl
         ON tl.target_id = tc.id::text AND tl.source_type = 'REQUIREMENT' AND tl.target_type = 'TEST_CASE'
       WHERE tl.source_id = $1`,
      [requirementId],
    );

    const dlRows = await pool.query(
      `SELECT defect_id FROM traceability_defect_links WHERE requirement_id = $1`,
      [requirementId],
    );
    const defect_ids = dlRows.rows.map((d: any) => d.defect_id);

    return this.mapMatrixRow({
      ...row.rows[0],
      defect_count: dlRows.rows.length,
      defect_ids,
      test_cases: tcRows.rows,
    });
  }

  async getCoverageAggregate(projectId: string) {
    log.info('getCoverageAggregate', { projectId });
    const pool = getPool();

    const rows = await pool.query(
      `SELECT r.id, r.priority, COUNT(DISTINCT tc.technique) AS technique_count
       FROM requirements r
       LEFT JOIN trace_links tl
         ON tl.source_id = r.id::text AND tl.source_type = 'REQUIREMENT' AND tl.target_type = 'TEST_CASE'
       LEFT JOIN test_cases tc ON tc.id::text = tl.target_id
       WHERE r.project_id = $1
       GROUP BY r.id, r.priority`,
      [projectId],
    );

    const total = rows.rows.length;
    let covered = 0, partial = 0, notCovered = 0, totalPct = 0;

    for (const r of rows.rows) {
      const pct = this.calcCoveragePct(parseInt(r.technique_count, 10), r.priority as string);
      totalPct += pct;
      if (pct === 100) covered++;
      else if (pct > 0) partial++;
      else notCovered++;
    }

    return {
      projectId,
      totalRequirements: total,
      covered,
      partial,
      notCovered,
      overallCoveragePct: total > 0 ? Math.round(totalPct / total) : 0,
    };
  }

  async linkTestCases(reqId: string, projectId: string, testCaseIds: string[]) {
    log.info('linkTestCases', { reqId, projectId, count: testCaseIds.length });
    if (!testCaseIds.length) throw new ApiError(400, 'testCaseIds must not be empty');

    const pool = getPool();

    const reqRow = await pool.query(
      `SELECT id FROM requirements WHERE project_id = $1 AND (id::text = $2 OR external_id = $2)`,
      [projectId, reqId],
    );
    if (!reqRow.rows.length) {
      log.warn('linkTestCases: requirement not found', { reqId, projectId });
      throw new ApiError(404, 'Requirement not found');
    }
    const requirementId = reqRow.rows[0].id as string;

    const linked: string[] = [];
    for (const tcId of testCaseIds) {
      const tcRow = await pool.query(
        'SELECT id FROM test_cases WHERE id = $1 AND project_id = $2',
        [tcId, projectId],
      );
      if (!tcRow.rows.length) continue;

      await pool.query(
        `INSERT INTO trace_links (project_id, source_type, source_id, target_type, target_id, relationship)
         VALUES ($1, 'REQUIREMENT', $2, 'TEST_CASE', $3, 'COVERS')
         ON CONFLICT (source_type, source_id, target_type, target_id) DO NOTHING`,
        [projectId, requirementId, tcId],
      );
      linked.push(tcId);
    }

    log.info('linkTestCases: linked', { requirementId, linked: linked.length, skipped: testCaseIds.length - linked.length });
    return { requirementId, linked, count: linked.length };
  }

  async linkDefect(reqId: string, projectId: string, defectId: string, linkedBy: string) {
    log.info('linkDefect', { reqId, projectId, defectId, linkedBy });
    if (!defectId?.trim()) throw new ApiError(400, 'defectId is required');

    const pool = getPool();

    const reqRow = await pool.query(
      `SELECT id FROM requirements WHERE project_id = $1 AND (id::text = $2 OR external_id = $2)`,
      [projectId, reqId],
    );
    if (!reqRow.rows.length) {
      log.warn('linkDefect: requirement not found', { reqId, projectId });
      throw new ApiError(404, 'Requirement not found');
    }
    const requirementId = reqRow.rows[0].id as string;

    // Check for existing link first (pg-mem does not reliably enforce UNIQUE on ON CONFLICT)
    const existingDl = await pool.query(
      `SELECT * FROM traceability_defect_links WHERE requirement_id = $1 AND defect_id = $2`,
      [requirementId, defectId.trim()],
    );
    if (existingDl.rows.length) {
      log.warn('linkDefect: already linked (conflict)', { requirementId, defectId, projectId });
      return { ...existingDl.rows[0], alreadyLinked: true };
    }

    const result = await pool.query(
      `INSERT INTO traceability_defect_links (project_id, requirement_id, defect_id, linked_by)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [projectId, requirementId, defectId.trim(), linkedBy],
    );

    log.info('linkDefect: linked', { requirementId, defectId, projectId });
    return { ...result.rows[0], alreadyLinked: false };
  }

  async createLink(dto: {
    projectId: string;
    sourceType: string;
    sourceId: string;
    targetType: string;
    targetId: string;
    relationship: string;
  }) {
    const pool = getPool();
    // Check for existing link first (pg-mem does not reliably enforce UNIQUE on ON CONFLICT)
    const existing = await pool.query(
      `SELECT id FROM trace_links
        WHERE source_type = $1 AND source_id = $2 AND target_type = $3 AND target_id = $4`,
      [dto.sourceType, dto.sourceId, dto.targetType, dto.targetId],
    );
    if (existing.rows.length) return undefined;

    const result = await pool.query(
      `INSERT INTO trace_links (project_id, source_type, source_id, target_type, target_id, relationship)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [dto.projectId, dto.sourceType, dto.sourceId, dto.targetType, dto.targetId, dto.relationship],
    );
    return result.rows[0];
  }

  private calcCoveragePct(actualTechniques: number, priority: string): number {
    const required = this.REQUIRED_TECHNIQUES[priority?.toUpperCase()] ?? 1;
    return Math.min(100, Math.round((actualTechniques / required) * 100));
  }

  private mapMatrixRow(r: any) {
    const actualTechniques = parseInt(r.technique_count, 10);
    const coveragePct      = this.calcCoveragePct(actualTechniques, r.priority);

    let coverageStatus: 'COVERED' | 'PARTIAL' | 'NOT_COVERED';
    if (coveragePct === 100)   coverageStatus = 'COVERED';
    else if (coveragePct > 0) coverageStatus = 'PARTIAL';
    else                      coverageStatus = 'NOT_COVERED';

    return {
      id:             r.id,
      externalId:     r.external_id,
      title:          r.title,
      description:    r.description,
      priority:       r.priority,
      status:         r.status,
      testCaseCount:  parseInt(r.test_case_count,  10),
      techniqueCount: actualTechniques,
      techniques:     Array.isArray(r.techniques) ? r.techniques.filter(Boolean) : [],
      testCases:      Array.isArray(r.test_cases)  ? r.test_cases.filter(Boolean)  : undefined,
      defectCount:    parseInt(r.defect_count,     10),
      defectIds:      Array.isArray(r.defect_ids)  ? r.defect_ids.filter(Boolean)  : [],
      coveragePct,
      coverageStatus,
    };
  }

  private buildSummary(rows: ReturnType<TraceabilityService['mapMatrixRow']>[]) {
    const total   = rows.length;
    const covered = rows.filter((r) => r.coverageStatus === 'COVERED').length;
    const partial = rows.filter((r) => r.coverageStatus === 'PARTIAL').length;
    const gaps    = rows.filter((r) => r.coverageStatus === 'NOT_COVERED').map((r) => r.externalId || r.title);
    const overall = total > 0
      ? Math.round(rows.reduce((sum, r) => sum + r.coveragePct, 0) / total)
      : 0;

    return { total, covered, partial, notCovered: total - covered - partial, overallCoveragePct: overall, gaps };
  }
}

