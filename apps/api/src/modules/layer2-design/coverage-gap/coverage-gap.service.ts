import { getPool } from '../../../config/database.config';
import { LLMGateway } from '@platform/llm-gateway';

/**
 * Layer 2 — Coverage Gap Service
 *
 * Identifies which requirements lack test coverage and, optionally,
 * uses the LLM to suggest what test cases should be created to fill gaps.
 */
export class CoverageGapService {

  // ── LIST GAPS ─────────────────────────────────────────────────────────
  async listGaps(projectId: string) {
    const pool = getPool();

    // Requirements with zero approved/draft test case links
    const result = await pool.query(
      `SELECT
         r.id,
         r.title,
         r.description,
         r.priority,
         r.status,
         COUNT(DISTINCT tl.target_id) AS test_case_count,
         COALESCE(ra.risk_level, 'UNKNOWN') AS risk_level,
         COALESCE(ra.risk_score, 0)          AS risk_score
       FROM requirements r
       LEFT JOIN trace_links tl
         ON tl.source_id    = r.id::TEXT
        AND tl.source_type  = 'REQUIREMENT'
        AND tl.target_type  = 'TEST_CASE'
       LEFT JOIN risk_assessments ra
         ON ra.requirement_id = r.id
        AND ra.project_id     = r.project_id
       WHERE r.project_id = $1
         AND r.status      = 'ACTIVE'
       GROUP BY r.id, r.title, r.description, r.priority, r.status,
                ra.risk_level, ra.risk_score
       ORDER BY risk_score DESC NULLS LAST, test_case_count ASC`,
      [projectId],
    );

    const all = result.rows;
    const gaps = all.filter((r: any) => parseInt(r.test_case_count, 10) === 0);
    const partial = all.filter((r: any) => parseInt(r.test_case_count, 10) > 0 && parseInt(r.test_case_count, 10) < 2);
    const covered = all.filter((r: any) => parseInt(r.test_case_count, 10) >= 2);

    return {
      summary: {
        total:              all.length,
        notCovered:         gaps.length,
        partiallyCovered:   partial.length,
        fullyCovered:       covered.length,
        coveragePercentage: all.length > 0 ? Math.round((covered.length / all.length) * 100) : 0,
      },
      gaps:    gaps.map(this.mapGap),
      partial: partial.map(this.mapGap),
      covered: covered.map(this.mapGap),
    };
  }

  // ── SUGGEST TEST CASES FOR GAPS (LLM-powered) ─────────────────────────
  async suggestForGaps(
    projectId: string,
    llmConfig: { apiEndpoint: string; apiKey: string; modelName: string; region?: string },
    maxGaps = 5,
  ) {
    const gaps = await this.listGaps(projectId);
    const topGaps = gaps.gaps.slice(0, maxGaps);

    if (!topGaps.length) {
      return { suggestions: [], message: 'No uncovered requirements found.' };
    }

    const gateway = new LLMGateway(llmConfig);

    const systemPrompt = `You are a QA engineer. For each uncovered requirement below, suggest
2–3 test case titles and their primary test design technique.
Return JSON: { "suggestions": [{ "requirementId": string, "requirementTitle": string, "testCaseSuggestions": [{ "title": string, "technique": string, "priority": "HIGH"|"MEDIUM"|"LOW" }] }] }
Return ONLY valid JSON.`;

    const userPrompt = `Uncovered requirements:\n${topGaps
      .map((g) => `- ID: ${g.id} | Title: ${g.title} | Risk: ${g.riskLevel}`)
      .join('\n')}`;

    const result = await gateway.completeJSON<{
      suggestions: Array<{
        requirementId: string;
        requirementTitle: string;
        testCaseSuggestions: Array<{ title: string; technique: string; priority: string }>;
      }>;
    }>({ systemPrompt, userPrompt, config: llmConfig });

    return result;
  }

  // ── MAPPER ────────────────────────────────────────────────────────────
  private mapGap(row: any) {
    return {
      id:            row.id,
      title:         row.title,
      description:   row.description,
      priority:      row.priority,
      status:        row.status,
      testCaseCount: parseInt(row.test_case_count, 10),
      riskLevel:     row.risk_level,
      riskScore:     parseFloat(row.risk_score),
    };
  }
}
