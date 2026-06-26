import { getPool } from '../../../config/database.config';
import { ApiError } from '../../../utils/api-error';
import { childLogger } from '../../../utils/logger';

const log = childLogger('layer1:feedback');

/**
 * Layer 1 — Feedback Service
 *
 * Captures 3-dimension quality feedback (clarity / correctness / coverage)
 * on generated test cases.
 *
 * Rules:
 *   - Only the user who triggered the generation job may submit feedback
 *   - One-shot: a second submission from the same user on the same test case is rejected
 *   - matchPercentage = ((clarity + correctness + coverage_score) / 15) * 100
 *   - matchPercentage >= 80  → test_cases.gold_standard_candidate = TRUE
 *   - matchPercentage <  50  → strip gold standard if previously approved
 *
 * Dimension scores are stored in knowledge_feedback and surfaced back to the
 * LLM prompt builder so future generations can correct known weaknesses.
 */
export class FeedbackService {

  // ── SUBMIT FEEDBACK ────────────────────────────────────────────────────
  async submitFeedback(
    testCaseId: string,
    projectId: string,
    userId: string,
    dto: {
      clarity: number;       // 1–5
      correctness: number;   // 1–5
      coverage: number;      // 1–5
      notes?: string;
    },
  ) {
    log.info('submitFeedback', { testCaseId, projectId, userId, clarity: dto.clarity, correctness: dto.correctness, coverage: dto.coverage });
    this.validateScores(dto);

    const pool = getPool();

    // ── Guard: test case belongs to this project ─────────────────────────
    const tcRow = await pool.query(
      `SELECT id, project_id, title, technique, priority, created_by
       FROM test_cases WHERE id = $1 AND project_id = $2`,
      [testCaseId, projectId],
    );
    if (!tcRow.rows.length) {
      log.warn('submitFeedback: test case not found', { testCaseId, projectId });
      throw new ApiError(404, 'Test case not found');
    }
    const tc = tcRow.rows[0];

    // ── Guard: only the requester can submit feedback ─────────────────────
    // created_by on test_cases is the user who triggered the generation job
    if (tc.created_by && tc.created_by !== userId) {
      log.warn('submitFeedback: requester mismatch', { testCaseId, userId, owner: tc.created_by });
      throw new ApiError(403, 'Only the user who requested generation can submit feedback on this test case');
    }

    // ── Guard: one-shot — reject duplicate submissions ────────────────────
    const existing = await pool.query(
      'SELECT id FROM knowledge_feedback WHERE test_case_id = $1 AND user_id = $2',
      [testCaseId, userId],
    );
    if (existing.rows.length) {
      log.warn('submitFeedback: duplicate submission rejected', { testCaseId, userId });
      throw new ApiError(409, 'Feedback already submitted for this test case. Updates are not allowed.');
    }

    // ── Calculate composite match percentage ──────────────────────────────
    const matchPercentage = Math.round(
      ((dto.clarity + dto.correctness + dto.coverage) / 15) * 100,
    );

    const isGoldStandardCandidate = matchPercentage >= 80;
    const isLowQuality            = matchPercentage < 50;
    log.info('submitFeedback: scores calculated', { testCaseId, matchPercentage, isGoldStandardCandidate, isLowQuality });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Insert feedback record
      const feedbackResult = await client.query(
        `INSERT INTO knowledge_feedback
           (org_id, project_id, test_case_id, user_id,
            clarity, correctness, coverage_score,
            match_percentage, is_gold_standard, notes)
         VALUES (
           (SELECT org_id FROM projects WHERE id = $1),
           $1, $2, $3,
           $4, $5, $6,
           $7, FALSE, $8
         )
         RETURNING *`,
        [
          projectId, testCaseId, userId,
          dto.clarity, dto.correctness, dto.coverage,
          matchPercentage, dto.notes || null,
        ],
      );

      // 2. Update test_cases with match percentage + candidate flag
      if (isGoldStandardCandidate) {
        await client.query(
          `UPDATE test_cases
           SET match_percentage            = $1,
               gold_standard_candidate     = TRUE,
               is_gold_standard_candidate  = TRUE,
               gold_standard_candidate_at  = NOW(),
               feedback_notes              = COALESCE($2, feedback_notes),
               updated_at                  = NOW()
           WHERE id = $3`,
          [matchPercentage, dto.notes || null, testCaseId],
        );
      } else if (isLowQuality) {
        // Strip gold standard if the test case was previously approved
        await client.query(
          `UPDATE test_cases
           SET match_percentage           = $1,
               is_gold_standard           = FALSE,
               gold_standard_candidate    = FALSE,
               gold_standard_candidate_at = NULL,
               gold_standard_by           = NULL,
               gold_standard_at           = NULL,
               feedback_notes             = COALESCE($2, feedback_notes),
               updated_at                 = NOW()
           WHERE id = $3`,
          [matchPercentage, dto.notes || null, testCaseId],
        );

        // Remove from knowledge_vectors if previously pushed as gold standard
        await client.query(
          `DELETE FROM knowledge_vectors
           WHERE doc_id = $1 AND doc_type = 'gold_standard_test_case'`,
          [testCaseId],
        );
      } else {
        // Just update match percentage
        await client.query(
          `UPDATE test_cases
           SET match_percentage = $1,
               feedback_notes   = COALESCE($2, feedback_notes),
               updated_at       = NOW()
           WHERE id = $3`,
          [matchPercentage, dto.notes || null, testCaseId],
        );
      }

      await client.query('COMMIT');
      log.info('submitFeedback: committed', { testCaseId, projectId, matchPercentage });

      return {
        ...this.mapFeedback(feedbackResult.rows[0]),
        matchPercentage,
        isGoldStandardCandidate,
        isLowQuality,
        message: isGoldStandardCandidate
          ? 'Test case flagged as Gold Standard candidate (≥80%). A reviewer can now approve it.'
          : isLowQuality
            ? 'Low quality score (<50%). Gold standard status revoked if previously set.'
            : 'Feedback recorded.',
      };
    } catch (err) {
      await client.query('ROLLBACK');
      log.error('submitFeedback: rolled back', { testCaseId, projectId, err });
      throw err;
    } finally {
      client.release();
    }
  }

  // ── GET FEEDBACK FOR A TEST CASE ──────────────────────────────────────
  async getFeedback(testCaseId: string, projectId: string) {
    log.info('getFeedback', { testCaseId, projectId });
    const pool = getPool();

    // Verify test case belongs to project
    const tcRow = await pool.query(
      'SELECT id FROM test_cases WHERE id = $1 AND project_id = $2',
      [testCaseId, projectId],
    );
    if (!tcRow.rows.length) {
      log.warn('getFeedback: test case not found', { testCaseId, projectId });
      throw new ApiError(404, 'Test case not found');
    }

    const result = await pool.query(
      `SELECT kf.*,
              u.first_name || ' ' || u.last_name AS submitted_by_name
       FROM knowledge_feedback kf
       LEFT JOIN users u ON u.id = kf.user_id
       WHERE kf.test_case_id = $1
       ORDER BY kf.created_at DESC`,
      [testCaseId],
    );

    return result.rows.map(this.mapFeedback);
  }

  // ── PROMPT CONTEXT ────────────────────────────────────────────────────
  // Returns a structured summary of feedback scores for a project/requirement
  // so the LLM prompt builder can inject weakness signals.
  // Called by the test case generation service before building the prompt.
  async getPromptContext(
    projectId: string,
    requirementId?: string,
  ): Promise<{
    avgClarity: number;
    avgCorrectness: number;
    avgCoverage: number;
    weaknesses: string[];
    promptHint: string;
  }> {
    log.info('getPromptContext', { projectId, requirementId });
    const pool = getPool();

    const conditions = ['kf.project_id = $1'];
    const params: unknown[] = [projectId];

    if (requirementId) {
      // Join to requirements via test case trace links
      conditions.push(`EXISTS (
        SELECT 1 FROM trace_links tl
        WHERE tl.target_id   = kf.test_case_id
          AND tl.source_id   = $${params.length + 1}
          AND tl.source_type = 'REQUIREMENT'
          AND tl.target_type = 'TEST_CASE'
      )`);
      params.push(requirementId);
    }

    const result = await pool.query(
      `SELECT
         AVG(clarity)        AS avg_clarity,
         AVG(correctness)    AS avg_correctness,
         AVG(coverage_score) AS avg_coverage
       FROM knowledge_feedback kf
       WHERE ${conditions.join(' AND ')}
         AND clarity      IS NOT NULL
         AND correctness  IS NOT NULL
         AND coverage_score IS NOT NULL`,
      params,
    );

    const row = result.rows[0];
    // Round to 1 decimal in JS (pg-mem does not support 2-arg ROUND)
    const round1 = (v: unknown) => Math.round((parseFloat(String(v ?? '0')) || 0) * 10) / 10;
    const avgClarity     = round1(row?.avg_clarity);
    const avgCorrectness = round1(row?.avg_correctness);
    const avgCoverage    = round1(row?.avg_coverage);

    const weaknesses: string[] = [];
    if (avgClarity     > 0 && avgClarity     < 3) weaknesses.push('clarity (steps are ambiguous or hard to follow)');
    if (avgCorrectness > 0 && avgCorrectness < 3) weaknesses.push('correctness (expected results do not match acceptance criteria)');
    if (avgCoverage    > 0 && avgCoverage    < 3) weaknesses.push('coverage (not all acceptance criteria are exercised)');

    if (weaknesses.length) {
      log.debug('getPromptContext: weaknesses detected', { projectId, requirementId, weaknesses });
    }

    const promptHint = weaknesses.length
      ? `IMPORTANT: Previous test cases for this requirement scored poorly on: ${weaknesses.join(', ')}. ` +
        `Ensure the generated test cases explicitly address these weaknesses.`
      : '';

    log.debug('getPromptContext: result', { projectId, avgClarity, avgCorrectness, avgCoverage, hasPromptHint: !!promptHint });
    return { avgClarity, avgCorrectness, avgCoverage, weaknesses, promptHint };
  }

  // ── VALIDATORS ────────────────────────────────────────────────────────
  private validateScores(dto: { clarity: number; correctness: number; coverage: number }) {
    const check = (name: string, val: unknown) => {
      if (typeof val !== 'number' || !Number.isInteger(val) || val < 1 || val > 5) {
        throw new ApiError(400, `${name} must be an integer between 1 and 5`);
      }
    };
    check('clarity',     dto.clarity);
    check('correctness', dto.correctness);
    check('coverage',    dto.coverage);
  }

  // ── MAPPER ────────────────────────────────────────────────────────────
  private mapFeedback(row: any) {
    return {
      id:              row.id,
      projectId:       row.project_id,
      testCaseId:      row.test_case_id,
      userId:          row.user_id,
      submittedByName: row.submitted_by_name ?? null,
      clarity:         row.clarity,
      correctness:     row.correctness,
      coverage:        row.coverage_score,
      matchPercentage: row.match_percentage,
      isGoldStandard:  row.is_gold_standard,
      notes:           row.notes,
      createdAt:       row.created_at,
    };
  }
}
