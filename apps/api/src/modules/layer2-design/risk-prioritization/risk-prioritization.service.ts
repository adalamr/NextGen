import { getPool } from '../../../config/database.config';
import { ApiError } from '../../../utils/api-error';
import { LLMGateway } from '@platform/llm-gateway';

/**
 * Layer 2 — Risk Prioritization Service
 *
 * Scores requirements by likelihood × impact and orders test coverage
 * so the highest-risk areas are tested first.
 */
export class RiskPrioritizationService {

  // ── LIST ASSESSMENTS ──────────────────────────────────────────────────
  async listAssessments(projectId: string, filters: { riskLevel?: string } = {}) {
    const pool = getPool();
    const conditions = ['ra.project_id = $1'];
    const params: unknown[] = [projectId];

    if (filters.riskLevel) {
      params.push(filters.riskLevel.toUpperCase());
      conditions.push(`ra.risk_level = $${params.length}`);
    }

    const result = await pool.query(
      `SELECT ra.*, r.title AS requirement_title, r.priority AS requirement_priority
       FROM risk_assessments ra
       LEFT JOIN requirements r ON r.id = ra.requirement_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY ra.risk_score DESC`,
      params,
    );
    return result.rows.map(this.mapAssessment);
  }

  // ── GET SINGLE ASSESSMENT ─────────────────────────────────────────────
  async getAssessment(id: string) {
    const pool = getPool();
    const result = await pool.query(
      `SELECT ra.*, r.title AS requirement_title
       FROM risk_assessments ra
       LEFT JOIN requirements r ON r.id = ra.requirement_id
       WHERE ra.id = $1`,
      [id],
    );
    if (!result.rows.length) throw new ApiError(404, 'Risk assessment not found');
    return this.mapAssessment(result.rows[0]);
  }

  // ── ASSESS REQUIREMENT RISK (LLM-powered) ─────────────────────────────
  async assessRisk(
    projectId: string,
    requirementId: string,
    requirementText: string,
    llmConfig: { apiEndpoint: string; apiKey: string; modelName: string; region?: string },
  ) {
    const pool = getPool();
    const gateway = new LLMGateway(llmConfig);

    const systemPrompt = `You are a senior QA risk analyst.
Assess the risk of the provided requirement and return:
{
  "likelihood": number (0.0–1.0),
  "impact": number (0.0–1.0),
  "riskLevel": "HIGH" | "MEDIUM" | "LOW",
  "factors": { "complexity": string, "businessCriticality": string, "technicalDebt": string, "externalDependencies": string }
}
Return ONLY valid JSON.`;

    const userPrompt = `Requirement:\n${requirementText}`;

    const llmResult = await gateway.completeJSON<{
      likelihood: number;
      impact: number;
      riskLevel: 'HIGH' | 'MEDIUM' | 'LOW';
      factors: Record<string, string>;
    }>({ systemPrompt, userPrompt, config: llmConfig });

    // Upsert: one assessment per requirement per project
    const result = await pool.query(
      `INSERT INTO risk_assessments
         (project_id, requirement_id, likelihood, impact, risk_level, factors)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (project_id, requirement_id)
       DO UPDATE SET
         likelihood = EXCLUDED.likelihood,
         impact     = EXCLUDED.impact,
         risk_level = EXCLUDED.risk_level,
         factors    = EXCLUDED.factors
       RETURNING *`,
      [
        projectId,
        requirementId,
        llmResult.likelihood,
        llmResult.impact,
        llmResult.riskLevel,
        JSON.stringify(llmResult.factors),
      ],
    );

    return this.mapAssessment(result.rows[0]);
  }

  // ── BATCH ASSESS ALL REQUIREMENTS ────────────────────────────────────
  async batchAssess(
    projectId: string,
    llmConfig: { apiEndpoint: string; apiKey: string; modelName: string; region?: string },
  ) {
    const pool = getPool();
    const requirements = await pool.query(
      'SELECT id, title, description FROM requirements WHERE project_id = $1 AND status = $2',
      [projectId, 'ACTIVE'],
    );

    const results = [];
    for (const req of requirements.rows) {
      try {
        const text = `${req.title}\n${req.description || ''}`.trim();
        const assessment = await this.assessRisk(projectId, req.id, text, llmConfig);
        results.push(assessment);
      } catch {
        // Continue on per-requirement failure
      }
    }

    return { assessed: results.length, total: requirements.rows.length, results };
  }

  // ── RISK SUMMARY ──────────────────────────────────────────────────────
  async getSummary(projectId: string) {
    const pool = getPool();
    const result = await pool.query(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE risk_level = 'HIGH')   AS high,
         COUNT(*) FILTER (WHERE risk_level = 'MEDIUM') AS medium,
         COUNT(*) FILTER (WHERE risk_level = 'LOW')    AS low,
         AVG(risk_score)::NUMERIC(4,3)                 AS avg_risk_score
       FROM risk_assessments
       WHERE project_id = $1`,
      [projectId],
    );
    const row = result.rows[0];
    return {
      total:        parseInt(row.total, 10),
      high:         parseInt(row.high, 10),
      medium:       parseInt(row.medium, 10),
      low:          parseInt(row.low, 10),
      avgRiskScore: parseFloat(row.avg_risk_score) || 0,
    };
  }

  // ── MAPPER ────────────────────────────────────────────────────────────
  private mapAssessment(row: any) {
    return {
      id:                  row.id,
      projectId:           row.project_id,
      requirementId:       row.requirement_id,
      requirementTitle:    row.requirement_title ?? null,
      requirementPriority: row.requirement_priority ?? null,
      likelihood:          parseFloat(row.likelihood),
      impact:              parseFloat(row.impact),
      riskScore:           parseFloat(row.risk_score),
      riskLevel:           row.risk_level,
      factors:             row.factors ?? {},
      createdAt:           row.created_at,
    };
  }
}
